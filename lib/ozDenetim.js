'use strict';
/**
 * ÖZ DENETİM (69.1, PLAN-OZ-DENETIM.md) — Pusula'nın kendini 5 dk'da bir yoklaması, güvenli onarım, güvenli kip, tam kapanma.
 *
 * Kademe (kullanıcı kararı 2026-10-21, taslak 1–3):
 *   onar  — geri alınabilir, parayı etkilemeyen iş (kilit sil, eski günlüğü sıkıştır, sessiz saatte yeniden başlat …)
 *   koru  — tek koruyucu adım, sonra kullanıcıya bırakır (güvenli kip; para kaybettirebilecek sebepte TAM KAPANMA)
 *   haber — yalnız haber (saat, yedek, internet, mutabakat, marj, kaçan işlem, Telegram, sağlık sinyali)
 *
 * GÜVENLİ KİP: bot `durum.guvenliKip` — günlük çalışma yapılmaz (yeni işlem yok), dakikalık stop/koruma denetimi sürer.
 *   Öz denetimin koyduğu güvenli kip sebep geçince kendiliğinden kalkar; kullanıcı Sağlık sayfasından da kaldırabilir.
 * TAM KAPANMA = botun mevcut ENGEL'i (`durum.engel`, diske yazılır, yalnız kullanıcı "Engeli kaldır" ile açar). Bekçi,
 *   güncelleme, yeniden başlatma açamaz. Açık pozisyona dokunulmaz; borsadaki stoplar (felaket stopu) yerinde kalır.
 * DEMO KABUL (2026-12-09'a kadar): demo kipindeki bota (Hücum) öz denetim HİÇBİR ŞEY yapmaz — yalnız haber.
 * PARA KARARI YOK: pozisyon kapatma, al-sat, ayar/strateji değişikliği bu modülde yoktur. Kod hatası onarılmaz, raporlanır.
 *
 * Kalıcı: <dizin>/durum.json (son sonuçlar, onarım sayaçları, akşam özeti günü) · <dizin>/olaylar.jsonl (yalnız ekle,
 *   panel son 30 günü gösterir) · <dizin>/acilislar.jsonl (Pusula açılışları; günde 5'i geçince kırmızı).
 * Sunucuya bağımlılık `ctx` ile verilir (server.js ozDenetimKur) — öz test sahte ctx ile koşar (scripts/oz-denetim-selftest.js).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DK = 60000;
const SAAT = 60 * DK;
const GUN = 24 * SAAT;
const TR = 3 * SAAT;                       // Türkiye UTC+3 (yaz saati yok)

const AYAR = {
  aralikMs: 5 * DK,                        // yoklama
  yavasAralikMs: SAAT,                     // disk + yedek
  tekrarPencereMs: 30 * DK, tekrarEsik: 3, // aynı hata 30 dk'da 3 kez → güvenli kip
  tekrarKalkMs: 60 * DK,                   // güvenli kip (tekrar) — 60 dk tekrar yoksa kalkar
  onarimGunluk: 5,                         // aynı onarım günde en çok 5 kez
  acilisGunluk: 5,                         // Pusula günde 5'ten çok açıldıysa kırmızı (yeniden açma SINIRSIZ — bekçi)
  bellekMB: 1024, bellekKat: 2,
  diskOran: 0.10, diskGB: 5, gunlukSikistirGun: 30,
  saatFarkMs: 1000,
  fiyatTazeMs: 10 * DK, fiyatSapma: 0.03, fiyatSapmaKalk: 0.01,
  kacanDk: 15,                             // planlı günlük çalışma 00:02 UTC (03:02 TR) + 15 dk
  yedekSaat: 26,
  sinyalSaat: 2,
  stopHataArdisik: 3,                      // koruma stopu art arda 3 denetimde kurulamadı → tam kapanma
  emirRetEsik: 3,                          // emir retleri 30 dk'da 3 → tam kapanma
  tikHataEsik: 3,                          // bot döngüsü 30 dk'da 3 kez hata → tam kapanma
  ilkBeklemeMs: 15 * DK,                   // açılıştan 15 dk içinde yeniden başlatma yok (döngü olmasın)
  demoKorumaBitis: Date.parse('2026-12-09T21:00:00Z'),   // 2026-12-10 00:00 TR — demo kabul bitişi
  olaySakla: 30 * GUN,
};

/** Denetim tanımları (panel aynı listeyi gösterir). kademe: onar | koru | haber. */
const DENETIMLER = [
  { kimlik: 'surec', grup: 'sunucu', ad: 'Pusula süreci ayakta', kademe: 'onar', olcut: 'Panel 2 dk yanıt vermiyor; günde 5\'ten çok yeniden açıldı', nasil: 'Bekçi Pusula\'yı yeniden açar (sınırsız); günde 5\'i geçince kırmızı + Telegram.' },
  { kimlik: 'donma', grup: 'sunucu', ad: 'Bot döngüsü dönüyor', kademe: 'onar', olcut: 'Botun işi 30 dk\'dan uzun sürüyor ya da döngü 30 dk\'da 3 kez hata verdi', nasil: 'Takılan bot için Pusula yeniden başlatılır; döngü tekrar tekrar hata verirse bot tamamen kapanır.' },
  { kimlik: 'bellek', grup: 'sunucu', ad: 'Bellek kullanımı', kademe: 'onar', olcut: '1 GB üstü ya da 24 saatte 2 katı', nasil: 'Sessiz saatte Pusula yeniden başlatılır (çalışma sürmüyorken, 02:30–04:30 dışında).' },
  { kimlik: 'disk', grup: 'sunucu', ad: 'Disk alanı', kademe: 'onar', olcut: 'Boş yer %10 ya da 5 GB altında', nasil: '30 günden eski günlükler sıkıştırılır; hiçbir şey silinmez.' },
  { kimlik: 'saat', grup: 'sunucu', ad: 'Bilgisayar saati', kademe: 'haber', olcut: 'Borsa saatiyle fark 1 sn üstü', nasil: 'Windows saat eşitlemesini açmanızı söyler.' },
  { kimlik: 'kilit', grup: 'sunucu', ad: 'Takılı kilit dosyası', kademe: 'onar', olcut: 'Güncelleme kilidi var, sahibi çalışmıyor', nasil: 'Sahipsiz kilit silinir.' },
  { kimlik: 'dosya', grup: 'sunucu', ad: 'Kayıt dosyaları okunuyor', kademe: 'onar', olcut: 'Ayar ya da bot dosyası bozuk açıldı', nasil: 'Son sağlam kopyadan açılır; bot kaydıysa bot borsayla karşılaştırılana kadar kapalı kalır.' },
  { kimlik: 'yedek', grup: 'sunucu', ad: 'Yedek alınıyor', kademe: 'haber', olcut: 'Son yedek 26 saatten eski ya da başarısız', nasil: '' },
  { kimlik: 'guncel', grup: 'sunucu', ad: 'Son güncelleme', kademe: 'haber', olcut: 'Son kurulum geri alındı ya da yarıda kaldı', nasil: 'Adımları Ayarlar › Güncelleme gösterir.' },
  { kimlik: 'baglanti', grup: 'borsa', ad: 'Borsa bağlantısı', kademe: 'onar', olcut: 'Bot borsaya bağlı değil ya da borsa yürütücüsü durdu', nasil: 'Bağlantı 1, 2, 5, 10, 30 dk arayla yeniden denenir; geri çekilme bitince yürütücü kendisi açılır.' },
  { kimlik: 'fiyat', grup: 'borsa', ad: 'Fiyat tazeliği', kademe: 'koru', olcut: 'Borsa fiyatı 10 dk okunamadı ya da ikinci kaynaktan %3\'ten fazla sapıyor', nasil: 'Her yoklamada yeniden çekilir; sapma varsa botlar güvenli kipe girer, sapma %1\'in altına inince çıkar.' },
  { kimlik: 'internet', grup: 'borsa', ad: 'İnternet', kademe: 'haber', olcut: 'Borsa ve GitHub\'a ulaşılamıyor', nasil: 'İnternet gelince kesintinin ne kadar sürdüğünü yazar.' },
  { kimlik: 'mutabakat', grup: 'bot', ad: 'Mutabakat', kademe: 'koru', olcut: 'Borsadaki pozisyon ya da bakiye botun kaydından farklı', nasil: 'Bot tamamen kapanır (ENGEL); farkı inceleyip "Engeli kaldır" ile siz açarsınız.' },
  { kimlik: 'stop', grup: 'bot', ad: 'Koruma stopu', kademe: 'koru', olcut: 'Felaket stopu denetiminde hata', nasil: 'Stop her denetimde yeniden kurulur; art arda 3 denetimde kurulamazsa bot tamamen kapanır.' },
  { kimlik: 'marj', grup: 'bot', ad: 'Marj oranı', kademe: 'haber', olcut: 'Marj uyarı ya da alarm eşiğinde', nasil: '' },
  { kimlik: 'tekrar', grup: 'bot', ad: 'Tekrarlayan hata', kademe: 'koru', olcut: 'Aynı hata 30 dk\'da 3 kez', nasil: 'Bot güvenli kipe girer (yeni işlem yok, stop korunur); emir retleriyse tamamen kapanır.' },
  { kimlik: 'kacan', grup: 'bot', ad: 'Kaçan planlı işlem', kademe: 'haber', olcut: 'Günlük çalışma 03:02\'den 15 dk sonra hâlâ yapılmadı', nasil: 'Kaçırılanı kendisi yapmaz; nedenini yazar.' },
  { kimlik: 'telegram', grup: 'bildirim', ad: 'Telegram ulaşıyor', kademe: 'haber', olcut: 'Son gönderim başarısız ya da Telegram bağlı değil', nasil: '' },
  { kimlik: 'sinyal', grup: 'bildirim', ad: 'Sağlık sinyali', kademe: 'haber', olcut: 'Son ping başarısız ya da sunucu sinyali 2 saatten eski', nasil: '' },
];
const GRUPLAR = [['sunucu', 'Pusula ve sunucu'], ['borsa', 'Borsa ve veri'], ['bot', 'Botlar ve pozisyonlar'], ['bildirim', 'Bildirimler']];

/** Tam kapanma / güvenli kip tetikleri (taslak 3 — hepsi kullanıcının onayladığı öneriler). */
const TETIKLER = [
  { kimlik: 'mutabakat', ad: 'Mutabakat farkı', sonuc: 'tam', not: 'mevcut ENGEL' },
  { kimlik: 'stop', ad: 'Koruma stopu kurulamadı', sonuc: 'tam' },
  { kimlik: 'dosya', ad: 'Bozuk bot kaydı borsayla uyuşmuyor', sonuc: 'tam', not: 'mevcut ENGEL' },
  { kimlik: 'emirRet', ad: 'Emirler art arda reddediliyor', sonuc: 'tam' },
  { kimlik: 'ciftEmir', ad: 'Beklenmeyen emir ya da dolum', sonuc: 'tam', not: 'mutabakat yakalar (mevcut ENGEL)' },
  { kimlik: 'cokme', ad: 'Bot döngüsü tekrar tekrar çöküyor', sonuc: 'tam' },
  { kimlik: 'yetki', ad: 'API anahtarının yetkisi değişti', sonuc: 'tam', not: 'henüz denetlenmiyor — canlı hesaba geçmeden eklenecek' },
  { kimlik: 'fiyatSapma', ad: 'Fiyat ikinci kaynaktan çok farklı', sonuc: 'guvenli' },
  { kimlik: 'tekrar', ad: 'Diğer tekrarlayan hatalar', sonuc: 'guvenli' },
  { kimlik: 'guncelleme', ad: 'Güncellemeden hemen sonra bot hatası', sonuc: 'guvenli', not: 'tekrarlayan hata olarak yakalanır; kararlılık gözlemi eski sürüme döner' },
];

const SIRA = { tamam: 0, kapali: 0, bilinmiyor: 1, uyari: 2, hata: 3 };
const enKotu = (l) => l.reduce((a, d) => (SIRA[d] > SIRA[a] ? d : a), 'tamam');
const trGun = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
const trSaatDk = (ms) => { const d = new Date(ms + TR); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const utcGun = (ms) => new Date(ms).toISOString().slice(0, 10);
const dkMetin = (ms) => (ms < SAAT ? `${Math.max(1, Math.round(ms / DK))} dk` : ms < 3 * SAAT ? `${(Math.round(ms / SAAT * 2) / 2).toString().replace('.', ',')} saat` : ms < 2 * GUN ? `${Math.round(ms / SAAT)} saat` : `${Math.round(ms / GUN)} gün`);

/**
 * Sessiz saat (S6): çalışma sürmüyor, TR 02:30–04:30 dışında (planlı 03:02 ±30 dk + 02:50–04:30 güncelleme penceresi).
 * @param mesgul bir bot işi sürüyor mu
 */
function sessizSaat(simdi, mesgul) {
  if (mesgul) return false;
  const dk = trSaatDk(simdi);
  return !(dk >= 150 && dk < 270);
}

/** Günlük satırından tekrar anahtarı: bot etiketi ayrı, sayılar/kimlikler '#'. */
function tekrarAnahtari(mesaj) {
  return String(mesaj).replace(/^\[[^\]]+\]\s*/, '').replace(/0x[0-9a-f]+/gi, '#').replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 140);
}
/** Emir reddi (Binance -2019 marj yetersiz, -2010 yeni emir reddi, -1111 hassasiyet, -4164 asgari nominal, -1013 filtre …). */
const EMIR_RET = /(-2019|-2010|-1111|-4164|-1013|-4003|-4131|Margin is insufficient|insufficient balance|yetersiz bakiye|geçersiz miktar|emir reddedildi)/i;
/** Kendi döngüsünü besleyen satırlar tekrar sayılmaz (ENGELLİ / güvenli kip her 15 dk yazılır). */
const TEKRAR_DISI = /ENGELLİ|GÜVENLİ KİP|\[ÖZ DENETİM\]|günlük çalışma yapılamadı/;
/** Ağ hataları tekrar sayılmaz — bağlantı/internet denetimi ve yürütücünün geri çekilmesi (418/429) izler; kısa kesinti güvenli kip açmasın. */
const AG_HATASI = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|RequestTimeout|NetworkError|ExchangeNotAvailable|zaman aşımı|timed? ?out|GERI_CEKILME|geri çekilme|\b(418|429|502|503|504)\b/i;

class OzDenetim {
  /**
   * @param o.dizin  kalıcı kayıt dizini (data/oz-denetim)
   * @param o.ctx    sunucu bağdaştırıcısı — bkz. server.js ozDenetimKur (her alan isteğe bağlı; yoksa denetim 'bilinmiyor')
   * @param o.bildirici isletim.Bildirici benzeri { gonder(tur, baslik, satirlar, secenek) }
   * @param o.kaydet (seviye, metin) günlük
   */
  constructor({ dizin, ctx = {}, bildirici = null, kaydet = () => {}, ayar = {}, simdi = () => Date.now() } = {}) {
    this.dizin = dizin;
    this.ctx = ctx;
    this.bildirici = bildirici;
    this.kaydet = (sv, m) => { try { kaydet(sv, `[ÖZ DENETİM] ${m}`); } catch { /* */ } };
    this.ayar = { ...AYAR, ...ayar };
    this.simdi = simdi;
    this.sonuclar = {};          // kimlik → { durum, ayrinti, botlar, zaman, onarim }
    this.durumDosya = dizin ? path.join(dizin, 'durum.json') : null;
    this.kayit = { sayac: {}, ozetGun: null, stopHata: {}, kesintiBas: null, yavasSon: 0, oncekiDurum: {} };
    if (this.durumDosya) { try { this.kayit = { ...this.kayit, ...JSON.parse(fs.readFileSync(this.durumDosya, 'utf8')) }; } catch { /* ilk kez */ } }
    this.tekrarlar = {};         // bot → anahtar → [zaman]
    this.tekrarOrnek = {};       // bot → anahtar → son özgün satır (panelde görünen)
    this.emirRetler = {};        // bot → [zaman]
    this.bellekOrnek = [];       // [{zaman, mb}] saatlik
    this.acilis = simdi();
    this.mesgul = false;
    this.sonYoklama = null;
    this.zamanlayici = null;
  }

  // ── kalıcılık ──
  _yaz() {
    if (!this.durumDosya) return;
    try {
      fs.mkdirSync(this.dizin, { recursive: true });
      const g = `${this.durumDosya}.tmp`;
      fs.writeFileSync(g, JSON.stringify({ ...this.kayit, sonuclar: this.sonuclar, sonYoklama: this.sonYoklama }, null, 2), 'utf8');
      fs.renameSync(g, this.durumDosya);
    } catch (e) { this.kaydet('WARN', `durum yazılamadı: ${e.message}`); }
  }
  _olay(o) {
    const satir = { zaman: this.simdi(), ...o };
    if (!this.dizin) return satir;
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.appendFileSync(path.join(this.dizin, 'olaylar.jsonl'), JSON.stringify(satir) + '\n', 'utf8'); } catch { /* */ }
    return satir;
  }
  olaylar(gun = 30, tavan = 300) {
    if (!this.dizin) return [];
    const sinir = this.simdi() - gun * GUN;
    let l = [];
    try { l = fs.readFileSync(path.join(this.dizin, 'olaylar.jsonl'), 'utf8').split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(x => x && x.zaman >= sinir); } catch { /* yok */ }
    return l.slice(-tavan).reverse();
  }

  /** Açılışta bir kez (server): açılışı kaydeder. @returns bugünkü (TR) açılış sayısı */
  acilisKaydet() {
    if (!this.dizin) return 0;
    const dosya = path.join(this.dizin, 'acilislar.jsonl');
    let l = [];
    try { l = fs.readFileSync(dosya, 'utf8').split('\n').filter(Boolean).map(Number).filter(Number.isFinite); } catch { /* ilk */ }
    l.push(this.acilis);
    l = l.slice(-200);
    try { fs.mkdirSync(this.dizin, { recursive: true }); fs.writeFileSync(dosya, l.join('\n') + '\n', 'utf8'); } catch { /* */ }
    return l.filter(z => trGun(z) === trGun(this.acilis)).length;
  }
  bugunAcilis() {
    if (!this.dizin) return 1;
    try { const g = trGun(this.simdi()); return fs.readFileSync(path.join(this.dizin, 'acilislar.jsonl'), 'utf8').split('\n').filter(Boolean).map(Number).filter(z => trGun(z) === g).length; } catch { return 1; }
  }

  // ── günlük gözlemi (tekrarlayan hata, emir reddi) ──
  /** server db.addLog her satırda çağırır. Yalnız WARN/ERROR ve bir bot etiketiyle başlayan satırlar sayılır. */
  gunlukGozle(seviye, mesaj) {
    if (seviye !== 'WARN' && seviye !== 'ERROR') return;
    const m = String(mesaj || '');
    if (TEKRAR_DISI.test(m)) return;
    const bot = this._etikettenBot(m);
    if (!bot) return;
    const z = this.simdi();
    const p = this.ayar.tekrarPencereMs;
    if (EMIR_RET.test(m)) { const l = (this.emirRetler[bot] = (this.emirRetler[bot] || []).filter(t => z - t < p)); l.push(z); }
    if (AG_HATASI.test(m)) return;
    const a = tekrarAnahtari(m);
    const b = (this.tekrarlar[bot] = this.tekrarlar[bot] || {});
    const l = (b[a] = (b[a] || []).filter(t => z - t < Math.max(p, this.ayar.tekrarKalkMs)));
    l.push(z);
    (this.tekrarOrnek[bot] = this.tekrarOrnek[bot] || {})[a] = m.replace(/^\[[^\]]+\]\s*/, '').slice(0, 200);
    const anahtarlar = Object.keys(b);
    if (anahtarlar.length > 200) for (const k of anahtarlar.slice(0, anahtarlar.length - 200)) { delete b[k]; delete this.tekrarOrnek[bot][k]; }
  }
  _etikettenBot(m) {
    const e = /^\[([^\]]+)\]/.exec(m);
    if (!e) return null;
    const etiket = e[1].toLocaleUpperCase('tr-TR');
    const b = this._botlar().find(x => x.etiket && etiket === String(x.etiket).toLocaleUpperCase('tr-TR'));
    return b ? b.ad : null;
  }
  _tekrarlayan(bot, simdi) {
    const b = this.tekrarlar[bot] || {};
    const out = [];
    for (const [a, l] of Object.entries(b)) {
      const n = l.filter(t => simdi - t < this.ayar.tekrarPencereMs).length;
      if (n >= this.ayar.tekrarEsik) out.push({ anahtar: a, adet: n, ornek: ((this.tekrarOrnek[bot] || {})[a]) || a });
    }
    return out.sort((x, y) => y.adet - x.adet);
  }
  _sonTekrar(bot) { let s = 0; for (const l of Object.values(this.tekrarlar[bot] || {})) for (const t of l) if (t > s) s = t; return s; }

  // ── yardımcılar ──
  _botlar() { try { return (this.ctx.botlar && this.ctx.botlar()) || []; } catch { return []; } }
  /** Demo kabul süresince demo bota öz denetim hiçbir şey yapmaz. */
  dokunulmaz(b, simdi = this.simdi()) { return !!b && b.mod === 'demo' && simdi < this.ayar.demoKorumaBitis; }
  _onarimHakki(kimlik, simdi) {
    const g = trGun(simdi);
    const s = this.kayit.sayac[kimlik];
    return !s || s.gun !== g || s.adet < this.ayar.onarimGunluk;
  }
  _onarimSay(kimlik, simdi) {
    const g = trGun(simdi);
    const s = this.kayit.sayac[kimlik];
    this.kayit.sayac[kimlik] = s && s.gun === g ? { gun: g, adet: s.adet + 1 } : { gun: g, adet: 1 };
  }
  _mesgulMu() { return this._botlar().some(b => b.bot && (b.bot._calisma || b.bot.mesgul)); }
  async _bildir(tur, baslik, satirlar, anahtar, kisitMs) {
    if (!this.bildirici) return null;
    try { return await this.bildirici.gonder(tur, `Öz denetim: ${baslik}`, satirlar, anahtar ? { anahtar: `oz:${anahtar}`, kisitMs } : {}); } catch { return null; }
  }

  // ── bot eylemleri (koru kademesi) ──
  _guvenliKip(b, kaynak, metin) {
    if (this.dokunulmaz(b) || !b.bot || typeof b.bot.guvenliKipKoy !== 'function') return false;
    if (b.bot.durum.engel || b.bot.durum.guvenliKip) return false;
    if (!b.bot.guvenliKipKoy(`oz:${kaynak}`, metin)) return false;
    this._turBildirdi = true;
    this._olay({ kimlik: kaynak, tur: 'guvenli-kip', bot: b.ad, metin });
    this.kaydet('WARN', `${b.adGorunen}: GÜVENLİ KİP — ${metin}`);
    this._bildir('alarm', `${b.adGorunen} güvenli kipte`, [metin, 'Yeni işlem açılmayacak; açık pozisyonun stopu yerinde. Sebep geçince kendiliğinden çıkar; Sağlık sayfasından da kaldırabilirsiniz.'], `gk:${b.ad}:${kaynak}`);
    return true;
  }
  _guvenliKipKaldir(b, kaynak, neden) {
    const g = b.bot && b.bot.durum.guvenliKip;
    if (!g || g.kaynak !== `oz:${kaynak}` || typeof b.bot.guvenliKipKaldir !== 'function') return false;
    b.bot.guvenliKipKaldir(`oz:${kaynak}`);
    this._olay({ kimlik: kaynak, tur: 'guvenli-kip-kalkti', bot: b.ad, metin: neden });
    this.kaydet('INFO', `${b.adGorunen}: güvenli kip kendiliğinden kalktı — ${neden}`);
    return true;
  }
  _tamKapanma(b, kaynak, metin) {
    if (this.dokunulmaz(b) || !b.bot || typeof b.bot.engelKoy !== 'function') return false;
    if (b.bot.durum.engel) return false;
    const tam = `öz denetim: ${metin}`;
    if (!b.bot.engelKoy(`oz:${kaynak}`, tam)) return false;
    this._turBildirdi = true;
    this._olay({ kimlik: kaynak, tur: 'tam-kapanma', bot: b.ad, metin });
    this.kaydet('ERROR', `${b.adGorunen}: TAM KAPANMA — ${metin}`);
    this._bildir('alarm', `${b.adGorunen} TAMAMEN KAPANDI`, [metin, 'Bot siz açana kadar çalışmayacak (Pusula yeniden başlasa da). Açık pozisyona dokunulmadı; borsadaki stoplar yerinde.',
      'Sebebi inceleyip Sağlık sayfasından "Botu yeniden aç" deyin.'], `tk:${b.ad}:${kaynak}`);
    return true;
  }

  // ── denetimler ──
  /** Her denetim { durum, ayrinti, botlar?, onarim? } döndürür. Sorun yoksa 'tamam'. */
  async _yokla(kimlik, simdi, yavas) {
    const c = this.ctx;
    const A = this.ayar;
    const botlar = this._botlar().filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor);
    const botSatir = (fn) => {
      const out = {};
      for (const b of botlar) { try { out[b.ad] = { ad: b.adGorunen, mod: b.mod, ...fn(b) }; } catch (e) { out[b.ad] = { ad: b.adGorunen, mod: b.mod, durum: 'bilinmiyor', ayrinti: e.message }; } }
      return out;
    };
    const botOzet = (out, bosMetin) => {
      const l = Object.values(out);
      if (!l.length) return { durum: 'tamam', ayrinti: bosMetin || 'çalışan bot yok' };
      const d = enKotu(l.map(x => x.durum));
      const sorunlu = l.filter(x => SIRA[x.durum] >= 2);
      return { durum: d, ayrinti: (sorunlu.length ? sorunlu : l).map(x => `${x.ad}: ${x.ayrinti}`).join(' · '), botlar: out };
    };

    switch (kimlik) {
      case 'surec': {
        const n = this.bugunAcilis();
        const dt = c.denetleyici ? c.denetleyici() : null;
        const ardisik = dt && dt.ardisik ? dt.ardisik : 0;
        const acik = dkMetin(simdi - this.acilis);
        if (ardisik >= 3) return { durum: 'hata', ayrinti: `Pusula ${ardisik} kez üst üste açılıp hemen kapandı · bugün ${n} açılış` };
        if (n > A.acilisGunluk) return { durum: 'hata', ayrinti: `bugün ${n} kez açıldı (günde ${A.acilisGunluk}'ten çok) · ${acik} süredir açık` };
        return { durum: 'tamam', ayrinti: `${acik} süredir açık · bugün ${n} açılış${c.denetleyiciVar && !c.denetleyiciVar() ? ' · denetleyicisiz başlatıldı (çökerse bekçi açar)' : ''}` };
      }
      case 'donma': {
        const out = botSatir((b) => {
          const s = typeof b.bot.bekci === 'function' ? b.bot.bekci(simdi).filter(x => x.anahtar === 'mesgul' || x.anahtar === 'calisma') : [];
          const th = typeof b.bot.tikHatalari === 'function' ? b.bot.tikHatalari(simdi, A.tekrarPencereMs) : [];
          if (th.length >= A.tikHataEsik) return { durum: 'hata', ayrinti: `döngü 30 dk'da ${th.length} kez hata verdi (son: ${String(th[th.length - 1].metin).slice(0, 90)})`, cokme: th };
          if (s.length) return { durum: 'hata', ayrinti: s.map(x => x.metin).join(' · '), takildi: true };
          return { durum: 'tamam', ayrinti: 'dönüyor' };
        });
        return botOzet(out);
      }
      case 'bellek': {
        const mb = c.bellekMB ? c.bellekMB() : null;
        if (!Number.isFinite(mb)) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        const son = this.bellekOrnek[this.bellekOrnek.length - 1];
        if (!son || simdi - son.zaman >= SAAT) { this.bellekOrnek.push({ zaman: simdi, mb }); this.bellekOrnek = this.bellekOrnek.filter(x => simdi - x.zaman <= 25 * SAAT); }
        const once = this.bellekOrnek.find(x => simdi - x.zaman >= 23 * SAAT);
        if (mb > A.bellekMB) return { durum: 'uyari', ayrinti: `${mb} MB (> ${A.bellekMB} MB)` };
        if (once && mb > A.bellekKat * once.mb && mb > 300) return { durum: 'uyari', ayrinti: `${mb} MB — 24 saatte ${(mb / once.mb).toFixed(1).replace('.', ',')} katı (${once.mb} MB)` };
        return { durum: 'tamam', ayrinti: `${mb} MB` };
      }
      case 'disk': {
        if (!yavas && this.sonuclar.disk) return null;   // saatte bir
        const d = c.disk ? c.disk() : null;
        if (!d || d.hata || !Number.isFinite(d.bosGB)) return { durum: 'bilinmiyor', ayrinti: (d && d.hata) || 'okunamadı' };
        const oran = d.toplamGB > 0 ? d.bosGB / d.toplamGB : null;
        const metin = `boş ${String(d.bosGB).replace('.', ',')} GB${oran != null ? ` (%${Math.round(oran * 100)})` : ''}`;
        if (d.bosGB < A.diskGB || (oran != null && oran < A.diskOran)) return { durum: 'uyari', ayrinti: metin };
        return { durum: 'tamam', ayrinti: metin };
      }
      case 'saat':
      case 'internet':
      case 'fiyat': {
        const ag = this._agSonuc;
        if (!ag) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi' };
        if (kimlik === 'internet') {
          if (!ag.binance && !ag.github) return { durum: 'uyari', ayrinti: `borsaya ve GitHub'a ulaşılamıyor${this.kayit.kesintiBas ? ` · ${dkMetin(simdi - this.kayit.kesintiBas)} süredir` : ''}` };
          if (!ag.binance) return { durum: 'uyari', ayrinti: 'borsaya ulaşılamıyor (GitHub açık)' };
          return { durum: 'tamam', ayrinti: `bağlı · borsa ${ag.gecikmeMs} ms` };
        }
        if (kimlik === 'saat') {
          if (!Number.isFinite(ag.saatFarkMs)) return { durum: 'bilinmiyor', ayrinti: 'borsa saati okunamadı' };
          const f = Math.abs(ag.saatFarkMs);
          const metin = `borsa saatiyle fark ${(ag.saatFarkMs / 1000).toFixed(1).replace('.', ',')} sn`;
          return f > A.saatFarkMs ? { durum: 'uyari', ayrinti: `${metin} — Ayarlar › Saat ve dil › "Saati şimdi eşitle"` } : { durum: 'tamam', ayrinti: metin };
        }
        // fiyat
        const f = ag.fiyat || {};
        if (!(f.binance > 0)) {
          const yas = this.kayit.fiyatSon ? simdi - this.kayit.fiyatSon : null;
          if (yas == null || yas >= A.fiyatTazeMs) return { durum: 'uyari', ayrinti: `borsa fiyatı ${yas == null ? 'okunamadı' : `${dkMetin(yas)} süredir okunamıyor`} — her yoklamada yeniden deneniyor` };
          return { durum: 'tamam', ayrinti: `son okuma ${dkMetin(yas)} önce` };
        }
        this.kayit.fiyatSon = simdi;
        if (f.ikinci > 0) {
          const sapma = Math.abs(f.binance / f.ikinci - 1);
          const metin = `BTC ${Math.round(f.binance).toLocaleString('tr-TR')} $ · ikinci kaynak (${f.ikinciAd}) farkı %${(sapma * 100).toFixed(2).replace('.', ',')}`;
          return sapma > A.fiyatSapma ? { durum: 'hata', ayrinti: metin, sapma } : { durum: 'tamam', ayrinti: metin, sapma };
        }
        return { durum: 'tamam', ayrinti: `BTC ${Math.round(f.binance).toLocaleString('tr-TR')} $ · ikinci kaynak okunamadı` };
      }
      case 'kilit': {
        const k = c.kilit ? c.kilit() : null;
        if (!k) return { durum: 'tamam', ayrinti: 'kilit yok' };
        if (k.yasiyor) return { durum: 'tamam', ayrinti: 'güncelleme sürüyor' };
        if (simdi - k.zaman < 30 * DK) return { durum: 'tamam', ayrinti: `kilit ${dkMetin(simdi - k.zaman)} önce alındı` };
        return { durum: 'uyari', ayrinti: `güncelleme kilidi ${dkMetin(simdi - k.zaman)} süredir duruyor, sahibi (pid ${k.pid || '?'}) çalışmıyor`, sahipsiz: true };
      }
      case 'dosya': {
        const ayarB = (c.ayarBozuk ? c.ayarBozuk() : []).filter(Boolean);
        const out = botSatir((b) => (b.bot.bozuk || /durum dosyası bozuk/.test(String(b.bot.durum.engel || ''))
          ? { durum: 'hata', ayrinti: 'durum dosyası bozuk açıldı — son sağlam kopyadan; bot borsayla karşılaştırılana kadar kapalı (ENGEL)' }
          : { durum: 'tamam', ayrinti: 'okunuyor' }));
        const bo = botOzet(out, 'okunuyor');
        if (ayarB.length) return { durum: 'hata', ayrinti: [...ayarB, ...(bo.durum !== 'tamam' ? [bo.ayrinti] : [])].join(' · '), botlar: out };
        return bo.durum === 'tamam' ? { durum: 'tamam', ayrinti: 'ayar ve bot dosyaları okunuyor', botlar: out } : bo;
      }
      case 'yedek': {
        if (!yavas && this.sonuclar.yedek) return null;
        const y = c.yedek ? c.yedek() : null;
        if (!y || !y.son) return { durum: 'uyari', ayrinti: 'henüz yedek alınmamış (Ayarlar › Yedek ve taşıma)' };
        const z = Date.parse(y.son.zaman);
        if (y.son.hata) return { durum: 'uyari', ayrinti: `son yedek başarısız: ${String(y.son.hata).slice(0, 120)}` };
        if (!Number.isFinite(z) || simdi - z > A.yedekSaat * SAAT) return { durum: 'uyari', ayrinti: `son yedek ${Number.isFinite(z) ? dkMetin(simdi - z) + ' önce' : 'okunamadı'}` };
        return { durum: 'tamam', ayrinti: `son yedek ${dkMetin(simdi - z)} önce · ${y.son.dosya || '?'} dosya` };
      }
      case 'guncel': {
        const g = c.guncelleme ? c.guncelleme() : null;
        if (!g) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        if (g.yarida) return { durum: 'uyari', ayrinti: 'son güncelleme yarıda kaldı — Ayarlar › Güncelleme › Şimdi kontrol et' };
        if (g.durum === 'geri-alindi') return { durum: 'uyari', ayrinti: `son kurulum geri alındı: ${String(g.mesaj || '').slice(0, 140)}` };
        return { durum: 'tamam', ayrinti: `${g.durum || '—'} · çalışan sürüm ${g.calisan || '?'}` };
      }
      case 'baglanti': {
        const out = botSatir((b) => {
          if (!b.y || !b.y.borsa) return { durum: 'hata', ayrinti: 'borsaya bağlı değil — bağlantı yeniden deneniyor' };
          if (b.y.durum === 'DURDURULDU') {
            const kendi = b.y.durmaTuru === 'GERI_CEKILME' || b.y.durmaTuru === 'BELIRSIZ';
            return { durum: kendi ? 'uyari' : 'hata', ayrinti: `yürütücü durdu [${b.y.durmaTuru || '?'}]${kendi ? ' — süre bitince kendisi açılır' : ' — elle müdahale gerekir'}` };
          }
          return { durum: 'tamam', ayrinti: 'bağlı' };
        });
        return botOzet(out);
      }
      case 'mutabakat': {
        const out = botSatir((b) => {
          const e = b.bot.durum.engel || (b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel);
          if (e) return { durum: 'hata', ayrinti: `TAMAMEN KAPALI (ENGEL): ${String(e).slice(0, 160)}`, engel: true };
          return { durum: 'tamam', ayrinti: 'kayıt borsayla uyuşuyor' };
        });
        return botOzet(out);
      }
      case 'stop': {
        const out = botSatir((b) => {
          const k = b.bot.koruma;
          if (!k || typeof k.aktif !== 'function' || !k.aktif()) return { durum: 'tamam', ayrinti: 'felaket stopu kapalı' };
          const sd = k.durum && k.durum.sonDenetim;
          const hatalar = (sd && sd.hatalar) || [];
          const kayit = this.kayit.stopHata[b.ad] || { zaman: null, ardisik: 0 };
          if (sd && sd.zaman !== kayit.zaman) this.kayit.stopHata[b.ad] = { zaman: sd.zaman, ardisik: hatalar.length ? kayit.ardisik + 1 : 0 };
          const ardisik = (this.kayit.stopHata[b.ad] || kayit).ardisik;
          const n = Object.keys((k.durum && k.durum.stoplar) || {}).length;
          if (hatalar.length) return { durum: ardisik >= A.stopHataArdisik ? 'hata' : 'uyari', ayrinti: `stop kurulamadı (${ardisik}. denetim): ${hatalar.slice(0, 2).map(String).join(' · ').slice(0, 160)}`, ardisik };
          return { durum: 'tamam', ayrinti: n ? `${n} pozisyonun stopu borsada` : 'pozisyon yok' };
        });
        return botOzet(out);
      }
      case 'marj': {
        const out = botSatir((b) => {
          const m = b.bot.durum.sonMarj;
          if (!m) return { durum: 'bilinmiyor', ayrinti: 'henüz ölçülmedi' };
          if (m.hata) return { durum: 'uyari', ayrinti: `okunamadı: ${String(m.hata).slice(0, 100)}` };
          const oran = Number.isFinite(m.oran) ? `marj oranı %${(m.oran * 100).toFixed(1).replace('.', ',')}` : 'marj';
          if (m.seviye === 'alarm') return { durum: 'hata', ayrinti: `${oran} · ${(m.uyarilar || []).join(' · ')}` };
          if (m.seviye === 'uyari') return { durum: 'uyari', ayrinti: `${oran} · ${(m.uyarilar || []).join(' · ')}` };
          return { durum: 'tamam', ayrinti: oran };
        });
        return botOzet(out);
      }
      case 'tekrar': {
        const out = botSatir((b) => {
          const t = this._tekrarlayan(b.ad, simdi);
          const ret = (this.emirRetler[b.ad] || []).filter(z => simdi - z < A.tekrarPencereMs).length;
          if (ret >= A.emirRetEsik) return { durum: 'hata', ayrinti: `emirler 30 dk'da ${ret} kez reddedildi`, emirRet: ret };
          if (t.length) return { durum: 'uyari', ayrinti: `aynı hata 30 dk'da ${t[0].adet} kez: ${t[0].ornek.slice(0, 130)}`, tekrar: t[0] };
          const gk = b.bot.durum.guvenliKip;
          if (gk) return { durum: 'uyari', ayrinti: `güvenli kipte: ${String(gk.metin || '').slice(0, 120)}` };
          return { durum: 'tamam', ayrinti: 'tekrarlayan hata yok' };
        });
        return botOzet(out);
      }
      case 'kacan': {
        const out = botSatir((b) => {
          if (!b.y || !b.y.borsa) return { durum: 'tamam', ayrinti: 'borsaya bağlı değil (bağlantı denetimine bakın)' };
          const gunIci = simdi % GUN;
          const dun = utcGun(simdi - GUN);
          if (gunIci < (2 + A.kacanDk) * DK || b.bot.durum.sonGun === dun) return { durum: 'tamam', ayrinti: `son günlük çalışma ${b.bot.durum.sonGun || '—'}` };
          const k = typeof c.kalp === 'function' ? c.kalp(b) : null;
          const neden = b.bot.durum.engel ? 'bot ENGELLİ' : b.bot.durum.guvenliKip ? 'bot güvenli kipte' : k && k.hata ? String(k.hata).slice(0, 120) : 'nedeni günlükte';
          return { durum: 'uyari', ayrinti: `bugünkü çalışma 03:02'de yapılmadı — ${neden}` };
        });
        return botOzet(out);
      }
      case 'telegram': {
        const t = c.telegram ? c.telegram() : null;
        if (!t) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        if (!t.bagli) return { durum: 'uyari', ayrinti: t.neden || 'Telegram bağlı değil' };
        const son = (t.gecmis || []).filter(x => !x.atlandi && !x.kisitlandi).slice(-1)[0];
        if (son && son.ok === false) return { durum: 'hata', ayrinti: `son gönderim başarısız: ${String(son.hata || '').slice(0, 100)}${t.kuyruk ? ` · ${t.kuyruk} ileti bekliyor` : ''}` };
        if (t.kuyruk) return { durum: 'uyari', ayrinti: `${t.kuyruk} ileti giden kutusunda bekliyor` };
        return { durum: 'tamam', ayrinti: son ? `son gönderim ${dkMetin(simdi - son.zaman)} önce` : 'bağlı' };
      }
      case 'sinyal': {
        const s = c.sinyal ? c.sinyal() : null;
        if (!s) return { durum: 'bilinmiyor', ayrinti: 'okunamadı' };
        const l = [];
        let d = 'tamam';
        for (const x of s) {
          if (!x.ayarli) { l.push(`${x.ad}: adres yok`); continue; }
          if (x.son && x.son.ok === false) { d = enKotu([d, 'uyari']); l.push(`${x.ad}: son ping başarısız`); continue; }
          if (x.sunucu && x.sonBasari && simdi - x.sonBasari > A.sinyalSaat * SAAT) { d = enKotu([d, 'uyari']); l.push(`${x.ad}: son ping ${dkMetin(simdi - x.sonBasari)} önce`); continue; }
          l.push(`${x.ad}: ${x.sonBasari ? `son ping ${dkMetin(simdi - x.sonBasari)} önce` : 'henüz ping yok'}`);
        }
        return { durum: d, ayrinti: l.join(' · ') || 'ayarlı sinyal yok' };
      }
      default: return { durum: 'bilinmiyor', ayrinti: 'tanımsız denetim' };
    }
  }

  /** Ağ ölçümü (internet, saat, fiyat) — tek seferde. */
  async _agOlc(simdi) {
    const c = this.ctx;
    let r = { binance: false, github: false, saatFarkMs: null, gecikmeMs: null, fiyat: {} };
    try { r = { ...r, ...((c.ag && await c.ag()) || {}) }; } catch { /* hepsi false */ }
    const kopuk = !r.binance && !r.github;
    if (kopuk && !this.kayit.kesintiBas) this.kayit.kesintiBas = simdi;
    else if (!kopuk && this.kayit.kesintiBas) {
      const sure = simdi - this.kayit.kesintiBas;
      this.kayit.kesintiBas = null;
      this._olay({ kimlik: 'internet', tur: 'duzeldi', metin: `internet kesintisi ${dkMetin(sure)} sürdü` });
      if (sure >= 10 * DK) this._bildir('bilgi', 'internet geri geldi', [`Kesinti ${dkMetin(sure)} sürdü.`]);
    }
    this._agSonuc = r;
    return r;
  }

  /** Onarım ve koru kademesi eylemleri — sonuca `onarim` ekler. */
  async _eylem(tanim, s, simdi) {
    const c = this.ctx;
    const A = this.ayar;
    const k = tanim.kimlik;
    const onar = async (metin, fn) => {
      if (!this._onarimHakki(k, simdi)) { s.onarim = { zaman: simdi, basari: false, metin: `günlük onarım sınırı (${A.onarimGunluk}) doldu — size bırakıldı` }; return false; }
      this._onarimSay(k, simdi);
      let ok = false, hata = null;
      try { ok = (await fn()) !== false; } catch (e) { hata = e.message; }
      s.onarim = { zaman: simdi, basari: ok, metin: ok ? metin : `${metin} — olmadı${hata ? `: ${hata}` : ''}` };
      this._olay({ kimlik: k, tur: ok ? 'onarildi' : 'onarilamadi', metin: s.onarim.metin });
      this.kaydet(ok ? 'INFO' : 'WARN', `${tanim.ad}: ${s.onarim.metin}`);
      return ok;
    };
    const botlar = this._botlar();
    const bul = (ad) => botlar.find(b => b.ad === ad);

    if (k === 'kilit' && s.sahipsiz && c.kilitSil) await onar('sahipsiz güncelleme kilidi silindi', () => c.kilitSil());
    else if (k === 'disk' && s.durum === 'uyari') await onar(`${A.gunlukSikistirGun} günden eski günlükler sıkıştırıldı`, () => {
      const n = this.gunlukSikistir();
      if (!n.adet) throw new Error('sıkıştırılacak eski günlük yok');
      return true;
    });
    else if (k === 'bellek' && s.durum === 'uyari' && c.yenidenBaslat) {
      if (simdi - this.acilis < A.ilkBeklemeMs) s.ayrinti += ' · yeni açıldı, bekleniyor';
      else if (!sessizSaat(simdi, this._mesgulMu())) s.ayrinti += ' · sessiz saatte yeniden başlatılacak';
      else await onar('sessiz saatte Pusula yeniden başlatıldı', () => c.yenidenBaslat(`öz denetim: bellek ${s.ayrinti}`));
    } else if (k === 'donma') {
      for (const [ad, x] of Object.entries(s.botlar || {})) {
        const b = bul(ad);
        if (!b) continue;
        if (x.cokme) {
          if (this._tamKapanma(b, 'cokme', `bot döngüsü 30 dk'da ${x.cokme.length} kez hata verdi (son: ${String(x.cokme[x.cokme.length - 1].metin).slice(0, 120)})`)) x.ayrinti += ' → TAMAMEN KAPANDI';
          else if (this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        } else if (x.takildi) {
          if (this.dokunulmaz(b)) { x.ayrinti += ' · demo kabul süresince yalnız haber'; continue; }
          if (!c.yenidenBaslat) continue;
          if (simdi - this.acilis < A.ilkBeklemeMs) { x.ayrinti += ' · yeni açıldı, bekleniyor'; continue; }
          await onar(`${b.adGorunen} takıldı — Pusula yeniden başlatıldı`, () => c.yenidenBaslat(`öz denetim: ${b.adGorunen} takıldı (${x.ayrinti})`));
          break;
        }
      }
    } else if (k === 'fiyat') {
      for (const b of botlar.filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor)) {
        if (s.durum === 'hata' && Number.isFinite(s.sapma)) this._guvenliKip(b, 'fiyat', `fiyat iki kaynakta %${(s.sapma * 100).toFixed(1).replace('.', ',')} farklı — bozuk veriyle işlem açılmasın`);
        else if (Number.isFinite(s.sapma) && s.sapma < A.fiyatSapmaKalk) this._guvenliKipKaldir(b, 'fiyat', 'fiyat kaynakları yeniden uyuşuyor');
      }
    } else if (k === 'stop') {
      for (const [ad, x] of Object.entries(s.botlar || {})) {
        const b = bul(ad);
        if (b && x.ardisik >= A.stopHataArdisik && this._tamKapanma(b, 'stop', `koruma stopu art arda ${x.ardisik} denetimde kurulamadı`)) x.ayrinti += ' → TAMAMEN KAPANDI';
        else if (b && x.ardisik >= A.stopHataArdisik && this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
      }
    } else if (k === 'tekrar') {
      for (const b of botlar.filter(b => b.bot && b.bot.durum && b.bot.durum.calisiyor)) {
        const x = (s.botlar || {})[b.ad];
        if (!x) continue;
        if (x.emirRet && this._tamKapanma(b, 'emirRet', `emirler 30 dk'da ${x.emirRet} kez reddedildi — miktar ya da bakiye hesabı bozuk olabilir`)) x.ayrinti += ' → TAMAMEN KAPANDI';
        else if (x.tekrar && this._guvenliKip(b, 'tekrar', `aynı hata 30 dk'da ${x.tekrar.adet} kez: ${x.tekrar.ornek.slice(0, 160)}`)) x.ayrinti += ' → güvenli kip';
        else if ((x.emirRet || x.tekrar) && this.dokunulmaz(b)) x.ayrinti += ' · demo kabul süresince yalnız haber';
        else if (!x.tekrar && !x.emirRet && simdi - this._sonTekrar(b.ad) >= A.tekrarKalkMs) {
          if (this._guvenliKipKaldir(b, 'tekrar', `${dkMetin(A.tekrarKalkMs)} boyunca aynı hata tekrarlamadı`)) x.ayrinti = 'tekrarlayan hata yok (güvenli kip kalktı)';
        }
      }
      s.durum = enKotu(Object.values(s.botlar || {}).map(x => x.durum));
      s.ayrinti = Object.values(s.botlar || {}).filter(x => SIRA[x.durum] >= 2).map(x => `${x.ad}: ${x.ayrinti}`).join(' · ') || 'tekrarlayan hata yok';
    }
  }

  /** 30 günden eski günlük dosyalarını (data/gunluk/*.jsonl) .gz'ye sıkıştırır; özgün dosya ancak .gz doğrulanınca kalkar. */
  gunlukSikistir() {
    const dizin = this.ctx.gunlukDizin ? this.ctx.gunlukDizin() : null;
    if (!dizin || !fs.existsSync(dizin)) return { adet: 0, kazanc: 0 };
    const sinir = new Date(this.simdi() - this.ayar.gunlukSikistirGun * GUN).toISOString().slice(0, 10);
    let adet = 0, kazanc = 0;
    for (const f of fs.readdirSync(dizin)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) || f.slice(0, 10) >= sinir) continue;
      const kaynak = path.join(dizin, f);
      const hedef = `${kaynak}.gz`;
      if (fs.existsSync(hedef)) continue;
      const ham = fs.readFileSync(kaynak);
      const gz = zlib.gzipSync(ham, { level: 9 });
      fs.writeFileSync(hedef, gz);
      if (!zlib.gunzipSync(fs.readFileSync(hedef)).equals(ham)) { fs.rmSync(hedef, { force: true }); continue; }
      fs.rmSync(kaynak);
      adet++; kazanc += ham.length - gz.length;
    }
    return { adet, kazanc };
  }

  /** Bir yoklama turu. @returns anlık görüntü */
  async yokla({ zorla = false } = {}) {
    if (this.mesgul) return this.goruntu();
    this.mesgul = true;
    const simdi = this.simdi();
    try {
      const yavas = zorla || simdi - (this.kayit.yavasSon || 0) >= this.ayar.yavasAralikMs;
      if (yavas) this.kayit.yavasSon = simdi;
      await this._agOlc(simdi);
      for (const t of DENETIMLER) {
        let s;
        try { s = await this._yokla(t.kimlik, simdi, yavas); } catch (e) { s = { durum: 'bilinmiyor', ayrinti: `denetim yapılamadı: ${e.message}` }; }
        if (s === null) continue;                       // yavaş denetim bu tur atlandı — önceki sonuç kalır
        s.zaman = simdi;
        this._turBildirdi = false;
        try { await this._eylem(t, s, simdi); } catch (e) { this.kaydet('WARN', `${t.ad}: eylem hatası ${e.message}`); }
        const onceki = this.kayit.oncekiDurum[t.kimlik] || 'tamam';
        if (!s.onarim && this.sonuclar[t.kimlik] && this.sonuclar[t.kimlik].onarim && simdi - this.sonuclar[t.kimlik].onarim.zaman < GUN) s.sonOnarim = this.sonuclar[t.kimlik].onarim;
        else if (s.onarim) s.sonOnarim = s.onarim;
        this.sonuclar[t.kimlik] = s;
        this._gecis(t, onceki, s, simdi);
        this.kayit.oncekiDurum[t.kimlik] = s.durum;
      }
      await this._aksamOzeti(simdi);
      this.sonYoklama = simdi;
      this._yaz();
      return this.goruntu();
    } finally { this.mesgul = false; }
  }

  /** Durum geçişi: sarı/kırmızıya geçince Telegram (anında); düzelince olay (akşam özetinde). */
  _gecis(t, onceki, s, simdi) {
    const yeni = s.durum;
    if (yeni === onceki || yeni === 'bilinmiyor') return;
    if (SIRA[yeni] >= 2 && SIRA[yeni] > SIRA[onceki]) {
      this._olay({ kimlik: t.kimlik, tur: yeni, metin: s.ayrinti });
      const satirlar = [s.ayrinti];
      if (s.onarim) satirlar.push(s.onarim.basari ? `Onarıldı: ${s.onarim.metin}` : `Onarılamadı: ${s.onarim.metin}`);
      else if (t.kademe === 'haber') satirlar.push('Pusula bunu kendisi düzeltmez; bakmanız gerekiyor.');
      if (this._turBildirdi) return;                    // güvenli kip / tam kapanma iletisi zaten gitti
      this._bildir(yeni === 'hata' ? 'alarm' : 'uyari', t.ad, satirlar, `${t.kimlik}:${yeni}`);
    } else if (SIRA[yeni] < 2 && SIRA[onceki] >= 2 && t.kimlik !== 'internet') {
      this._olay({ kimlik: t.kimlik, tur: 'duzeldi', metin: s.ayrinti });
    }
  }

  /** 21:00 TR akşam özeti (günde bir): sayılar, bugünkü onarımlar, açık sorunlar. */
  async _aksamOzeti(simdi) {
    const g = trGun(simdi);
    if (trSaatDk(simdi) < 21 * 60 || this.kayit.ozetGun === g) return;
    this.kayit.ozetGun = g;
    const o = this.goruntu();
    const bugun = this.olaylar(1).filter(x => trGun(x.zaman) === g);
    const onarim = bugun.filter(x => x.tur === 'onarildi');
    const satir = [`${o.ozet.toplam} denetim · ${o.ozet.tamam} tamam · ${o.ozet.uyari} uyarı · ${o.ozet.hata} hata`];
    if (onarim.length) satir.push(`Bugün ${onarim.length} onarım: ${onarim.slice(0, 6).map(x => x.metin).join(' · ')}`);
    else satir.push('Bugün onarım gerekmedi.');
    const acik = o.denetimler.filter(d => SIRA[d.durum] >= 2);
    if (acik.length) satir.push(`Açık: ${acik.map(d => `${d.ad} (${d.ayrinti.slice(0, 80)})`).join(' · ')}`);
    for (const b of o.botlar) if (b.engel || b.guvenliKip) satir.push(`${b.ad}: ${b.engel ? 'TAMAMEN KAPALI' : 'güvenli kipte'}`);
    const r = (n) => (this.sonuclar[n] ? this.sonuclar[n].ayrinti : '—');
    satir.push(`Disk: ${r('disk')} · bellek ${r('bellek')} · ${r('saat')}`);
    await this._bildir('ozet', 'akşam özeti', satir);
  }

  /** Panel / API için anlık görüntü. */
  goruntu() {
    const denetimler = DENETIMLER.map(t => {
      const s = this.sonuclar[t.kimlik] || { durum: 'bilinmiyor', ayrinti: 'henüz yoklanmadı' };
      return { ...t, durum: s.durum, ayrinti: s.ayrinti, zaman: s.zaman || null, onarim: s.sonOnarim || null,
        botlar: s.botlar ? Object.fromEntries(Object.entries(s.botlar).map(([a, x]) => [a, { ad: x.ad, mod: x.mod, durum: x.durum, ayrinti: x.ayrinti }])) : null };
    });
    const say = (d) => denetimler.filter(x => (d === 'tamam' ? SIRA[x.durum] === 0 : x.durum === d)).length;
    const botlar = this._botlar().map(b => ({ ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, calisiyor: !!(b.bot && b.bot.durum && b.bot.durum.calisiyor),
      engel: (b.bot && (b.bot.durum.engel || (b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel))) || null,
      bindirmeEngel: (b.bot && b.bot.durum.engel) || null, kolEngel: (b.bot && b.bot.kol && b.bot.kol.durum && b.bot.kol.durum.engel) || null,
      guvenliKip: (b.bot && b.bot.durum.guvenliKip) || null, dokunulmaz: this.dokunulmaz(b) }));
    const g = trGun(this.simdi());
    const onarimBugun = Object.entries(this.kayit.sayac).filter(([, s]) => s.gun === g).reduce((a, [, s]) => a + s.adet, 0);
    return {
      ozet: { toplam: denetimler.length, tamam: say('tamam'), uyari: say('uyari'), hata: say('hata'), bilinmiyor: say('bilinmiyor'),
        durum: enKotu(denetimler.map(x => x.durum === 'bilinmiyor' ? 'tamam' : x.durum)), sonYoklama: this.sonYoklama,
        sonraki: this.sonYoklama ? this.sonYoklama + this.ayar.aralikMs : null, onarimBugun, onarimSiniri: this.ayar.onarimGunluk },
      gruplar: GRUPLAR.map(([kimlik, ad]) => ({ kimlik, ad })), denetimler, botlar, tetikler: TETIKLER,
      demoKorumaBitis: new Date(this.ayar.demoKorumaBitis).toISOString(),
    };
  }

  baslat() {
    if (this.zamanlayici) return;
    setTimeout(() => { this.yokla().catch(e => this.kaydet('WARN', `yoklama: ${e.message}`)); }, 90 * 1000).unref();
    this.zamanlayici = setInterval(() => { this.yokla().catch(e => this.kaydet('WARN', `yoklama: ${e.message}`)); }, this.ayar.aralikMs);
    if (this.zamanlayici.unref) this.zamanlayici.unref();
  }
  durdur() { if (this.zamanlayici) { clearInterval(this.zamanlayici); this.zamanlayici = null; } }
}

module.exports = { OzDenetim, DENETIMLER, GRUPLAR, TETIKLER, AYAR, sessizSaat, tekrarAnahtari, EMIR_RET, AG_HATASI, trGun, enKotu };
