/**
 * OTOMATİK GÜNCELLEME (61.3, kullanıcı kararı 2026-10-13) — sunucu GitHub'daki yeni sürümü kendisi kurar.
 * ═══════════════════════════════════════════════════════════════════════════
 * Kararlar: "panel otomatik, bot onaylı" · günde bir 12:00 (scripts/install-guncelleme-gorev.ps1, görev PusulaGuncelle).
 * Komut satırı: scripts/guncelle.js. Panel: Ayarlar › Bu bilgisayar (GET /api/guncelleme/durum, POST /kontrol, /uygula).
 *
 * AKIŞ (`calistir`):
 *   0. Kilit (data/guncelleme.kilit; 30 dk'dan eskiyse bayat sayılır). Geliştirme bilgisayarında (data/makine.json
 *      arastirmaModu) HİÇBİR ŞEY yapmaz — kaynak orası.
 *   1. git fetch origin main. HEAD = origin/main → "guncel".
 *   2. PLAN (`planla`, saf):
 *      · HEAD, origin/main'in atası değil (sunucuda gönderilmemiş commit, ör. liste kaydı) → "elle" (merge/rebase YAPILMAZ)
 *      · değişen dosya, sunucuda değiştirilmiş (commit'lenmemiş) bir dosyaya dokunuyor (ör. config.json) → "elle" (ayar ezilmez)
 *      · başlatma betikleri (start-bot.cmd, pusula-sunucu.ps1, Pusula-*.cmd) değişti → "elle": Windows çalışan .cmd'yi
 *        satır satır diskten okur; denetleyici çalışırken değiştirmek onu bozabilir
 *      · CANLI KOD değişti → "onay" (kullanıcı panelde "Güncellemeyi kur" der; yalnız o commit için geçerli).
 *        Canlı kod = lib/live/**, lib/risk/** ve motor / borsa / risk yöneticisi / Telegram / sağlık sinyali / acil PIN
 *        modüllerinden require ile ulaşılan HER dosya (eski VE yeni sürümde; `canliKumesi`)
 *        + package.json / package-lock.json. Liste elle tutulmaz: botun kullandığı yeni bir modül kendiliğinden girer.
 *      · yoksa → "kur".
 *   3. KUR: git merge --ff-only → (paketler değiştiyse npm install) → değişen .js dosyalarında `node --check` →
 *      yeniden başlat (POST /api/sistem/yeniden-baslat; eski sunucuda yoksa pusula-sunucu.ps1 Durdur + PusulaBot görevi)
 *      → /api/health yeni sürümü söyleyene kadar bekle (180 sn).
 *      Sözdizimi / paket / açılış hatasında: git reset --keep <eski> (sunucudaki config.json değişikliği korunur), gerekirse
 *      npm install, yeniden başlat → "geri-alindi" + Telegram. Yeniden başlatılamazsa (Pusula kısayolla/görevle
 *      açılmamış): kod yeni, sunucu eski → "yeniden-baslat" + Telegram ("Pusula'yı yeniden başlatın").
 *   4. Durum data/guncelleme.json (panel okur), günlük data/guncelleme.log. Telegram aynı durum + commit için BİR KEZ.
 * Testler (npm test) burada koşmaz: bazı eski testler gerçek veriye yazıyor — sunucuda canlı veride çalıştırılmaz; tam test
 * geliştirme bilgisayarında push'tan önce koşar. Sunucuda güvence: sözdizimi denetimi + açılış sağlığı + geri alma.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

const DAL = 'main';
const KILIT_BAYAT_MS = 30 * 60 * 1000;
const SAGLIK_BEKLE_MS = 180 * 1000;
/**
 * Y7 (61.8, DENETIM-CANLI-ALTYAPI): yeni sürüm bir kez cevap verdi diye "kuruldu" denmez. KARARLILIK_MS boyunca her
 * KARARLILIK_ADIM_MS'de bir sağlık: sürüm aynı, uptime geri gitmiyor (yeniden başlama = çökme döngüsü), 3 ardışık cevapsızlık
 * yok; pencere sonunda güncellemeden ÖNCE bağlı olan her portföy botu yine bağlı. Değilse geri alınır.
 */
const KARARLILIK_MS = 8 * 60 * 1000;
const KARARLILIK_ADIM_MS = 15 * 1000;
const PAKET = ['package.json', 'package-lock.json'];
/** Çalışırken değiştirilirse denetleyiciyi bozabilecek başlatma dosyaları — her zaman elle. */
const BASLATMA = /^(scripts\/start-bot\.cmd|scripts\/pusula-sunucu\.ps1|Pusula-[^/]*\.cmd)$/i;
/** Canlı kod kökleri: canlı bot + risk dizinleri ve bota dokunan tekil modüller (motor, borsa, risk yöneticisi, Telegram
 * uyarıları, sağlık sinyali, acil durdurma PIN'i). Kapanış (require) bunlardan yürür. */
const CANLI_KOK = /^lib\/((live|risk)\/.+|engine|exchange|riskManager|telegram|saglikSinyali|acilPin)\.js$/;
const GECMIS_EN_COK = 30;
/**
 * Onaysız kurulabilecek dosyalar (izin listesi, K1 DENETIM-CANLI-ALTYAPI 2026-10-13): panel ekranı, belgeler, kayıtlar, araştırma
 * ve portföy (tasarımcı / Portföyüm / laboratuvar) kodu, araştırma betikleri. Bunlardan biri canlı kapanışa girerse yine onay.
 * Bilerek DIŞARIDA: server.js, lib/guvenlik.js, lib/acilPin.js, lib/guncelleme.js, scripts/guncelle.js, scripts/install-*,
 * lib/telegram*.js, lib/live, lib/risk, config/paket dosyaları ve listede olmayan her yeni yol.
 */
const OTOMATIK = [
  /^public\//, /^docs\//, /^ai\//, /^referans\//, /^kayitlar\//, /^[^/]+\.md$/i, /^pine\//,
  /^lib\/(tasarimci|portfoyum|portfoy|research|tarama|ileri|backtest|pine|rangeEngine|context|indicatorPool|veri)\//,
  /^lib\/(defter|backtester|backtestStats|drawdownStats|strategyScanner|hesaplar)\.js$/,
  /^scripts\/(?!guncelle\.js$|install-|pusula-|start-bot|kisayol-|telefon)[^/]+\.(js|json|md)$/,
  /^scripts\/kilavuz\//
];

/* ── Canlı kod kümesi (require kapanışı) ─────────────────────────────────── */
const REQUIRE_RE = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/**
 * Bir sürümde canlı botun kullandığı dosyalar: lib/live ve lib/risk altındaki her .js'den başlayıp göreli require'ları
 * izler. `dosyalar`: o sürümdeki bütün yollar (Set, '/' ayraçlı); `oku(yol)`: içerik (yoksa null).
 * Döndürür: Set<yol>.
 */
function canliKumesi(dosyalar, oku) {
  const kume = new Set();
  const kuyruk = [...dosyalar].filter(f => CANLI_KOK.test(f));
  const coz = (kimden, hedef) => {
    const taban = path.posix.normalize(path.posix.join(path.posix.dirname(kimden), hedef));
    for (const a of [taban, taban + '.js', taban + '.json', taban + '/index.js']) if (dosyalar.has(a)) return a;
    return null;
  };
  while (kuyruk.length) {
    const f = kuyruk.shift();
    if (kume.has(f)) continue;
    kume.add(f);
    if (!f.endsWith('.js')) continue;
    const m = oku(f);
    if (m == null) continue;
    for (const r of m.matchAll(REQUIRE_RE)) { const y = coz(f, r[1]); if (y && !kume.has(y)) kuyruk.push(y); }
  }
  return kume;
}

/* ── Plan (saf) ─────────────────────────────────────────────────────────── */
/**
 * girdi: { ata: bool (HEAD origin/main'in atası mı), degisen: [yol], kirli: [yol] (sunucuda commit'lenmemiş izlenen dosyalar),
 *          canli: Set<yol> (eski ∪ yeni), onay: bool (bu hedef için kullanıcı onayı var) }
 * Döndürür: { karar: 'kur'|'onay'|'elle', neden, canliDosyalar, cakisan, baslatma }
 */
function planla({ ata, degisen, kirli, canli, onay, muaf = new Set() }) {
  if (!ata) return { karar: 'elle', neden: 'Sunucudaki kopyada GitHub\'a gönderilmemiş kayıt var (ör. liste kaydı). Önce sunucuda "git pull" ve "git push" yapın; güncelleme ondan sonra kendiliğinden kurulur.' };
  const kirliK = new Set(kirli);
  const cakisan = degisen.filter(f => kirliK.has(f));
  if (cakisan.length) return { karar: 'elle', cakisan, neden: `Güncelleme, sunucuda değiştirilmiş dosyaya dokunuyor (${cakisan.join(', ')}). Sunucudaki ayarlarınız ezilmesin diye kurulmadı; geliştirme sohbetine haber verin.` };
  const baslatma = degisen.filter(f => BASLATMA.test(f));
  if (baslatma.length) return { karar: 'elle', baslatma, neden: `Başlatma dosyaları değişti (${baslatma.join(', ')}). Pusula çalışırken değiştirilemez: Pusula'yı durdurun, "git pull" yapın, yeniden başlatın.` };
  // K1 (DENETIM-CANLI-ALTYAPI): İZİN LİSTESİ — yalnız OTOMATIK desenine uyan VE canlı kapanışta olmayan dosyalar onaysız kurulur;
  // geri kalan her şey (server.js, güvenlik, güncelleyicinin kendisi, Telegram komutları, paketler, bilinmeyen yeni dosyalar) onay.
  const canliDosyalar = degisen.filter(f => !muaf.has(f) && (canli.has(f) || PAKET.includes(f) || !OTOMATIK.some(r => r.test(f))));
  if (canliDosyalar.length && !onay) return { karar: 'onay', canliDosyalar, neden: `Bot kodu değişti (${canliDosyalar.slice(0, 5).join(', ')}${canliDosyalar.length > 5 ? ` +${canliDosyalar.length - 5}` : ''}) — kurulum onayınızı bekliyor.` };
  return { karar: 'kur', canliDosyalar };
}

/* ── Durum dosyası ──────────────────────────────────────────────────────── */
function durumYolu(kok) { return yollar.programVeri(kok, 'guncelleme.json'); }
function durumOku(kok) { try { return JSON.parse(fs.readFileSync(durumYolu(kok), 'utf8')); } catch (e) { return {}; } }
function durumYaz(kok, d) {
  const y = durumYolu(kok);
  fs.mkdirSync(path.dirname(y), { recursive: true });
  const g = `${y}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(d, null, 1));
  fs.renameSync(g, y);
}
function gunluk(kok, satir, simdi) {
  try { fs.appendFileSync(yollar.programVeri(kok, 'guncelleme.log'), `[${new Date(simdi()).toISOString()}] ${satir}\n`); } catch (e) { /* günlük yazılamazsa iş sürer */ }
}
function gelistirmeMi(kok) {
  try { return !!JSON.parse(fs.readFileSync(yollar.programVeri(kok, 'makine.json'), 'utf8').replace(/^﻿/, '')).arastirmaModu; } catch (e) { return false; }
}

/** Bir sürümün panel sürümü (server.js APP_VERSION) ve kılavuzdaki "bu sürümde yeni" maddeleri. */
function surumBilgisi(oku) {
  const s = oku('server.js') || '';
  const m = s.match(/const APP_VERSION = '([^']+)'/);
  let yeni = [];
  try { const k = JSON.parse(oku('public/kilavuz/kilavuz.json') || '{}'); const ilk = (k.surumler || [])[0]; if (ilk && m && ilk.surum === m[1]) yeni = ilk.yeni || []; } catch (e) { /* yok */ }
  return { surum: m ? m[1] : null, yeni };
}

/* ── Ana akış ───────────────────────────────────────────────────────────── */
/**
 * ops: { kok, onayla?: sha, kuru?: bool, simdi?, git(args) → { kod, cikti }, npmKur() → { kod, cikti },
 *        nodeCheck(yol) → { kod, cikti }, yenidenBaslat() → Promise<{ tamam, yol, hata? }>, saglik() → Promise<{ appVersion }|null>,
 *        bildir(seviye, baslik, satirlar) → Promise, bekle(ms), saglikBekleMs?, zorla? (geliştirme bilgisayarında da çalış — test) }
 * Döndürür: son durum nesnesi (data/guncelleme.json'a da yazılır).
 */
async function calistir(ops) {
  const kok = ops.kok;
  const simdi = ops.simdi || Date.now;
  const log = (m) => gunluk(kok, m, simdi);
  const eski = durumOku(kok);
  const kayit = (d) => {
    const yeni = { ...eski, ...d, kontrol: new Date(simdi()).toISOString() };
    if (d.durum && d.durum !== 'guncel') yeni.gecmis = [{ zaman: yeni.kontrol, durum: d.durum, hedef: d.hedef || null, surum: d.hedefSurum || null, neden: d.neden || null }].concat(eski.gecmis || []).slice(0, GECMIS_EN_COK);
    durumYaz(kok, yeni);
    return yeni;
  };
  /** Aynı durum + hedef için Telegram bir kez. */
  const bildirBirKez = async (d, seviye, baslik, satirlar) => {
    const anahtar = `${d.durum}:${d.hedef || ''}`;
    if (eski.bildirilen === anahtar) return d;
    try { await ops.bildir(seviye, baslik, satirlar); } catch (e) { log(`Telegram gönderilemedi: ${e.message}`); }
    const s = { ...durumOku(kok), bildirilen: anahtar };
    durumYaz(kok, s);
    return s;
  };

  if (gelistirmeMi(kok) && !ops.zorla) {
    log('geliştirme bilgisayarı (data/makine.json arastirmaModu) — güncelleme yapılmaz');
    return kayit({ durum: 'gelistirme', neden: 'Bu bilgisayar geliştirme kopyası: güncellemeler buradan gönderilir, buraya kurulmaz.' });
  }

  const kilit = yollar.programVeri(kok, 'guncelleme.kilit');
  try {
    const st = fs.statSync(kilit);
    // D1 (62.1): kötü durumda kurulum (npm + sağlık + geri alma) 30 dk'yı aşabilir — kilitteki süreç YAŞIYORSA 2 saate kadar bayat sayılmaz.
    const yas = simdi() - st.mtimeMs;
    let pidYasiyor = false;
    try { const pid = parseInt(fs.readFileSync(kilit, 'utf8'), 10); if (pid > 0 && pid !== process.pid) { process.kill(pid, 0); pidYasiyor = true; } } catch (e) { pidYasiyor = !!(e && e.code === 'EPERM'); }
    if (yas < KILIT_BAYAT_MS || (pidYasiyor && yas < 4 * KILIT_BAYAT_MS)) { log('başka bir güncelleme sürüyor (kilit) — çıkılıyor'); return { ...eski, durum: eski.durum, mesgul: true }; }
  } catch (e) { /* kilit yok */ }
  fs.mkdirSync(path.dirname(kilit), { recursive: true });
  fs.writeFileSync(kilit, String(process.pid));
  try {
    const git = (...a) => ops.git(a);
    const tek = (...a) => { const r = git(...a); if (r.kod !== 0) throw new Error(`git ${a.join(' ')}: ${String(r.cikti).trim().slice(0, 300)}`); return String(r.cikti).trim(); };

    const dal = tek('rev-parse', '--abbrev-ref', 'HEAD');
    if (dal !== DAL) {
      const d = kayit({ durum: 'elle', neden: `Sunucudaki kopya '${dal}' dalında (beklenen ${DAL}). "git switch ${DAL}" gerekli.` });
      return bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
    }
    const once = tek('rev-parse', 'HEAD');
    const f = git('fetch', '--quiet', 'origin', DAL);
    if (f.kod !== 0) {
      const ardisik = (eski.durum === 'ag-hatasi' ? (eski.agHatasi || 0) : 0) + 1;
      log(`git fetch başarısız (${ardisik}. kez): ${String(f.cikti).trim().slice(0, 300)}`);
      const d = kayit({ durum: 'ag-hatasi', agHatasi: ardisik, neden: `GitHub'a ulaşılamadı: ${String(f.cikti).trim().slice(0, 200)}` });
      if (ardisik >= 3) return bildirBirKez({ ...d, hedef: 'ag' }, 'error', 'Pusula güncellemesi: GitHub\'a ulaşılamıyor', [`${ardisik} gündür güncelleme kontrolü yapılamadı.`, d.neden]);
      return d;
    }
    const hedef = tek('rev-parse', `origin/${DAL}`);
    const okuRev = (rev) => (yol) => { const r = git('show', `${rev}:${yol}`); return r.kod === 0 ? String(r.cikti) : null; };
    const kurulu = surumBilgisi(okuRev(once));
    if (hedef === once) {
      log(`güncel (${kurulu.surum || '?'} ${once.slice(0, 7)})`);
      return kayit({ durum: 'guncel', hedef: null, hedefSurum: null, neden: null, kurulu: { sha: once, surum: kurulu.surum }, agHatasi: 0, bildirilen: null });
    }
    const yeniBilgi = surumBilgisi(okuRev(hedef));
    const ata = git('merge-base', '--is-ancestor', 'HEAD', `origin/${DAL}`).kod === 0;
    const degisen = ata ? tek('diff', '--name-only', 'HEAD', `origin/${DAL}`).split('\n').map(s => s.trim()).filter(Boolean) : [];
    // Porcelain satırı "XY yol": ilk iki sütun durum, 3. boşluk. Çıktı KIRPILMAZ (tek() trim'i ilk satırın baştaki boşluğunu
    // silip " M config.json" → "onfig.json" yapıyordu; sunucudaki ayar değişikliği gözden kaçardı — denetim 2026-10-13).
    const st = git('status', '--porcelain', '--untracked-files=no');
    if (st.kod !== 0) throw new Error(`git status: ${String(st.cikti).trim().slice(0, 300)}`);
    const kirli = String(st.cikti).split('\n').filter(s => s.length > 3).map(s => s.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean);
    const kume = (rev) => {
      const l = tek('ls-tree', '-r', '--name-only', rev, '--', 'lib').split('\n').filter(Boolean);
      return canliKumesi(new Set(l), okuRev(rev));
    };
    const canli = ata ? new Set([...kume(once), ...kume(hedef)]) : new Set();
    // server.js her sürümde yalnız APP_VERSION satırıyla değişir — değişen tek satır buysa onay gerekmez (muaf).
    const muaf = new Set();
    if (degisen.includes('server.js')) {
      const d = git('diff', '-U0', once, hedef, '--', 'server.js');
      const sat = String(d.cikti).split('\n').filter(x => /^[-+]/.test(x) && !/^(\+\+\+|---)/.test(x));
      if (d.kod === 0 && sat.length && sat.every(x => /^[-+]const APP_VERSION = '[^']+';\s*$/.test(x))) muaf.add('server.js');
    }
    const p = planla({ ata, degisen, kirli, canli, onay: ops.onayla === hedef, muaf });
    const ortak = { hedef, hedefSurum: yeniBilgi.surum, kurulu: { sha: once, surum: kurulu.surum }, degisenSayisi: degisen.length, agHatasi: 0 };
    log(`plan: ${p.karar} — ${once.slice(0, 7)} → ${hedef.slice(0, 7)} (${kurulu.surum} → ${yeniBilgi.surum}), ${degisen.length} dosya${p.canliDosyalar && p.canliDosyalar.length ? `, canlı: ${p.canliDosyalar.join(', ')}` : ''}`);

    if (p.karar === 'elle') {
      const d = kayit({ ...ortak, durum: 'elle', neden: p.neden, dosyalar: p.cakisan || p.baslatma || [] });
      return bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [`Yeni sürüm: ${yeniBilgi.surum || hedef.slice(0, 7)}`, p.neden]);
    }
    if (p.karar === 'onay') {
      const d = kayit({ ...ortak, durum: 'onay', neden: p.neden, dosyalar: p.canliDosyalar, yeni: yeniBilgi.yeni });
      return bildirBirKez(d, 'lifecycle', `Pusula ${yeniBilgi.surum || ''} kurulmayı bekliyor (onay)`, [
        'Bu güncelleme BOT KODUNU değiştiriyor; kendiliğinden kurulmadı.',
        `Değişen bot dosyaları: ${p.canliDosyalar.slice(0, 8).join(', ')}`,
        ...yeniBilgi.yeni.slice(0, 3).map(x => `• ${x}`),
        'Kurmak için sunucudaki panelde: Ayarlar › Bu bilgisayar › "Güncellemeyi kur".'
      ]);
    }
    if (ops.kuru) return { ...ortak, durum: 'kuru', plan: p };

    // ── KUR ──
    kayit({ ...ortak, durum: 'kuruluyor', neden: null });
    const geriAl = async (neden) => {
      log(`GERİ ALINIYOR: ${neden}`);
      const r = git('reset', '--keep', once);
      if (r.kod !== 0) log(`git reset --keep başarısız: ${String(r.cikti).trim().slice(0, 300)}`);
      if (degisen.some(x => PAKET.includes(x))) { const n = ops.npmKur(); if (n.kod !== 0) log(`npm install (geri alma) başarısız: ${String(n.cikti).slice(-300)}`); }
      const yb = await ops.yenidenBaslat();
      const s = yb.tamam ? await saglikBekle(ops, kurulu.surum) : null;
      const d = kayit({ ...ortak, durum: 'geri-alindi', neden, geriDonus: s ? 'eski sürüm çalışıyor' : 'eski sürüm de açılmadı — elle bakın' });
      return bildirBirKez(d, 'critical', `Pusula ${yeniBilgi.surum || ''} kurulamadı — geri alındı`, [neden, s ? `Eski sürüm (${kurulu.surum}) yeniden çalışıyor.` : 'Eski sürüm de açılmadı: Pusula\'yı elle başlatın ve geliştirme sohbetine haber verin.']);
    };

    // 68.0 (PLAN-TASIMA F1): gelen sürüm kökteki config.json'a dokunuyorsa (ör. ileride depodan çıkarılması) ÖNCE kullanıcı
    // ayarı <veri>/ayarlar.json'a alınır — merge eski dosyayı değiştirse/silse de ayar kaybolmaz. Göç yapılamazsa kurulmaz.
    if (degisen.includes('config.json')) {
      try {
        const g = require('./ayarlar').gocEt(kok);
        if (g.yapildi) log(`ayar göçü: config.json → ${g.yol} (güncelleme config.json'a dokunmadan önce)`);
      } catch (e) {
        const d = kayit({ ...ortak, durum: 'elle', neden: `Ayarlar güvenceye alınamadı (config.json → ayarlar.json): ${e.message}` });
        return bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
      }
    }
    const m = git('merge', '--ff-only', `origin/${DAL}`);
    if (m.kod !== 0) {
      const d = kayit({ ...ortak, durum: 'elle', neden: `Kod indirilemedi (git merge): ${String(m.cikti).trim().slice(0, 200)}` });
      return bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
    }
    if (degisen.some(x => PAKET.includes(x))) {
      const n = ops.npmKur();
      if (n.kod !== 0) return geriAl(`Paketler kurulamadı (npm install): ${String(n.cikti).trim().slice(-200)}`);
    }
    for (const yol of degisen.filter(x => /\.js$/.test(x) && fs.existsSync(path.join(kok, x)))) {
      const c = ops.nodeCheck(path.join(kok, yol));
      if (c.kod !== 0) return geriAl(`Sözdizimi hatası: ${yol} — ${String(c.cikti).trim().split('\n').slice(0, 3).join(' ')}`);
    }
    const onceSaglik = await Promise.resolve().then(() => ops.saglik()).catch(() => null);   // Y7: hangi botlar bağlıydı
    const yb = await ops.yenidenBaslat();
    if (!yb.tamam) {
      const d = kayit({ ...ortak, durum: 'yeniden-baslat', kurulu: { sha: hedef, surum: yeniBilgi.surum }, neden: `Yeni kod indirildi ama Pusula yeniden başlatılamadı (${yb.hata || 'bilinmiyor'}). Pusula'yı durdurup yeniden başlatın.` });
      return bildirBirKez(d, 'error', `Pusula ${yeniBilgi.surum || ''}: yeniden başlatma gerekli`, [d.neden]);
    }
    const s = await saglikBekle(ops, yeniBilgi.surum);
    if (!s) return geriAl(`Yeni sürüm ${Math.round((ops.saglikBekleMs || SAGLIK_BEKLE_MS) / 1000)} sn içinde açılmadı (yeniden başlatma yolu: ${yb.yol}).`);
    const kr = await kararlilikBekle(ops, yeniBilgi.surum, onceSaglik);
    if (!kr.tamam) return geriAl(`Yeni sürüm kararlı çalışmadı: ${kr.neden}`);
    if (kr.uyari) log(`UYARI: ${kr.uyari}`);
    log(`KURULDU: ${kurulu.surum} → ${yeniBilgi.surum} (${hedef.slice(0, 7)}, yol ${yb.yol})`);
    const d = kayit({ ...ortak, durum: 'kuruldu', kurulu: { sha: hedef, surum: yeniBilgi.surum }, onceki: { sha: once, surum: kurulu.surum }, neden: null, dosyalar: [], yeni: yeniBilgi.yeni, onayli: ops.onayla === hedef });
    return bildirBirKez(d, 'lifecycle', `Pusula ${yeniBilgi.surum || ''} kuruldu`, [
      `${kurulu.surum || '?'} → ${yeniBilgi.surum || '?'}${ops.onayla === hedef ? ' (onayınızla)' : ' (otomatik)'}`,
      ...(kr.uyari ? [`⚠ ${kr.uyari}`] : []),
      ...yeniBilgi.yeni.slice(0, 4).map(x => `• ${x}`)
    ]);
  } finally {
    try { fs.unlinkSync(kilit); } catch (e) { /* yok */ }
  }
}

/** Sağlık yeni sürümü söyleyene kadar bekle. Döndürür: sağlık nesnesi | null. */
async function saglikBekle(ops, surum) {
  const bitis = (ops.simdi || Date.now)() + (ops.saglikBekleMs || SAGLIK_BEKLE_MS);
  while ((ops.simdi || Date.now)() < bitis) {
    const s = await ops.saglik().catch(() => null);
    if (s && (!surum || s.appVersion === surum)) return s;
    await ops.bekle(3000);
  }
  return null;
}

/** Y7: kararlılık penceresi. ops.kararlilikMs (test: küçük/0), ops.bekle. @returns {{tamam, neden?}} */
async function kararlilikBekle(ops, surum, once) {
  const sure = ops.kararlilikMs != null ? ops.kararlilikMs : KARARLILIK_MS;
  const tur = Math.ceil(sure / KARARLILIK_ADIM_MS);
  let sonUptime = -1, cevapsiz = 0, son = null;
  for (let i = 0; i < tur; i++) {
    await ops.bekle(KARARLILIK_ADIM_MS);
    const s = await Promise.resolve().then(() => ops.saglik()).catch(() => null);
    if (!s) { if (++cevapsiz >= 3) return { tamam: false, neden: 'kurulumdan sonra panel yanıt vermeyi bıraktı (3 deneme)' }; continue; }
    cevapsiz = 0;
    if (surum && s.appVersion && s.appVersion !== surum) return { tamam: false, neden: `çalışan sürüm ${s.appVersion} (beklenen ${surum})` };
    if (Number.isFinite(s.uptimeSec)) {
      if (sonUptime >= 0 && s.uptimeSec < sonUptime) return { tamam: false, neden: 'kurulumdan sonra panel yeniden başladı (çökme döngüsü)' };
      sonUptime = s.uptimeSec;
    }
    son = s;
  }
  if (!tur) return { tamam: true };
  // Denetim 61.8 #4: yalnız ÇALIŞAN ve bağlı botlar karşılaştırılır (durdurulmuş ama bağlı bot açılışta bağlanmaz). Bağlanamayan
  // bot GERİ ALMA sebebi değil (internet/Binance kesintisi de olabilir; açılış 1-2-5-10-30 dk yeniden dener) — uyarı döner.
  const bagli = (h, calisan) => new Set(((h && h.bindirme) || []).filter(b => b && b.bagli && (!calisan || b.calisiyor)).map(b => b.ad));
  const onceBagli = [...bagli(once, true)];
  const simdi = bagli(son, false);
  const kopan = onceBagli.filter(a => !simdi.has(a));
  if (son && kopan.length) return { tamam: true, uyari: `güncellemeden önce bağlı olan bot henüz bağlanmadı: ${kopan.join(', ')} — açılış yeniden deniyor; 15 dk sürerse ayrıca alarm gelir` };
  return { tamam: true };
}

module.exports = { kararlilikBekle, KARARLILIK_MS, calistir, planla, canliKumesi, surumBilgisi, durumOku, durumYaz, gelistirmeMi, BASLATMA, PAKET, OTOMATIK, DAL };
