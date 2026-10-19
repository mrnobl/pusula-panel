/**
 * TAŞIMA DOSYASI · İÇE AKTARMA · ARAŞTIRMA EKLENTİSİ (68.1, PLAN-TASIMA F3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Bir Pusula kurulumunun kullanıcıya ait verisini TEK dosyaya koyar ve başka bir bilgisayarda (boş kurulum) yerine açar.
 *
 *   .pusula             taşıma dosyası (ve 68.1'den USB yedeği): KİŞİSEL + ayarlar + GİZLİ (şifreli) [+ ARAŞTIRMA kutusuyla]
 *   .pusula-arastirma   araştırma eklentisi: ARAŞTIRMA türünün tamamı + araştırma kitapçıkları + araştırma kayıtları (şifre isteğe bağlı)
 *
 * PAKET İÇİ (tar.gz — lib/paket.js):
 *   bildiri.json                 İLK kayıt: biçim, uygulama sürümü, oluşturma zamanı, kaynak makine adı, türler, kutular,
 *                                dosya listesi (yol, boyut, sha256, tür), GİZLİ kısmın şifreleme parametreleri (tuz, iv, etiket, scrypt N/r/p)
 *   veri/<tür klasörü>/<parça>/… KİŞİSEL (kisisel/), ARAŞTIRMA (arastirma/) dosyaları — düzenden bağımsız (eski data/ ya da yeni kök)
 *   veri/kisisel/ayarlar.json    lib/ayarlar KULLANICI katmanı (varsayılandan farklar; eski düzende config.json'dan üretilir; sır alanı YOK)
 *   gizli.enc                    GİZLİ dosyalar (secrets.json, telefon jetonu, acil PIN özeti, yedek şifresi … ; ev-baglanti.json yalnız
 *                                "Sunucu bağlantısını da taşı" kutusuyla) — JSON, AES-256-GCM, anahtar scrypt(kullanıcı şifresi)
 *   govde.enc                    (yalnız şifreli eklenti) bütün gövde tek şifreli iç tar; dosya listesi de içinde (araştırma adları görünmez)
 *   program/…                    (yalnız eklenti) public/kitapcik/…, kayitlar/… (program klasörüne, var olanın üzerine yazmadan)
 *
 * ASLA GİRMEZ: ÖNBELLEK (yeniden indirilir) ve MAKİNE (bu bilgisayara özel) türleri — `secim()` saf ve testli.
 *
 * İÇE AKTARMA (`ac` → `yerlestir`): önce geçici klasöre (<veri>/makine/tasima/ice-<kimlik>) açılır; HER dosya sha256 + boyutla
 * bildiriye karşı doğrulanır, fazla/eksik dosya ya da GCM reddi → geçici klasör silinir, HİÇBİR şey değişmez. Hedefte kişisel veri
 * varsa reddedilir (üzerine yazma yok); açık "yedekleyip değiştir" seçilirse var olan parçalar <veri>/makine/onceki-<zaman>/ altına
 * TAŞINIR (silinmez). Yerleştirme parça parça yeniden adlandırmadır; yarıda hata → yapılan geri alınır.
 * Sonra `tasima-bekliyor.json` (MAKİNE): botlar açılışta KENDİLİĞİNDEN BAŞLAMAZ; her bot için ilk temiz borsa mutabakatı + kullanıcının
 * "Başlat"ı gerekir (server.js — kurulum engeliyle aynı yerde). Kurulum onayı dosyadan gelir; KOSUL_SURUM değiştiyse yeniden onay.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const yollar = require('./yollar');
const turler = require('./veriTurleri');
const ayarlarLib = require('./ayarlar');
const P = require('./paket');

const UZANTI = { tasima: '.pusula', 'arastirma-eklentisi': '.pusula-arastirma' };
const BICIM = 'pusula-paket';
const BICIM_SURUM = 1;
const BEKLIYOR_AD = 'tasima-bekliyor.json';
const EKLENTI_ISARET = 'arastirma-eklentisi.json';
const YEDEK_SIFRE_AD = 'yedek-sifre.json';
const BOTLAR = ['hucum', 'denge', 'kalkan', 'donchian'];
/** Pakete girmeyen geçici dosyalar (yazılırken kopya alınmasın). */
const GECICI = /\.tmp$|\.yaziliyor(-\d+)?$|\.kilit$/i;
/** Ayar katmanında asla düz durmayan alanlar (sırlar GİZLİ'ye, şifreli). server.js SECRET_KEYS ile aynı + Telegram jetonu. */
const SIR_ALANLARI = ['apiKey', 'apiSecret', 'testnetApiKey', 'testnetApiSecret', 'liveApiKey', 'liveApiSecret', 'healthchecksUrl', 'healthchecksSunucuUrl'];
/** Eklentinin program tarafı: araştırma kitapçıkları + araştırma kayıtları (dağıtımda olmayacaklar — F5). */
const EKLENTI_PROGRAM = [
  { kok: 'public/kitapcik', haric: null },
  { kok: 'kayitlar', haric: /^kayitlar\/(listeler|tasarim)(\/|$)/ },
];
/** Boş yeni kurulumun açılışta KENDİSİ ürettiği KİŞİSEL dosyalar — "kişisel veri var" sayılmaz (yine de silinmez: önceki-<zaman>'a taşınır). */
const OTOMATIK = [/^gunluk\//, /^wallet\.json$/, /^tarama\/listeler\.jsonl$/, /^tarama\/piyasa\//, /^kurulum\.json$/];

const hata = (mesaj, durum = 400, kod) => Object.assign(new Error(mesaj), { durum, kod });

function cozum(program) {
  return (!program || path.resolve(program).toLowerCase() === yollar.PROGRAM.toLowerCase()) ? yollar.bilgi() : yollar.cozumle(program);
}
function uygulamaSurumu(program = yollar.PROGRAM) {
  try { const m = fs.readFileSync(path.join(program, 'server.js'), 'utf8').match(/APP_VERSION\s*=\s*'([^']+)'/); return m ? m[1] : null; } catch { return null; }
}

/** Klasör altındaki düz dosyalar [{ goreli ('/' ayraçlı), tam, boyut }]; bağlar izlenmez, geçici dosyalar atlanır. */
function dosyalar(kok, onEk = '') {
  const out = [];
  const gez = (d, g) => {
    let st; try { st = fs.lstatSync(d); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isFile()) { if (!GECICI.test(g)) out.push({ goreli: g, tam: d, boyut: st.size }); return; }
    if (st.isDirectory()) for (const a of fs.readdirSync(d).sort()) gez(path.join(d, a), g ? `${g}/${a}` : a);
  };
  gez(kok, onEk);
  return out;
}

/**
 * SAF — hangi parça pakete girer. parcalar: [{ ad, tur }] (tur null → bilinmeyen = KİŞİSEL, kaybolmasın).
 * kutular: { gizli (şifre var mı), arastirma, sunucuBaglantisi, yalnizArastirma (eklenti) }
 * @returns {{ kisisel: string[], gizli: string[], arastirma: string[], haric: {ad, tur, neden}[] }}
 */
function secim(parcalar, kutular = {}) {
  const s = { kisisel: [], gizli: [], arastirma: [], haric: [] };
  for (const p of parcalar) {
    const tur = p.tur || turler.BILINMEYEN_TUR;
    const h = (neden) => s.haric.push({ ad: p.ad, tur, neden });
    if (p.ad === yollar.ISARET) { h('veri klasörü işareti'); continue; }
    if (tur === 'ONBELLEK') { h('önbellek — yeni bilgisayarda yeniden indirilir'); continue; }
    if (tur === 'MAKINE') { h('bu bilgisayara özel'); continue; }
    if (kutular.yalnizArastirma) { if (tur === 'ARASTIRMA') s.arastirma.push(p.ad); else h('eklentiye yalnız araştırma girer'); continue; }
    if (tur === 'ARASTIRMA') { if (kutular.arastirma) s.arastirma.push(p.ad); else h('araştırma kutusu işaretsiz'); continue; }
    if (tur === 'GIZLI') {
      if (p.ad === 'ev-baglanti.json' && !kutular.sunucuBaglantisi) { h('"Sunucu bağlantısını da taşı" işaretsiz'); continue; }
      if (!kutular.gizli) { h('şifre verilmedi — gizli bilgiler girmedi'); continue; }
      s.gizli.push(p.ad); continue;
    }
    if (p.ad === ayarlarLib.KULLANICI_AD) continue;   // ayar katmanı ayrıca üretilir (sırsız)
    s.kisisel.push(p.ad);
  }
  return s;
}

/** Ayar katmanı (varsayılandan farklar) — sır alanları ÇIKARILIR ve ayrı döner (GİZLİ secrets.json'a eklenir). */
function ayarKatmani(program) {
  const b = ayarlarLib.okuBilgi(program && path.resolve(program).toLowerCase() !== yollar.PROGRAM.toLowerCase() ? program : undefined);
  const katman = ayarlarLib.fark(b.ayar, ayarlarLib.varsayilan(program));
  const sirlar = {};
  for (const a of SIR_ALANLARI) if (a in katman) { if (katman[a]) sirlar[a] = katman[a]; delete katman[a]; }
  if (katman.telegram && katman.telegram.botToken) { sirlar.telegram = { botToken: katman.telegram.botToken }; delete katman.telegram.botToken; }
  return { katman, sirlar, kaynak: b.kaynak };
}

/** Bir türün parçalarının paket içi dosyaları. */
function parcaDosyalari(c, adlar, tur) {
  const out = [];
  const klasor = turler.klasor(tur);
  const bul = new Map(yollar.parcalar(c).map(p => [p.ad, p.yol]));
  for (const ad of adlar) {
    const tam = bul.get(ad);
    if (!tam) continue;
    for (const f of dosyalar(tam, ad)) out.push({ yol: `veri/${klasor}/${f.goreli}`, tam: f.tam, boyut: f.boyut, tur });
  }
  return out;
}
function programDosyalari(program) {
  const out = [];
  for (const k of EKLENTI_PROGRAM) for (const f of dosyalar(path.join(program, ...k.kok.split('/')), k.kok)) {
    if (k.haric && k.haric.test(f.goreli)) continue;
    out.push({ yol: `program/${f.goreli}`, tam: f.tam, boyut: f.boyut, tur: 'ARASTIRMA' });
  }
  return out;
}

/** Boyut tahmini (panel): tür başına dosya ve bayt. */
function tahmin({ program, kutular = {} } = {}) {
  const c = cozum(program);
  const parcalar = yollar.parcalar(c);
  const s = secim(parcalar, { gizli: true, arastirma: true, sunucuBaglantisi: true });
  const say = (l) => ({ dosya: l.length, bayt: l.reduce((t, f) => t + f.boyut, 0) });
  const evBag = parcalar.some(p => p.ad === 'ev-baglanti.json');
  return {
    kisisel: say(parcaDosyalari(c, s.kisisel, 'KISISEL')),
    gizli: say(parcaDosyalari(c, s.gizli.filter(a => a !== 'ev-baglanti.json'), 'GIZLI')),
    arastirma: say(parcaDosyalari(c, s.arastirma, 'ARASTIRMA')),
    arastirmaProgram: say(programDosyalari(c.program)),
    sunucuBaglantisiVar: evBag,
    kutular,
  };
}

async function* hashliOku(f, h) { for await (const p of fs.createReadStream(f)) { h.update(p); yield p; } }

/**
 * Paket oluştur.
 * @param o.tur 'tasima' | 'arastirma-eklentisi'
 * @param o.cikti hedef dosya yolu · o.sifre (tasima: GİZLİ için; yoksa GİZLİ girmez · eklenti: varsa bütün gövde şifreli)
 * @param o.kutular { arastirma, sunucuBaglantisi } · o.kaynak 'panel' | 'komut' | 'usb-yedek' · o.ilerleme(fn)
 */
async function olustur(o) {
  const tur = o.tur || 'tasima';
  if (!UZANTI[tur]) throw hata(`bilinmeyen paket türü: ${tur}`);
  const program = o.program || yollar.PROGRAM;
  const c = cozum(program);
  const sifre = o.sifre || null;
  if (sifre) P.sifreDenetle(sifre);
  const kutular = { arastirma: !!(o.kutular && o.kutular.arastirma), sunucuBaglantisi: !!(o.kutular && o.kutular.sunucuBaglantisi) };
  const ilerleme = typeof o.ilerleme === 'function' ? o.ilerleme : () => {};
  const eklenti = tur === 'arastirma-eklentisi';
  const parcalar = yollar.parcalar(c);
  const s = secim(parcalar, eklenti ? { yalnizArastirma: true } : { ...kutular, gizli: !!sifre });

  const liste = [];
  let ayar = null;
  if (!eklenti) {
    liste.push(...parcaDosyalari(c, s.kisisel, 'KISISEL'));
    ayar = ayarKatmani(program);
  }
  liste.push(...parcaDosyalari(c, s.arastirma, 'ARASTIRMA'));
  if (eklenti) liste.push(...programDosyalari(c.program));

  // GİZLİ: küçük dosyalar bellekte → tek şifreli blok
  let gizliBlok = null, gizliBildiri = { var: false };
  if (!eklenti && sifre) {
    const g = [];
    for (const f of parcaDosyalari(c, s.gizli, 'GIZLI')) {
      if (f.boyut > 8 * 1024 * 1024) throw hata(`gizli dosya beklenmedik büyük: ${f.yol}`);
      g.push({ yol: f.yol, veri: fs.readFileSync(f.tam) });
    }
    if (ayar && Object.keys(ayar.sirlar).length) {     // eski config.json'da kalmış sırlar → secrets.json'a (şifreli) birleşir
      const i = g.findIndex(x => x.yol === 'veri/gizli/secrets.json');
      let mevcut = {};
      if (i >= 0) { try { mevcut = JSON.parse(g[i].veri.toString('utf8').replace(/^﻿/, '')); } catch { mevcut = {}; } }
      const birlesik = { ...ayar.sirlar, ...mevcut, telegram: { ...(ayar.sirlar.telegram || {}), ...(mevcut.telegram || {}) } };
      if (!Object.keys(birlesik.telegram).length) delete birlesik.telegram;
      const v = Buffer.from(JSON.stringify(birlesik, null, 2), 'utf8');
      if (i >= 0) g[i].veri = v; else g.push({ yol: 'veri/gizli/secrets.json', veri: v });
    }
    const acik = Buffer.from(JSON.stringify({ dosyalar: g.map(x => ({ yol: x.yol, boyut: x.veri.length, sha256: P.sha256(x.veri), veri: x.veri.toString('base64') })) }), 'utf8');
    const sf = P.sifrele(acik, sifre);
    gizliBlok = sf.veri;
    gizliBildiri = { var: true, dosyaSayisi: g.length, adlar: g.map(x => x.yol.replace(/^veri\/gizli\//, '')), bayt: sf.veri.length, sha256: P.sha256(sf.veri), kripto: sf.kripto,
      sunucuBaglantisi: g.some(x => x.yol === 'veri/gizli/ev-baglanti.json') };
  }

  const cikti = path.resolve(o.cikti);
  fs.mkdirSync(path.dirname(cikti), { recursive: true });
  const govdeYol = `${cikti}.govde-${process.pid}`;
  const yaziliyor = `${cikti}.yaziliyor-${process.pid}`;
  const toplamBayt = liste.reduce((t, f) => t + f.boyut, 0) + (ayar ? 1 : 0);
  let yapilan = 0;
  try {
    // 1. Gövde (ham tar kayıtları; özetler yazılırken hesaplanır — bildiri yazılan bayttan)
    const govdeAkis = fs.createWriteStream(govdeYol);
    const t = P.tarYazici(govdeAkis);
    const kayitlar = [];
    if (ayar) {
      const v = Buffer.from(JSON.stringify(ayar.katman, null, 2), 'utf8');
      await t.dosya('veri/kisisel/ayarlar.json', v.length, v);
      kayitlar.push({ yol: 'veri/kisisel/ayarlar.json', boyut: v.length, sha256: P.sha256(v), tur: 'KISISEL' });
    }
    for (const f of liste) {
      const h = crypto.createHash('sha256');
      let boyut;
      try { boyut = fs.statSync(f.tam).size; } catch { continue; }   // arada silinmiş (günlük döndürme) — atla
      if (boyut <= 32 * 1024 * 1024) {
        // Küçük dosya (bot durumları, defterler — Pusula çalışırken eklenebilir): tek okumada anlık kopya, boyut + özet tutarlı.
        let v; try { v = fs.readFileSync(f.tam); } catch { continue; }
        boyut = v.length;
        await t.dosya(f.yol, boyut, v);
        h.update(v);
      } else await t.dosya(f.yol, boyut, hashliOku(f.tam, h));
      kayitlar.push({ yol: f.yol, boyut, sha256: h.digest('hex'), tur: f.tur });
      yapilan += boyut;
      ilerleme({ asama: 'paketleniyor', yapilan, toplam: toplamBayt, dosya: kayitlar.length, dosyaToplam: liste.length });
    }
    let govdeSifre = null;
    if (eklenti && sifre) {
      const dl = Buffer.from(JSON.stringify(kayitlar), 'utf8');
      await t.dosya('dosyalar.json', dl.length, dl);
    }
    await t.bitir();
    await new Promise((ok, red) => govdeAkis.end((e) => (e ? red(e) : ok())));
    if (eklenti && sifre) {
      ilerleme({ asama: 'sifreleniyor', yapilan, toplam: toplamBayt });
      const enc = `${govdeYol}.enc`;
      const sk = await P.sifreleDosya(govdeYol, enc, sifre);
      fs.rmSync(govdeYol, { force: true });
      fs.renameSync(enc, govdeYol);
      govdeSifre = { kripto: sk, bayt: fs.statSync(govdeYol).size, sha256: await P.sha256Dosya(govdeYol) };
    }

    // 2. Bildiri + son dosya
    const sayilar = {};
    for (const k of kayitlar) { const x = sayilar[k.tur] || (sayilar[k.tur] = { dosya: 0, bayt: 0 }); x.dosya++; x.bayt += k.boyut; }
    if (gizliBildiri.var) sayilar.GIZLI = { dosya: gizliBildiri.dosyaSayisi, bayt: gizliBildiri.bayt };
    const bildiri = {
      bicim: BICIM, bicimSurum: BICIM_SURUM, tur, kaynak: o.kaynak || 'komut',
      uygulamaSurum: o.uygulamaSurum || uygulamaSurumu(program), olusturma: new Date().toISOString(), makine: os.hostname(),
      kaynakDuzen: c.duzen, turler: Object.keys(sayilar), sayilar, kutular: eklenti ? {} : kutular,
      ayarKaynagi: ayar ? ayar.kaynak : null,
      haric: s.haric.map(h => ({ ad: h.ad, tur: h.tur, neden: h.neden })),
      gizli: gizliBildiri,
      govde: govdeSifre ? { sifreli: true, dosyaSayisi: kayitlar.length, bayt: govdeSifre.bayt, sha256: govdeSifre.sha256, kripto: govdeSifre.kripto } : { sifreli: false },
      dosyalar: govdeSifre ? [] : kayitlar,
      notlar: [!eklenti && !gizliBildiri.var ? 'GİZLİ bilgiler (API anahtarları, jetonlar, PIN) bu dosyada YOK — şifre verilmedi.' : null].filter(Boolean),
    };
    ilerleme({ asama: 'yaziliyor', yapilan, toplam: toplamBayt });
    const gz = zlib.createGzip({ level: 6 });
    const w = fs.createWriteStream(yaziliyor);
    const bitti = new Promise((ok, red) => { w.on('finish', ok); w.on('error', red); gz.on('error', red); });
    gz.pipe(w);
    const d = P.tarYazici(gz);
    const bb = Buffer.from(JSON.stringify(bildiri, null, 2), 'utf8');
    await d.dosya('bildiri.json', bb.length, bb);
    if (govdeSifre) await d.dosya('govde.enc', govdeSifre.bayt, govdeYol);
    else {
      // ham gövde kayıtları — sondaki iki boş blok hariç (son işaret bu tar'ın sonunda bir kez yazılır)
      const boyut = fs.statSync(govdeYol).size - P.BLOK * 2;
      if (boyut > 0) {
        await new Promise((ok, red) => {
          const r = fs.createReadStream(govdeYol, { start: 0, end: boyut - 1 });
          r.on('data', (p) => { if (!gz.write(p)) { r.pause(); gz.once('drain', () => r.resume()); } });
          r.on('end', ok); r.on('error', red);
        });
      }
    }
    if (gizliBlok) await d.dosya('gizli.enc', gizliBlok.length, gizliBlok);
    await d.bitir();
    gz.end();
    await bitti;
    fs.rmSync(govdeYol, { force: true });
    fs.renameSync(yaziliyor, cikti);
    const boyut = fs.statSync(cikti).size;
    ilerleme({ asama: 'bitti', yapilan: toplamBayt, toplam: toplamBayt, boyut });
    return { dosya: cikti, boyut, bildiri: { ...bildiri, dosyalar: undefined, dosyaSayisi: kayitlar.length } };
  } catch (e) {
    for (const f of [govdeYol, `${govdeYol}.enc`, yaziliyor]) { try { fs.rmSync(f, { force: true }); } catch { /* */ } }
    throw e;
  }
}

/** Yalnız bildiri (ilk kayıt) — şifresiz, dosyanın tamamı açılmadan ("hangi sürümden, ne var"). */
async function bildiriOku(dosya) {
  let bildiri = null;
  const DUR = Symbol('dur');
  try {
    await P.paketOku(dosya, async (k) => {
      if (k.ad !== 'bildiri.json') throw hata('bu bir Pusula paketi değil (ilk kayıt bildiri.json değil)', 400, 'bicim');
      if (k.boyut > 16 * 1024 * 1024) throw hata('bildiri çok büyük', 400, 'bicim');
      const p = [];
      return { yaz: async (b) => p.push(b), bitir: async () => { bildiri = JSON.parse(Buffer.concat(p).toString('utf8')); throw DUR; } };
    });
  } catch (e) { if (e !== DUR) throw (/^paket bozuk/.test(e.message) ? hata(`${e.message}`, 400, 'bozuk') : e); }
  bildiriDenetle(bildiri);
  return bildiri;
}
function bildiriDenetle(b) {
  if (!b || b.bicim !== BICIM) throw hata('bu bir Pusula taşıma dosyası değil', 400, 'bicim');
  if (b.bicimSurum > BICIM_SURUM) throw hata(`bu dosya daha yeni bir Pusula ile oluşturulmuş (biçim ${b.bicimSurum}) — önce Pusula'yı güncelleyin`, 400, 'surum');
  if (!UZANTI[b.tur]) throw hata(`bilinmeyen paket türü: ${b.tur}`, 400, 'bicim');
}

const IZINLI_VERI = new Set(['kisisel', 'arastirma']);
/** Paket içi yol → staging göreli yol | hata (yol kaçışı, izinsiz tür). */
function icYolDenetle(yol, tur) {
  const p = yol.split('/');
  if (p.some(x => !x || x === '.' || x === '..') || /[\\:*?"<>|\0]/.test(yol)) throw hata(`paket bozuk: geçersiz yol (${yol})`, 400, 'bozuk');
  if (p[0] === 'veri' && p.length >= 3 && IZINLI_VERI.has(p[1])) { if (tur === 'arastirma-eklentisi' && p[1] !== 'arastirma') throw hata(`eklentide araştırma dışı veri: ${yol}`, 400, 'bozuk'); return yol; }
  if (p[0] === 'program' && tur === 'arastirma-eklentisi' && EKLENTI_PROGRAM.some(k => (p.slice(1).join('/') + '/').startsWith(k.kok + '/'))) return yol;
  throw hata(`paket bozuk: beklenmeyen kayıt (${yol})`, 400, 'bozuk');
}

/**
 * Paketi geçici klasöre AÇ + DOĞRULA (hedef klasör yok olmalı). Hata → klasör silinir, hata atılır.
 * @returns {{ bildiri, dosyalar: [{ yol, boyut, sha256 }], hedef }}
 */
async function ac({ dosya, sifre, hedef, beklenenTur }) {
  if (fs.existsSync(hedef)) throw hata('geçici klasör zaten var', 500);
  fs.mkdirSync(hedef, { recursive: true });
  try {
    let bildiri = null, gizliBuf = null, govdeEnc = false, icListe = null;
    const yazilan = new Map();
    const dosyaIsleyici = (tur) => async (k) => {
      if (k.ad === 'dosyalar.json' && tur === 'ic') { const p = []; return { yaz: async (b) => p.push(b), bitir: async () => { icListe = JSON.parse(Buffer.concat(p).toString('utf8')); } }; }
      const y = icYolDenetle(k.ad, bildiri.tur);
      if (yazilan.has(y)) throw hata(`paket bozuk: aynı dosya iki kez (${y})`, 400, 'bozuk');
      const tam = path.join(hedef, ...y.split('/'));
      fs.mkdirSync(path.dirname(tam), { recursive: true });
      const fd = fs.openSync(tam, 'w');
      const h = crypto.createHash('sha256');
      let n = 0;
      return { yaz: async (b) => { h.update(b); n += b.length; fs.writeSync(fd, b); }, bitir: async () => { fs.closeSync(fd); yazilan.set(y, { yol: y, boyut: n, sha256: h.digest('hex') }); } };
    };
    await P.paketOku(dosya, async (k) => {
      if (!bildiri) {
        if (k.ad !== 'bildiri.json') throw hata('bu bir Pusula paketi değil', 400, 'bicim');
        const p = [];
        return { yaz: async (b) => p.push(b), bitir: async () => { bildiri = JSON.parse(Buffer.concat(p).toString('utf8')); bildiriDenetle(bildiri); if (beklenenTur && bildiri.tur !== beklenenTur) throw hata(beklenenTur === 'tasima' ? 'Bu bir araştırma eklentisi — Ayarlar › Yedek ve taşıma › "Eklenti yükle" ile yükleyin.' : 'Bu bir taşıma dosyası, eklenti değil — kurulum sihirbazında "Başka bilgisayardan taşı" ile açın.', 400, 'tur'); } };
      }
      if (k.ad === 'gizli.enc') { if (k.boyut > 64 * 1024 * 1024) throw hata('paket bozuk: gizli kısım çok büyük', 400, 'bozuk'); const p = []; return { yaz: async (b) => p.push(b), bitir: async () => { gizliBuf = Buffer.concat(p); } }; }
      if (k.ad === 'govde.enc') {
        if (!bildiri.govde || !bildiri.govde.sifreli) throw hata('paket bozuk: beklenmeyen şifreli gövde', 400, 'bozuk');
        govdeEnc = true;
        const tam = path.join(hedef, '.govde.enc'); const fd = fs.openSync(tam, 'w'); const h = crypto.createHash('sha256');
        return { yaz: async (b) => { h.update(b); fs.writeSync(fd, b); }, bitir: async () => { fs.closeSync(fd); if (h.digest('hex') !== bildiri.govde.sha256) throw hata('paket bozuk: şifreli gövde özeti tutmuyor', 400, 'bozuk'); } };
      }
      return dosyaIsleyici('dis')(k);
    });
    if (!bildiri) throw hata('paket boş', 400, 'bozuk');
    let beklenen = bildiri.dosyalar || [];
    if (bildiri.govde && bildiri.govde.sifreli) {
      if (!govdeEnc) throw hata('paket bozuk: şifreli gövde eksik', 400, 'bozuk');
      if (!sifre) throw hata('Bu eklenti şifreli — şifreyi girin.', 401, 'sifre');
      const enc = path.join(hedef, '.govde.enc'), acik = path.join(hedef, '.govde.tar');
      await P.cozDosya(enc, acik, sifre, bildiri.govde.kripto);
      fs.rmSync(enc, { force: true });
      await P.tarOku(fs.createReadStream(acik), dosyaIsleyici('ic'));
      fs.rmSync(acik, { force: true });
      if (!Array.isArray(icListe)) throw hata('paket bozuk: şifreli gövdede dosya listesi yok', 400, 'bozuk');
      beklenen = icListe;
    }
    // Doğrulama: bildirideki her dosya var + özet/boyut tutar; fazlası yok
    const eksik = [], bozuk = [];
    for (const f of beklenen) {
      const y = yazilan.get(f.yol);
      if (!y) eksik.push(f.yol); else if (y.sha256 !== f.sha256 || y.boyut !== f.boyut) bozuk.push(f.yol);
    }
    const fazla = [...yazilan.keys()].filter(y => !beklenen.some(f => f.yol === y));
    if (eksik.length || bozuk.length || fazla.length) {
      throw hata(`Dosya doğrulanamadı — hiçbir şey değiştirilmedi. ${bozuk.length ? `Özeti tutmayan: ${bozuk.slice(0, 3).join(', ')}${bozuk.length > 3 ? ` (+${bozuk.length - 3})` : ''}. ` : ''}${eksik.length ? `Eksik: ${eksik.length} dosya. ` : ''}${fazla.length ? `Listede olmayan: ${fazla.length} dosya.` : ''}`.trim(), 400, 'bozuk');
    }
    // GİZLİ
    if (bildiri.gizli && bildiri.gizli.var) {
      if (!gizliBuf) throw hata('paket bozuk: gizli kısım eksik', 400, 'bozuk');
      if (P.sha256(gizliBuf) !== bildiri.gizli.sha256) throw hata('paket bozuk: gizli kısmın özeti tutmuyor', 400, 'bozuk');
      if (!sifre) throw hata('Bu dosyada gizli bilgiler var — şifreyi girin.', 401, 'sifre');
      const j = JSON.parse(P.coz(gizliBuf, sifre, bildiri.gizli.kripto).toString('utf8'));
      for (const g of j.dosyalar || []) {
        const p = g.yol.split('/');
        if (p[0] !== 'veri' || p[1] !== 'gizli' || p.length !== 3 || /[\\/:*?"<>|\0]|^\.\.?$/.test(p[2])) throw hata(`paket bozuk: gizli yol geçersiz (${g.yol})`, 400, 'bozuk');
        const v = Buffer.from(g.veri, 'base64');
        if (P.sha256(v) !== g.sha256 || v.length !== g.boyut) throw hata(`paket bozuk: gizli dosya özeti tutmuyor (${p[2]})`, 400, 'bozuk');
        const tam = path.join(hedef, 'veri', 'gizli', p[2]);
        fs.mkdirSync(path.dirname(tam), { recursive: true });
        fs.writeFileSync(tam, v);
        yazilan.set(g.yol, { yol: g.yol, boyut: v.length, sha256: g.sha256 });
      }
    } else if (gizliBuf) throw hata('paket bozuk: bildiride olmayan gizli kısım', 400, 'bozuk');
    fs.writeFileSync(path.join(hedef, '.bildiri.json'), JSON.stringify(bildiri));
    return { bildiri, dosyalar: [...yazilan.values()], hedef };
  } catch (e) {
    try { fs.rmSync(hedef, { recursive: true, force: true }); } catch { /* */ }
    if (/^paket bozuk|gzip/.test(e.message) && !e.durum) throw hata(e.message, 400, 'bozuk');
    throw e;
  }
}

/** Önizleme (panel): ne gelecek, ne kadar, hangi sürümden. */
function onizleme(bildiri, dosyalar, o = {}) {
  const turBasi = {};
  const parcalar = {};
  for (const f of dosyalar) {
    const p = f.yol.split('/');
    const tur = p[0] === 'program' ? 'PROGRAM' : ({ kisisel: 'KISISEL', gizli: 'GIZLI', arastirma: 'ARASTIRMA' })[p[1]];
    const x = turBasi[tur] || (turBasi[tur] = { dosya: 0, bayt: 0 }); x.dosya++; x.bayt += f.boyut;
    if (p[0] === 'veri') { const ad = p[2]; (parcalar[tur] || (parcalar[tur] = new Set())).add(ad); }
  }
  const ad = (t) => [...(parcalar[t] || [])].sort();
  const botlar = BOTLAR.filter(b => ad('KISISEL').includes('live') && dosyalar.some(f => f.yol.startsWith(`veri/kisisel/live/${b}`)));
  return {
    tur: bildiri.tur, uygulamaSurum: bildiri.uygulamaSurum, buSurum: o.buSurum || null, olusturma: bildiri.olusturma, makine: bildiri.makine,
    kaynak: bildiri.kaynak, turler: turBasi, kisiselParcalar: ad('KISISEL'), gizliAdlar: ad('GIZLI'), arastirmaParcalar: ad('ARASTIRMA'),
    sunucuBaglantisi: !!(bildiri.gizli && bildiri.gizli.sunucuBaglantisi), gizliVar: !!(bildiri.gizli && bildiri.gizli.var), botlar,
    haric: bildiri.haric || [], notlar: bildiri.notlar || [],
    surumUyari: o.buSurum && bildiri.uygulamaSurum && bildiri.uygulamaSurum !== o.buSurum
      ? (parseFloat(bildiri.uygulamaSurum) > parseFloat(o.buSurum) ? `Dosya daha yeni bir Pusula'dan (${bildiri.uygulamaSurum}); bu bilgisayar ${o.buSurum}. Önce güncellemeniz önerilir.` : `Dosya ${bildiri.uygulamaSurum} sürümünden; bu bilgisayar ${o.buSurum} — kayıtlar okunur.`)
      : null,
  };
}

/** Hedefte kişisel/gizli veri var mı (boş kurulumun kendi ürettikleri sayılmaz). */
/** 68.3: kurulum adımının (scripts/kur.js) ürettiği telefon jetonu "kişisel veri var" sayılmaz (boş kurulum; taşınan jeton gelirse eskisi önceki-<zaman>'a). */
function kurulumUrettiMi(p) {
  if (p.ad !== 'telefon-jeton.json') return false;
  try { return JSON.parse(fs.readFileSync(p.yol, 'utf8')).kaynak === 'scripts/kur.js'; } catch (e) { return false; }
}

function doluluk(c) {
  const dolu = [];
  for (const p of yollar.parcalar(c)) {
    const tur = p.tur || turler.BILINMEYEN_TUR;
    if (tur !== 'KISISEL' && tur !== 'GIZLI') continue;
    if (kurulumUrettiMi(p)) continue;
    const anlamli = dosyalar(p.yol, p.ad).filter(f => !(tur === 'KISISEL' && OTOMATIK.some(r => r.test(f.goreli))));
    if (anlamli.length) dolu.push({ ad: p.ad, tur, dosya: anlamli.length });
  }
  return { dolu: dolu.length > 0, parcalar: dolu };
}

const damga = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');

/**
 * Doğrulanmış geçici klasörü yerine koy. mod: 'bos' (hedefte kişisel veri varsa RED) | 'degistir' (var olan → makine/onceki-<zaman>).
 * Eklenti için `eklentiYerlestir`. @returns {{ yerlesen: string[], onceki: string|null, tasinan: string[] }}
 */
function yerlestir({ hedef, program, mod = 'bos', simdi = new Date() }) {
  const c = cozum(program);
  const bildiri = JSON.parse(fs.readFileSync(path.join(hedef, '.bildiri.json'), 'utf8'));
  if (bildiri.tur !== 'tasima') throw hata('bu bir taşıma dosyası değil', 400, 'tur');
  const d = doluluk(c);
  if (d.dolu && mod !== 'degistir') {
    throw hata(`Bu bilgisayarda zaten kişisel veri var (${d.parcalar.map(p => p.ad).slice(0, 6).join(', ')}${d.parcalar.length > 6 ? '…' : ''}) — üzerine yazılmaz. Boş bir kurulumda deneyin ya da "Var olanı yedekleyip değiştir"i seçin.`, 409, 'dolu');
  }
  const gelen = [];
  for (const klasor of ['kisisel', 'gizli', 'arastirma']) {
    const d2 = path.join(hedef, 'veri', klasor);
    if (fs.existsSync(d2)) for (const ad of fs.readdirSync(d2)) gelen.push({ ad, kaynak: path.join(d2, ad) });
  }
  const oncekiKok = yollar.yolKur(c, [`onceki-${damga(simdi)}`]);
  const kenara = [];       // [{ yer, onceki }]
  const konan = [];        // [{ kaynak, yer }]
  try {
    // A. Kenara: 'degistir' → bütün var olan KİŞİSEL + GİZLİ (+ gelen araştırma parçalarıyla çakışan); 'bos' → yalnız çakışan otomatik dosyalar
    const tasinacak = new Map();
    if (mod === 'degistir') for (const p of yollar.parcalar(c)) { const t = p.tur || turler.BILINMEYEN_TUR; if (t === 'KISISEL' || t === 'GIZLI') tasinacak.set(p.ad, p.yol); }
    for (const g of gelen) { const yer = yollar.yolKur(c, [g.ad]); if (fs.existsSync(yer)) tasinacak.set(g.ad, yer); }
    for (const [ad, yer] of tasinacak) {
      const onceki = path.join(oncekiKok, ad);
      fs.mkdirSync(path.dirname(onceki), { recursive: true });
      fs.renameSync(yer, onceki);
      kenara.push({ yer, onceki });
    }
    // B. Yerleştir
    for (const g of gelen) {
      const yer = yollar.yolKur(c, [g.ad]);
      fs.mkdirSync(path.dirname(yer), { recursive: true });
      fs.renameSync(g.kaynak, yer);
      konan.push({ kaynak: g.kaynak, yer });
    }
  } catch (e) {
    for (const k of konan.reverse()) { try { fs.renameSync(k.yer, k.kaynak); } catch { /* */ } }
    for (const k of kenara.reverse()) { try { fs.renameSync(k.onceki, k.yer); } catch { /* */ } }
    throw hata(`Yerleştirme yarıda kaldı ve geri alındı — hiçbir şey değişmedi (${e.message}).`, 500, 'yerlestirme');
  }
  if (kenara.length) {
    try { fs.writeFileSync(path.join(oncekiKok, 'NEDIR.txt'), `Pusula taşıma dosyası içe aktarılmadan önce bu bilgisayarda olan veri (${simdi.toISOString()}).\r\nKaynak dosya: ${bildiri.makine} · ${bildiri.olusturma}\r\n`, 'utf8'); } catch { /* */ }
  }
  bekleyenYaz(c, { zaman: simdi.toISOString(), kaynakMakine: bildiri.makine, kaynakSurum: bildiri.uygulamaSurum, olusturma: bildiri.olusturma, botlar: BOTLAR.slice(), temiz: [] });
  try { fs.rmSync(hedef, { recursive: true, force: true }); } catch { /* */ }
  return { yerlesen: konan.map(k => path.basename(k.yer)), onceki: kenara.length ? oncekiKok : null, tasinan: kenara.map(k => path.basename(k.yer)) };
}

/**
 * Eklentiyi yerleştir: hiçbir şeyin ÜZERİNE YAZILMAZ — dosya başına: yoksa konur, aynısı varsa atlanır, farklısı varsa
 * "çakışma" (atlanır, raporlanır). Yarıda hata → konanlar geri alınır.
 */
async function eklentiYerlestir({ hedef, program }) {
  const c = cozum(program);
  const bildiri = JSON.parse(fs.readFileSync(path.join(hedef, '.bildiri.json'), 'utf8'));
  if (bildiri.tur !== 'arastirma-eklentisi') throw hata('bu bir araştırma eklentisi değil', 400, 'tur');
  const rapor = { konan: 0, ayni: 0, cakisma: [], bayt: 0 };
  const konan = [];
  try {
    const kaynaklar = [...dosyalar(path.join(hedef, 'veri', 'arastirma')).map(f => ({ ...f, yer: yollar.yolKur(c, f.goreli.split('/')) })),
      ...dosyalar(path.join(hedef, 'program')).map(f => ({ ...f, yer: path.join(c.program, ...f.goreli.split('/')) }))];
    for (const f of kaynaklar) {
      if (fs.existsSync(f.yer)) {
        if ((await P.sha256Dosya(f.yer)) === (await P.sha256Dosya(f.tam))) rapor.ayni++;
        else rapor.cakisma.push(path.relative(c.program, f.yer).startsWith('..') ? path.relative(c.kok, f.yer) : path.relative(c.program, f.yer));
        continue;
      }
      fs.mkdirSync(path.dirname(f.yer), { recursive: true });
      fs.renameSync(f.tam, f.yer);
      konan.push({ kaynak: f.tam, yer: f.yer });
      rapor.konan++; rapor.bayt += f.boyut;
    }
  } catch (e) {
    for (const k of konan.reverse()) { try { fs.renameSync(k.yer, k.kaynak); } catch { /* */ } }
    throw hata(`Eklenti yerleştirmesi yarıda kaldı ve geri alındı (${e.message}).`, 500, 'yerlestirme');
  }
  const isaret = yollar.yolKur(c, [EKLENTI_ISARET]);
  let onceki = {};
  try { onceki = JSON.parse(fs.readFileSync(isaret, 'utf8')); } catch { /* ilk */ }
  const yuklemeler = [...(onceki.yuklemeler || []), { zaman: new Date().toISOString(), makine: bildiri.makine, olusturma: bildiri.olusturma, surum: bildiri.uygulamaSurum, konan: rapor.konan, ayni: rapor.ayni, cakisma: rapor.cakisma.length }].slice(-20);
  fs.mkdirSync(path.dirname(isaret), { recursive: true });
  fs.writeFileSync(isaret, JSON.stringify({ eklenti: 'arastirma', yuklemeler }, null, 2));
  try { fs.rmSync(hedef, { recursive: true, force: true }); } catch { /* */ }
  durumSifirla();
  return rapor;
}

/* ── araştırma eklentisi durumu (menü görünürlüğü) ───────────────────────── */

let _durum = null, _durumZaman = 0;
function durumSifirla() { _durum = null; }
/**
 * Araştırma "yüklü" mü: (1) eklenti işareti varsa, (2) veri kökünde içi dolu bir ARAŞTIRMA parçası varsa, (3) ESKİ düzen
 * (program/data — bugünkü kurulumlar: bu bilgisayar ve sunucu) → evet. Yeni boş kurulum → hayır (menü gizli).
 */
function eklentiDurumu(program, { tazele = false } = {}) {
  const bu = !program || path.resolve(program).toLowerCase() === yollar.PROGRAM.toLowerCase();
  if (bu && !tazele && _durum && Date.now() - _durumZaman < 60000) return _durum;
  const c = cozum(program);
  let r;
  if (c.duzen === 'eski') r = { yuklu: true, neden: 'eski-duzen' };
  else if (fs.existsSync(yollar.yolKur(c, [EKLENTI_ISARET]))) r = { yuklu: true, neden: 'eklenti' };
  else {
    const dolu = yollar.parcalar(c).find(p => p.tur === 'ARASTIRMA' && p.ad !== EKLENTI_ISARET && icDoluMu(p.yol));
    r = dolu ? { yuklu: true, neden: 'arastirma-verisi', parca: dolu.ad } : { yuklu: false, neden: null };
  }
  if (bu) { _durum = r; _durumZaman = Date.now(); }
  return r;
}
function icDoluMu(d) {
  let st; try { st = fs.lstatSync(d); } catch { return false; }
  if (st.isFile()) return true;
  if (!st.isDirectory()) return false;
  for (const a of fs.readdirSync(d)) if (icDoluMu(path.join(d, a))) return true;
  return false;
}

/* ── "mutabakat bekliyor" işareti ─────────────────────────────────────────── */

function bekleyenYolu(c) { return yollar.yolKur(c, [BEKLIYOR_AD]); }
function bekleyenYaz(c, j) { const f = bekleyenYolu(c); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(`${f}.tmp`, JSON.stringify(j, null, 2)); fs.renameSync(`${f}.tmp`, f); }
/** İşaret (yoksa null). */
function bekleyenOku(program) { try { return JSON.parse(fs.readFileSync(bekleyenYolu(cozum(program)), 'utf8')); } catch { return null; } }
/** Bot taşıma sonrası mutabakat bekliyor mu. */
function botBekliyor(bot, program) { const j = bekleyenOku(program); return !!(j && (j.botlar || []).includes(bot) && !(j.temiz || []).includes(bot)); }
/** Temiz mutabakat → o botun işareti kalkar; hepsi temizse dosya silinir. */
function mutabakatTemiz(bot, program) {
  const c = cozum(program);
  const j = bekleyenOku(program);
  if (!j || !(j.botlar || []).includes(bot)) return j;
  j.temiz = [...new Set([...(j.temiz || []), bot])];
  if (j.botlar.every(b => j.temiz.includes(b))) { try { fs.rmSync(bekleyenYolu(c), { force: true }); } catch { /* */ } return null; }
  bekleyenYaz(c, j);
  return j;
}

/* ── yedek şifresi (USB yedeği) ──────────────────────────────────────────── */

function yedekSifreYolu(program) { return yollar.yolKur(cozum(program), [YEDEK_SIFRE_AD]); }
function yedekSifreKaydet(sifre, program) {
  P.sifreDenetle(sifre);
  const f = yedekSifreYolu(program);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, JSON.stringify({ sifre, kayit: new Date().toISOString(), not: 'USB yedeği (.pusula) gizli kısmının şifresi. Bu dosya taşıma dosyasında şifreli gider; kimseyle paylaşmayın.' }, null, 2));
  fs.renameSync(`${f}.tmp`, f);
}
function yedekSifre(program) { try { const j = JSON.parse(fs.readFileSync(yedekSifreYolu(program), 'utf8')); return typeof j.sifre === 'string' && j.sifre.length >= 8 ? j.sifre : null; } catch { return null; } }

/** Taşıma dosyalarının klasörü (<veri>/makine/tasima). */
function klasor(program) { return yollar.yolKur(cozum(program), ['tasima']); }

module.exports = {
  olustur, bildiriOku, ac, onizleme, yerlestir, eklentiYerlestir, doluluk, secim, ayarKatmani, tahmin, eklentiDurumu, durumSifirla,
  bekleyenOku, botBekliyor, mutabakatTemiz, yedekSifreKaydet, yedekSifre, klasor, uygulamaSurumu, damga,
  UZANTI, BICIM, BICIM_SURUM, BOTLAR, BEKLIYOR_AD, EKLENTI_ISARET, YEDEK_SIFRE_AD, OTOMATIK, SIR_ALANLARI, EKLENTI_PROGRAM,
};
