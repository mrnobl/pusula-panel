'use strict';
/**
 * KURU DENEME (69.2) — güncellemeden ÖNCE botların kararı eski ve yeni kodla, emir göndermeden karşılaştırılır.
 * ═══════════════════════════════════════════════════════════════════════════
 * Neden: 2026-10-21 "fiyat yok" bir kod hatasıydı. Sözdizimi denetimi ve açılış sağlığı kodun ÇALIŞTIĞINI söyler, botun DOĞRU
 * karar verdiğini değil. lib/guncelleme.js bot kodu değişen (onaylı) kurulumda, sözdizimi denetiminden sonra, Pusula yeniden
 * başlamadan önce bunu çağırır:
 *   1. eski (`once`) ve yeni (`hedef`) commit'in `lib/` ağacı ayrı geçici klasörlere açılır (git archive) — gerçek veri yerine
 *      hiçbir şey yazılmaz (kopya program kökü → kopya-data, lib/yollar.js).
 *   2. her bot için veri dizininin İKİ kopyası alınır (eski ve yeni koşu birbirini etkilemesin).
 *   3. scripts/kuru-deneme.js her kopyada ayrı süreçte koşar (kâğıt: karar; demo/canlı: yalnız yükleme — hesaba bağlanmaz).
 *   4. `karsilastir` → ayni | fark | yeni-hata | ikisi-hata | eski-hata.
 * Sonuç (guncelleme.js): yeni-hata → kurulmaz, geri alınır (Pusula yeniden başlamaz; eski sürüm hiç durmadı).
 *   fark → kurulmaz, "onay" + `kuruFark`; panelde "Farkı gördüm, yine de kur". ikisi-hata → uyarı (yeni kodun getirdiği bir şey
 *   değil), kurulum sürer. Deneme hiç yapılamazsa (ağ, git archive, sunucu yanıtı) → uyarı, kurulum sürer.
 * 69.6 SIRSIZ ORTAM (güvenlik testi Y1): deneme imza doğrulamasından SONRA koşar ve koşucu süreç sır göremez:
 *   · ortam değişkenleri izin listesiyle temizlenir (`kuruOrtam`): Pusula/jeton/anahtar değişkenleri geçmez; PUSULA_KURU=1 →
 *     lib/sirKasasi her okumada SirKilitliHatasi.
 *   · `--require` ile yüklenen ağ kalkanı (`KALKAN_KODU`, bu modülde — gelen koddan DEĞİL): yalnız Binance'in herkese açık
 *     piyasa verisi adreslerine bağlantı; başka her bağlantı ve alt süreç (child_process) hata verir.
 *   · 76.7: bot kaydındaki işlem borsası OKX ise o bot `--borsa okx` ile koşar ve AYRI kalkan dosyasını (`KALKAN_OKX_KODU`) yükler:
 *     Binance'e ek YALNIZ OKX'in herkese açık REST adresleri (www.okx.com / okx.com / aws.okx.com; WebSocket yok). Koşuda anahtar
 *     yoktur (sırsız ortam + sır kasası kilitli) → yalnız anahtarsız veri uçları (pazar listesi) okunabilir. Binance botları
 *     eskisiyle BİREBİR: aynı argümanlar, aynı kalkan (OKX adresi Binance koşusunda yine yasak).
 *   · veri yalnız kopya (bot dizini kopyası; secrets.json bot dizininde değildir).
 *   Sınır: aynı Windows kullanıcısıyla koşan kötü kod bu katmanları kendi içinden aşmayı deneyebilir — asıl kapı imza doğrulamasıdır.
 * Sınır: aynı hatayı eski kod da veriyorsa (ör. bugünkü hata güncellemeden değil sıfırlamadan geldiyse) bu bir "fark" değildir.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SURE_MS = 4 * 60000;
/** Koşucuya geçen ortam değişkenleri (izin listesi; büyük/küçük harf duyarsız). Gerisi — PUSULA_*, PANEL_TOKEN, anahtarlar — geçmez. */
const ORTAM_IZIN = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|LANG|TZ)$/i;
function kuruOrtam(kaynak, kok) {
  const env = {};
  for (const [k, v] of Object.entries(kaynak || {})) if (ORTAM_IZIN.test(k)) env[k] = v;
  env.NODE_PATH = require('path').join(kok, 'node_modules');
  env.PUSULA_KURU = '1';
  return env;
}
/** Ağ kalkanı: koşucu sürece --require ile yüklenir. İzinli: Binance herkese açık piyasa verisi (anahtarsız, yalnız okuma). */
const KALKAN_KODU = `'use strict';
const net = require('net'); const cp = require('child_process');
const IZIN = /(^|\\.)(binance\\.com|binance\\.vision|binancefuture\\.com)$/i;
const red = (n) => { throw new Error('kuru deneme: izin yok (' + n + ')'); };
const ilk = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const o = a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) ? (a[0][0] || a[0]) : null;
  const host = o && typeof o === 'object' ? (o.servername || o.host || '') : (typeof a[1] === 'string' ? a[1] : '');
  if (o && o.path) red('yerel bağlantı');
  if (!IZIN.test(String(host))) red('ağ: ' + host);
  return ilk.apply(this, a);
};
for (const ad of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[ad] = () => red('alt süreç');
`;
/** 76.7: OKX botunun koşusu — Binance kalkanıyla aynı, izin listesine yalnız OKX'in herkese açık REST adresleri eklenir. */
const OKX_IZIN_KAYNAK = '|^(www\\.|aws\\.)?okx\\.com$';
const KALKAN_OKX_KODU = KALKAN_KODU.replace("binancefuture\\.com)$/i;", `binancefuture\\.com)$${OKX_IZIN_KAYNAK}/i;`);
if (KALKAN_OKX_KODU === KALKAN_KODU) throw new Error('kuruDeneme: OKX kalkanı kurulamadı');
/** Saf (76.7): botun kuru denemedeki işlem borsası — yalnız bilinen Binance dışı kimlik ('okx'); diğer her şey Binance (eski yol). */
const kuruBorsa = (b) => (b && b.borsa === 'okx' ? 'okx' : null);
const OZSERMAYE_TOLERANS = 0.01;   // iki koşu arasında fiyat oynar: özsermaye %1 içinde aynı sayılır

const ALAN_AD = {
  rejimIcerde: 'trend rejimi', btcSebep: 'BTC işlem sebebi', btcWHedef: 'BTC hedef payı', btcYon: 'BTC işlem yönü', btcHata: 'BTC ayağı hatası',
  kolSemboller: 'kol evreni', kolRisk: 'risk kademesi', kolHata: 'kol yürütme hatası', ozsermaye: 'özsermaye', mutabakatEngel: 'mutabakat',
  gun: 'karar günü', bozuk: 'bozuk dosya', engel: 'ENGEL', sonGun: 'son çalışma günü', calisiyor: 'çalışıyor',
};
const yaz = (v) => (v == null ? '—' : Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * Saf: iki koşunun sonucu → { durum, farklar[{alan, ad, eski, yeni}], metin }.
 * @param eski / yeni  scripts/kuru-deneme.js çıktısı { ok, kip, karar, hata }
 */
function karsilastir(eski, yeni) {
  const eh = !eski || !eski.ok ? String((eski && eski.hata) || 'sonuç yok') : null;
  const yh = !yeni || !yeni.ok ? String((yeni && yeni.hata) || 'sonuç yok') : null;
  if (yh && !eh) return { durum: 'yeni-hata', farklar: [], metin: `yeni kod hata verdi: ${yh.slice(0, 200)}` };
  if (yh && eh) return { durum: 'ikisi-hata', farklar: [], metin: `iki sürüm de hata verdi (yeni kodun getirdiği değil): ${yh.slice(0, 160)}` };
  if (eh) return { durum: 'eski-hata', farklar: [], metin: `eski kod hata veriyordu, yeni kod çalıştı: ${eh.slice(0, 160)}` };
  const a = eski.karar || {}, b = yeni.karar || {};
  const farklar = [];
  for (const alan of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[alan], z = b[alan];
    if (alan === 'ozsermaye') {
      if (Number.isFinite(x) && Number.isFinite(z) && Math.abs(z - x) <= OZSERMAYE_TOLERANS * Math.max(Math.abs(x), 1)) continue;
    } else if (alan === 'bozuk' && x && z) continue;   // ikisi de bozuk diyorsa aynı
    if (JSON.stringify(x === undefined ? null : x) === JSON.stringify(z === undefined ? null : z)) continue;
    farklar.push({ alan, ad: ALAN_AD[alan] || alan, eski: x === undefined ? null : x, yeni: z === undefined ? null : z });
  }
  // Yeni kod bot kaydını bozuk görüyor ya da yeni ENGEL koyuyor → hata sayılır (bot açılışta kapanırdı).
  if (b.bozuk && !a.bozuk) return { durum: 'yeni-hata', farklar, metin: `yeni kod botun kaydını okuyamıyor: ${String(b.bozuk).slice(0, 160)}` };
  if (!farklar.length) return { durum: 'ayni', farklar, metin: 'karar aynı' };
  return { durum: 'fark', farklar, metin: farklar.map(f => `${f.ad}: ${yaz(f.eski)} → ${yaz(f.yeni)}`).join(' · ').slice(0, 400) };
}

/** Saf: bot sonuçları → genel durum (en kötüsü) + özet satırı. */
function genel(sonuclar) {
  const SIRA = { ayni: 0, 'eski-hata': 0, atlandi: 0, 'ikisi-hata': 1, fark: 2, 'yeni-hata': 3 };
  let d = 'ayni';
  for (const s of sonuclar) if ((SIRA[s.durum] || 0) > (SIRA[d] || 0)) d = s.durum;
  const ozet = sonuclar.map(s => `${s.adGorunen || s.ad} (${s.kip === 'karar' ? 'karar' : 'yükleme'}): ${s.metin}`).join(' · ');
  return { durum: d, ozet };
}

function kopyala(kaynak, hedef) {
  fs.mkdirSync(hedef, { recursive: true });
  if (!fs.existsSync(kaynak)) return;
  for (const ad of fs.readdirSync(kaynak)) {
    const k = path.join(kaynak, ad), h = path.join(hedef, ad);
    const st = fs.statSync(k);
    if (st.isDirectory()) kopyala(k, h);
    else if (st.isFile() && !/\.(tmp|lock)$/.test(ad)) fs.copyFileSync(k, h);
  }
}

/**
 * Bir commit'in lib/ ağacını `hedef` klasörüne açar: git archive → tar. tar yoksa (eski Windows) dosya dosya `git show`.
 * @param ops { git(args) → {kod,cikti}, komut(k, args, o) → {kod,cikti} }
 */
function libAc(ops, rev, hedef) {
  fs.mkdirSync(hedef, { recursive: true });
  const tarDosya = path.join(hedef, 'lib.tar');
  const a = ops.git(['archive', '--format=tar', '-o', tarDosya, rev, 'lib']);
  if (a.kod === 0 && fs.existsSync(tarDosya)) {
    const t = ops.komut('tar', ['-xf', tarDosya, '-C', hedef], { sure: 60000 });
    try { fs.rmSync(tarDosya, { force: true }); } catch { /* */ }
    if (t.kod === 0 && fs.existsSync(path.join(hedef, 'lib', 'live', 'bindirmeBot.js'))) return;
  }
  const l = ops.git(['ls-tree', '-r', '--name-only', rev, '--', 'lib']);
  if (l.kod !== 0) throw new Error(`git ls-tree: ${String(l.cikti).slice(0, 200)}`);
  for (const yol of String(l.cikti).split('\n').map(s => s.trim()).filter(Boolean)) {
    const r = ops.gitHam(['show', `${rev}:${yol}`]);
    if (r.kod !== 0) throw new Error(`git show ${yol}`);
    fs.mkdirSync(path.dirname(path.join(hedef, yol)), { recursive: true });
    fs.writeFileSync(path.join(hedef, yol), r.cikti);
  }
}

/**
 * Kuru denemeyi yapar.
 * @param o.kok      program kökü (yeni kod çalışma ağacında; koşucu buradan)
 * @param o.eskiRev / o.yeniRev
 * @param o.botlar   [{ ad, strateji?, adGorunen, mod, dizin, btcAyak, sermayeTavani, k, kagitBakiye, kucukSermaye, calisiyor }] (sunucudan)
 * @param o.ops      { git, gitHam, komut, node(args, {sure, env}) → Promise<{kod, cikti}> }
 * @param o.ilerleme (metin) → adım ayrıntısı
 * @returns {{ durum, ozet, botlar: [...] }}
 */
async function calistir({ kok, eskiRev, yeniRev, botlar, ops, ilerleme = () => {} }) {
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'pusula-kuru-'));
  try {
    ilerleme('eski ve yeni kod açılıyor');
    libAc(ops, eskiRev, path.join(gecici, 'eski'));
    libAc(ops, yeniRev, path.join(gecici, 'yeni'));
    const kosucu = path.join(kok, 'scripts', 'kuru-deneme.js');
    const env = kuruOrtam(process.env, kok);   // 69.6 sırsız
    const kalkan = path.join(gecici, 'ag-kalkani.js');
    fs.writeFileSync(kalkan, KALKAN_KODU, 'utf8');
    const kalkanOkx = path.join(gecici, 'ag-kalkani-okx.js');   // 76.7: yalnız OKX botunun koşusunda
    if (botlar.some(x => x.calisiyor && kuruBorsa(x))) fs.writeFileSync(kalkanOkx, KALKAN_OKX_KODU, 'utf8');
    const sonuclar = [];
    for (const b of botlar.filter(x => x.calisiyor)) {
      const kos = async (surum) => {
        const kopya = path.join(gecici, 'veri', `${b.ad}-${surum}`);
        kopyala(b.dizin, kopya);
        const okx = kuruBorsa(b);
        const args = ['--require', okx ? kalkanOkx : kalkan, kosucu, '--kok', path.join(gecici, surum), '--dizin', kopya, '--ad', b.ad, '--mod', b.mod, '--btcAyak', b.btcAyak || 'spot',
          '--tavan', String(b.sermayeTavani || 10000), '--k', String(b.k || 15), '--bakiye', String(b.kagitBakiye || 10000), '--kucuk', String(b.kucukSermaye == null ? 'oto' : b.kucukSermaye),
          ...(b.strateji && b.strateji !== b.ad ? ['--strateji', String(b.strateji)] : []),   // 74.4: kayıttaki strateji (Kairos/Tao'da yok)
          ...(okx ? ['--borsa', okx] : [])];   // 76.7: yalnız OKX botunda (Binance botunun argümanları birebir)
        const r = await ops.node(args, { sure: SURE_MS, env });
        const satir = String(r.cikti || '').trim().split('\n').reverse().find(s => s.trim().startsWith('{'));
        try { return JSON.parse(satir); } catch { return { ok: false, hata: `koşucu çıktısı okunamadı (çıkış ${r.kod}): ${String(r.cikti || '').trim().slice(-200)}` }; }
      };
      ilerleme(`${b.adGorunen || b.ad}: eski kodla`);
      const eski = await kos('eski');
      ilerleme(`${b.adGorunen || b.ad}: yeni kodla`);
      const yeni = await kos('yeni');
      const k = karsilastir(eski, yeni);
      sonuclar.push({ ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, ...(kuruBorsa(b) ? { borsa: kuruBorsa(b) } : {}), kip: (yeni && yeni.kip) || (eski && eski.kip) || (b.mod === 'kagit' ? 'karar' : 'yukleme'), ...k, eski, yeni });
    }
    if (!sonuclar.length) return { durum: 'atlandi', ozet: 'çalışan bot yok', botlar: [] };
    return { ...genel(sonuclar), botlar: sonuclar };
  } finally {
    try { fs.rmSync(gecici, { recursive: true, force: true }); } catch { /* geçici klasör sonra silinir */ }
  }
}

module.exports = { calistir, karsilastir, genel, libAc, kopyala, kuruOrtam, kuruBorsa, KALKAN_KODU, KALKAN_OKX_KODU, ORTAM_IZIN, OZSERMAYE_TOLERANS };
