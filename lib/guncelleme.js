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
 *   69.2 KURU DENEME (lib/kuruDeneme.js): bot kodu değişen (onaylı) kurulumda sözdizimi denetiminden sonra, yeniden başlatmadan
 *      ÖNCE botların bugünkü kararı eski ve yeni kodla emir göndermeden hesaplanır (`ops.kuruDeneme`). Yeni kod hata verirse →
 *      kod geri alınır, Pusula yeniden başlamaz ("geri-alindi"). Karar farkı → geri alınır, "onay" + `kuruFark` (panel "Farkı
 *      gördüm, yine de kur" → `ops.kuruFarkOnay`). Deneme yapılamazsa (ağ, sunucu yanıtı) uyarı ile sürer. Panel değişikliğinde atlanır.
 *   69.0: her çalıştırma `islem` alanına adım adım yazılır (ADIMLAR: baglanti → plan → indir → paket → denetim → baslat →
 *      acilis → kararlilik) + o çalıştırmanın günlük satırları; panel Ayarlar › Güncelleme baştan sona izler. `bitti` dolunca
 *      işlem kapanmıştır; dolmadan kilit kalkmışsa süreç yarıda ölmüştür (durum ucu `yarida` der).
 *   69.6 GÜVENLİK SIKILAŞTIRMA (güvenlik testi 2026-10-21, scratchpad tedarik.md K1/K2/Y1/Y2):
 *      · ONAYSIZ KURULUM YALNIZ BELGE VE GÖRSEL (`OTOMATIK`): .md/.txt, kılavuz bölümleri ve ekran görüntüleri, kayıt verisi.
 *        lib/, scripts/, public/ kodu ve sunucunun yüklediği HER ŞEY onaylı (eskiden araştırma/portföy kodu ve panel JS'i onaysızdı:
 *        sunucu sürecinde anahtarlarla çalışıyordu; panel JS'i bekleyen onayı kendisi verebiliyordu).
 *      · İMZA (`imzaDenetle`): <veri>/imza-izinli (allowed_signers, depo DIŞINDA) varsa eski..yeni aralığındaki HER commit
 *        bu dosyadaki bir SSH anahtarıyla imzalı olmalı (%G? = G); değilse kurulmaz → "elle" + Telegram. Dosya yoksa geçiş dönemi:
 *        kurulur ama durumda `imza.durum = 'kurulmadi'` (öz denetim sarı). Kurulum: scripts/imza-kur.js.
 *      · GÜVENLİ GIT (`guvenliGit`): her git çağrısı core.fsmonitor=false, core.hooksPath=<boş>, protocol.ext kapalı;
 *        diff'ler --no-ext-diff. .git/config özeti saklanır; değişirse UYARI + Telegram (kalıcılık izi).
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
/** 69.0: panelde izlenen adımlar (sıra sabit; panel de bu listeyi çizer — public/js/pages/ayarlar.js GUNC_ADIMLAR). */
const ADIMLAR = [
  { kod: 'baglanti', ad: 'GitHub bağlantısı' },
  { kod: 'plan', ad: 'Değişikliklerin incelenmesi' },
  { kod: 'indir', ad: 'Yeni kodun indirilmesi' },
  { kod: 'paket', ad: 'Paketler' },
  { kod: 'denetim', ad: 'Sözdizimi denetimi' },
  { kod: 'kuru', ad: 'Kuru deneme (bot kararı)' },
  { kod: 'baslat', ad: "Pusula'nın yeniden başlatılması" },
  { kod: 'acilis', ad: 'Yeni sürümün açılışı' },
  { kod: 'kararlilik', ad: 'Kararlılık gözlemi' }
];
const ISLEM_SATIR_EN_COK = 200;
/**
 * 69.4 PAKET FARKI (saf): iki package-lock.json metni → değişen paketler [{ ad, eski, yeni }] (eklenen: eski null, silinen: yeni null).
 * Onay iletisi ve panel kurulmadan önce hangi paketin hangi sürüme geçtiğini gösterir (tedarik zinciri saldırısına karşı göz).
 */
function paketFarki(eskiMetin, yeniMetin) {
  const sur = (m) => { try { const j = JSON.parse(m || '{}'); const o = {}; for (const [k, v] of Object.entries(j.packages || {})) if (k.startsWith('node_modules/') && v && v.version) o[k.slice(13)] = v.version; return o; } catch { return {}; } };
  const a = sur(eskiMetin), b = sur(yeniMetin);
  const out = [];
  for (const ad of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) if (a[ad] !== b[ad]) out.push({ ad, eski: a[ad] || null, yeni: b[ad] || null });
  return out;
}
/**
 * Onaysız kurulabilecek dosyalar — 69.6'dan beri YALNIZ ÇALIŞTIRILMAYAN içerik: belgeler (.md/.txt/.pdf), kılavuz bölümleri ve
 * ekran görüntüleri, kayıt verisi (kayitlar/ altında json/jsonl/csv — kod değil, okunur). Hiçbir .js/.html/.css/.svg/.json(kayitlar
 * dışı) yok: lib/, scripts/, public/ kodu ve sunucunun yüklediği her şey ONAY ister. (61.3–69.5'te araştırma/portföy kodu, betikler
 * ve panel JS'i onaysızdı — güvenlik testi: sunucu sürecinde anahtarlarla çalışıyordu.) Listede olmayan her yeni yol: onay.
 */
const OTOMATIK = [
  /^(docs|ai)\/.+\.(md|txt|pdf|png|jpe?g|webp|gif)$/i,
  /^[^/]+\.md$/i,
  /^public\/kilavuz\/bolumler\/[^/]+\.md$/i,
  /^public\/kilavuz\/ekran\/[^/]+\.(webp|png|jpe?g)$/i,
  /^kayitlar\/.+\.(md|txt|json|jsonl|csv)$/i,
  /^referans\/.+\.(md|txt|pdf)$/i,
];

/* ── 69.6 güvenli git + imza ────────────────────────────────────────────── */
/**
 * Her git çağrısının önüne: depo yapılandırmasındaki çalıştırılabilir kancalar etkisiz (fsmonitor, hooks), ext protokolü
 * kapalı. Kötü amaçlı bir değişiklik .git/config'e "her git status'ta çalış" yerleştirse de güncelleyici onu çalıştırmaz.
 */
function guvenliGit(args, win = process.platform === 'win32') {
  return ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${win ? 'NUL' : '/dev/null'}`,
    '-c', 'protocol.ext.allow=never', '-c', 'core.pager=cat', ...args];
}
/** allowed_signers dosyası (depo dışında, veri klasöründe). */
function imzaDosyasi(kok) { return yollar.programVeri(kok, 'imza-izinli'); }
/** Windows'un yerleşik ssh-keygen'i (taşınabilir git'te olmayabilir) — imza doğrulaması için. */
function sshKeygenBul() {
  for (const a of [process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32', 'OpenSSH', 'ssh-keygen.exe'), 'C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe']) {
    try { if (a && fs.existsSync(a)) return a; } catch { /* */ }
  }
  return null;
}
/**
 * eski..yeni aralığındaki her commit izinli bir SSH anahtarıyla imzalı mı.
 * @param o { git(args) → {kod,cikti}, once, hedef, dosya (allowed_signers), sshKeygen? }
 * @returns {{ durum: 'kurulmadi'|'gecerli'|'gecersiz'|'hata', sayi?, kotu?: [{sha, kod}], neden? }}
 */
function imzaDenetle({ git, once, hedef, dosya, sshKeygen = sshKeygenBul() }) {
  if (!dosya || !fs.existsSync(dosya)) return { durum: 'kurulmadi' };
  let icerik = '';
  try { icerik = fs.readFileSync(dosya, 'utf8'); } catch (e) { return { durum: 'hata', neden: `imza dosyası okunamadı: ${e.message}` }; }
  if (!/^\S+\s+(\S+=\S+\s+)*(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-\S+)\s+\S+/m.test(icerik)) return { durum: 'hata', neden: 'imza dosyasında geçerli anahtar satırı yok' };
  const c = ['-c', 'gpg.format=ssh', '-c', `gpg.ssh.allowedSignersFile=${dosya.replace(/\\/g, '/')}`];
  if (sshKeygen) c.push('-c', `gpg.ssh.program=${sshKeygen.replace(/\\/g, '/')}`);
  const r = git([...c, 'log', '--format=%H %G?', `${once}..${hedef}`]);
  if (r.kod !== 0) return { durum: 'hata', neden: `imza okunamadı: ${String(r.cikti).trim().slice(0, 200)}` };
  const satirlar = String(r.cikti).split('\n').map(s => s.trim()).filter(s => /^[0-9a-f]{40} \S$/.test(s));
  if (!satirlar.length) return { durum: 'hata', neden: 'aralıkta commit bulunamadı' };
  const kotu = satirlar.map(s => ({ sha: s.slice(0, 40), kod: s.slice(41) })).filter(x => x.kod !== 'G');
  return kotu.length ? { durum: 'gecersiz', sayi: satirlar.length, kotu } : { durum: 'gecerli', sayi: satirlar.length };
}
const IMZA_KOD = { N: 'imzasız', B: 'imza bozuk', U: 'imza izinli değil', X: 'imza süresi dolmuş', Y: 'anahtar süresi dolmuş', R: 'anahtar iptal', E: 'imza denetlenemedi' };
/** .git/config özeti (kalıcılık izi). */
function gitConfigOzeti(kok) {
  try { return require('crypto').createHash('sha256').update(fs.readFileSync(path.join(kok, '.git', 'config'))).digest('hex').slice(0, 16); } catch { return null; }
}

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
  const eski = durumOku(kok);
  let islem = null;   // 69.0: kilit alındıktan sonra kurulur (kilitte çıkan ikinci süreç çalışanın kaydını ezmesin)
  const islemYaz = () => { if (!islem || ops.kuru) return; try { durumYaz(kok, { ...durumOku(kok), islem }); } catch (e) { /* panel izlemesi iş değil */ } };
  const satir = (metin, tur = 'bilgi') => {
    if (!islem) return;
    islem.satirlar.push({ zaman: new Date(simdi()).toISOString(), metin: String(metin).slice(0, 400), tur });
    if (islem.satirlar.length > ISLEM_SATIR_EN_COK) islem.satirlar.splice(0, islem.satirlar.length - ISLEM_SATIR_EN_COK);
  };
  const log = (m) => { gunluk(kok, m, simdi); satir(m, /^(GERİ|UYARI)|başarısız/.test(m) ? 'uyari' : 'bilgi'); islemYaz(); };
  /** Adım durumu: suruyor | tamam | atlandi | hata. ayrinti yerinde güncellenir (kararlılık sayacı satır doldurmasın). */
  const adim = (kod, durum, ayrinti = null, { sessiz = false } = {}) => {
    if (!islem) return;
    let a = islem.adimlar.find(x => x.kod === kod);
    if (!a) { a = { kod, durum: null, bas: null, bit: null, ayrinti: null }; islem.adimlar.push(a); }
    const t = new Date(simdi()).toISOString();
    if (!a.bas) a.bas = t;
    if (durum !== 'suruyor') a.bit = t;
    a.durum = durum; a.ayrinti = ayrinti;
    if (!sessiz) {
      const ad = (ADIMLAR.find(x => x.kod === kod) || {}).ad || kod;
      satir(`${{ suruyor: '▶', tamam: '✓', atlandi: '–', hata: '✗' }[durum] || '·'} ${ad}${ayrinti ? ` — ${ayrinti}` : ''}`, durum === 'hata' ? 'hata' : durum === 'tamam' ? 'tamam' : 'bilgi');
    }
    islemYaz();
  };
  const kayit = (d) => {
    const yeni = { ...eski, ...d, kontrol: new Date(simdi()).toISOString() };
    if (islem) yeni.islem = islem;
    if (d.durum && d.durum !== 'guncel') yeni.gecmis = [{ zaman: yeni.kontrol, durum: d.durum, hedef: d.hedef || null, surum: d.hedefSurum || null, neden: d.neden || null }].concat(eski.gecmis || []).slice(0, GECMIS_EN_COK);
    durumYaz(kok, yeni);
    return yeni;
  };
  /** Aynı durum + hedef için Telegram bir kez. */
  const bildirBirKez = async (d, seviye, baslik, satirlar) => {
    const anahtar = `${d.durum}:${d.hedef || ''}`;
    if (eski.bildirilen === anahtar) return d;
    try { await ops.bildir(seviye, baslik, satirlar); satir('Telegram bildirimi gönderildi'); } catch (e) { log(`Telegram gönderilemedi: ${e.message}`); }
    const s = { ...durumOku(kok), bildirilen: anahtar, ...(islem ? { islem } : {}) };
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
  islem = { bas: new Date(simdi()).toISOString(), tur: ops.onayla ? 'onayli' : (ops.kuru ? 'kuru' : 'kontrol'), pid: process.pid,
    adimlar: [], satirlar: [], bitti: null, sonuc: null };
  satir(ops.onayla ? `Onaylı kurulum başladı (${String(ops.onayla).slice(0, 7)})` : 'Güncelleme kontrolü başladı');
  // 69.6: .git/config değişti mi (kötü amaçlı kalıcılık: fsmonitor/hooks/filter). Değişirse bir kez uyar; özet saklanır.
  const gco = ops.gitConfigOzeti ? ops.gitConfigOzeti() : gitConfigOzeti(kok);
  if (gco && eski.gitConfigOzet && gco !== eski.gitConfigOzet && eski.gitConfigBildirilen !== gco) {
    log(`UYARI: .git/config değişti (${eski.gitConfigOzet} → ${gco}) — bilerek yapılmadıysa sunucu incelenmeli`);
    try { await ops.bildir('error', 'Pusula: sunucudaki .git/config değişti', ['Git yapılandırması son güncelleme kontrolünden beri değişti.', 'Siz değiştirmediyseniz bilgisayarda kötü amaçlı bir yazılım olabilir: geliştirme sohbetine haber verin.']); } catch (e) { /* */ }
    eski.gitConfigBildirilen = gco;
  }
  if (gco) eski.gitConfigOzet = gco;
  adim('baglanti', 'suruyor');
  try {
    // 69.0: bu bloktaki her "return" AWAIT'lidir — yoksa finally (kilit silme, islem.bitti) geri alma / Telegram bitmeden koşar.
    const git = (...a) => ops.git(a);
    const tek = (...a) => { const r = git(...a); if (r.kod !== 0) throw new Error(`git ${a.join(' ')}: ${String(r.cikti).trim().slice(0, 300)}`); return String(r.cikti).trim(); };

    const dal = tek('rev-parse', '--abbrev-ref', 'HEAD');
    if (dal !== DAL) {
      const d = kayit({ durum: 'elle', neden: `Sunucudaki kopya '${dal}' dalında (beklenen ${DAL}). "git switch ${DAL}" gerekli.` });
      return await bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
    }
    const once = tek('rev-parse', 'HEAD');
    const f = git('fetch', '--quiet', 'origin', DAL);
    if (f.kod !== 0) {
      adim('baglanti', 'hata', 'GitHub\'a ulaşılamadı');
      const ardisik = (eski.durum === 'ag-hatasi' ? (eski.agHatasi || 0) : 0) + 1;
      log(`git fetch başarısız (${ardisik}. kez): ${String(f.cikti).trim().slice(0, 300)}`);
      const d = kayit({ durum: 'ag-hatasi', agHatasi: ardisik, neden: `GitHub'a ulaşılamadı: ${String(f.cikti).trim().slice(0, 200)}` });
      if (ardisik >= 3) return await bildirBirKez({ ...d, hedef: 'ag' }, 'error', 'Pusula güncellemesi: GitHub\'a ulaşılamıyor', [`${ardisik} gündür güncelleme kontrolü yapılamadı.`, d.neden]);
      return d;
    }
    const hedef = tek('rev-parse', `origin/${DAL}`);
    adim('baglanti', 'tamam');
    adim('plan', 'suruyor');
    const okuRev = (rev) => (yol) => { const r = git('show', `${rev}:${yol}`); return r.kod === 0 ? String(r.cikti) : null; };
    const kurulu = surumBilgisi(okuRev(once));
    if (hedef === once) {
      log(`güncel (${kurulu.surum || '?'} ${once.slice(0, 7)})`);
      adim('plan', 'tamam', `yeni sürüm yok — ${kurulu.surum || once.slice(0, 7)} güncel`);
      return kayit({ durum: 'guncel', hedef: null, hedefSurum: null, neden: null, kurulu: { sha: once, surum: kurulu.surum }, agHatasi: 0, bildirilen: null,
        imza: { durum: fs.existsSync(ops.imzaDosyasi !== undefined ? (ops.imzaDosyasi || '') : imzaDosyasi(kok)) ? 'kurulu' : 'kurulmadi' } });
    }
    const yeniBilgi = surumBilgisi(okuRev(hedef));
    const ata = git('merge-base', '--is-ancestor', 'HEAD', `origin/${DAL}`).kod === 0;
    // 69.6 İMZA — planlamadan ve indirmeden ÖNCE: izinli anahtarla imzalanmamış hiçbir commit kurulmaz (onaylı kurulum dahil).
    const imza = ata ? imzaDenetle({ git: ops.git, once, hedef, dosya: ops.imzaDosyasi !== undefined ? ops.imzaDosyasi : imzaDosyasi(kok), ...(ops.sshKeygen !== undefined ? { sshKeygen: ops.sshKeygen } : {}) }) : { durum: 'atlandi' };
    if (imza.durum === 'gecersiz' || imza.durum === 'hata') {
      adim('plan', 'hata', 'kod imzası doğrulanamadı');
      const ilk = (imza.kotu || [])[0];
      const neden = imza.durum === 'gecersiz'
        ? `Gelen kodda izinli anahtarla imzalanmamış commit var (${imza.kotu.length}/${imza.sayi}; ilk: ${ilk.sha.slice(0, 7)} — ${IMZA_KOD[ilk.kod] || ilk.kod}). Güvenlik için KURULMADI.`
        : `Kod imzası denetlenemedi (${imza.neden}). Güvenlik için KURULMADI.`;
      log(`GERİ: ${neden}`);
      const d = kayit({ durum: 'elle', hedef, hedefSurum: yeniBilgi.surum, kurulu: { sha: once, surum: kurulu.surum }, neden, imza, agHatasi: 0 });
      return await bildirBirKez(d, 'critical', 'Pusula güncellemesi: İMZASIZ KOD — kurulmadı', [neden,
        'GitHub hesabı ya da geliştirme bilgisayarı ele geçirilmiş olabilir. Siz göndermediyseniz GitHub parolanızı ve jetonlarınızı değiştirin.']);
    }
    if (imza.durum === 'kurulmadi') log('UYARI: kod imzası doğrulaması kurulmamış (scripts/imza-kur.js) — geçiş dönemi, imzasız kod kuruluyor');
    const degisen = ata ? tek('diff', '--no-ext-diff', '--name-only', 'HEAD', `origin/${DAL}`).split('\n').map(s => s.trim()).filter(Boolean) : [];
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
      const d = git('diff', '--no-ext-diff', '--no-textconv', '-U0', once, hedef, '--', 'server.js');
      const sat = String(d.cikti).split('\n').filter(x => /^[-+]/.test(x) && !/^(\+\+\+|---)/.test(x));
      if (d.kod === 0 && sat.length && sat.every(x => /^[-+]const APP_VERSION = '[^']+';\s*$/.test(x))) muaf.add('server.js');
    }
    const p = planla({ ata, degisen, kirli, canli, onay: ops.onayla === hedef, muaf });
    const pFarki = degisen.includes('package-lock.json') ? paketFarki(okuRev(once)('package-lock.json'), okuRev(hedef)('package-lock.json')) : [];
    const pMetin = pFarki.length ? `paket değişikliği (${pFarki.length}): ${pFarki.slice(0, 8).map(x => `${x.ad} ${x.eski || '—'} → ${x.yeni || 'silindi'}`).join(', ')}${pFarki.length > 8 ? ' …' : ''}` : null;
    const ortak = { hedef, hedefSurum: yeniBilgi.surum, kurulu: { sha: once, surum: kurulu.surum }, degisenSayisi: degisen.length, agHatasi: 0, paketFarki: pFarki.slice(0, 60), imza };
    log(`plan: ${p.karar} — ${once.slice(0, 7)} → ${hedef.slice(0, 7)} (${kurulu.surum} → ${yeniBilgi.surum}), ${degisen.length} dosya${p.canliDosyalar && p.canliDosyalar.length ? `, canlı: ${p.canliDosyalar.join(', ')}` : ''}`);

    adim('plan', p.karar === 'elle' ? 'hata' : 'tamam', `${kurulu.surum || '?'} → ${yeniBilgi.surum || hedef.slice(0, 7)} · ${degisen.length} dosya · ${{ kur: 'kurulacak', onay: 'bot kodu değişti — onayınız bekleniyor', elle: 'elle bakılmalı' }[p.karar]}`);
    if (p.karar === 'elle') {
      const d = kayit({ ...ortak, durum: 'elle', neden: p.neden, dosyalar: p.cakisan || p.baslatma || [] });
      return await bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [`Yeni sürüm: ${yeniBilgi.surum || hedef.slice(0, 7)}`, p.neden]);
    }
    if (p.karar === 'onay') {
      const d = kayit({ ...ortak, durum: 'onay', neden: p.neden, dosyalar: p.canliDosyalar, yeni: yeniBilgi.yeni, ...(eski.kuruFark && eski.kuruFark.hedef === hedef ? { neden: eski.neden, kuruFark: eski.kuruFark } : { kuruFark: null }) });
      return await bildirBirKez(d, 'lifecycle', `Pusula ${yeniBilgi.surum || ''} kurulmayı bekliyor (onay)`, [
        'Bu güncelleme BOT KODUNU değiştiriyor; kendiliğinden kurulmadı.',
        `Değişen bot dosyaları: ${p.canliDosyalar.slice(0, 8).join(', ')}`,
        ...(pMetin ? [pMetin] : []),
        ...yeniBilgi.yeni.slice(0, 3).map(x => `• ${x}`),
        'Kurmak için sunucudaki panelde: Ayarlar › Bu bilgisayar › "Güncellemeyi kur".'
      ]);
    }
    if (ops.kuru) return { ...ortak, durum: 'kuru', plan: p };

    // ── KUR ──
    kayit({ ...ortak, durum: 'kuruluyor', neden: null });
    adim('indir', 'suruyor');
    const geriAl = async (neden) => {
      log(`GERİ ALINIYOR: ${neden}`);
      for (const a of islem.adimlar) if (a.durum === 'suruyor') adim(a.kod, 'hata', neden.slice(0, 160));
      satir(`Eski sürüme (${kurulu.surum || once.slice(0, 7)}) dönülüyor…`, 'uyari'); islemYaz();
      const r = git('reset', '--keep', once);
      if (r.kod !== 0) log(`git reset --keep başarısız: ${String(r.cikti).trim().slice(0, 300)}`);
      if (degisen.some(x => PAKET.includes(x))) { const n = ops.npmKur(); if (n.kod !== 0) log(`npm install (geri alma) başarısız: ${String(n.cikti).slice(-300)}`); }
      const yb = await ops.yenidenBaslat();
      const s = yb.tamam ? await saglikBekle(ops, kurulu.surum) : null;
      satir(s ? `Eski sürüm (${kurulu.surum}) yeniden çalışıyor` : 'Eski sürüm de açılmadı — elle bakın', s ? 'uyari' : 'hata');
      const d = kayit({ ...ortak, durum: 'geri-alindi', neden, geriDonus: s ? 'eski sürüm çalışıyor' : 'eski sürüm de açılmadı — elle bakın' });
      return await bildirBirKez(d, 'critical', `Pusula ${yeniBilgi.surum || ''} kurulamadı — geri alındı`, [neden, s ? `Eski sürüm (${kurulu.surum}) yeniden çalışıyor.` : 'Eski sürüm de açılmadı: Pusula\'yı elle başlatın ve geliştirme sohbetine haber verin.']);
    };

    // 68.0 (PLAN-TASIMA F1): gelen sürüm kökteki config.json'a dokunuyorsa (ör. ileride depodan çıkarılması) ÖNCE kullanıcı
    // ayarı <veri>/ayarlar.json'a alınır — merge eski dosyayı değiştirse/silse de ayar kaybolmaz. Göç yapılamazsa kurulmaz.
    if (degisen.includes('config.json')) {
      try {
        const g = require('./ayarlar').gocEt(kok);
        if (g.yapildi) log(`ayar göçü: config.json → ${g.yol} (güncelleme config.json'a dokunmadan önce)`);
      } catch (e) {
        adim('indir', 'hata', 'ayarlar güvenceye alınamadı');
        const d = kayit({ ...ortak, durum: 'elle', neden: `Ayarlar güvenceye alınamadı (config.json → ayarlar.json): ${e.message}` });
        return await bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
      }
    }
    const m = git('merge', '--ff-only', `origin/${DAL}`);
    if (m.kod !== 0) {
      adim('indir', 'hata', 'git merge başarısız');
      const d = kayit({ ...ortak, durum: 'elle', neden: `Kod indirilemedi (git merge): ${String(m.cikti).trim().slice(0, 200)}` });
      return await bildirBirKez(d, 'error', 'Pusula güncellemesi: elle bakılmalı', [d.neden]);
    }
    adim('indir', 'tamam', `${degisen.length} dosya`);
    if (degisen.some(x => PAKET.includes(x))) {
      adim('paket', 'suruyor', 'npm install (birkaç dakika sürebilir)');
      const n = ops.npmKur();
      if (n.kod !== 0) return await geriAl(`Paketler kurulamadı (npm install): ${String(n.cikti).trim().slice(-200)}`);
      adim('paket', 'tamam');
    } else adim('paket', 'atlandi', 'paket değişikliği yok');
    const jsler = degisen.filter(x => /\.js$/.test(x) && fs.existsSync(path.join(kok, x)));
    adim('denetim', 'suruyor', `${jsler.length} dosya`);
    for (const yol of jsler) {
      const c = ops.nodeCheck(path.join(kok, yol));
      if (c.kod !== 0) return await geriAl(`Sözdizimi hatası: ${yol} — ${String(c.cikti).trim().split('\n').slice(0, 3).join(' ')}`);
    }
    adim('denetim', 'tamam', `${jsler.length} dosya temiz`);
    // 69.2 KURU DENEME — yalnız bot kodu değiştiyse. Kod değişti ama Pusula hâlâ ESKİ sürümle çalışıyor; vazgeçilirse yeniden başlatma yok.
    const kuruVazgec = async (d, seviye, baslik, satirlar) => {
      const r = git('reset', '--keep', once);
      if (r.kod !== 0) log(`git reset --keep başarısız: ${String(r.cikti).trim().slice(0, 300)}`);
      if (degisen.some(x => PAKET.includes(x))) { const n = ops.npmKur(); if (n.kod !== 0) log(`npm install (geri alma) başarısız: ${String(n.cikti).slice(-300)}`); }
      satir(`Kod eski sürüme (${kurulu.surum || once.slice(0, 7)}) döndürüldü; Pusula yeniden başlatılmadı — eski sürüm çalışmaya devam ediyor`, 'uyari');
      const k = kayit(d);
      // Bildirim anahtarı ayrı: "onay bekliyor" iletisi bu commit için zaten gitmiş olabilir — fark iletisi yine gitsin.
      return await bildirBirKez({ ...k, durum: d.kuruFark ? 'kuru-fark' : d.durum }, seviye, baslik, satirlar);
    };
    let kuruSonuc = null, kuruKayit = null;
    if (!(p.canliDosyalar && p.canliDosyalar.length)) adim('kuru', 'atlandi', 'bot kodu değişmedi');
    else if (typeof ops.kuruDeneme !== 'function') adim('kuru', 'atlandi', 'bu güncelleyicide kuru deneme yok');
    else {
      adim('kuru', 'suruyor', 'botların kararı eski ve yeni kodla, emir göndermeden (1–3 dk)');
      try { kuruSonuc = await ops.kuruDeneme({ eskiRev: once, yeniRev: hedef, ilerleme: (m) => adim('kuru', 'suruyor', m, { sessiz: true }) }); }
      catch (e) { kuruSonuc = { durum: 'yapilamadi', ozet: e.message }; }
      const kd = { zaman: new Date(simdi()).toISOString(), hedef, durum: kuruSonuc.durum, ozet: String(kuruSonuc.ozet || '').slice(0, 600),
        botlar: (kuruSonuc.botlar || []).map(b => ({ ad: b.ad, adGorunen: b.adGorunen, kip: b.kip, durum: b.durum, metin: b.metin, farklar: (b.farklar || []).slice(0, 12) })) };
      log(`kuru deneme: ${kd.durum} — ${kd.ozet}`);
      if (kd.durum === 'yeni-hata') {
        adim('kuru', 'hata', kd.ozet.slice(0, 200));
        return await kuruVazgec({ ...ortak, durum: 'geri-alindi', neden: `Kuru denemede yeni kod hata verdi: ${kd.ozet}`, geriDonus: 'eski sürüm çalışmaya devam ediyor (yeniden başlatılmadı)', kuruDeneme: kd },
          'critical', `Pusula ${yeniBilgi.surum || ''} kurulmadı — kuru denemede hata`, ['Yeni kod botun kararını hesaplarken hata verdi; kurulmadı, eski sürüm çalışıyor.', kd.ozet]);
      }
      if (kd.durum === 'fark' && !ops.kuruFarkOnay) {
        adim('kuru', 'hata', `karar farkı — onayınız gerekiyor: ${kd.ozet.slice(0, 160)}`);
        return await kuruVazgec({ ...ortak, durum: 'onay', neden: `Kuru denemede botun kararı değişti: ${kd.ozet}`, dosyalar: p.canliDosyalar, yeni: yeniBilgi.yeni, kuruFark: kd, kuruDeneme: kd },
          'lifecycle', `Pusula ${yeniBilgi.surum || ''}: kuru denemede karar farkı`, ['Yeni kod botun bugünkü kararını eskisinden farklı hesapladı; kurulmadı.', kd.ozet,
            'Fark bekleniyorsa (ör. bir düzeltme) panelde: Ayarlar › Güncelleme › "Farkı gördüm, yine de kur".']);
      }
      adim('kuru', 'tamam', { ayni: 'karar aynı', fark: 'karar farkı onaylandı', 'ikisi-hata': `uyarı — iki sürüm de hata verdi: ${kd.ozet.slice(0, 120)}`, 'eski-hata': 'yeni kod eski hatayı düzeltti', atlandi: 'çalışan bot yok', yapilamadi: `yapılamadı (uyarı): ${kd.ozet.slice(0, 120)}` }[kd.durum] || kd.durum);
      kuruKayit = kd;
      kayit({ ...ortak, durum: 'kuruluyor', neden: null, kuruDeneme: kd });
    }
    const onceSaglik = await Promise.resolve().then(() => ops.saglik()).catch(() => null);   // Y7: hangi botlar bağlıydı
    adim('baslat', 'suruyor', 'panel birkaç saniye yanıt vermeyebilir');
    const yb = await ops.yenidenBaslat();
    if (!yb.tamam) {
      adim('baslat', 'hata', yb.hata || 'yeniden başlatılamadı');
      const d = kayit({ ...ortak, durum: 'yeniden-baslat', kurulu: { sha: hedef, surum: yeniBilgi.surum }, neden: `Yeni kod indirildi ama Pusula yeniden başlatılamadı (${yb.hata || 'bilinmiyor'}). Pusula'yı durdurup yeniden başlatın.` });
      return await bildirBirKez(d, 'error', `Pusula ${yeniBilgi.surum || ''}: yeniden başlatma gerekli`, [d.neden]);
    }
    adim('baslat', 'tamam', `yol: ${yb.yol}`);
    adim('acilis', 'suruyor', `${yeniBilgi.surum || 'yeni sürüm'} bekleniyor`);
    const s = await saglikBekle(ops, yeniBilgi.surum);
    if (!s) return await geriAl(`Yeni sürüm ${Math.round((ops.saglikBekleMs || SAGLIK_BEKLE_MS) / 1000)} sn içinde açılmadı (yeniden başlatma yolu: ${yb.yol}).`);
    adim('acilis', 'tamam', `${s.appVersion || yeniBilgi.surum} yanıt veriyor`);
    const krMs = ops.kararlilikMs != null ? ops.kararlilikMs : KARARLILIK_MS;
    const krTur = Math.ceil(krMs / KARARLILIK_ADIM_MS);
    adim('kararlilik', 'suruyor', `${Math.round(krMs / 60000)} dk boyunca 15 sn'de bir sağlık kontrolü`);
    const kr = await kararlilikBekle({ ...ops, ilerleme: (i, tur) => adim('kararlilik', 'suruyor', `${i}/${tur} kontrol · kalan ~${Math.max(0, Math.ceil((tur - i) * KARARLILIK_ADIM_MS / 60000))} dk`, { sessiz: true }) }, yeniBilgi.surum, onceSaglik);
    if (!kr.tamam) return await geriAl(`Yeni sürüm kararlı çalışmadı: ${kr.neden}`);
    adim('kararlilik', 'tamam', kr.uyari ? `uyarı: ${kr.uyari}` : (krTur ? `${krTur}/${krTur} kontrol sorunsuz` : 'sorun yok'));
    if (kr.uyari) log(`UYARI: ${kr.uyari}`);
    log(`KURULDU: ${kurulu.surum} → ${yeniBilgi.surum} (${hedef.slice(0, 7)}, yol ${yb.yol})`);
    const d = kayit({ ...ortak, durum: 'kuruldu', kurulu: { sha: hedef, surum: yeniBilgi.surum }, onceki: { sha: once, surum: kurulu.surum }, neden: null, dosyalar: [], yeni: yeniBilgi.yeni, onayli: ops.onayla === hedef, kuruFark: null, kuruDeneme: kuruKayit });
    return await bildirBirKez(d, 'lifecycle', `Pusula ${yeniBilgi.surum || ''} kuruldu`, [
      `${kurulu.surum || '?'} → ${yeniBilgi.surum || '?'}${ops.onayla === hedef ? ' (onayınızla)' : ' (otomatik)'}`,
      ...(kr.uyari ? [`⚠ ${kr.uyari}`] : []),
      ...yeniBilgi.yeni.slice(0, 4).map(x => `• ${x}`)
    ]);
  } catch (e) {
    satir(`HATA: ${e.message}`, 'hata');
    for (const a of (islem && islem.adimlar) || []) if (a.durum === 'suruyor') adim(a.kod, 'hata', String(e.message).slice(0, 160), { sessiz: true });
    throw e;
  } finally {
    if (islem) {
      const son = ops.kuru ? 'kuru' : (durumOku(kok).durum || null);
      islem.bitti = new Date(simdi()).toISOString(); islem.sonuc = son;
      satir(`Bitti: ${{ guncel: 'güncel', kuruldu: 'kuruldu ✓', onay: 'onayınız bekleniyor', elle: 'elle bakılmalı', 'geri-alindi': 'geri alındı', 'yeniden-baslat': 'yeniden başlatma gerekli', 'ag-hatasi': 'GitHub\'a ulaşılamadı', kuru: 'deneme (hiçbir şey değişmedi)' }[son] || son || '?'}`, son === 'kuruldu' || son === 'guncel' ? 'tamam' : (son === 'onay' || son === 'kuru') ? 'bilgi' : 'uyari');
      islemYaz();
    }
    try { fs.unlinkSync(kilit); } catch (e) { /* yok */ }
  }
}

/** 69.0: kilit duruyor mu (panel: işlem bitmeden kilit kalkmışsa süreç yarıda ölmüş). */
function kilitVar(kok) { return fs.existsSync(yollar.programVeri(kok, 'guncelleme.kilit')); }

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
    if (ops.ilerleme) ops.ilerleme(i + 1, tur);
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

module.exports = { guvenliGit, imzaDenetle, imzaDosyasi, sshKeygenBul, gitConfigOzeti, IMZA_KOD, ADIMLAR, paketFarki, kilitVar, kararlilikBekle, KARARLILIK_MS, calistir, planla, canliKumesi, surumBilgisi, durumOku, durumYaz, gelistirmeMi, BASLATMA, PAKET, OTOMATIK, DAL };
