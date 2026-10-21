/**
 * İŞLETİM GÜVENLİĞİ — portföy botlarının (Hücum / Denge) gözetim yardımcıları.
 *
 *   · KALP ATIŞI  `data/live/<bot>/kalp.json`: her çalışmada (başarılı ya da hatalı) son zaman,
 *     son karar, hata. Panel "son çalışma X saat önce" gösterir; 26 saati geçerse kırmızı;
 *     sunucu açılınca 26 saati geçmişse Telegram uyarısı.
 *   · BİLDİRİCİ  Telegram (lib/telegram.js — Ayarlar sekmesindeki token/chat id). Token, chat id
 *     ya da "etkin" yoksa SESSİZCE atlar ({ atlandi: true }); bot asla bildirim yüzünden durmaz.
 *   · GÖLGE KARŞILAŞTIRMA  `data/ileri/bindirme-golge.jsonl` (lib/ileri gölge izleyici, C0 =
 *     çalışan O-GC kuralı) ile gerçekleşen özsermaye değişimi; PLAN-ILERI-HUCUM-DENGE.md B bandı.
 */
const fs = require('fs');
const path = require('path');
const E = require('../ileri/hucumDengeEsikleri');

const SAAT = 3600e3;
const GUN = 864e5;
const KALP_ESIK_SAAT = 26;

// ── Kalp atışı ─────────────────────────────────────────────────────────────
function kalpYaz(dizin, kayit) {
  if (!dizin) return null;
  fs.mkdirSync(dizin, { recursive: true });
  const dosya = path.join(dizin, 'kalp.json');
  let eski = {};
  try { eski = JSON.parse(fs.readFileSync(dosya, 'utf8')); } catch { /* ilk kayıt */ }
  const yeni = { ...eski, ...kayit, zaman: kayit.zaman || Date.now() };
  if (!kayit.hata) { yeni.hata = null; yeni.sonBasari = yeni.zaman; }
  const gecici = dosya + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(yeni, null, 2), 'utf8');
  fs.renameSync(gecici, dosya);
  return yeni;
}

function kalpOku(dizin) {
  if (!dizin) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dizin, 'kalp.json'), 'utf8')); } catch { return null; }
}

/** @returns {{ var, saat, gecikti, metin, sonBasariSaat }} — `gecikti` 26 saatten eski demek. */
function kalpDurumu(kalp, simdi = Date.now()) {
  if (!kalp || !kalp.zaman) return { var: false, saat: null, gecikti: false, metin: 'hiç çalışmadı' };
  const saat = (simdi - kalp.zaman) / SAAT;
  const sonBasariSaat = kalp.sonBasari ? (simdi - kalp.sonBasari) / SAAT : null;
  const ref = sonBasariSaat == null ? saat : sonBasariSaat;
  return { var: true, saat, sonBasariSaat, gecikti: ref > KALP_ESIK_SAAT,
    metin: `son çalışma ${saat < 1 ? `${Math.round(saat * 60)} dk` : `${saat.toFixed(1)} saat`} önce${kalp.hata ? ' (hatalı)' : ''}` };
}

// ── Telegram bildirici ─────────────────────────────────────────────────────
class Bildirici {
  /**
   * @param notifierFn () → TelegramNotifier benzeri { enabled, botToken, chatId, sendMessageDetailed }
   * @param ayar { kisitMs: aynı anahtarlı alarmın tekrar süresi (6 saat),
   *               gunlukDosya: kalıcı bildirim günlüğü (jsonl, yalnız ekle; özet/işlem hariç — PLAN-DEMO-KABUL I3; null → yok),
   *               ozetDosya: son günlük özetlerin kalıcı kopyası (Telegram /ozet komutu; null → yalnız bellek),
   *               kuyrukDosya: GİDEN KUTUSU (altyapı Y3, 61.8) — gönderilemeyen ileti buraya eklenir, `kuyruguGonder` ağ
   *               dönünce "[gecikmeli …]" önekiyle sırayla yollar; tavan KUYRUK_TAVAN (en eskiler düşer); null → kuyruk yok }
   */
  constructor(notifierFn, ayar = {}) {
    this.notifierFn = notifierFn || (() => null);
    this.kisitMs = ayar.kisitMs ?? 6 * SAAT;
    this.ozetDosya = ayar.ozetDosya || null;
    this.kuyrukDosya = ayar.kuyrukDosya || null;
    this.gunlukDosya = ayar.gunlukDosya || null;   // demo kabul I3: kalıcı bildirim günlüğü (null → yok)
    // 69.4 İKİNCİ KANAL (ntfy.sh — ücretsiz, hesapsız telefon bildirimi): () → { konu, sunucu? } | null. ALARM her zaman, diğer türler
    // Telegram gönderilemediğinde (bağlı değil / hata) buradan da gider. Telegram'ın kendisi düşse de ACİL uyarı telefona ulaşır.
    this.ikinciKanalFn = ayar.ikinciKanalFn || (() => null);
    this.fetchFn = ayar.fetchFn || ((...a) => fetch(...a));
    this.ikinciGecmis = [];
    this._kuyrukMesgul = false;
    this._son = {};
    this.gecmis = [];
    this.sonOzetler = {};
    if (this.ozetDosya) { try { this.sonOzetler = JSON.parse(fs.readFileSync(this.ozetDosya, 'utf8')) || {}; } catch { /* ilk kez */ } }
  }

  /** Günlük özeti (düz metin) bot başına saklar — Telegram kapalıyken de; /ozet yeniden gönderir. */
  _ozetSakla(baslik, satirlar) {
    const anahtar = String(baslik).split(':')[0].trim() || 'özet';
    const govde = (Array.isArray(satirlar) ? satirlar : [satirlar]).filter(Boolean).map(String);
    this.sonOzetler[anahtar] = { zaman: Date.now(), baslik: String(baslik), satirlar: govde };
    if (!this.ozetDosya) return;
    try {
      fs.mkdirSync(path.dirname(this.ozetDosya), { recursive: true });
      const gecici = this.ozetDosya + '.tmp';
      fs.writeFileSync(gecici, JSON.stringify(this.sonOzetler, null, 2), 'utf8');
      fs.renameSync(gecici, this.ozetDosya);
    } catch { /* özet kopyası yazılamadı — bildirim etkilenmez */ }
  }

  durum() {
    const n = this.notifierFn();
    if (!n) return { bagli: false, neden: 'Telegram modülü yok' };
    if (!n.botToken) return { bagli: false, neden: 'Telegram bağlı değil — bot token girilmemiş (Ayarlar → Telegram)' };
    if (!n.chatId) return { bagli: false, neden: 'Telegram bağlı değil — chat id girilmemiş (Ayarlar → Telegram)' };
    if (!n.enabled) return { bagli: false, neden: 'Telegram bağlı değil — bildirimler kapalı (Ayarlar → Telegram → etkinleştir)' };
    return { bagli: true, neden: null };
  }

  /**
   * @param tur 'ozet' | 'islem' | 'alarm' | 'uyari'
   * @param secenek { anahtar: tekrar kısıtı anahtarı (alarm/uyarıda varsayılan başlık), kisitMs }
   */
  async gonder(tur, baslik, satirlar = [], secenek = {}) {
    const d = this.durum();
    const kayit = { zaman: Date.now(), tur, baslik };
    if (tur === 'ozet') this._ozetSakla(baslik, satirlar);
    if (!d.bagli) { this._kaydet({ ...kayit, atlandi: true }); if (tur === 'alarm' || tur === 'uyari') await this._ikinci(tur, baslik, satirlar, 'Telegram bağlı değil'); return { atlandi: true, neden: d.neden }; }
    const kisitli = tur === 'alarm' || tur === 'uyari';
    const anahtar = secenek.anahtar || (kisitli ? `${tur}:${baslik}` : null);
    if (anahtar) {
      const k = secenek.kisitMs ?? this.kisitMs;
      if (this._son[anahtar] && Date.now() - this._son[anahtar] < k) { this._kaydet({ ...kayit, kisitlandi: true }); return { kisitlandi: true }; }
      this._son[anahtar] = Date.now();   // eşzamanlı aynı alarmı keser; gönderilemezse aşağıda geri alınır (Y3)
    }
    const simge = { ozet: '📊', islem: '💱', alarm: '🚨', uyari: '⚠️' }[tur] || 'ℹ️';
    const kac = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const govde = (Array.isArray(satirlar) ? satirlar : [satirlar]).filter(Boolean).map(kac).join('\n');
    // Denetim 61.8 #2: Telegram sınırı 4096 karakter — uzun "çalışmada hata" listesi kırpılır (yoksa ileti hiç gitmez).
    const govdeK = govde.length > Bildirici.GOVDE_SINIR ? `${govde.slice(0, Bildirici.GOVDE_SINIR)}\n… (${govde.length - Bildirici.GOVDE_SINIR} karakter kırpıldı — panel günlüğüne bakın)` : govde;
    const metin = `${simge} <b>${kac(baslik)}</b>\n\n${govdeK}\n\n<i>🧭 Pusula · ${new Date().toLocaleString('tr-TR')}</i>`;
    let r;
    try { r = await this.notifierFn().sendMessageDetailed(metin); } catch (e) { r = { ok: false, error: e.message }; }
    this._kaydet({ ...kayit, ok: !!r.ok, hata: r.ok ? null : r.error });
    if (tur === 'alarm' || (!r.ok && tur === 'uyari')) await this._ikinci(tur, baslik, satirlar, r.ok ? null : 'Telegram gönderilemedi');
    if (r.ok) {
      if (this._kuyrukVar()) this.kuyruguGonder().catch(() => null);   // ağ döndü: bekleyenleri de yolla
    } else {
      // Y3: kısıt yalnız BAŞARILI gönderimde kalır — ağ dönünce aynı alarm susturulmasın; ileti giden kutusuna.
      if (anahtar) delete this._son[anahtar];
      // Kalıcı hata (4xx, 429 hariç: biçim/uzunluk/yetki) yeniden denenerek düzelmez — kuyruğu tıkamasın (denetim #2).
      if (!Bildirici.kaliciHata(r)) this._kuyrugaEkle({ zaman: Date.now(), tur, baslik: String(baslik), metin, hata: r.error || null });
    }
    return r;
  }

  /**
   * 69.4: ntfy'a JSON yayın (UTF-8 başlık güvenli). Hata atmaz, 10 sn zaman aşımı. @returns { ok, atlandi?, hata? }
   */
  async _ikinci(tur, baslik, satirlar, neden = null) {
    let k = null;
    try { k = this.ikinciKanalFn(); } catch { k = null; }
    if (!k || !k.konu) return { atlandi: true };
    const govde = (Array.isArray(satirlar) ? satirlar : [satirlar]).filter(Boolean).map(String).join('\n').slice(0, 3500);
    const sunucu = String(k.sunucu || 'https://ntfy.sh').replace(/\/+$/, '');
    let r;
    try {
      const yanit = await this.fetchFn(sunucu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ topic: k.konu, title: `Pusula: ${String(baslik).slice(0, 180)}`, message: `${govde}${neden ? `\n(${neden})` : ''}`,
          priority: tur === 'alarm' ? 5 : 4, tags: [tur === 'alarm' ? 'rotating_light' : 'warning'] }) });
      r = { ok: !!(yanit && yanit.ok), hata: yanit && !yanit.ok ? `HTTP ${yanit.status}` : null };
    } catch (e) { r = { ok: false, hata: e.message }; }
    this.ikinciGecmis.push({ zaman: Date.now(), tur, baslik: String(baslik).slice(0, 120), ...r });
    if (this.ikinciGecmis.length > 30) this.ikinciGecmis.splice(0, this.ikinciGecmis.length - 30);
    return r;
  }

  _kuyrukOku() {
    if (!this.kuyrukDosya) return [];
    try { return fs.readFileSync(this.kuyrukDosya, 'utf8').split('\n').filter(s => s.trim()).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean); } catch { return []; }
  }

  _kuyrukYaz(liste) {
    if (!this.kuyrukDosya) return;
    try {
      fs.mkdirSync(path.dirname(this.kuyrukDosya), { recursive: true });
      const gecici = this.kuyrukDosya + '.tmp';
      fs.writeFileSync(gecici, liste.map(x => JSON.stringify(x)).join('\n') + (liste.length ? '\n' : ''), 'utf8');
      fs.renameSync(gecici, this.kuyrukDosya);
    } catch { /* kuyruk yazılamadı — bildirim akışı etkilenmez */ }
  }

  _kuyrukVar() { return !!this.kuyrukDosya && fs.existsSync(this.kuyrukDosya) && fs.statSync(this.kuyrukDosya).size > 0; }

  _kuyrugaEkle(k) {
    if (!this.kuyrukDosya) return;
    const l = this._kuyrukOku(); l.push(k);
    this._kuyrukYaz(l.slice(-Bildirici.KUYRUK_TAVAN));
  }

  /** Giden kutusunu sırayla gönderir; ilk başarısızlıkta durur (kalanlar bekler). @returns {{gonderilen, kalan}} */
  async kuyruguGonder() {
    if (!this.kuyrukDosya || this._kuyrukMesgul || !this.durum().bagli) return { gonderilen: 0, kalan: this._kuyrukOku().length };
    this._kuyrukMesgul = true;
    let gonderilen = 0;
    try {
      let l = this._kuyrukOku();
      while (l.length) {
        const k = l[0];
        const ayni = (x) => x.zaman === k.zaman && x.metin === k.metin;
        // Denetim #3: dosya her adımda YENİDEN okunur — boşaltma sürerken eklenen ileti silinmez.
        const cikar = () => { const g = this._kuyrukOku(); const i = g.findIndex(ayni); if (i >= 0) g.splice(i, 1); this._kuyrukYaz(g); return g; };
        const saat = new Date(k.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        let r;
        try { r = await this.notifierFn().sendMessageDetailed(`⏳ <i>[gecikmeli, ${saat}]</i>\n${k.metin}`); } catch (e) { r = { ok: false, error: e.message }; }
        if (!r.ok) {
          if (Bildirici.kaliciHata(r)) { l = cikar(); continue; }   // kalıcı hata: düşür, sıradakine geç
          break;
        }
        gonderilen++;
        l = cikar();
        if (l.length) await new Promise(res => setTimeout(res, Bildirici.KUYRUK_ARALIK_MS));   // art arda 429 olmasın
      }
      return { gonderilen, kalan: l.length };
    } finally { this._kuyrukMesgul = false; }
  }

  _kaydet(k) {
    this.gecmis.push(k); if (this.gecmis.length > 50) this.gecmis.splice(0, this.gecmis.length - 50);
    // PLAN-DEMO-KABUL §8.2 #3 (I3): kalıcı bildirim günlüğü (yalnız-ekle; özet/işlem hariç). Yazılamazsa bildirim etkilenmez.
    if (!this.gunlukDosya || k.tur === 'ozet' || k.tur === 'islem') return;
    try {
      fs.mkdirSync(path.dirname(this.gunlukDosya), { recursive: true });
      fs.appendFileSync(this.gunlukDosya, JSON.stringify({ zaman: k.zaman, tur: k.tur, baslik: String(k.baslik), ok: !!k.ok, atlandi: !!k.atlandi, kisitlandi: !!k.kisitlandi, hata: k.hata || null }) + '\n', 'utf8');
    } catch { /* günlük yazılamadı — bildirim akışı etkilenmez */ }
  }
}

Bildirici.KUYRUK_TAVAN = 200;
Bildirici.KUYRUK_ARALIK_MS = 1000;
Bildirici.GOVDE_SINIR = 3500;
/** Yeniden denemeyle düzelmeyecek Telegram hatası: 4xx (429 hız sınırı hariç). Ağ hatasında status yok → geçici. */
Bildirici.kaliciHata = (r) => !!(r && Number.isFinite(r.status) && r.status >= 400 && r.status < 500 && r.status !== 429);

// ── Gölge ↔ gerçekleşen ────────────────────────────────────────────────────
/** Gölge dosyası → Map(gun → satır). Yoksa boş. Bozuk satır atlanır (dosyaya dokunulmaz). */
function golgeOku(dosya) {
  const m = new Map();
  if (!dosya || !fs.existsSync(dosya)) return m;
  for (const s of fs.readFileSync(dosya, 'utf8').split('\n')) {
    if (!s.trim()) continue;
    try { const x = JSON.parse(s); if (x.gun && !m.has(x.gun)) m.set(x.gun, x); } catch { /* atla */ }
  }
  return m;
}

const gunEkle = (g, n) => new Date(Date.parse(`${g}T00:00:00Z`) + n * GUN).toISOString().slice(0, 10);
const gunFarki = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GUN);

/**
 * (bas, bit] getiri günlerinin gölge bileşik getirisi (`ad` = hucum | denge, kural C0).
 * Gün eksikse `tamam: false` (henüz yazılmadı — sonraki çalışmada yeniden denenir).
 */
function golgeBirikim(golge, ad, bas, bit, kural = 'C0') {
  let oz = 1; const eksik = [];
  for (let g = gunEkle(bas, 1); g <= bit; g = gunEkle(g, 1)) {
    const x = golge.get(g);
    const r = x && x[ad] && x[ad][kural];
    if (!Number.isFinite(r)) eksik.push(g); else oz *= 1 + r;
  }
  return { getiri: oz - 1, tamam: eksik.length === 0, eksik };
}

/**
 * Bekleyen aralıkları gölgeyle kapatır.
 * @param bekleyen [{ bas, bit, gercek, fundingDuzeltme? }]  bas = önceki çalışmanın karar günü, bit = bu çalışmanınki
 * @returns {{ kapanan: [{bas, bit, gun, gercek, golge, fark, hamFark?}], kalan: [...] }}
 *
 * DEMO BTC AYAĞI FUNDING DÜZELTMESİ (PLAN-DEMO-KABUL U2, kullanıcı kararı 2026-10-07 "seçenek 1"): aralıkta
 * `fundingDuzeltme` alanı varsa (yalnız btcAyak 'perp') `hamFark` = gerçekleşen − gölge (U1) ve
 * `fark` = gerçekleşen + fundingDuzeltme − gölge (U2; fundingDuzeltme = BTC ayağının ödediği funding / oncekiCap).
 * fundingDuzeltme 'okunamadı' ise düzeltme uygulanmaz (fark = ham). B bandı / ENGEL `fark`tan hesaplanır.
 * Alan yoksa (spot/kâğıt, eski kayıt) kayıt eskisiyle aynıdır.
 *
 * KISITLI GÖLGE (karar Ö9, deneme 860; geçiş 2026-10-11): aralıkta `kisitDuzeltme` varsa (kâğıt spot / çoklu varlık BTC
 * alımı çekilebilir USDT yüzünden eksik kaldıysa: kisitEksikPay × r_BTC(aralık)) kısıtlı gölge = gölge − kisitDuzeltme,
 * `fark` = gerçekleşen + fundingDuzeltme + kisitDuzeltme − gölge, `hamFark` düzeltmesiz. Gölge DOSYASI değişmez
 * (data/ileri/bindirme-golge.jsonl ideal model — cüzdan durumu taşımaz; kısıt yalnız gerçekleşmemiş kol kârıyla bağlar).
 * 'okunamadı' → düzeltme 0. ENGEL / İncele eşikleri DEĞİŞMEZ.
 */
function golgeKapat(golge, ad, bekleyen) {
  const kapanan = [], kalan = [];
  for (const b of bekleyen) {
    const g = golgeBirikim(golge, ad, b.bas, b.bit);
    if (!g.tamam) { kalan.push(b); continue; }
    const ham = b.gercek - g.getiri;
    if (!('fundingDuzeltme' in b) && !('kisitDuzeltme' in b)) { kapanan.push({ ...b, gun: gunFarki(b.bas, b.bit), golge: g.getiri, fark: ham }); continue; }
    const d = Number.isFinite(b.fundingDuzeltme) ? b.fundingDuzeltme : 0;
    const k = Number.isFinite(b.kisitDuzeltme) ? b.kisitDuzeltme : 0;
    const x = { ...b, gun: gunFarki(b.bas, b.bit), golge: g.getiri, hamFark: ham, fark: b.gercek + d + k - g.getiri };
    if ('kisitDuzeltme' in b) x.kisitliGolge = g.getiri - k;
    kapanan.push(x);
  }
  return { kapanan, kalan };
}

/**
 * B bandı: son 30 günün (bit ∈ (son − 30, son]) farkları. Bant `fark`tan (demo'da funding düzeltmeli = U2).
 * Pencerede funding düzeltmeli kayıt varsa ek alanlar: birikimHam (U1, düzeltmesiz), fundingDuzeltme (Σ),
 * fundingOkunamadi (düzeltmesi okunamayan aralık sayısı). Spot/kâğıtta alanlar eskisiyle aynı.
 */
function uygulamaOzeti(farklar, bugun) {
  const son = bugun || (farklar.length ? farklar[farklar.length - 1].bit : null);
  const pencere = son ? farklar.filter(f => gunFarki(f.bit, son) < E.UYGULAMA.pencereGun) : [];
  const birikim = pencere.reduce((a, f) => a + f.fark, 0);
  const mutlakToplam = pencere.reduce((a, f) => a + Math.abs(f.fark), 0);
  const ozet = { gun: pencere.reduce((a, f) => a + f.gun, 0), kayit: pencere.length, birikim, birikimMutlak: Math.abs(birikim), mutlakToplam,
    bant: E.uygulamaBandi(Math.abs(birikim)), esik: { incele: E.UYGULAMA.incele, engel: E.UYGULAMA.engel } };
  if (pencere.some(f => 'hamFark' in f)) {
    ozet.birikimHam = pencere.reduce((a, f) => a + (Number.isFinite(f.hamFark) ? f.hamFark : f.fark), 0);
    if (pencere.some(f => 'fundingDuzeltme' in f)) {
      ozet.fundingDuzeltme = pencere.reduce((a, f) => a + (Number.isFinite(f.fundingDuzeltme) ? f.fundingDuzeltme : 0), 0);
      ozet.fundingOkunamadi = pencere.filter(f => f.fundingDuzeltme === 'okunamadı').length;
    }
    if (pencere.some(f => 'kisitDuzeltme' in f)) {
      ozet.kisitDuzeltme = pencere.reduce((a, f) => a + (Number.isFinite(f.kisitDuzeltme) ? f.kisitDuzeltme : 0), 0);
      ozet.kisitOkunamadi = pencere.filter(f => f.kisitDuzeltme === 'okunamadı').length;
    }
  }
  return ozet;
}

/** A göstergesi: gölge (C0) ileri MaxDD'si → p95/p99 durumu. */
function golgeModelDurumu(golge, ad, bugun) {
  const gunler = [...golge.keys()].filter(g => !bugun || g <= bugun).sort();
  let oz = 1, tepe = 1, dd = 0, getiri = 0;
  for (const g of gunler) { const r = golge.get(g)[ad] && golge.get(g)[ad].C0; if (!Number.isFinite(r)) continue; oz *= 1 + r; if (oz > tepe) tepe = oz; dd = Math.max(dd, 1 - oz / tepe); }
  getiri = oz - 1;
  if (!gunler.length) return { gun: 0, getiri: 0, maxdd: 0, durum: 'veri yok', metin: 'gölge kaydı henüz yok (ilk ileri gün 2026-10-07)' };
  return { gun: gunler.length, getiri, ...E.modelDurumu(ad, gunler.length, dd) };
}

module.exports = { kalpYaz, kalpOku, kalpDurumu, KALP_ESIK_SAAT, Bildirici, golgeOku, golgeBirikim, golgeKapat, uygulamaOzeti, golgeModelDurumu, gunEkle, gunFarki };
