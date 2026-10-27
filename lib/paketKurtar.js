'use strict';
/**
 * S-026 (2026-10-27) YARIM PAKET KURULUMU KURTARMASI — açılışta, `node server.js`'ten ÖNCE (scripts/denetleyici-bekle.js --basla).
 *
 * Sorun: güncelleyici (lib/guncelleme.js calistir) paket gerekince Pusula'yı durdurur, node_modules'ü node_modules.yedek-<zaman>'a
 * adlandırır ve `npm ci` koşar. Tam bu sırada elektrik kesilir / süreç ölürse kod YENİ (git merge yapılmış), paketler YARIM kalır;
 * geri alma (geriAl / paketGeriYukle) aynı süreçte olduğu için hiçbir şey geri almaz → Pusula açılamaz ("Cannot find module").
 *
 * Bu modül YALNIZ şu durumda dokunur (hepsi birden): güncelleme kaydında bitmemiş işlem + "paket" adımı SÜRÜYOR + güncelleme kilidinin
 * sahibi yaşamıyor + node_modules eksik / bozuk (bağımlılık yok ya da require atıyor) + node_modules.yedek-* var + git HEAD hedef ya da
 * eski commit. O zaman güncelleyicinin kendi geri alma sırasını AYNEN uygular: `git reset --keep <eski>` (guvenliGit; yerel değişiklik
 * varsa git reddeder → hiçbir şey değişmez) → yarım node_modules SİLİNMEZ, node_modules.yarim-<zaman>'a adlandırılır → en yeni yedek
 * node_modules olur → paketler doğrulanır → kayıt "geri-alindi" (güncelleyici ertesi denetimde yeniden dener; 2 kez geri alınan sürüm
 * elle bakılır — mevcut kural) + güncelleme günlüğü + Telegram. Koşullardan biri tutmazsa ya da bir adım olmazsa YALNIZ TEŞHİS: hiçbir
 * şey değişmez, Telegram'a bir kez "paket kurulumu yarıda kaldı — Onarım Rehberi S-026" iletisi gider.
 *
 * Yalnız fs.rename / fs okuma + git (execFile, kabuk yok) + doğrulama için process.execPath (Node) — PowerShell / cmd YOK, silme YOK.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yollar = require('./yollar');

const YEDEK_RE = /^node_modules\.yedek-[0-9TZ-]+$/;
const yasiyor = (pid) => { if (!(pid > 0)) return false; try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === 'EPERM'); } };
const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Saf olmayan küçük okuyucu: package.json bağımlılık adları. */
function bagimliliklar(kok) { const p = jsonOku(path.join(kok, 'package.json')) || {}; return Object.keys(p.dependencies || {}); }

/**
 * node_modules sağlam mı? (1) her bağımlılığın package.json'u var (2) ayrı Node sürecinde hepsi require edilebiliyor.
 * @returns { saglam, neden }
 */
function paketSaglam(kok, { calistir } = {}) {
  const adlar = bagimliliklar(kok);
  const NM = path.join(kok, 'node_modules');
  if (!fs.existsSync(NM)) return { saglam: false, neden: 'node_modules yok' };
  const eksik = adlar.filter(a => !fs.existsSync(path.join(NM, a, 'package.json')));
  if (eksik.length) return { saglam: false, neden: `eksik paket: ${eksik.slice(0, 5).join(', ')}` };
  const kod = `const p=${JSON.stringify(NM)};for(const a of ${JSON.stringify(adlar)})require(require.resolve(a,{paths:[p]}));`;
  try {
    (calistir || ((args) => execFileSync(process.execPath, args, { cwd: kok, timeout: 60000, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })))(['-e', kod]);
    return { saglam: true, neden: `${adlar.length} paket yükleniyor` };
  } catch (e) { return { saglam: false, neden: `paket yüklenemiyor: ${String((e && e.stderr) || (e && e.message) || e).split('\n').find(s => /Cannot find|Error/.test(s)) || 'require hatası'}`.slice(0, 240) }; }
}

/** En yeni node_modules.yedek-* (ad sırası = zaman sırası, ISO). */
function enYeniYedek(kok) {
  let l = [];
  try { l = fs.readdirSync(kok).filter(a => YEDEK_RE.test(a) && fs.statSync(path.join(kok, a)).isDirectory()).sort(); } catch { l = []; }
  return l.length ? path.join(kok, l[l.length - 1]) : null;
}

/**
 * Saf karar (öz test): durum + gözlemler → { eylem: 'yok' | 'kurtar' | 'teshis', neden, once, hedef }.
 * @param g { durum (guncelleme.json), kilit: { var, pid, yasiyor }, paket: { saglam, neden }, yedek, head }
 */
function karar(g) {
  const d = g.durum || {};
  const islem = d.islem;
  if (!islem || islem.bitti) return { eylem: 'yok', neden: 'bitmemiş güncelleme işlemi yok' };
  const a = (islem.adimlar || []).find(x => x && x.kod === 'paket');
  if (!a || a.durum !== 'suruyor') return { eylem: 'yok', neden: 'paket adımı sürmüyordu' };
  if (g.kilit && g.kilit.var && g.kilit.yasiyor) return { eylem: 'yok', neden: `güncelleyici hâlâ çalışıyor (pid ${g.kilit.pid})` };
  if (g.paket && g.paket.saglam) return { eylem: 'yok', neden: `paketler sağlam (${g.paket.neden}) — npm ci bitmiş; güncelleyici "yarıda kaldı" kaydını kendisi ele alır` };
  const once = d.kurulu && /^[0-9a-f]{40}$/.test(String(d.kurulu.sha || '')) ? d.kurulu.sha : null;
  const hedef = /^[0-9a-f]{40}$/.test(String(d.hedef || '')) ? d.hedef : null;
  const neden = `paket kurulumu yarıda kalmış (${(g.paket && g.paket.neden) || 'paketler bozuk'})`;
  if (!g.yedek) return { eylem: 'teshis', neden: `${neden}; geri konacak node_modules.yedek-* yok`, once, hedef };
  if (!once || !hedef) return { eylem: 'teshis', neden: `${neden}; güncelleme kaydında eski / hedef commit yok`, once, hedef };
  if (g.head !== hedef && g.head !== once) return { eylem: 'teshis', neden: `${neden}; kod ne eski ne hedef sürümde (HEAD ${String(g.head || '?').slice(0, 7)})`, once, hedef };
  return { eylem: 'kurtar', neden, once, hedef };
}

/**
 * Açılış kurtarması. @param o { kok, git (args → { kod, cikti }), bildir (seviye, baslik, satirlar) async, simdi, paketDenetle (deneme) }
 * @returns { eylem, neden, adimlar: [metin], sonuc: 'yok' | 'kurtarildi' | 'teshis' | 'basarisiz' }
 */
async function acilisKurtar(o = {}) {
  const kok = o.kok;
  const G = require('./guncelleme');
  const simdi = o.simdi || Date.now;
  const adimlar = [];
  const durum = G.durumOku(kok);
  if (!durum.islem || durum.islem.bitti) return { eylem: 'yok', sonuc: 'yok', neden: 'bitmemiş güncelleme işlemi yok', adimlar };   // hızlı yol: alt süreç yok
  if (G.gelistirmeMi(kok)) return { eylem: 'yok', sonuc: 'yok', neden: 'geliştirme bilgisayarı — güncelleyici burada çalışmaz', adimlar };
  const kilitYol = yollar.programVeri(kok, 'guncelleme.kilit');
  let kilit = { var: fs.existsSync(kilitYol), pid: null, yasiyor: false };
  if (kilit.var) { const pid = parseInt(String(fs.readFileSync(kilitYol, 'utf8')), 10); kilit = { ...kilit, pid, yasiyor: yasiyor(pid) }; }
  const git = o.git || ((args) => {
    let bin = 'git';
    try { bin = require('./kurulumDenetimi').gitBul(kok) || 'git'; } catch { /* */ }
    try { return { kod: 0, cikti: execFileSync(bin, ['-C', kok, ...G.guvenliGit(args)], { encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { return { kod: 1, cikti: `${(e && e.stdout) || ''}${(e && e.stderr) || (e && e.message) || ''}` }; }
  });
  const pd = o.paketDenetle || ((k) => paketSaglam(k));
  const head = String((git(['rev-parse', 'HEAD']).cikti || '')).trim();
  const k = karar({ durum, kilit, paket: pd(kok), yedek: enYeniYedek(kok), head });
  if (k.eylem === 'yok') return { ...k, sonuc: 'yok', adimlar };
  const gunluk = (m) => { try { G.gunluk(kok, m, simdi); } catch { /* */ } };
  const bildir = async (seviye, baslik, satirlar) => { try { if (o.bildir) await o.bildir(seviye, baslik, satirlar); } catch { /* bildirim yok */ } };
  const teshis = async (neden) => {
    // Denetleyici her açılışta (çökme döngüsünde 5 dk'da bir) çağırır: aynı işlem için günlük ve Telegram YALNIZ BİR KEZ.
    if (durum.paketTeshis === durum.islem.bas) return { ...k, eylem: 'teshis', neden, sonuc: 'teshis', adimlar, tekrar: true };
    try { G.durumYaz(kok, { ...G.durumOku(kok), paketTeshis: durum.islem.bas }); } catch { /* işaret yazılamazsa bir sonraki açılışta yine haber verir */ }
    gunluk(`AÇILIŞ KURTARMASI YAPILMADI (yalnız teşhis): ${neden}`);
    await bildir('critical', 'Pusula: paket kurulumu yarıda kaldı', [`Güncelleme sırasında paket kurulumu (npm ci) bitmeden kesildi: ${neden}.`, 'Pusula açılmayabilir. Kendiniz klasör adı değiştirmeyin / silmeyin.',
      'Ne yapmalı: Onarım Rehberi › S-026 — data\\sunucu-konsol.log son satırlarını ve C:\\Pusula klasörünün ekran görüntüsünü geliştirme sohbetine gönderin. Pozisyonları Binance uygulamasından izleyin; stoplar borsada.']);
    return { ...k, eylem: 'teshis', neden, sonuc: 'teshis', adimlar };
  };
  if (k.eylem === 'teshis') return teshis(k.neden);

  // ── KURTAR: güncelleyicinin geri alma sırası (geriAl / paketGeriYukle) — kod önce, sonra paketler ──
  const NM = path.join(kok, 'node_modules');
  const yedek = enYeniYedek(kok);
  if (head === k.hedef) {
    const r = git(['reset', '--keep', k.once]);
    if (r.kod !== 0) return teshis(`${k.neden}; git reset --keep ${k.once.slice(0, 7)} yapılamadı (${String(r.cikti).trim().slice(0, 160)}) — hiçbir şey değiştirilmedi`);
    adimlar.push(`kod eski sürüme döndü (git reset --keep ${k.once.slice(0, 7)})`);
  } else adimlar.push(`kod zaten eski sürümde (${k.once.slice(0, 7)})`);
  const zaman = new Date(simdi()).toISOString().replace(/[:.]/g, '-');
  let yarim = null;
  if (fs.existsSync(NM)) {
    yarim = path.join(kok, `node_modules.yarim-${zaman}`);
    try { fs.renameSync(NM, yarim); adimlar.push(`yarım node_modules → ${path.basename(yarim)} (silinmedi)`); }
    catch (e) { return teshis(`${k.neden}; kod geri alındı ama yarım node_modules kenara alınamadı (${e.code || e.message})`); }
  }
  try { fs.renameSync(yedek, NM); adimlar.push(`${path.basename(yedek)} → node_modules`); }
  catch (e) {
    if (yarim) { try { fs.renameSync(yarim, NM); } catch { /* */ } }
    return teshis(`${k.neden}; kod geri alındı ama yedek paketler geri konamadı (${e.code || e.message})`);
  }
  const son = pd(kok);
  adimlar.push(son.saglam ? `paketler doğrulandı (${son.neden})` : `UYARI: geri konan paketler de doğrulanamadı (${son.neden})`);
  const neden = `Paket kurulumu (npm ci) yarıda kalmıştı (elektrik kesintisi ya da süreç kapanması). Açılışta eski kod ve eski paketler geri kondu: ${adimlar.join(' · ')}.`;
  const islem = { ...durum.islem, bitti: new Date(simdi()).toISOString(), sonuc: 'geri-alindi',
    satirlar: [...(durum.islem.satirlar || []), { zaman: new Date(simdi()).toISOString(), metin: `AÇILIŞ KURTARMASI: ${adimlar.join(' · ')}`.slice(0, 400), tur: 'uyari' }] };
  const ga = { hedef: k.hedef, sayi: ((durum.geriAlinan && durum.geriAlinan.hedef === k.hedef) ? (durum.geriAlinan.sayi || 0) : 0) + 1, son: new Date(simdi()).toISOString() };
  try { G.durumYaz(kok, { ...durum, durum: 'geri-alindi', neden, geriDonus: son.saglam ? 'eski sürüm açılıyor (açılış kurtarması)' : 'eski sürüm paketleri doğrulanamadı — elle bakın', geriAlinan: ga, islem }); } catch { /* kayıt yazılamadı — Telegram yine gider */ }
  gunluk(`AÇILIŞ KURTARMASI: ${adimlar.join(' · ')}`);
  await bildir('critical', 'Pusula güncellemesi yarıda kalmıştı — açılışta geri alındı', [neden,
    son.saglam ? 'Pusula eski sürümle açılıyor; güncelleme bir sonraki denetimde yeniden denenir.' : 'Geri konan paketler de doğrulanamadı: Pusula açılmayabilir — Onarım Rehberi › S-026, geliştirme sohbetine yazın.',
    yarim ? `Yarım klasör ${path.basename(yarim)} olarak duruyor; Pusula düzgün açıldıktan sonra silinebilir.` : null].filter(Boolean));
  return { ...k, eylem: 'kurtar', neden, sonuc: son.saglam ? 'kurtarildi' : 'basarisiz', adimlar };
}

module.exports = { karar, acilisKurtar, paketSaglam, enYeniYedek, bagimliliklar, YEDEK_RE };
