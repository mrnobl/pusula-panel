/**
 * PAKET — taşıma dosyası ve araştırma eklentisinin alt katmanı (68.1, PLAN-TASIMA F3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Biçim: standart **tar.gz** (POSIX ustar + PAX uzun/UTF-8 ad kaydı), yalnız Node yerleşik `zlib` ve `crypto`. Harici paket YOK
 * (gerekçe: dağıtım her paketi taşır; 7-Zip / Windows `tar -tzf` dosyanın içini açıp gösterebilir — biçim kapalı kutu değil).
 *
 *   tarYazici(akis)               → { dosya(ad, boyut, kaynak), bitir() } — kaynak: Buffer | Readable | dosya yolu
 *   tarOku(girdi, isleyici)       → her kayıt için isleyici({ ad, boyut }) → { yaz(parca), bitir() } | null (atla)
 *   sifrele(buf, sifre) / coz(sifreli, sifre, kripto)   → AES-256-GCM, anahtar scrypt (tuz + parametreler kripto nesnesinde)
 *   sifreleAkis(...)              → büyük gövde için akış (eklenti şifreli olursa)
 *
 * ŞİFRELEME: anahtar = scrypt(şifre, tuz 16 bayt, 32 bayt, N=2^16, r=8, p=1); AES-256-GCM, iv 12 bayt, etiket 16 bayt,
 * ek doğrulanan veri (AAD) = sabit biçim etiketi. Yanlış şifre ya da tek bayt değişikliği → GCM reddi ("şifre yanlış ya da dosya
 * bozuk"); ikisi bilerek ayırt edilmez (saldırgana ipucu vermez). Şifre dosyada / bildiride HİÇBİR biçimde (özet dahil) durmaz.
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const BLOK = 512;
const KDF = { ad: 'scrypt', N: 1 << 16, r: 8, p: 1, anahtarBayt: 32 };
const AAD = Buffer.from('pusula-tasima-gizli-v1', 'utf8');
const MAX_SIFRE = 1024;

/* ── tar ────────────────────────────────────────────────────────────────── */

function sekizli(n, uzunluk) {
  const s = Math.floor(n).toString(8);
  if (s.length > uzunluk - 1) throw new Error(`tar alanı taştı (${n})`);
  return s.padStart(uzunluk - 1, '0') + '\0';
}

function basliKur(ad, boyut, tip, mtime) {
  const b = Buffer.alloc(BLOK, 0);
  const asciiAd = /^[\x20-\x7e]{1,99}$/.test(ad) ? ad : `PaxHeader/${crypto.createHash('sha1').update(ad).digest('hex').slice(0, 40)}`;
  b.write(asciiAd, 0, 100, 'utf8');
  b.write(sekizli(0o644, 8), 100, 8, 'ascii');
  b.write(sekizli(0, 8), 108, 8, 'ascii');
  b.write(sekizli(0, 8), 116, 8, 'ascii');
  b.write(sekizli(boyut, 12), 124, 12, 'ascii');
  b.write(sekizli(mtime, 12), 136, 12, 'ascii');
  b.fill(0x20, 148, 156);                        // sağlama hesabı için boşluk
  b.write(tip, 156, 1, 'ascii');
  b.write('ustar\0', 257, 6, 'ascii');
  b.write('00', 263, 2, 'ascii');
  let t = 0;
  for (let i = 0; i < BLOK; i++) t += b[i];
  b.write(sekizli(t, 7) + ' ', 148, 8, 'ascii');
  return b;
}

/** PAX kaydı: "<uzunluk> path=<ad>\n" (uzunluk kendini de sayar). */
function paxKaydi(anahtar, deger) {
  const govde = ` ${anahtar}=${deger}\n`;
  let n = Buffer.byteLength(govde) + 1;
  while (String(n).length + Buffer.byteLength(govde) !== n) n = String(n).length + Buffer.byteLength(govde);
  return Buffer.from(`${n}${govde}`, 'utf8');
}

const dolgu = (n) => (BLOK - (n % BLOK)) % BLOK;

/**
 * Akışa tar yazar. Yazılan her kayıt `dosya()` sözüyle sırayla gider (geri basınç gözetilir).
 * @param {import('stream').Writable} akis
 */
function tarYazici(akis) {
  const yaz = (buf) => new Promise((ok, red) => {
    const devam = akis.write(buf, (e) => { if (e) red(e); });
    if (devam) ok(); else akis.once('drain', ok);
  });
  let sayi = 0;
  return {
    /** @param {string} ad göreli yol ('/' ayraçlı) @param {number} boyut @param {Buffer|string|Readable} kaynak */
    async dosya(ad, boyut, kaynak, mtime = Date.now() / 1000) {
      if (!ad || ad.startsWith('/') || ad.split('/').includes('..')) throw new Error(`geçersiz paket yolu: ${ad}`);
      if (!/^[\x20-\x7e]{1,99}$/.test(ad)) {
        const pax = paxKaydi('path', ad);
        await yaz(basliKur('', pax.length, 'x', mtime));
        await yaz(Buffer.concat([pax, Buffer.alloc(dolgu(pax.length))]));
      }
      await yaz(basliKur(ad, boyut, '0', mtime));
      let yazilan = 0;
      if (Buffer.isBuffer(kaynak)) { await yaz(kaynak); yazilan = kaynak.length; }
      else {
        const r = typeof kaynak === 'string' ? fs.createReadStream(kaynak) : kaynak;
        for await (const parca of r) {
          yazilan += parca.length;
          if (yazilan > boyut) { r.destroy(); throw new Error(`${ad}: dosya yazılırken büyüdü`); }
          await yaz(parca);
        }
      }
      if (yazilan !== boyut) throw new Error(`${ad}: beklenen ${boyut} bayt, okunan ${yazilan} (dosya yazılırken değişti)`);
      const d = dolgu(boyut);
      if (d) await yaz(Buffer.alloc(d));
      sayi++;
    },
    /** Ham bayt (önceden yazılmış tar kayıtları — gövde dosyası) olduğu gibi eklenir. */
    async ham(kaynakYolu) { for await (const parca of fs.createReadStream(kaynakYolu)) await yaz(parca); },
    async bitir() { await yaz(Buffer.alloc(BLOK * 2)); },
    sayi: () => sayi,
  };
}

function alanOku(b, bas, uz) { const s = b.toString('utf8', bas, bas + uz); const i = s.indexOf('\0'); return i >= 0 ? s.slice(0, i) : s; }
function sayiOku(b, bas, uz) { const s = alanOku(b, bas, uz).trim(); return s ? parseInt(s, 8) : 0; }
function paxCoz(buf) {
  const out = {};
  let i = 0;
  while (i < buf.length) {
    const bosluk = buf.indexOf(0x20, i);
    if (bosluk < 0) break;
    const n = parseInt(buf.toString('ascii', i, bosluk), 10);
    if (!n) break;
    const kayit = buf.toString('utf8', bosluk + 1, i + n - 1);
    const e = kayit.indexOf('=');
    if (e > 0) out[kayit.slice(0, e)] = kayit.slice(e + 1);
    i += n;
  }
  return out;
}

/**
 * tar akışını okur (gzip AÇILMIŞ bayt akışı). Kayıt başına isleyici({ad, boyut}) → { yaz(buf), bitir() } ya da null (atla).
 * Bozuk başlık (sağlama tutmaz) → hata. Yalnız düz dosya (tip '0' / '\0') ve PAX 'x' kabul edilir; dizin/bağ kayıtları atlanır.
 */
async function tarOku(girdi, isleyici) {
  let tampon = Buffer.alloc(0);
  let durum = 'baslik';      // baslik | veri | dolgu | pax | son
  let kalan = 0, dolguKalan = 0, hedef = null, paxBuf = [], paxAd = null, kayit = null, bitti = false;
  const sayac = { kayit: 0 };
  for await (const parca of girdi) {
    tampon = tampon.length ? Buffer.concat([tampon, parca]) : parca;
    let i = 0;
    while (i < tampon.length && !bitti) {
      if (durum === 'baslik') {
        if (tampon.length - i < BLOK) break;
        const b = tampon.subarray(i, i + BLOK); i += BLOK;
        if (b.every(x => x === 0)) { durum = 'son'; continue; }
        let t = 0; for (let k = 0; k < BLOK; k++) t += (k >= 148 && k < 156) ? 0x20 : b[k];
        if (t !== sayiOku(b, 148, 8)) throw new Error('paket bozuk: tar başlığı sağlaması tutmuyor');
        const tip = String.fromCharCode(b[156] || 0x30);
        const boyut = sayiOku(b, 124, 12);
        const ad = paxAd || alanOku(b, 0, 100);
        paxAd = null;
        kalan = boyut; dolguKalan = dolgu(boyut);
        if (tip === 'x') { durum = 'pax'; paxBuf = []; continue; }
        if (tip === '0' || tip === '\0') {
          if (!ad || ad.startsWith('/') || ad.includes('\\') || ad.split('/').includes('..')) throw new Error(`paket bozuk: geçersiz yol (${ad})`);
          kayit = { ad, boyut }; sayac.kayit++;
          hedef = await isleyici(kayit);
        } else hedef = null;
        durum = 'veri';
        if (kalan === 0) { if (hedef) await hedef.bitir(); hedef = null; durum = dolguKalan ? 'dolgu' : 'baslik'; }
      } else if (durum === 'veri' || durum === 'pax') {
        const n = Math.min(kalan, tampon.length - i);
        const dilim = tampon.subarray(i, i + n); i += n; kalan -= n;
        if (durum === 'pax') paxBuf.push(Buffer.from(dilim));
        else if (hedef) await hedef.yaz(Buffer.from(dilim));
        if (kalan === 0) {
          if (durum === 'pax') { paxAd = paxCoz(Buffer.concat(paxBuf)).path || null; }
          else if (hedef) { await hedef.bitir(); hedef = null; }
          durum = dolguKalan ? 'dolgu' : 'baslik';
        }
      } else if (durum === 'dolgu') {
        const n = Math.min(dolguKalan, tampon.length - i); i += n; dolguKalan -= n;
        if (dolguKalan === 0) durum = 'baslik';
      } else if (durum === 'son') { bitti = true; }
    }
    tampon = tampon.subarray(i);
    if (bitti) break;
  }
  if (durum === 'veri' || durum === 'pax') throw new Error('paket bozuk: dosya yarıda kesilmiş');
  if (durum !== 'son' && !bitti) throw new Error('paket bozuk: tar sonu işareti yok (dosya eksik indirilmiş olabilir)');
  return sayac;
}

/** gzip'li paket dosyasını tar okuyucusuna verir. */
async function paketOku(dosya, isleyici) {
  const g = zlib.createGunzip();
  const r = fs.createReadStream(dosya);
  r.on('error', (e) => g.destroy(e));
  r.pipe(g);
  try { return await tarOku(g, isleyici); }
  catch (e) {
    r.destroy(); g.destroy();
    // zlib hataları (Z_DATA_ERROR "incorrect data check", Z_BUF_ERROR "unexpected end of file" …) → dosya bozuk/eksik
    if (((e.code && /^Z_/.test(e.code)) || /incorrect|unexpected end|invalid/i.test(e.message)) && !/^paket/.test(e.message) && !e.durum) throw new Error(`paket bozuk: sıkıştırma açılamadı (${e.message}) — dosya bozuk ya da yarım indirilmiş`);
    throw e;
  }
}

/* ── şifreleme ──────────────────────────────────────────────────────────── */

function sifreDenetle(sifre) {
  if (typeof sifre !== 'string' || sifre.length < 8) throw Object.assign(new Error('şifre en az 8 karakter olmalı'), { durum: 400 });
  if (sifre.length > MAX_SIFRE) throw Object.assign(new Error('şifre çok uzun'), { durum: 400 });
}

function anahtar(sifre, tuz, k = KDF) {
  return crypto.scryptSync(Buffer.from(sifre.normalize('NFC'), 'utf8'), tuz, k.anahtarBayt || 32, { N: k.N, r: k.r, p: k.p, maxmem: 256 * 1024 * 1024 });
}

/** @returns {{ veri: Buffer, kripto: object }} kripto: { alg, kdf, N, r, p, tuz, iv, etiket } (base64) — bildiriye yazılır. */
function sifrele(acik, sifre) {
  sifreDenetle(sifre);
  const tuz = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar(sifre, tuz), iv);
  c.setAAD(AAD);
  const veri = Buffer.concat([c.update(acik), c.final()]);
  return { veri, kripto: { alg: 'aes-256-gcm', kdf: KDF.ad, N: KDF.N, r: KDF.r, p: KDF.p, tuz: tuz.toString('base64'), iv: iv.toString('base64'), etiket: c.getAuthTag().toString('base64'), aad: AAD.toString('utf8') } };
}

function kriptoDenetle(k) {
  if (!k || k.alg !== 'aes-256-gcm' || k.kdf !== 'scrypt') throw new Error('desteklenmeyen şifreleme');
  for (const a of ['N', 'r', 'p']) if (!Number.isInteger(k[a]) || k[a] < 1) throw new Error('şifreleme parametresi bozuk');
  if (k.N > (1 << 20) || k.r > 32 || k.p > 16) throw new Error('şifreleme parametresi sınır dışı');
}

/** Yanlış şifre / değişmiş bayt → hata (durum 401). */
function coz(sifreli, sifre, k) {
  kriptoDenetle(k);
  if (typeof sifre !== 'string' || !sifre) throw Object.assign(new Error('şifre gerekli'), { durum: 401, kod: 'sifre' });
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', anahtar(sifre, Buffer.from(k.tuz, 'base64'), k), Buffer.from(k.iv, 'base64'));
    d.setAAD(Buffer.from(k.aad || AAD.toString('utf8'), 'utf8'));
    d.setAuthTag(Buffer.from(k.etiket, 'base64'));
    return Buffer.concat([d.update(sifreli), d.final()]);
  } catch (e) {
    throw Object.assign(new Error('Şifre yanlış ya da dosyanın şifreli kısmı bozuk — hiçbir şey değiştirilmedi.'), { durum: 401, kod: 'sifre' });
  }
}

/** Akış şifreleme (büyük gövde): kaynak dosya → hedef dosya; etiket sonda döner. */
async function sifreleDosya(kaynak, hedef, sifre) {
  sifreDenetle(sifre);
  const tuz = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar(sifre, tuz), iv);
  c.setAAD(AAD);
  await new Promise((ok, red) => { const w = fs.createWriteStream(hedef); fs.createReadStream(kaynak).on('error', red).pipe(c).on('error', red).pipe(w).on('error', red).on('finish', ok); });
  return { alg: 'aes-256-gcm', kdf: KDF.ad, N: KDF.N, r: KDF.r, p: KDF.p, tuz: tuz.toString('base64'), iv: iv.toString('base64'), etiket: c.getAuthTag().toString('base64'), aad: AAD.toString('utf8') };
}
/** Akış çözme: doğrulama SONDA (final) — çağıran çıktıyı geçici yere yazar, hata olursa siler. */
async function cozDosya(kaynak, hedef, sifre, k) {
  kriptoDenetle(k);
  const d = crypto.createDecipheriv('aes-256-gcm', anahtar(sifre, Buffer.from(k.tuz, 'base64'), k), Buffer.from(k.iv, 'base64'));
  d.setAAD(Buffer.from(k.aad || AAD.toString('utf8'), 'utf8'));
  d.setAuthTag(Buffer.from(k.etiket, 'base64'));
  try {
    await new Promise((ok, red) => { const w = fs.createWriteStream(hedef); fs.createReadStream(kaynak).on('error', red).pipe(d).on('error', red).pipe(w).on('error', red).on('finish', ok); });
  } catch (e) {
    try { fs.rmSync(hedef, { force: true }); } catch { /* */ }
    throw Object.assign(new Error('Şifre yanlış ya da dosya bozuk — hiçbir şey değiştirilmedi.'), { durum: 401, kod: 'sifre' });
  }
}

function sha256Dosya(f) {
  return new Promise((ok, red) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('error', red).on('data', d => h.update(d)).on('end', () => ok(h.digest('hex'))); });
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

module.exports = { tarYazici, tarOku, paketOku, sifrele, coz, sifreleDosya, cozDosya, sifreDenetle, sha256, sha256Dosya, KDF, AAD, BLOK, _ic: { basliKur, paxKaydi, paxCoz } };
