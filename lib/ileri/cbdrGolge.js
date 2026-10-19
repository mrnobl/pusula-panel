/**
 * İLERİ VERİ GÖLGE TESTİ — EUR/USD "CBDR ile Londra girişi" (PLAN-ILERI-CBDR.md "ÖN KAYIT", deneme 864).
 * EMİR YOK, PARA YOK: yalnız kayıt. lib/live ve lib/risk'e DOKUNMAZ.
 *
 * VERİ: Binance spot EURUSDT 5 dk mumları (herkese açık, anahtarsız; ccxt). Fiyat EUR/USD'ye çok yakın; maliyet ECN EUR/USD
 * varsayımıyla. Mumlar `data/ileri/cbdr-mum/EURUSDT-5m-AAAA-AA.json` önbelleğinde ([t, o, h, l, c]); her çalışmada son 2 gün
 * yeniden indirilir (borsa düzeltmesi yakalanır, geçmiş KAYIT değişmez — fark uyarı olur).
 *
 * KURAL (ön kayıt §2 — saatler New York, yaz saati dahil):
 *   gün = NY 00:00'da başlar; yalnız pazartesi–cuma. P = önceki iş günü (pazartesi → cuma).
 *   CBDR = P'nin 14:00–20:00 mumlarının GÖVDE (max/min(o, c)) en yükseği / en düşüğü → cbH, cbL, r = cbH − cbL.
 *   Asya = D'den önceki takvim gününün 20:00–24:00 yüksek / düşüğü (pazartesi için pazar akşamı) → aH, aL.
 *   ADR5 = son 5 iş gününün (yüksek − düşük) ortalaması (P dahil, D hariç).
 *   yön = P kapanışı > (P yüksek + P düşük) / 2 → +1 (alış günü), < → −1 (satış günü), eşit → işlem yok.
 *   koşul: r > 0, r ≤ 0,45·ADR5, (aH − aL) ≤ 0,35·ADR5.
 *   giriş: 02:00–04:00 limit — satış cbH + r, alış cbL − r; mum seviyeye dokunursa dolar (açılış seviyenin ötesindeyse açılıştan).
 *   stop = giriş ± 0,33·ADR5 (satışta üstte); hedef = satışta cbL − 2r, alışta cbH + 2r.
 *   çıkış: stop ya da hedef; aynı mumda ikisi → stop; dolum mumunda yalnız stop; 11:00'de açıksa o mumun açılışından.
 *   maliyet: her dolumda 0,5 pip (0,00005); stop ve zaman çıkışında ayrıca 0,2 pip. stop mesafesi < 3 × gidiş-dönüş (1 pip)
 *   → işlem açılmaz. R = net / stop mesafesi. Günde en fazla bir işlem.
 *
 * KAYIT `data/ileri/cbdr-kayit.jsonl` — YALNIZ EKLENİR, anahtar `gun` (ilk 2026-10-15). Gün D, D 11:30 NY'den sonra yazılır.
 *   Her çalışmada bütün günler baştan hesaplanır; kayıtlı bir günün sonucu (imza) değişirse UYARI (`cbdr-son.json degisen`),
 *   kayıt DEĞİŞMEZ.
 * Ara rapor YALNIZ BETİMLEYİCİ; `hukum()` 2027-10-15 öncesi "henüz karar zamanı değil".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const I = require('./bollingerIzleme');

const DENEME = 864;
const PLAN = 'PLAN-ILERI-CBDR.md';
const BAS = '2026-10-15';
const ARA_KONTROL = '2027-04-15';
const KARAR = '2027-10-15';
const KARAR_ERTELEME = '2028-04-15';
const EN_AZ_ISLEM = 25;
const KAYNAK = 'Binance spot EURUSDT 5m';
const DK5 = 5 * 60e3;
const GUN = 864e5;

const P = Object.freeze({
  cbBas: 14 * 60, cbSon: 20 * 60, asyaBas: 20 * 60, girisBas: 2 * 60, girisSon: 4 * 60, kapanis: 11 * 60,
  rAdr: 0.45, asyaAdr: 0.35, stopAdr: 0.33, hedefR: 2, adrGun: 5,
  dolumMaliyet: 0.00005, kayma: 0.00002, stopMaliyetKat: 3,
  kesinlesme: 11 * 60 + 30,                  // D 11:30 NY'den sonra D kesinleşir (11:00 mumu kapanmış + pay)
});
/** Veri yeterliliği (ön kayıt §2c): pencere başına beklenen mumun en az bu kadarı yoksa gün "veri eksik" (işlem yok). */
const YETER = Object.freeze({ cb: 0.8, asya: 0.8, gunluk: 0.8, giris: 0.8 });

// ═══ 1. ZAMAN (America/New_York) ═══════════════════════════════════════════
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
const HG = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const saatOnbellek = new Map();
/** UTC ms → NY { gun: 'YYYY-AA-GG', dk: 0..1439, hg: 0 (pazar)..6 }. Saat başına önbellekli (yaz saati geçişi tam saatte). */
function ny(t) {
  const s = Math.floor(t / 3600e3);
  let o = saatOnbellek.get(s);
  if (!o) {
    const p = Object.fromEntries(NY.formatToParts(new Date(s * 3600e3)).map(x => [x.type, x.value]));
    o = { gun: `${p.year}-${p.month}-${p.day}`, saat: Number(p.hour), hg: HG[p.weekday] };
    if (saatOnbellek.size > 200000) saatOnbellek.clear();
    saatOnbellek.set(s, o);
  }
  return { gun: o.gun, dk: o.saat * 60 + Math.floor((t % 3600e3) / 60e3), hg: o.hg };
}
/** NY yerel (gün, dakika) → UTC ms. */
function nyUtc(gun, dk) {
  const [y, a, g] = gun.split('-').map(Number);
  const yerel = Date.UTC(y, a - 1, g, 0, dk);
  let t = yerel + 5 * 3600e3;
  for (let i = 0; i < 3; i++) {
    const n = ny(t), [yy, aa, gg] = n.gun.split('-').map(Number);
    const fark = Date.UTC(yy, aa - 1, gg, 0, n.dk) - yerel;
    if (!fark) break;
    t -= fark;
  }
  return t;
}
const gunEkle = (gun, n) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * GUN).toISOString().slice(0, 10);
const haftaGunu = (gun) => new Date(`${gun}T00:00:00Z`).getUTCDay();
const isGunuMu = (gun) => { const h = haftaGunu(gun); return h >= 1 && h <= 5; };
function oncekiIsGunu(gun) { let g = gunEkle(gun, -1); while (!isGunuMu(g)) g = gunEkle(g, -1); return g; }
function sonrakiIsGunu(gun) { let g = gunEkle(gun, 1); while (!isGunuMu(g)) g = gunEkle(g, 1); return g; }

// ═══ 2. MUM GRUPLARI ═══════════════════════════════════════════════════════
/** [[t,o,h,l,c]] (sıralı, tekil) → Map(gün → [{t,o,h,l,c,dk}]) NY gününe göre. `kesim`: yalnız kapanışı ≤ kesim olan mumlar. */
function grupla(mumlar, { kesim = Infinity } = {}) {
  const g = new Map();
  for (const m of mumlar) {
    if (m[0] + DK5 > kesim) continue;
    const n = ny(m[0]);
    let l = g.get(n.gun); if (!l) { l = []; g.set(n.gun, l); }
    l.push({ t: m[0], o: m[1], h: m[2], l: m[3], c: m[4], dk: n.dk });
  }
  return g;
}
const pencere = (G, gun, bas, son) => (G.get(gun) || []).filter(x => x.dk >= bas && x.dk < son);

// ═══ 3. GÜN HESABI (saf, deterministik) ═════════════════════════════════════
const yuv = (x, b = 5) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** b) / 10 ** b);

/**
 * Gün D'nin sonucu. `G` = grupla(...). `kesim` verilirse (canlı durum) yalnız o ana kadarki mumlar G'de olmalıdır; `asama`
 * hangi pencerelerin bittiğini söyler. Kesinleşmiş gün için kesim yok.
 * @returns { gun, onceki, durum: 'islem'|'dolmadi'|'kosul-yok'|'yon-yok'|'stop-dar'|'veri-eksik'|'bekliyor', yon, cbH, cbL, r, aH, aL, adr5,
 *            kosul: { r, asya }, limit, stop, hedef, islem: null | { yon, giris, girisZamani, cikis, cikisZamani, neden, brut, net, R }, eksik: [] }
 */
function gunHesapla(D, G, { simdi = Infinity } = {}) {
  const Pg = oncekiIsGunu(D), dun = gunEkle(D, -1);
  const o = { gun: D, onceki: Pg, durum: null, yon: null, cbH: null, cbL: null, r: null, aH: null, aL: null, adr5: null, kosul: null, limit: null, stop: null, hedef: null, islem: null, eksik: [] };
  const zaman = (gun, dk) => nyUtc(gun, dk);
  const bitti = (gun, dk) => simdi >= zaman(gun, dk);
  // ADR5 + yön (P'nin tam günü)
  const adrGunler = []; { let g = Pg; while (adrGunler.length < P.adrGun) { adrGunler.push(g); g = oncekiIsGunu(g); } }
  const araliklar = [];
  for (const g of adrGunler) {
    const l = G.get(g) || [];
    if (l.length < 288 * YETER.gunluk) { o.eksik.push(`${g} günlük (${l.length}/288 mum)`); continue; }
    araliklar.push(Math.max(...l.map(x => x.h)) - Math.min(...l.map(x => x.l)));
  }
  if (araliklar.length === P.adrGun) o.adr5 = araliklar.reduce((a, b) => a + b, 0) / P.adrGun;
  const pGun = G.get(Pg) || [];
  if (pGun.length >= 288 * YETER.gunluk) {
    const ph = Math.max(...pGun.map(x => x.h)), pl = Math.min(...pGun.map(x => x.l)), pc = pGun[pGun.length - 1].c;
    const orta = (ph + pl) / 2;
    o.yon = pc > orta ? 1 : pc < orta ? -1 : 0;
  }
  // CBDR (P 14:00–20:00 gövde)
  const cb = pencere(G, Pg, P.cbBas, P.cbSon);
  const cbBeklenen = (P.cbSon - P.cbBas) / 5;
  if (cb.length) { o.cbH = Math.max(...cb.map(x => Math.max(x.o, x.c))); o.cbL = Math.min(...cb.map(x => Math.min(x.o, x.c))); o.r = o.cbH - o.cbL; }
  if (!bitti(Pg, P.cbSon)) { o.durum = 'bekliyor'; o.asama = 'cbdr'; return son(o); }
  if (cb.length < cbBeklenen * YETER.cb) o.eksik.push(`CBDR penceresi (${cb.length}/${cbBeklenen} mum)`);
  // Asya (D−1 takvim günü 20:00–24:00)
  const as = pencere(G, dun, P.asyaBas, 1440);
  if (as.length) { o.aH = Math.max(...as.map(x => x.h)); o.aL = Math.min(...as.map(x => x.l)); }
  if (o.adr5 != null && o.r != null) o.kosul = { r: o.r > 0 && o.r <= P.rAdr * o.adr5, asya: o.aH != null && (o.aH - o.aL) <= P.asyaAdr * o.adr5 };
  if (o.r != null && o.yon) {
    o.limit = o.yon < 0 ? o.cbH + o.r : o.cbL - o.r;
    o.hedef = o.yon < 0 ? o.cbL - P.hedefR * o.r : o.cbH + P.hedefR * o.r;
  }
  if (!bitti(D, 0)) { o.durum = 'bekliyor'; o.asama = 'asya'; return son(o); }
  if (as.length < 48 * YETER.asya) o.eksik.push(`Asya penceresi (${as.length}/48 mum)`);
  if (o.eksik.length) { o.durum = 'veri-eksik'; return son(o); }
  if (!o.yon) { o.durum = 'yon-yok'; return son(o); }
  if (!(o.kosul.r && o.kosul.asya)) { o.durum = 'kosul-yok'; return son(o); }
  const stopMesafe = P.stopAdr * o.adr5;
  if (stopMesafe < P.stopMaliyetKat * 2 * P.dolumMaliyet) { o.durum = 'stop-dar'; return son(o); }
  // Giriş penceresi
  const giris = pencere(G, D, P.girisBas, P.girisSon);
  let dolum = null, i0 = -1;
  for (let i = 0; i < giris.length; i++) {
    const m = giris[i];
    if (o.yon < 0 && m.h >= o.limit) { dolum = { fiyat: m.o >= o.limit ? m.o : o.limit, m }; i0 = i; break; }
    if (o.yon > 0 && m.l <= o.limit) { dolum = { fiyat: m.o <= o.limit ? m.o : o.limit, m }; i0 = i; break; }
  }
  if (!dolum) {
    if (!bitti(D, P.girisSon)) { o.durum = 'bekliyor'; o.asama = bitti(D, P.girisBas) ? 'giris' : 'giris-oncesi'; return son(o); }
    if (giris.length < 24 * YETER.giris) { o.eksik.push(`giriş penceresi (${giris.length}/24 mum)`); o.durum = 'veri-eksik'; return son(o); }
    o.durum = 'dolmadi'; return son(o);
  }
  const yon = o.yon, gir = dolum.fiyat;
  const stop = gir - yon * stopMesafe;
  o.stop = stop;
  // Yönetim: dolum mumundan 11:00'e kadar
  const yonetim = (G.get(D) || []).filter(x => x.t >= dolum.m.t);
  let cikis = null;
  for (const m of yonetim) {
    if (m.dk >= P.kapanis) { cikis = { fiyat: m.o, m, neden: 'zaman' }; break; }
    const ilk = m.t === dolum.m.t;
    const stopVurdu = yon < 0 ? m.h >= stop : m.l <= stop;
    if (stopVurdu) { cikis = { fiyat: ilk ? stop : (yon < 0 ? Math.max(stop, m.o) : Math.min(stop, m.o)), m, neden: 'stop' }; break; }
    if (ilk) continue;
    const hedefVurdu = yon < 0 ? m.l <= o.hedef : m.h >= o.hedef;
    if (hedefVurdu) { cikis = { fiyat: o.hedef, m, neden: 'hedef' }; break; }
  }
  if (!cikis) {
    if (!bitti(D, P.kapanis + 5)) { o.durum = 'bekliyor'; o.asama = 'acik'; o.islem = { yon, giris: gir, girisZamani: dolum.m.t, acik: true }; return son(o); }
    o.eksik.push('11:00 mumu yok'); o.durum = 'veri-eksik'; return son(o);
  }
  const brut = yon * (cikis.fiyat - gir);
  const net = brut - 2 * P.dolumMaliyet - (cikis.neden === 'hedef' ? 0 : P.kayma);
  o.islem = { yon, giris: gir, girisZamani: dolum.m.t, cikis: cikis.fiyat, cikisZamani: cikis.m.t, neden: cikis.neden, brut, net, R: net / stopMesafe };
  o.durum = 'islem';
  return son(o);
}
/** Yuvarlama (kayıt / imza kararlılığı): fiyat 5, R 4 basamak. */
function son(o) {
  if (o.durum === 'bekliyor') o.eksik = [];   // pencere sürüyor: eksik sayımı henüz anlamsız
  for (const k of ['cbH', 'cbL', 'r', 'aH', 'aL', 'adr5', 'limit', 'stop', 'hedef']) o[k] = yuv(o[k]);
  if (o.islem) for (const k of ['giris', 'cikis', 'brut', 'net']) if (k in o.islem) o.islem[k] = yuv(o.islem[k]);
  if (o.islem && 'R' in o.islem) o.islem.R = yuv(o.islem.R, 4);
  return o;
}
const IMZA_ALAN = ['gun', 'onceki', 'durum', 'yon', 'cbH', 'cbL', 'r', 'aH', 'aL', 'adr5', 'kosul', 'limit', 'stop', 'hedef', 'islem', 'eksik'];
const imza = (o) => crypto.createHash('sha256').update(JSON.stringify(IMZA_ALAN.map(k => o[k] === undefined ? null : o[k]))).digest('hex').slice(0, 16);

/** Kesinleşmiş iş günleri [bas, …] (simdi'ye göre: D 11:30 NY geçmiş). */
function kesinGunler(bas, simdi) {
  const out = [];
  for (let g = isGunuMu(bas) ? bas : sonrakiIsGunu(bas); simdi >= nyUtc(g, P.kesinlesme); g = sonrakiIsGunu(g)) out.push(g);
  return out;
}

/** Kayıt satırı (gün sonucu + imza + kaynak + zaman). */
function kayitSatiri(o, { simdi, gecikmeli }) {
  const s = {}; for (const k of IMZA_ALAN) s[k] = o[k];
  return { ...s, imza: imza(o), kaynak: KAYNAK, kayitZamani: new Date(simdi).toISOString(), gecikmeliKayit: !!gecikmeli };
}

// ═══ 4. RAPOR (saf) ═════════════════════════════════════════════════════════
function ozetle(kayit, { kadar = null } = {}) {
  const l = kayit.filter(x => !kadar || x.gun <= kadar).sort((a, b) => (a.gun < b.gun ? -1 : 1));
  const isl = l.filter(x => x.durum === 'islem' && x.islem && Number.isFinite(x.islem.R));
  const R = isl.map(x => x.islem.R);
  const top = R.reduce((a, b) => a + b, 0);
  const sayac = {}; for (const x of l) sayac[x.durum] = (sayac[x.durum] || 0) + 1;
  let c = 0;
  const seri = isl.map(x => { c += x.islem.R; return { gun: x.gun, R: x.islem.R, birikim: yuv(c, 4) }; });
  const ort = R.length ? top / R.length : null;
  const sd = R.length > 1 ? Math.sqrt(R.reduce((a, b) => a + (b - ort) ** 2, 0) / (R.length - 1)) : null;
  return { gun: l.length, islem: R.length, ortR: ort, toplamR: R.length ? top : 0, isabet: R.length ? R.filter(x => x > 0).length / R.length : null,
    hedef: isl.filter(x => x.islem.neden === 'hedef').length, stop: isl.filter(x => x.islem.neden === 'stop').length, zaman: isl.filter(x => x.islem.neden === 'zaman').length,
    ortHata: sd != null ? sd / Math.sqrt(R.length) : null, sayac, seri, son: isl.length ? isl[isl.length - 1] : null, sonGun: l.length ? l[l.length - 1].gun : null };
}

/** Ara rapor — YALNIZ BETİMLEYİCİ. */
function araRapor(kayit, { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  const o = ozetle(kayit);
  const kararTarihi = bugun >= KARAR && o.islem < EN_AZ_ISLEM ? KARAR_ERTELEME : KARAR;
  return { deneme: DENEME, plan: PLAN, baslangic: BAS, araKontrol: ARA_KONTROL, kararTarihi, kararErteleme: KARAR_ERTELEME, enAzIslem: EN_AZ_ISLEM,
    kalanGun: Math.round((Date.parse(`${kararTarihi}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN), ...o,
    not: 'Ara rapor — hüküm değil (PLAN-ILERI-CBDR §5). Karar günü gelmeden kural değişmez, yorum yapılmaz.' };
}

/** Karar (ön kayıt §4). Tarihten önce çağrılırsa karar vermez. */
function hukum(kayit, { bugun = new Date().toISOString().slice(0, 10) } = {}) {
  if (bugun < KARAR) return { durum: 'bekliyor', metin: `henüz karar zamanı değil (${KARAR})` };
  const o12 = ozetle(kayit, { kadar: KARAR });
  if (o12.islem < EN_AZ_ISLEM && bugun < KARAR_ERTELEME) return { durum: 'ertelendi', metin: `${o12.islem} işlem < ${EN_AZ_ISLEM} — karar ${KARAR_ERTELEME}`, olcu: o12 };
  const kadar = o12.islem < EN_AZ_ISLEM ? KARAR_ERTELEME : KARAR;
  const o = ozetle(kayit, { kadar });
  const sonuc = o.ortR == null ? 'belirsiz, bir yıl daha' : o.ortR <= -0.10 ? 'RED' : o.ortR > 0 && o.isabet >= 0.25 ? 'izlemeye devam / küçük sermayeyle canlı adayı' : 'belirsiz, bir yıl daha';
  return { durum: 'karar', tarih: kadar, sonuc, olcu: o, azIslem: o.islem < EN_AZ_ISLEM,
    not: 'Canlı adayı olmak canlıya geçiş değildir: kullanıcı onayı + ayrı canlı plan gerekir (PLAN-ILERI-CBDR §4).' };
}

// ═══ 5. VERİ (ccxt, önbellek) ═══════════════════════════════════════════════
const mumDizini = (dizin) => path.join(dizin, 'cbdr-mum');
const ayDosyasi = (dizin, ay) => path.join(mumDizini(dizin), `EURUSDT-5m-${ay}.json`);
const ayAdi = (t) => new Date(t).toISOString().slice(0, 7);

/** Önbellekten [bas, son] aralığının mumları (sıralı, tekil). */
function onbellekOku(dizin, bas, son = Date.now()) {
  const out = [];
  for (let a = ayAdi(bas); a <= ayAdi(son); a = ayAdi(Date.parse(`${a}-01T00:00:00Z`) + 32 * GUN)) {
    const f = ayDosyasi(dizin, a);
    if (!fs.existsSync(f)) continue;
    for (const m of JSON.parse(fs.readFileSync(f, 'utf8'))) if (m[0] >= bas && m[0] <= son) out.push(m);
  }
  return out;
}
function onbellekYaz(dizin, mumlar) {
  const aylar = new Map();
  for (const m of mumlar) { const a = ayAdi(m[0]); if (!aylar.has(a)) aylar.set(a, []); aylar.get(a).push(m); }
  fs.mkdirSync(mumDizini(dizin), { recursive: true });
  for (const [a, yeni] of aylar) {
    const f = ayDosyasi(dizin, a);
    const harita = new Map(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).map(m => [m[0], m]) : []);
    for (const m of yeni) harita.set(m[0], m);
    const l = [...harita.values()].sort((x, y) => x[0] - y[0]);
    fs.writeFileSync(f + '.tmp', JSON.stringify(l), 'utf8');
    fs.renameSync(f + '.tmp', f);
  }
}
let borsaTek = null;   // tek ccxt örneği: piyasa listesi süreç başına bir kez yüklenir
const borsaAl = () => borsaTek || (borsaTek = new (require('ccxt').binance)({ enableRateLimit: true, options: { defaultType: 'spot' } }));
/** [since, simdi) arası KAPANMIŞ 5 dk mumlar (ccxt fetchOHLCV, sayfa sayfa). */
async function indir(since, simdi, { borsa = null, log = () => {} } = {}) {
  const b = borsa || borsaAl();
  const out = new Map();
  let t = since;
  for (let i = 0; i < 2000 && t < simdi; i++) {
    const ham = await I.tekrarla(() => b.fetchOHLCV('EUR/USDT', '5m', t, 1000));
    if (!ham.length) { t += 1000 * DK5; continue; }   // boşluk: ileri atla
    for (const m of ham) if (m[0] + DK5 <= simdi) out.set(m[0], [m[0], +m[1], +m[2], +m[3], +m[4]]);
    const son = ham[ham.length - 1][0];
    if (son + DK5 >= simdi || son < t) break;
    t = son + DK5;
    if (i % 50 === 49) log('INFO', `EURUSDT 5m indiriliyor: ${new Date(t).toISOString().slice(0, 10)}`);
  }
  return [...out.values()].sort((a, b2) => a[0] - b2[0]);
}
/** Önbelleği güncelle: son kayıtlı mumdan 2 gün geri (düzeltme yakalama) → simdi. İlk kez: `bas`tan. */
async function onbellekGuncelle(dizin, bas, simdi, ops = {}) {
  const var_ = onbellekOku(dizin, bas, simdi);
  const since = var_.length ? Math.max(bas, var_[var_.length - 1][0] - 2 * GUN) : bas;
  const yeni = await (ops.indir || indir)(since, simdi, ops);
  if (yeni.length) onbellekYaz(dizin, yeni);
  return { indirilen: yeni.length, since };
}
/** Bir günün hesabı için ısınma: ilk günden 10 takvim günü geri (5 iş günü ADR + P + Asya). */
const isinmaBas = (gun) => nyUtc(gunEkle(gun, -12), 0);

// ═══ 6. ÇALIŞTIR ════════════════════════════════════════════════════════════
const dosyalar = (dizin = I.VARSAYILAN_DIZIN) => ({
  kayit: path.join(dizin, 'cbdr-kayit.jsonl'),
  son: path.join(dizin, 'cbdr-son.json'),
});

/** Sıradaki (henüz kesinleşmemiş) iş gününün canlı durumu. */
function siradaki(mumlar, simdi) {
  let D = new Date(simdi).toISOString().slice(0, 10);
  D = gunEkle(D, -1);
  while (!isGunuMu(D) || simdi >= nyUtc(D, P.kesinlesme)) D = sonrakiIsGunu(D);
  return gunHesapla(D, grupla(mumlar, { kesim: simdi }), { simdi });
}

/**
 * Bir çalışma: mum önbelleğini güncelle → kesinleşen günleri hesapla → eksikleri ekle, kayıtlıları yeniden hesaplayıp imza karşılaştır
 * → `cbdr-son.json` (özet + sıradaki gün + uyarılar). Idempotent.
 * @param o.indir (since, simdi) → [[t,o,h,l,c]] (test için)
 */
async function calistir({ simdi = Date.now(), dizin = I.VARSAYILAN_DIZIN, indir: indirFn = null, log = () => {}, bas = BAS } = {}) {
  const F = dosyalar(dizin);
  return I.kilitle(dizin, async () => {
    const t0 = Date.now();
    const ilk = isinmaBas(bas);
    const g = await onbellekGuncelle(dizin, ilk, simdi, { ...(indirFn ? { indir: indirFn } : {}), log });
    const mumlar = onbellekOku(dizin, ilk, simdi);
    const G = grupla(mumlar);
    const mevcut = I.satirlariOku(F.kayit);
    const M = new Map(mevcut.map(x => [x.gun, x]));
    const gunler = kesinGunler(bas, simdi);
    const yeni = [], degisen = [];
    gunler.forEach((D, i) => {
      const o = gunHesapla(D, G);
      const e = M.get(D);
      if (e) { if (e.imza !== imza(o)) degisen.push({ gun: D, kayit: { durum: e.durum, R: e.islem && e.islem.R != null ? e.islem.R : null }, yeniden: { durum: o.durum, R: o.islem && o.islem.R != null ? o.islem.R : null } }); return; }
      yeni.push(kayitSatiri(o, { simdi, gecikmeli: i < gunler.length - 1 }));
    });
    I.ekle(F.kayit, yeni);
    const s = siradaki(mumlar, simdi);
    const ozet = { zaman: new Date(simdi).toISOString(), sureMs: Date.now() - t0, indirilen: g.indirilen, yeniSatir: yeni.length,
      gecikmeliSatir: yeni.filter(x => x.gecikmeliKayit).length, satirSayisi: mevcut.length + yeni.length,
      sonMum: mumlar.length ? new Date(mumlar[mumlar.length - 1][0]).toISOString() : null, degisen, siradaki: s };
    fs.writeFileSync(F.son + '.tmp', JSON.stringify(ozet, null, 2), 'utf8');
    fs.renameSync(F.son + '.tmp', F.son);
    if (degisen.length) log('WARN', `CBDR: ${degisen.length} kayıtlı günün yeniden hesabı farklı (ilk ${degisen[0].gun}) — kayıt DEĞİŞMEDİ`);
    return ozet;
  });
}

/* ── Panel: canlı sıradaki gün (bellek içi, yazmaz; 5 dk önbellek) ──────── */
let canliOnbellek = null;
async function canliSiradaki({ dizin = I.VARSAYILAN_DIZIN, simdi = Date.now(), indir: indirFn = null } = {}) {
  if (canliOnbellek && simdi - canliOnbellek.zaman < 5 * 60e3 && canliOnbellek.dizin === dizin) return canliOnbellek.deger;
  const bas = nyUtc(gunEkle(new Date(simdi).toISOString().slice(0, 10), -14), 0);
  const eski = onbellekOku(dizin, bas, simdi);
  const since = eski.length ? eski[eski.length - 1][0] + DK5 : bas;
  const yeni = await (indirFn || indir)(since, simdi);
  const h = new Map(eski.map(m => [m[0], m])); for (const m of yeni) h.set(m[0], m);
  const mumlar = [...h.values()].sort((a, b) => a[0] - b[0]);
  const deger = { ...siradaki(mumlar, simdi), hesap: new Date(simdi).toISOString(), sonMum: mumlar.length ? new Date(mumlar[mumlar.length - 1][0]).toISOString() : null };
  canliOnbellek = { zaman: simdi, dizin, deger };
  return deger;
}

/** GET /api/ileri/cbdr gövdesi: kayıt + son çalışma + ara rapor + karar + canlı sıradaki gün (ağ hatasında son çalışmadaki). */
async function panelVerisi({ dizin = I.VARSAYILAN_DIZIN, simdi = Date.now(), indir: indirFn = null } = {}) {
  const F = dosyalar(dizin);
  const kayit = I.satirlariOku(F.kayit);
  let sonCalisma = null; try { sonCalisma = JSON.parse(fs.readFileSync(F.son, 'utf8')); } catch { /* henüz çalışmadı */ }
  const bugun = new Date(simdi).toISOString().slice(0, 10);
  let sira = null, siraHata = null;
  try { sira = await canliSiradaki({ dizin, simdi, indir: indirFn }); } catch (e) { siraHata = e.message; sira = sonCalisma && sonCalisma.siradaki ? { ...sonCalisma.siradaki, eski: true } : null; }
  return { success: true, rapor: araRapor(kayit, { bugun }), hukum: hukum(kayit, { bugun }), siradaki: sira, siradakiHata: siraHata,
    sonCalisma: sonCalisma ? { zaman: sonCalisma.zaman, yeniSatir: sonCalisma.yeniSatir, satirSayisi: sonCalisma.satirSayisi, sonMum: sonCalisma.sonMum, degisen: sonCalisma.degisen || [] } : null };
}

module.exports = {
  DENEME, PLAN, BAS, ARA_KONTROL, KARAR, KARAR_ERTELEME, EN_AZ_ISLEM, KAYNAK, P, YETER,
  ny, nyUtc, gunEkle, isGunuMu, oncekiIsGunu, sonrakiIsGunu, grupla, gunHesapla, imza, kesinGunler, kayitSatiri,
  ozetle, araRapor, hukum, onbellekOku, onbellekYaz, onbellekGuncelle, indir, isinmaBas, dosyalar, siradaki, calistir, canliSiradaki, panelVerisi,
  _canliSifirla: () => { canliOnbellek = null; },
};
