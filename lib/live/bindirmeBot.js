/**
 * BİNDİRME BOTU — HÜCUM / DENGE (kâğıt ya da Binance DEMO hesap).
 * PLAN-ALTUT-YENMEK.md 8.–10b. aşamalar (yol 1 ve risk menüsü p = 0,5).
 *
 * İki ayak, TEK hesap:
 *   · BTC AYAĞI: O-GC rejimi (`lib/research/bindirme.js` `ogcDurum` — Pine ile aynı
 *     kural). Son kapanmış günün kararı bugün uygulanır: LONG → özsermayenin
 *     `btcPay`'i (Hücum 1, Denge 0,5) BTC; pozisyon yok → 0.
 *     Ölçümle aynı denge kuralı: BTC yalnız REJİM DEĞİŞİNCE ve LONG iken HER AY
 *     BAŞINDA hedefe getirilir (her gün değil).
 *   · KOL: `KalkanBot` (Donchian PIT + DCA PIT, ters-vol 60 g) `kolCarpani` ×3
 *     ile — kol nominali = 3 × özsermaye × kol payları.
 *
 * BTC AYAĞININ İKİ BİÇİMİ (`btcAyak`):
 *   · 'spot' (kâğıt): SPOT BTC teminat — Binance USDⓈ-M çoklu varlık modunun kâğıt karşılığı
 *     (`KagitBorsa.spotEmir`). Özsermaye = USDT + BTC × mark. Ölçülen sistem budur.
 *   · 'perp' (DEMO): BTCUSDT perp LONG. **DEMO YAKLAŞIMI — gerçekte spot teminat.**
 *     Binance Demo Trading'in vadeli hesabına BTC teminat aktarılamıyor (sapi transfer
 *     uçları demo'da yok; çoklu varlık modu ve BTC teminatı anahtarsız doğrulanamadı) →
 *     BTC maruziyeti aynı nominalde perp LONG ile temsil edilir. Fark: perp funding öder
 *     (long için yılda ~%10), spot teminat ödemez; teminat oranı/marj farkı da yoktur.
 *     Bu ayak yürütücü defterinde `bt` etiketli dolumların toplamıdır (sanal pozisyon) ve
 *     kol mutabakatına eklenir: borsa neti = Donchian + DCA + BTC ayağı.
 *   · 'coklu' (GERÇEK TASARIM — yalnız ayarla açılır, varsayılan DEĞİL): Binance Multi-Assets Mode akışı
 *     (`lib/live/cokluVarlik.js`): spot BTC alımı → MAIN_UMFUTURE aktarımı (vadeli cüzdanda teminat), satışta ters
 *     akış; mod sorgula/aç, dilimli aktarım (kol marjı), defter-önce, belirsizde sorgu. BTC miktarı = vadeli + spot
 *     kalıntı; özsermaye = vadeli USDT + BTC × fiyat + spot USDT. Günlük mutabakata çoklu varlık denetimi eklenir
 *     (mod kapalı / vadeli BTC ≠ beklenen → ENGEL). Kâğıtta KagitBorsa taklidiyle; demo'da sapi aktarımı yok → kullanılamaz.
 *     PLAN-GERCEK-PARA-2027.md.
 *
 * İŞLETİM GÜVENLİĞİ (lib/live/isletim.js):
 *   · KALP ATIŞI `kalp.json` — her çalışmada; panel 26 saati geçeni kırmızı gösterir.
 *   · GÜNLÜK MUTABAKAT — her zamanlanmış çalışmadan önce yürütücü + kol mutabakatı;
 *     uyuşmazlık → ENGEL + alarm (kâğıt ve demo).
 *   · TELAFİ — bilgisayar kapalıyken kaçırılan günler: bot YALNIZ bugünkü hedefe gider
 *     (geçmiş günlerin emirleri verilmez — hedef idempotent), kaçırılan gün sayısı kaydedilir
 *     ve aralığın "gerçekleşen − gölge" farkı gölge yazılınca kapatılır.
 *   · UYGULAMA TAKİBİ (PLAN-ILERI-HUCUM-DENGE.md B): gölge = `data/ileri/bindirme-golge.jsonl`
 *     (C0 = çalışan O-GC). 30 g birikimli |fark| > %5 → bot ENGEL + alarm; %3–5 → uyarı.
 *     ENGEL elle kaldırılır (`engelKaldir`).
 *     DEMO (btcAyak 'perp') FUNDING DÜZELTMESİ (PLAN-DEMO-KABUL U2, kullanıcı kararı 2026-10-07): perp BTC ayağının
 *     ödediği funding (gerçekte spot teminat — funding yok) her aralığın gerçekleşen getirisine geri eklenir:
 *     fark = gerçekleşen + BTC ayağı funding / oncekiCap − gölge; ham fark (U1) `hamFark` olarak kalır. BTC ayağı
 *     funding = BTCUSDT funding geçmişi (kapılı fetchFundingHistory, aralık = önceki çalışma → bu çalışma) × btSanal / net
 *     (kol da BTC taşıyorsa pro-rata; pay aralık başındaki — önceki çalışma sonu — pozisyonlardan). Okunamazsa
 *     düzeltme yok (ham fark) ve kayıtta `fundingDuzeltme: 'okunamadı'`. ENGEL eşiği DEĞİŞMEZ. Spot (kâğıt) etkilenmez.
 *   · TELEGRAM (`bildirici`): günlük özet, işlem, hata/uyuşmazlık/acil alarmı. Token yoksa
 *     sessizce atlanır.
 *   · FELAKET STOPU (`lib/live/korumaEmri.js`): her net pozisyona borsada bekleyen STOP_MARKET
 *     closePosition (mark − 6 × ATR20%; DCA merdiveninin altında). BTC AYAĞI HARİÇ (ablasyon: bedel
 *     oradan) — BTC sembolünde yalnız kol payı kadar reduceOnly stop. Günlük çalışma sonunda yeniden
 *     çapalanır, saatte bir denetlenir, acil durdurmada iptal edilir. Kâğıt modda çalışmaz.
 *   · MARJ İZLEME (`lib/live/marjIzleme.js`): saatte bir hesap marj oranı + likidasyon mesafesi
 *     (borsanın kendi değerleri); eşik aşılırsa Telegram alarmı. Bot DURMAZ — karar kullanıcıda.
 *   · SAĞLIK SİNYALİ (`saglik`, lib/saglikSinyali.js — healthchecks.io): zamanlanmış günlük
 *     çalışma başlarken <url>/start, başarıyla bitince <url>, ENGEL/hata/istisnada <url>/fail
 *     (kısa, sırsız gövde). Ping BEKLENMEZ (arka planda) — ağ hatası botu asla durdurmaz.
 *
 * RİSK (`riskUygula`, KalkanBot içinden): sembol / brüt tavanları ×m ölçeklenir;
 * kill / zarar eşikleri `esikOlcekle` ile stratejinin ölçülmüş yıllık σ'sına ölçeklenir.
 * BTC ayağına etkisi: K3 → BTC hedefi 0 · K1 → BTC artırılmaz (satış serbest).
 *
 * KALICILIK / ÇÖKME: BTC miktarı borsadan (spot) ya da defterden (perp) okunur; bot yalnız
 * son uygulanan payı (`sonW`) ve ayı tutar. Hedef idempotent.
 */
const fs = require('fs');
const path = require('path');
const kalici = require('./kaliciDosya');
const crypto = require('crypto');
const { KalkanBot } = require('./kalkanBot');
const { kapanmisGunlukMumlar, mumKapisi } = require('./donchianBot');
const { ogcDurum, STRATEJILER } = require('../research/bindirme');
const RK = require('../risk/katmanlar');
const I = require('./isletim');
const { IslemGecmisi, kolAdi } = require('./islemGecmisi');
const { KorumaEmri } = require('./korumaEmri');
const { marjDurumu } = require('./marjIzleme');
const { CokluVarlik } = require('./cokluVarlik');

const GUN = 864e5;
const ayNo = (t) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);
const ASGARI_KOD = /-4164|-4003/;
const DEMO_NOT = 'BTC ayağı perp LONG — demo yaklaşımı, gerçekte spot teminat';
const KUCUK_NOT = "1000 $'da değişmemiş Hücum kolun ~%60'ını yürütür (asgari nominal / miktar adımı) — sermaye < 5000 $ iken Hücum-S önerilir (PLAN-SERMAYE-1000.md).";

class BindirmeBot {
  /**
   * @param yurutucu CanliYurutucu (kâğıt ya da testnet/demo)
   * @param ayar { ad ('hucum'|'denge'), btcPay, kolCarpani (3), sermayeTavani, dizin,
   *               evren, dca, donchian, risk, esikler (null → yalnız tavanlar), tau, kaydet,
   *               varlik ('BTC'), minNominal (USDT, 5), btcAyak ('spot'|'perp'), mod ('kagit'|'demo'),
   *               bildirici (isletim.Bildirici | null), golgeDosya (bindirme-golge.jsonl | null),
   *               cekilebilirKisit (true | { kaldirac 20, h 0,95 } | false — yalnız btcAyak 'spot'; karar Ö9: VARSAYILAN AÇIK) }
   */
  constructor(yurutucu, ayar = {}) {
    const tanim = STRATEJILER[ayar.ad] || {};
    this.y = yurutucu;
    this.ayar = { ad: 'hucum', btcPay: tanim.btcPay ?? 1, kolCarpani: 3, sermayeTavani: 10000, varlik: 'BTC', minNominal: 5, btcAyak: 'spot', mod: 'kagit', cekilebilirKisit: true, ...ayar };
    if (!['spot', 'perp', 'coklu'].includes(this.ayar.btcAyak)) throw new Error(`btcAyak spot | perp | coklu olmalı: ${this.ayar.btcAyak}`);
    this.adGorunen = tanim.ad || this.ayar.ad;
    this.btcSembol = `${this.ayar.varlik}/USDT:USDT`;
    this.kaydet = ayar.kaydet || (() => {});
    // Gerçek tasarım (çoklu varlık) — yalnız btcAyak 'coklu' iken kurulur; diğer kiplerde null (davranış birebir aynı).
    this.cv = this.ayar.btcAyak === 'coklu' ? new CokluVarlik(yurutucu, { dizin: this.ayar.dizin, varlik: this.ayar.varlik,
      etiket: `cv${String(this.ayar.ad).replace(/[^a-z0-9]/g, '').slice(0, 2)}`, minNominal: this.ayar.minNominal, uyu: ayar.uyu,
      modOtomatikAc: ayar.cokluModOtomatikAc !== false, ...(ayar.cokluVarlik || {}), kaydet: (sv, t) => this.kaydet(sv, `[çoklu varlık] ${t}`) }) : null;
    this.bildirici = ayar.bildirici || null;
    this.saglik = ayar.saglik || null;
    this._saglikSon = null;   // son ping sözü (testler bekleyebilsin diye)
    const m = this.ayar.kolCarpani;
    let esikler = ayar.esikler;
    if (esikler === undefined) {
      try { esikler = RK.esikOlcekle(require('../risk/esikler.json'), this.ayar.tau ?? (tanim.kayit && tanim.kayit.vol)); } catch { esikler = null; }
    }
    this.esikler = esikler;
    this.kol = new KalkanBot(yurutucu, {
      dizin: this.ayar.dizin, sermayeTavani: this.ayar.sermayeTavani, evren: ayar.evren, dca: ayar.dca, donchian: ayar.donchian,
      kolCarpani: m, esikler, kucukSermaye: this.ayar.kucukSermaye ?? 'oto',
      risk: { sembolTavan: 0.6 * m, brutTavan: 2 * m, ...(ayar.risk || {}) },
      ozsermayeFn: (hesap) => this._ozsermaye(hesap),
      ekSanalFn: () => (this.ayar.btcAyak === 'perp' ? this.btSanal() : {}),
      kaldiracEkSemboller: this.ayar.btcAyak === 'perp' ? [`${this.ayar.varlik}/USDT:USDT`] : [],   // Y3: perp BTC ayağı da çapraz ×20
      kaydet: (s, t) => this.kaydet(s, `[kol] ${t}`),
    });
    this.koruma = new KorumaEmri(yurutucu, {
      dizin: this.ayar.dizin, k: this.ayar.felaketK ?? 6, etkin: this.ayar.felaketStopu !== false,
      kaydet: (s, t) => this.kaydet(s, `[${this.adGorunen}] ${t}`),
      bildir: (tur, baslik, satirlar, secenek) => this._bildir(tur, baslik, satirlar, secenek),
      // BTC ayağı felaket stopu DIŞINDA (PLAN-FELAKET-ABLASYON.md, kullanıcı kararı 2026-10-07):
      // BTC sembolünde yalnız kolun payı kadar reduceOnly stop. Spot ayakta zaten vadeli pozisyon yok.
      haricFn: (symbol) => (this.ayar.btcAyak === 'perp' && symbol === this.btcSembol ? (this.btSanal()[symbol] || 0) : 0),
      dcaTabanFn: (symbol) => {
        const f = this.kol.dca.acikMerdiven(symbol).filter(e => e.side === 'buy' && e.fiyat > 0).map(e => +e.fiyat);
        return f.length ? Math.min(...f) : null;
      },
    });
    this.dosya = this.ayar.dizin ? path.join(this.ayar.dizin, 'bindirme-bot.json') : null;
    this.durum = { calisiyor: false, sonGun: null, sonW: null, sonAy: null, sonOzsermaye: null, sonOzsermayeCap: null, sonRapor: null, sapmaGecmisi: [], btcIslemler: [],
      btDuzeltme: 0, engel: null, telafiGecmisi: [], golgeBekleyen: [], golgeFarklar: [], golgeAtilan: 0, asgariNominal: { toplam: 0, son: 0, sonGun: null }, sonBant: null };
    // Y2 (61.7): bozuk dosya SESSİZCE sıfırlanmaz — son iyi kopyadan (.yedek) kurtarılır, `this.bozuk` dolar;
    // BindirmeBot bunu ENGEL + alarm yapar (lib/live/kaliciDosya.js).
    this.bozuk = null;
    if (this.dosya) {
      const k = kalici.oku(this.dosya);
      if (k.veri) this.durum = { ...this.durum, ...k.veri };
      if (k.bozuk) { this.bozuk = k.bozuk; this.kaydet('ERROR', `durum dosyası: ${k.bozuk}`); }
    }
    this.gecmis = new IslemGecmisi(this.ayar.dizin);            // islemler.jsonl (yalnız ekle)
    // 69.3 EMİR FRENİ (lib/live/yurutucu.js): tetiklenince bot ENGEL'e girer + alarm; "Engeli kaldır" freni de kaldırır.
    if (this.y && 'frenBildir' in this.y) {
      this.y.frenBildir = (sebep) => {
        this.engelKoy('emir-freni', `EMİR FRENİ: ${sebep}`);
        this._bildir('alarm', 'EMİR FRENİ — bot durdu', [sebep, 'Risk artıran emir verilmiyor; azaltan emirler ve felaket stopları çalışıyor.',
          'Kaçak bir döngü olabilir: günlüğü ve olay raporunu inceleyin, sonra panelden "Engeli kaldır".'], { anahtar: `fren:${this.ayar.ad}` });
      };
    }
    // 69.5 AZALTMA: güvenli kip kayıtlıysa (yeniden başlatma) yürütücü yine yalnız azaltan emre izin verir.
    if (this.durum.guvenliKip && this.y && typeof this.y.azaltmaKoy === 'function') this.y.azaltmaKoy(this.durum.guvenliKip.metin);
    // 69.3 SERMAYE TAVANI İZLEME (sürpriz yatırma/çekme): durum.tavanEk = algılanan/kaydedilen net akışların tavana eklenen kısmı.
    this._tavanTaban = this.ayar.sermayeTavani;
    // 69.6 (güvenlik testi O3): dosyadaki tavanEk açılışta da üst sınırla kırpılır (canlı onaylı sınır; yoksa ayarlı tavanın katı).
    if (this.ayar.tavanAkis !== false && Number.isFinite(this.durum.tavanEk) && this.durum.tavanEk !== 0) {
      const ust = this._tavanUstu();
      const yeni = Math.min(Math.max(this._tavanTaban, this._tavanTaban + this.durum.tavanEk), ust);
      if (yeni < this._tavanTaban + this.durum.tavanEk) { this.kaydet('WARN', `${this.ayar.ad}: kayıtlı tavan eki ${this.durum.tavanEk} üst sınırla kırpıldı (tavan ${yeni} USDT)`); this.durum.tavanEk = yeni - this._tavanTaban; }
      this._tavanAyarla(yeni);
    }
    this.ozsermayeDosya = this.ayar.dizin ? path.join(this.ayar.dizin, 'ozsermaye.jsonl') : null;
    this.zamanlayici = null;
    this.mesgul = false;
    this._sonDeneme = 0;
    this._tikHatalari = [];   // 69.1 öz denetim: dakikalık döngü istisnaları (yalnız bellek; 30 dk'da 3 → tam kapanma)
    // Y2 (61.7): herhangi bir durum dosyası bozuk açıldıysa ENGEL (gunlukCalisma emir vermez + alarm). Elle: borsayı incele,
    // panelden "Engeli kaldır". Kurtarılan son iyi kopya kullanılır; kol mutabakatı farkı yine yakalar.
    const bozuklar = [this.bozuk, this.kol.bozuk, this.kol.riskBozuk, this.kol.dca.bozuk, this.kol.evren.bozuk, this.koruma.bozuk, this.cv && this.cv.durum.bozuk].filter(Boolean);
    if (bozuklar.length) {
      this.durum.engel = `durum dosyası bozuk açıldı — borsayı (pozisyon/emir) elle inceleyin, sonra "Engeli kaldır": ${bozuklar.join(' · ')}`;
      this.kaydet('ERROR', `${this.adGorunen}: ${this.durum.engel}`);
      this._engelOlay('engel', 'durum-dosyasi', this.durum.engel);
      try { this._yaz(); } catch (e) { this.kaydet('ERROR', `durum yazılamadı: ${e.message}`); }
    }
  }

  _yaz() {
    if (!this.dosya) return;
    kalici.yaz(this.dosya, this.durum);   // Y2: fsync + son iyi kopya (.yedek)
  }

  async _bildir(tur, baslik, satirlar, secenek) {
    let r;
    if (!this.bildirici) r = { atlandi: true };
    else { try { r = await this.bildirici.gonder(tur, `${this.adGorunen} (${this.modEtiketi()}): ${baslik}`, satirlar, secenek); } catch { r = { ok: false }; } }
    // PLAN-DEMO-KABUL §8.2 #3 (I3): kalıcı alarm/uyarı günlüğü — günlük özet ve işlem bildirimi hariç.
    if (tur !== 'ozet' && tur !== 'islem') {
      this._kayitEkle('alarmlar.jsonl', { olay: 'bildirim', tur, baslik: String(baslik), satir: (Array.isArray(satirlar) ? satirlar : [satirlar]).filter(Boolean).map(String).join(' | ').slice(0, 500),
        anahtar: (secenek && secenek.anahtar) || null, ok: !!(r && r.ok), atlandi: !!(r && r.atlandi), kisitlandi: !!(r && r.kisitlandi) });
    }
    return r;
  }

  /**
   * DEMO KABUL KAYITLARI (PLAN-DEMO-KABUL.md §8.2): `<dizin>/<dosya>` yalnız-ekle JSON satırı. Bot kararını ETKİLEMEZ;
   * yazılamazsa (disk, izin) yalnız günlüğe uyarı — canlı döngü ASLA bu yüzden durmaz.
   * Dosyalar: alarmlar.jsonl (bildirim + ENGEL/acil olayları) · marj.jsonl · mutabakat.jsonl · golge-farklar.jsonl ·
   * sapma.jsonl · koruma.jsonl. Okuyan: scripts/demo-kabul-rapor.js.
   */
  _kayitEkle(dosya, satir) {
    if (!this.ayar.dizin) return;
    try {
      fs.mkdirSync(this.ayar.dizin, { recursive: true });
      fs.appendFileSync(path.join(this.ayar.dizin, dosya), JSON.stringify({ zaman: Date.now(), ...satir }) + '\n', 'utf8');
    } catch (e) { try { this.kaydet('WARN', `demo kabul kaydı (${dosya}) yazılamadı: ${e.message}`); } catch { /* */ } }
  }

  /** ENGEL olay geçmişi (§8.2 #6): konma / kalkma alarmlar.jsonl'e. */
  _engelOlay(olay, kaynak, metin) { this._kayitEkle('alarmlar.jsonl', { olay, kaynak, metin: metin == null ? null : String(metin).slice(0, 500) }); }

  // ── İşlem geçmişi ve özsermaye anlık görüntüsü (panel: pozisyon/emir/geçmiş/grafik) ──
  /** Defter + spot BTC işlemlerini islemler.jsonl'e ekler (idempotent). Hata atmaz. */
  islemGecmisiGuncelle() {
    try {
      let n = this.gecmis.defterdenEkle(this.y && this.y.defter);
      if (this.ayar.btcAyak !== 'perp') n += this.gecmis.spottanEkle(this.durum.btcIslemler, this.ayar.varlik);   // perp: defterde zaten var
      return n;
    } catch (e) { this.kaydet('WARN', `işlem geçmişi yazılamadı: ${e.message}`); return 0; }
  }

  /** Kol nominalleri (USDT): BTC ayağı / Donchian / DCA — mark fiyatları hesaptaki pozisyonlardan. */
  kolNominalleri(hesap, btcFiyat, btcDeger) {
    const mark = {};
    for (const p of (hesap && hesap.pozisyonlar) || []) if (+p.mark > 0) mark[p.symbol] = +p.mark;
    if (btcFiyat > 0 && !mark[this.btcSembol]) mark[this.btcSembol] = btcFiyat;
    const top = (o) => Object.entries(o || {}).reduce((a, [s, q]) => a + Math.abs(q) * (mark[s] || 0), 0);
    let don = 0, dca = 0;
    try { don = top(this.kol.donSanal()); } catch { /* */ }
    try { dca = top(this.kol.dca.sanalMiktarlar()); } catch { /* */ }
    return { btc: btcDeger || 0, donchian: don, dca };
  }

  /** Her gerçek çalışmada bir satır: data/live/<bot>/ozsermaye.jsonl (yalnız ekle). */
  _ozsermayeYaz({ simdi, gun, ozsermaye, ozsermayeCap, btcFiyat, btcDeger, hesap, icerde, asgari }) {
    if (!this.ozsermayeDosya) return;
    try {
      const satir = { zaman: simdi, gun, mod: this.ayar.mod, ozsermaye, ozsermayeCap, btcFiyat, icerde, kol: this.kolNominalleri(hesap, btcFiyat, btcDeger) };
      if (Number.isFinite(asgari)) satir.asgariNominalAlti = asgari;   // PLAN-DEMO-KABUL I9: o çalışmada verilmeyen (asgari nominal altı) emir
      fs.mkdirSync(path.dirname(this.ozsermayeDosya), { recursive: true });
      fs.appendFileSync(this.ozsermayeDosya, JSON.stringify(satir) + '\n', 'utf8');
    } catch (e) { this.kaydet('WARN', `özsermaye kaydı yazılamadı: ${e.message}`); }
  }

  /**
   * Panel "canlı görünüm": borsadaki GERÇEK pozisyonlar (kol kırılımıyla) + bekleyen emirler.
   * Ağ çağrısı yapar (hesap) — çağıran önbelleğe alır.
   */
  async canliGorunum() {
    this._ayakGerekli();
    const h = await this.y.hesap();
    const kollar = {};
    const ekle = (o, ad) => { for (const [s, q] of Object.entries(o || {})) if (Math.abs(q) > 1e-12) (kollar[s] = kollar[s] || {})[ad] = q; };
    if (this.ayar.btcAyak === 'perp') ekle(this.btSanal(), 'BTC ayağı');
    try { ekle(this.kol.donSanal(), 'Donchian'); } catch { /* */ }
    try { ekle(this.kol.dca.sanalMiktarlar(), 'DCA'); } catch { /* */ }
    const pozisyonlar = h.pozisyonlar.map(p => {
      const nominal = Number.isFinite(+p.nominal) && p.nominal != null ? Math.abs(+p.nominal) : (+p.mark > 0 ? Math.abs(p.miktar) * p.mark : null);
      return { symbol: p.symbol, yon: p.side === 'short' ? 'SHORT' : 'LONG', miktar: p.miktar, nominal, giris: p.giris, mark: p.mark, kz: p.gerceklesmemis, kollar: kollar[p.symbol] || {} };
    });
    let spot = null;
    if (this.ayar.btcAyak !== 'perp') {
      try { const q = await this.btcMiktari(); if (q > 0) { const f = await this._btcFiyat(); spot = { varlik: this.ayar.varlik, miktar: q, fiyat: f, deger: q * (f || 0), kol: 'BTC ayağı' }; } } catch { /* */ }
    }
    const emirler = h.acikEmirler.map(o => {
      const d = o.clientOrderId ? this.y.defter.al(o.clientOrderId) : null;
      const et = d ? d.bot : (/^ag-([a-z0-9]+)-/.exec(o.clientOrderId || '') || [])[1];
      return { symbol: o.symbol, side: o.side, tip: o.type, miktar: o.miktar, fiyat: o.fiyat, dolan: o.dolan, durum: 'borsada açık', zaman: o.zaman,
        kol: o.bizim ? kolAdi(et) : 'yabancı (botun değil)', neden: d ? d.neden : null, id: o.clientOrderId || o.id };
    });
    try {
      for (const s of this.kol.dca.ozet().semboller) for (const e of s.emirler) {
        if (e.durum !== 'BEKLIYOR') continue;
        emirler.push({ symbol: s.symbol, side: e.rol === 'TP' ? 'sell' : 'buy', tip: 'limit', miktar: e.miktar, fiyat: e.fiyat, dolan: 0, durum: 'yerelde bekliyor (fiyat bandı dışı)',
          kol: 'DCA', neden: e.rol === 'BO' ? 'DCA BO (giriş)' : e.rol === 'TP' ? 'DCA TP (kâr al)' : `DCA ${e.rol}`, id: null });
      }
    } catch { /* */ }
    return { zaman: Date.now(), ortam: h.ortam, bakiye: h.bakiye, pozisyonlar, spot, emirler };
  }

  /** ozsermaye.jsonl → gün başına SON satır (sıralı). */
  ozsermayeOku() {
    if (!this.ozsermayeDosya || !fs.existsSync(this.ozsermayeDosya)) return [];
    const g = new Map();
    for (const s of fs.readFileSync(this.ozsermayeDosya, 'utf8').split('\n')) {
      if (!s.trim()) continue;
      try { const x = JSON.parse(s); if (x.gun) g.set(x.gun, x); } catch { /* yarım satır */ }
    }
    return [...g.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
  }

  /** healthchecks ping'i — beklenmez, istisna atmaz (SaglikSinyali.ping zaten reddetmez). */
  _saglik(tur, govde, rid) {
    if (!this.saglik) return null;
    const etiket = `${this.adGorunen} (${this.modEtiketi()})`;
    try {
      this._saglikSon = Promise.resolve(this.saglik.ping(tur, { rid, govde: govde == null ? null : `${etiket}: ${govde}` })).catch(() => null);
    } catch { this._saglikSon = null; }
    return this._saglikSon;
  }

  /** Başarılı rapordaki hata satırları (Telegram "çalışmada hata" alarmıyla aynı koşul). */
  /** O2: BTC payı paydası = min(özsermaye, sermaye tavanı). */
  static _payda(E, tavan) { return Math.min(E, tavan > 0 ? tavan : E); }

  static raporHatalari(r) {
    if (!r) return [];
    const h = [...((r.kol && r.kol.yurutme && r.kol.yurutme.hatalar) || [])];
    if (r.btc && r.btc.hata && !r.btc.asgariNominalAlti) h.push(`BTC: ${r.btc.hata}`);
    if (r.koruma && r.koruma.hatalar) for (const k of r.koruma.hatalar) h.push(`felaket stopu ${k.symbol || ''}: ${k.hata}`);
    return h;
  }

  _kalp(kayit) {
    try { return I.kalpYaz(this.ayar.dizin, { mod: this.ayar.mod, ...kayit }); } catch { return null; }
  }

  _ayakGerekli() {
    if (!this.y.borsa) throw new Error('borsaya bağlı değil');
    if (this.ayar.btcAyak === 'spot' && typeof this.y.borsa.spotEmir !== 'function') throw new Error(`${this.adGorunen}: borsa spot ${this.ayar.varlik} tutamıyor (kâğıt borsa gerekir; demo'da btcAyak 'perp')`);
    if (this.ayar.btcAyak === 'perp' && !this.y.borsa.markets[this.btcSembol]) throw new Error(`${this.btcSembol} pazarı borsada yok`);
    if (this.ayar.btcAyak === 'coklu') {
      if (!CokluVarlik.destekler(this.y.borsa)) throw new Error(`${this.adGorunen}: borsa çoklu varlık uçlarını taşımıyor (btcAyak 'coklu')`);
      if (!CokluVarlik.aktarimVar(this.y.borsa)) throw new Error(`${this.adGorunen}: bu ortamda cüzdan aktarımı (sapi) yok — Binance Demo'da btcAyak 'coklu' kullanılamaz (perp)`);
    }
  }

  /** Borsa okumaları yürütücünün geri çekilme kapısından (F2 — 418 ban'da istek atılmaz); yalın test yürütücüsünde borsanın kendisi. */
  _b() { return (typeof this.y.kapiliBorsa === 'function' && this.y.kapiliBorsa()) || this.y.borsa; }
  _geriCekilmede() { return typeof this.y.geriCekilmede === 'function' && this.y.geriCekilmede(); }

  async _btcFiyat() {
    const m = await this._b().fetchMarkPrice(this.btcSembol);
    const f = +(m.markPrice || (m.info && m.info.markPrice));
    if (!(f > 0)) throw new Error(`${this.btcSembol} mark fiyatı yok`);
    return f;
  }

  /** Perp ayağının sanal pozisyonu: defterdeki `bt` dolumları + acil düzeltmesi. */
  btSanal() {
    let q = 0;
    for (const e of this.y.defter.emirler.values()) if (e.bot === 'bt' && +e.dolan > 0) q += (e.side === 'buy' ? 1 : -1) * +e.dolan;
    q = +(q + (this.durum.btDuzeltme || 0)).toFixed(12);
    return Math.abs(q) < 1e-12 ? {} : { [this.btcSembol]: q };
  }

  async btcMiktari() {
    if (this.ayar.btcAyak === 'perp') return this.btSanal()[this.btcSembol] || 0;
    if (this.ayar.btcAyak === 'coklu') return (await this.cv.btcToplam()).toplam;   // vadeli teminat + spot kalıntı
    const b = await this._b().fetchBalance();
    return +((b.total && b.total[this.ayar.varlik]) || 0);
  }

  /** Özsermaye: spot → USDT + BTC × mark; perp → USDT toplamı (perp PnL içinde). */
  async _ozsermaye(hesap) {
    const h = hesap || await this.y.hesap();
    if (this.ayar.btcAyak === 'perp') return h.bakiye.toplam || 0;
    const q = await this.btcMiktari();
    const f = q > 0 ? await this._btcFiyat() : 0;
    return (h.bakiye.toplam || 0) + q * f + (await this._spotUsdt());
  }

  /** Çoklu varlık: spot cüzdandaki USDT (akış kalıntısı) özsermayeye dahil; diğer kiplerde 0. */
  async _spotUsdt() {
    if (this.ayar.btcAyak !== 'coklu') return 0;
    return (await this.cv.spotKendi()).USDT || 0;   // yalnız botun kendi spot kalıntısı (yabancı bakiye sayılmaz)
  }

  /**
   * Kâğıt spot: Binance çekilebilir USDT taklidi (860 / PLAN-B1-KISIT.md formülü, `bindirme.simule cekilebilirKisit` ile aynı):
   * max(0, min(cüzdan, h × BTC değeri + cüzdan + gerçekleşmemiş − Σ|nominal| / kaldıraç)). cüzdan = vadeli USDT cüzdanı
   * (gerçekleşen; total.USDT − gerçekleşmemiş), h = BTC teminat iskontosu sonrası pay (0,95), kaldıraç 20.
   */
  async _cekilebilirUsdt(fiyat) {
    const ck = this.ayar.cekilebilirKisit === true ? {} : (this.ayar.cekilebilirKisit || {});
    const kaldirac = ck.kaldirac ?? 20, h = ck.h ?? 0.95;
    const b = this.y.borsa;
    const bak = await b.fetchBalance();
    const poz = typeof b.fetchPositions === 'function' ? await b.fetchPositions() : [];
    let upnl = 0, N = 0;
    for (const p of poz || []) { upnl += +p.unrealizedPnl || 0; N += Math.abs(+p.notional || 0); }
    const cuzdan = (+(bak.total && bak.total.USDT) || 0) - upnl;
    const q = +(bak.total && bak.total[this.ayar.varlik]) || 0;
    const cekilebilir = Math.max(0, Math.min(cuzdan, h * q * fiyat + cuzdan + upnl - N / kaldirac));
    return { cekilebilir, cuzdan, upnl, nominal: N, kaldirac, h };
  }

  /** Son kapanmış günlük BTC mumlarından O-GC durumu (karar günü = son mum). */
  rejim(mumlar) {
    const o = ogcDurum(mumlar.map(m => m.close));
    const j = mumlar.length - 1;
    if (j < 0) return { icerde: false, hazir: false, neden: 'mum yok' };
    const hazir = o.sma200[j] != null;
    let sonGecis = null;
    for (let i = j; i >= 1; i--) if (o.durum[i] !== o.durum[i - 1]) { sonGecis = { gun: gunStr(mumlar[i].time), yon: o.durum[i] ? 'giris' : 'cikis', kapanis: mumlar[i].close }; break; }
    return { icerde: o.durum[j] === 1, hazir, kararGun: gunStr(mumlar[j].time), kapanis: mumlar[j].close,
      sma50: o.sma50[j], sma100: o.sma100[j], sma200: o.sma200[j], sonGecis, gunSayisi: mumlar.length,
      neden: hazir ? null : `yetersiz geçmiş: ${mumlar.length}/200 gün — BTC pozisyon yok` };
  }

  /** BTC ayağı emri. @returns {{ islem, hata, asgari }} */
  async _btcEmir(fark, fiyat, sebep, simdi) {
    const nominal = Math.abs(fark) * fiyat;
    if (this.ayar.btcAyak === 'coklu') {
      if (nominal < this.ayar.minNominal) return { asgari: true };
      const r = fark > 0 ? await this.cv.al(fark, { sebep, simdi }) : await this.cv.sat(-fark, { sebep, simdi });
      if (r.asgari && !r.miktar) return { asgari: true };
      const islem = r.miktar > 0 ? { zaman: simdi, gun: gunStr(simdi), yon: fark > 0 ? 'alım' : 'satım', miktar: r.miktar, fiyat: r.fiyat, ucret: r.ucretUsdt, sebep, ayak: 'coklu',
        dilim: r.dilim, adim: r.adim, vadeliyeTasinan: r.vadeliyeTasinan || 0, toz: r.toz || 0 } : null;
      return { islem, hata: r.hata ? `çoklu varlık${r.belirsiz ? ' (BELİRSİZ)' : ''}: ${r.hata}` : null, belirsiz: r.belirsiz, kisit: r.kisit || null };
    }
    if (this.ayar.btcAyak === 'spot') {
      if (nominal < this.ayar.minNominal) return { asgari: true };
      // Karar Ö9 (deneme 860): kâğıt spot modeli ÇEKİLEBİLİR USDT KISITLI — alım (rejim girişi / ay başı ilavesi) gerçek
      // Binance'teki çekilebilir USDT ile sınırlı (bindirme.simule cekilebilirKisit ile aynı formül); satış kısıtsız.
      let miktar = Math.abs(fark), kisit = null;
      if (fark > 0 && this.ayar.cekilebilirKisit) {
        const c = await this._cekilebilirUsdt(fiyat);
        const dMax = Math.max(0, c.cekilebilir / (fiyat * (1 + (this.y.borsa.spotUcret ?? 0.001))));
        if (miktar > dMax + 1e-12) {
          kisit = `çekilebilir USDT yetmedi (gerçekleşmemiş kâr / marj çekilemez; çekilebilir ${c.cekilebilir.toFixed(2)} USDT) — ${(miktar - dMax).toFixed(8)} ${this.ayar.varlik} alınamadı`;
          miktar = Math.floor(dMax * 1e8) / 1e8;
          if (miktar * fiyat < this.ayar.minNominal) return { kisit, eksikMiktar: Math.abs(fark) };
        }
      }
      const cid = `bd${this.ayar.ad.slice(0, 2)}_${gunStr(simdi).replace(/-/g, '')}_${Date.now().toString(36)}`;
      try {
        const o = await this.y.borsa.spotEmir(this.ayar.varlik, fark > 0 ? 'buy' : 'sell', miktar, { clientOrderId: cid });
        return { islem: { zaman: simdi, gun: gunStr(simdi), yon: o.side === 'buy' ? 'alım' : 'satım', miktar: o.amount, fiyat: o.average, ucret: o.ucret, sebep, ayak: 'spot' },
          kisit, eksikMiktar: kisit ? Math.max(0, Math.abs(fark) - o.amount) : 0 };
      } catch (e) { return { hata: e.message }; }
    }
    // perp (demo yaklaşımı): yürütücü kapıları (ön kontrol, tavanlar, durum) aynen uygulanır.
    const mk = this.y.borsa.markets[this.btcSembol];
    const minN = Math.max(this.ayar.minNominal, (mk && mk.limits && mk.limits.cost && mk.limits.cost.min) || 0);
    if (nominal < minN) return { asgari: true };
    const r = await this.y.farkaGetir(this.btcSembol, fark, 'bt', `BTC ayağı — ${fark > 0 ? 'LONG AÇ' : 'LONG azalt/KAPAT'} (${sebep})`);
    const tamam = r.emirler.filter(e => e.emir && +e.emir.dolan > 0);
    const hata = r.emirler.find(e => !e.basarili);
    // Denetim O1 (61.7): fark bir lot adımından küçükse emir YOK — bu hata değil, hedefe zaten adım hassasiyetinde
    // ulaşılmış demektir. Eskiden "çalışmada hata" alarmı + healthchecks fail + sonAy yazılmıyordu (G4/G5 ölçümünü bozuyordu).
    if (!tamam.length && !hata && r.atlandi) return { adimAlti: r.atlandi };
    if (!tamam.length) {
      const s = hata ? hata.sebep || (hata.emir && hata.emir.hata) || 'emir dolmadı' : (r.atlandi || 'emir yok');
      return { hata: s, asgari: ASGARI_KOD.test(s) };
    }
    const miktar = tamam.reduce((a, e) => a + +e.emir.dolan, 0);
    const ort = tamam.reduce((a, e) => a + +e.emir.dolan * (+e.emir.ortFiyat || fiyat), 0) / miktar;
    return { islem: { zaman: simdi, gun: gunStr(simdi), yon: fark > 0 ? 'alım' : 'satım', miktar, fiyat: ort, ucret: null, sebep, ayak: 'perp' },
      hata: hata ? (hata.sebep || 'kısmi') : null };
  }

  /**
   * Hücum-S planı + filtre karşılaştırması. Kararda İŞLEM borsasının filtreleri kullanılır; demo'da
   * prod'un (anahtarsız) filtreleri yan yana raporlanır — demo exchangeInfo'su prod'dan farklı olabilir.
   */
  async _kucukSermayeRaporu(kolRapor) {
    const KS = require('./kucukSermaye');
    const S = kolRapor.kucukSermaye;
    const U = (kolRapor.evren && kolRapor.evren.semboller) || [];
    const out = { secim: this.ayar.kucukSermaye ?? 'oto', etkin: !!S, esik: KS.OTO_ESIK,
      not: KUCUK_NOT,
      plan: S ? { ay: S.ayStr, F: S.F, L: S.L, uygun: S.uygun, disarida: S.disarida, dcaDisi: S.dcaDisi, n: S.n } : null, filtreler: [] };
    let prod = null;
    if (this.y.veri) {
      try { if (!this.y.veri.markets || !Object.keys(this.y.veri.markets).length) await this.y.veri.loadMarkets(); prod = this.y.veri.markets; } catch (e) { out.prodHata = e.message; }
    }
    for (const s of U) {
      const d = KS.filtre(this.y.borsa.markets[s]);
      const sat = { symbol: s, borsa: d, minEtkin: S && S.me[s] ? S.me[s].deger : null };
      if (prod) { const p = KS.filtre(prod[s]); sat.prod = p; sat.fark = p.minN !== d.minN || p.minQty !== d.minQty || p.adim !== d.adim; }
      out.filtreler.push(sat);
    }
    out.farkliFiltre = out.filtreler.filter(f => f.fark).map(f => f.symbol);
    return out;
  }

  /** Kolun asgari nominal (−4164 / −4003) reddettiği emirleri sayar. */
  static _kolAsgari(kolRapor) {
    const y = kolRapor && kolRapor.yurutme;
    if (!y) return 0;
    let n = 0;
    for (const d of y.donchian || []) for (const e of d.emirler || []) if (!e.basarili && ASGARI_KOD.test(e.sebep || '')) n++;
    for (const d of y.dca || []) for (const k of d.merdiven || []) if (k.durum === 'RED' && ASGARI_KOD.test(k.sebep || '')) n++;
    return n;
  }

  /**
   * Günlük çalışma. Önce kol (KalkanBot ×m), sonra BTC ayağı.
   * @param {boolean} kuru true → yalnız hesap; emir YOK, durum yazılmaz
   */
  // ── Y1 (61.7): TEK ÇALIŞMA KİLİDİ ─────────────────────────────────────────
  // Zamanlanmış günlük çalışma ile panelden "Şimdi çalıştır" (ya da iki sekme) aynı eski durumdan fark hesaplayıp
  // BTC'yi İKİ KEZ alıyordu (denetim d2: BTC/özsermaye 2,0). calistir · gunlukCalisma · mutabakat · acilDene sıraya
  // girer; ikinci çağrı birincinin bitmesini bekler ve TAZE durumdan hesaplar (hedefe ulaşılmışsa emir yok).
  async _sirali(fn) {
    while (this._calisma) { try { await this._calisma; } catch { /* önceki çalışmanın hatası bunu etkilemez */ } }
    let bitir;
    this._calisma = new Promise(r => { bitir = r; });
    this._calismaBas = Date.now();
    try { return await fn(); } finally { this._calisma = null; bitir(); }
  }

  /**
   * O5 (61.7): SÜREÇ İÇİ BEKÇİ — sunucu saatte bir çağırır (eskiden yalnız açılıştan 45 sn sonra bir kez bakılıyordu).
   * @returns {{ anahtar, metin }[]} sorunlar (bot çalışmıyorsa boş)
   */
  bekci(simdi = Date.now()) {
    const out = [];
    if (!this.durum.calisiyor) return out;
    const k = I.kalpDurumu(I.kalpOku(this.ayar.dizin), simdi);
    if (k.var && k.gecikti) out.push({ anahtar: 'kalp', metin: `${I.KALP_ESIK_SAAT} saattir başarılı günlük çalışma yok (${k.metin})` });
    const TAKILMA = BindirmeBot.TAKILMA_MS;
    if (this.mesgul && this._mesgulBas && simdi - this._mesgulBas > TAKILMA) out.push({ anahtar: 'mesgul', metin: `dakikalık işlem ${Math.round((simdi - this._mesgulBas) / 60000)} dakikadır bitmedi (takıldı) — günlük çalışma denenmiyor` });
    if (this._calisma && this._calismaBas && simdi - this._calismaBas > TAKILMA) out.push({ anahtar: 'calisma', metin: `çalışma ${Math.round((simdi - this._calismaBas) / 60000)} dakikadır sürüyor (takıldı) — sonraki çalışmalar sırada bekliyor` });
    return out;
  }

  /** Telegram/sağlık etiketi: demo · GERÇEK PARA · kâğıt. */
  modEtiketi() { return this.ayar.mod === 'demo' ? 'demo' : this.ayar.mod === 'canli' ? 'GERÇEK PARA' : 'kâğıt'; }

  /**
   * HESAP KESİCİSİ (61.8, karar Ö6 / denetim O4) — yalnız `ayar.hesapKesicisi` verilince (server: gerçek para kipi).
   * Taban = ilk ölçülen özsermaye (sermaye tavanıyla sınırlı); sermaye tavanı değişirse taban yenilenir (artırma/azaltma).
   * Kayıp ≥ uyari (%30) → alarm (24 saatte bir); ≥ acil (%40) → 'acil' döner (çağıran acil durdurur, bot durur).
   * Bot eşiği DEĞİL: ölçülmüş strateji davranışını değiştirmez; kullanıcının hesap kuralı.
   * @returns {Promise<null|{seviye:'uyari'|'acil', kayip, E, taban}>}
   */
  async kesiciDenetle(simdi = Date.now()) {
    const k = this.ayar.hesapKesicisi;
    if (!k || !this.y.borsa) return null;
    const E = await this._ozsermaye();
    const t = this.durum.kesiciTaban;
    const tavan = this.ayar.sermayeTavani;
    // Denetim #3: taban yalnız ilk ölçümde ve tavan ARTIRILINCA yenilenir (tavanı düşürmek kaybı sıfırlamasın). Hesapta tavandan fazla
    // para varsa kayıp, tabandaki TÜM hesap değerinden mutlak düşüş / tavanlı taban — fazla bakiye kesiciyi kör etmesin.
    // 69.6 (güvenlik testi Y2a): tavan yatırma/çekme AKIŞIYLA değişince taban yeniden ölçülmez — akış _sermayeUygula'da tabana zaten
    // işlendi, birikmiş kayıp korunur. Taban yalnız ilk ölçümde ve AYARLI tavan (kullanıcı) artırılınca yenilenir.
    const ayarli = this._tavanTaban != null ? this._tavanTaban : tavan;
    if (t && (t.tavanTaban != null ? t.tavanTaban : t.tavan) >= ayarli && t.tavan !== tavan) { t.tavan = tavan; this._yaz(); }
    if (!t || !((t.tavanTaban != null ? t.tavanTaban : t.tavan) >= ayarli)) {
      this.durum.kesiciTaban = { deger: Math.min(E, tavan), hesap: E, tavan, tavanTaban: ayarli, zaman: simdi };
      this._yaz();
      this.kaydet('INFO', `${this.adGorunen}: hesap kesicisi tabanı ${this.durum.kesiciTaban.deger.toFixed(2)} USDT (uyarı %${k.uyari * 100}, acil %${k.acil * 100})`);
      if (E > tavan * 1.05) {
        await this._bildir('uyari', 'hesapta sermaye tavanından fazla para var', [`Hesap ${E.toFixed(2)} USDT, botun tavanı ${tavan} USDT. Adanmış hesap önerilir (PLAN-GERCEK-PARA-2027 §4); kesici tavan kadar kaybı ölçer.`], { anahtar: `kesici-fazla:${this.ayar.ad}`, kisitMs: 24 * 3600e3 });
      }
      return null;
    }
    if (!(t.deger > 0)) return null;
    const kayip = ((t.hesap != null ? t.hesap : t.deger) - E) / t.deger;
    const sonuc = { kayip, E, taban: t.deger };
    if (kayip >= k.acil) return { seviye: 'acil', ...sonuc };
    if (kayip >= k.uyari) {
      await this._bildir('alarm', `hesap kesicisi uyarısı: başlangıçtan %${(kayip * 100).toFixed(1)} kayıp`,
        [`Özsermaye ${E.toFixed(2)} / taban ${t.deger.toFixed(2)} USDT. %${k.acil * 100}'ta bot ACİL durdurulur (karar Ö6).`], { anahtar: `kesici-uyari:${this.ayar.ad}`, kisitMs: 24 * 3600e3 });
      return { seviye: 'uyari', ...sonuc };
    }
    return null;
  }

  async _kesiciAcil(r, ic) {
    const metin = `hesap kesicisi: başlangıçtan %${(r.kayip * 100).toFixed(1)} kayıp (özsermaye ${r.E.toFixed(2)} / taban ${r.taban.toFixed(2)} USDT) — karar Ö6 %${this.ayar.hesapKesicisi.acil * 100}`;
    this.kaydet('ERROR', `${this.adGorunen}: ${metin} → ACİL DURDURMA`);
    const rapor = ic ? await this._acilDurdur(metin) : await this.acilDurdur(metin);
    this.durum.engel = `${metin} — yeniden değerlendirme gerekli (PLAN-GERCEK-PARA-2027 §7)`;
    this._yaz();
    this._engelOlay('engel', 'hesap-kesicisi', this.durum.engel);
    return rapor;
  }

  /** Bir çalışma sürüyor mu (panel "Şimdi çalıştır" ucu 409 döner). */
  calismaSuruyor() { return !!this._calisma; }

  calistir(o = {}) { return this._sirali(() => this._calistir(o)); }
  gunlukCalisma(simdi = Date.now()) { return this._sirali(() => this._gunlukCalisma(simdi)); }
  /**
   * Dışarıdan (panel/sunucu) mutabakat. `kaynak` verilmezse: bu borsa bağlantısındaki İLK mutabakat 'acilis'
   * (server.js bagla() → bağlanış/açılış), sonrakiler 'elle' (panel "Mutabakat" düğmesi). Eskiden açılış da 'elle'
   * yazılıyordu (mutabakat.jsonl / alarmlar.jsonl kaynak alanı; demo kabul C2 "mutabakat denendi" sayımı şişiyordu).
   */
  mutabakat({ kaynak = null } = {}) {
    return this._sirali(async () => {
      const k = kaynak || (this.y.borsa && this.y.borsa === this._mutabakatBorsa ? 'elle' : 'acilis');
      const m = await this._mutabakat(k);
      this._mutabakatBorsa = this.y.borsa;
      return m;
    });
  }
  acilDene() { return this._sirali(() => this._acilDene()); }

  async _calistir({ kuru = false, simdi = Date.now() } = {}) {
    this._ayakGerekli();
    if (!kuru && this.durum.engel) throw new Error(`${this.adGorunen} ENGELLİ: ${this.durum.engel}`);
    const mumlar = await kapanmisGunlukMumlar(this._b(), this.btcSembol, simdi);
    // 69.3 VERİ KAPISI: boşluk / bayat / sıfır hacim / anlamsız sıçrama → karar verilmez (hata; 15 dk sonra yeniden denenir).
    const vk = mumKapisi(mumlar, simdi, { sicrama: 0.5, dusus: 0.6 });   // 69.6: BTC'de günlük %60'tan büyük düşüş şüpheli veri
    if (!vk.gecerli) throw new Error(`veri kapısı (${this.btcSembol}): ${vk.sebep} — karar verilmedi`);
    const rj = this.rejim(mumlar);

    // Telafi: kaçırılan günler (yalnız bilgi — hedef bugünün hedefi; geçmiş emirler verilmez)
    let telafi = null;
    if (!kuru && this.durum.sonGun && rj.kararGun && I.gunFarki(this.durum.sonGun, rj.kararGun) > 1) {
      const n = I.gunFarki(this.durum.sonGun, rj.kararGun) - 1;
      const gunler = []; for (let i = 1; i <= n; i++) gunler.push(I.gunEkle(this.durum.sonGun, i));
      telafi = { zaman: simdi, oncekiGun: this.durum.sonGun, kararGun: rj.kararGun, kacirilanGun: n, gunler: gunler.slice(0, 60) };
    }

    // 1. Kol (engelliyse KalkanBot hata atar — fail-closed, BTC ayağı da çalışmaz)
    const kolEngelOnce = this.kol.durum.engel;
    const kolRapor = await this.kol.calistir({ kuru, simdi });
    if (!kuru && this.kol.durum.engel && !kolEngelOnce) this._engelOlay('engel', 'kol-calisma', this.kol.durum.engel);

    // 1b. Küçük sermaye (S) + borsa filtreleri: işlem borsası (demo) ↔ prod
    const kucuk = await this._kucukSermayeRaporu(kolRapor);

    // 2. BTC ayağı
    const hesap = await this.y.hesap();
    const fiyat = await this._btcFiyat();
    const q = await this.btcMiktari();
    const ozs = (h, qq, su = 0) => (this.ayar.btcAyak === 'perp' ? (h.bakiye.toplam || 0) : (h.bakiye.toplam || 0) + qq * fiyat + su);
    const spotUsdt0 = await this._spotUsdt();
    const E = ozs(hesap, q, spotUsdt0);
    const Ecap = Math.min(E, this.ayar.sermayeTavani);
    const K3 = !!(kolRapor.risk && kolRapor.risk.K3), K1 = !!(kolRapor.risk && kolRapor.risk.K1);
    let wHedef = rj.icerde && rj.hazir ? this.ayar.btcPay : 0;
    if (K3) wHedef = 0;
    const ay = ayNo(simdi);
    const sebep = this.durum.sonW == null ? 'ilk çalışma'
      : wHedef !== this.durum.sonW ? (wHedef > this.durum.sonW ? 'rejim girişi' : (K3 ? 'risk K3' : 'rejim çıkışı'))
        : (wHedef > 0 && ay !== this.durum.sonAy) ? 'ay başı dengesi'
          : (wHedef > 0 && this.durum.sermayeDengesiBekliyor) ? 'sermaye değişimi' : null;
    let hedefQ = sebep ? wHedef * Ecap / fiyat : q;
    if (K1 && hedefQ > q) hedefQ = q;                       // K1: yeni risk yok
    const fark = hedefQ - q;
    const plan = { sebep, wHedef, hedefMiktar: hedefQ, mevcutMiktar: q, fark, nominal: Math.abs(fark) * fiyat, fiyat, K1, K3, ayak: this.ayar.btcAyak };
    let islem = null, asgari = BindirmeBot._kolAsgari(kolRapor);
    const kisitEksikOnce = this.durum.kisitEksikPay || 0;   // önceki çalışmadan kalan (bu aralıkta tutulan) BTC eksik payı
    let kisitEksikYeni = kisitEksikOnce;
    if (!kuru && sebep && Math.abs(fark) * fiyat > 1e-6 && this._acilIstek && fark > 0) {
      plan.hata = 'acil durdurma istendi — BTC alımı yapılmadı';   // Y1: süren çalışma acilden sonra risk eklemez
    } else if (!kuru && sebep && Math.abs(fark) * fiyat > 1e-6) {
      const r = await this._btcEmir(fark, fiyat, sebep, simdi);
      if (r.asgari) { asgari++; plan.asgariNominalAlti = true; }
      if (r.adimAlti) { plan.adimAlti = r.adimAlti; this.kaydet('INFO', `${this.adGorunen}: BTC farkı bir lot adımının altında — emir gerekmedi (${sebep})`); }
      if (r.kisit) { plan.kisit = r.kisit; this.kaydet('WARN', `${this.adGorunen}: BTC ayağı kısıtı (${sebep}): ${r.kisit}`); }
      // Kısıt eksik payı (karar Ö9): model hedefine göre alınamayan BTC / tavanlı sermaye; sonraki tam dengelemeye kadar sürer.
      if (r.kisit && fark > 0) {
        const alinan = r.islem ? +r.islem.miktar || 0 : 0;
        const eksikQ = r.eksikMiktar != null ? r.eksikMiktar : Math.max(0, fark - alinan);
        kisitEksikYeni = Ecap > 0 ? eksikQ * fiyat / Ecap : 0;
        plan.kisitEksikPay = kisitEksikYeni;
      } else if (!r.hata || r.asgari) kisitEksikYeni = 0;
      if (r.islem) {
        islem = r.islem;
        this.durum.btcIslemler = [...(this.durum.btcIslemler || []), islem].slice(-200);
        this.kaydet('INFO', `${this.adGorunen}: BTC ${islem.yon} ${(+islem.miktar).toFixed(6)} @ ${islem.fiyat} (${sebep}${islem.ayak === 'perp' ? ' · perp LONG, demo yaklaşımı' : ''})`);
      }
      if (r.hata) {
        plan.hata = r.hata;
        this.kaydet(r.asgari ? 'WARN' : 'ERROR', `${this.adGorunen}: BTC emri ${r.asgari ? 'asgari nominal altı — verilmedi' : 'başarısız'} (${sebep}): ${r.hata}`);
      }
    }
    const qSon = kuru ? q : await this.btcMiktari();
    const hesapSon = kuru ? hesap : await this.y.hesap();
    const Eson = ozs(hesapSon, qSon, kuru ? spotUsdt0 : await this._spotUsdt());
    if (this.cv) plan.cokluVarlik = await this.cv.teminat();

    // 3. Beklenti sapması (dünkü çalışmadan bugüne) — getiri bot sermayesine (tavanla kırpılmış) göre
    const oncekiCap = this.durum.sonOzsermayeCap || (this.durum.sonOzsermaye > 0 ? Math.min(this.durum.sonOzsermaye, this.ayar.sermayeTavani) : null);
    const gercekGetiri = oncekiCap > 0 && this.durum.sonOzsermaye > 0 ? (E - this.durum.sonOzsermaye) / oncekiCap : null;
    let sapma = null;
    const dunGun = gunStr(simdi - GUN);
    if (gercekGetiri != null && this.durum.sonCalisma && gunStr(this.durum.sonCalisma) === dunGun && mumlar.length >= 2) {
      const rBtc = mumlar[mumlar.length - 1].close / mumlar[mumlar.length - 2].close - 1;
      const btcPayDun = this.durum.sonBtcPay ?? 0;
      const beklenen = btcPayDun * rBtc + (kolRapor.model ? kolRapor.model.kolGetiri : 0);
      sapma = { gun: rj.kararGun, gercek: gercekGetiri, beklenen, fark: gercekGetiri - beklenen, btcPayDun, rBtc, kolModel: kolRapor.model ? kolRapor.model.kolGetiri : null };
    }

    const rapor = {
      zaman: simdi, gun: rj.kararGun, kuru, ad: this.ayar.ad, adGorunen: this.adGorunen, mod: this.ayar.mod, btcAyak: this.ayar.btcAyak,
      demoNot: this.ayar.btcAyak === 'perp' ? DEMO_NOT : null, btcPay: this.ayar.btcPay, kolCarpani: this.ayar.kolCarpani,
      rejim: rj, btc: { ...plan, islem, miktarSonra: qSon, degerSonra: qSon * fiyat, paySonra: BindirmeBot._payda(Eson, this.ayar.sermayeTavani) > 0 ? qSon * fiyat / BindirmeBot._payda(Eson, this.ayar.sermayeTavani) : 0 },
      ozsermaye: { once: E, sonra: Eson, usdt: hesapSon.bakiye.toplam }, sapma, telafi, asgariNominalAlti: asgari, kucukSermaye: kucuk,
      kol: { agirlik: kolRapor.agirlik, risk: kolRapor.risk, model: kolRapor.model, evren: kolRapor.evren, yurutme: kolRapor.yurutme && {
        donchian: kolRapor.yurutme.donchian.length, dca: (kolRapor.yurutme.dca || []).filter(r => r.merdiven).length, dcaKapanan: kolRapor.yurutme.dcaKapanan.length, hatalar: kolRapor.yurutme.hatalar } },
    };
    if (kuru) { this.durum.sonKuru = rapor; this._yaz(); return rapor; }

    // 4. Uygulama takibi: gerçekleşen vs gölge (PLAN-ILERI-HUCUM-DENGE B)
    if (gercekGetiri != null && this.durum.sonGun && rj.kararGun > this.durum.sonGun) {
      const aralik = { bas: this.durum.sonGun, bit: rj.kararGun, gercek: gercekGetiri, telafi: !!telafi };
      if (this.ayar.btcAyak === 'perp') {
        const bas = this.durum.sonCalisma || (Date.parse(`${this.durum.sonGun}T00:00:00Z`) + GUN);
        Object.assign(aralik, await this._btFundingDuzeltme(bas, simdi, oncekiCap, hesap, q));   // q, hesap: bu çalışmanın BTC emrinden ÖNCE
      }
      // Karar Ö9: gölge kısıtlı modele — aralıkta çekilebilir USDT kısıtı yüzünden eksik tutulan BTC payı varsa kısıtlı gölge
      // = gölge − eksikPay × r_BTC(aralık); fark = gerçekleşen + kisitDuzeltme − gölge (hamFark = düzeltmesiz). Eksik yoksa alan yok.
      if (kisitEksikOnce > 0) {
        const kap = (g) => { const m = mumlar.find(x => gunStr(x.time) === g); return m ? m.close : null; };
        const k0 = kap(this.durum.sonGun), k1 = kap(rj.kararGun);
        aralik.kisitEksikPay = kisitEksikOnce;
        aralik.kisitDuzeltme = k0 > 0 && k1 > 0 ? kisitEksikOnce * (k1 / k0 - 1) : 'okunamadı';
      }
      this.durum.golgeBekleyen = [...(this.durum.golgeBekleyen || []), aralik];
    }
    this.durum.kisitEksikPay = this.ayar.btcAyak === 'perp' ? 0 : kisitEksikYeni;
    if (!this.durum.kisitliModelBas && (this.ayar.btcAyak === 'coklu' || (this.ayar.btcAyak === 'spot' && this.ayar.cekilebilirKisit))) {
      this.durum.kisitliModelBas = rj.kararGun;   // geçiş günü kaydı (Ö9): bu günden itibaren kâğıt/çoklu BTC alımı kısıtlı, B bandı kısıt düzeltmeli
      this.kaydet('INFO', `${this.adGorunen}: gölge/kâğıt modeli çekilebilir USDT kısıtlı modele geçti (karar Ö9, ${rj.kararGun})`);
    }
    const uyg = this.uygulamaGuncelle(rj.kararGun);
    rapor.uygulama = uyg;

    if (!plan.hata || plan.asgariNominalAlti) { this.durum.sonW = wHedef; this.durum.sonAy = ay; this.durum.sermayeDengesiBekliyor = false; }
    this.durum.sonGun = rj.kararGun;
    this.durum.sonCalisma = simdi;
    this.durum.sonOzsermaye = Eson;
    this.durum.sonOzsermayeCap = Math.min(Eson, this.ayar.sermayeTavani);
    // Denetim O2 (62.1): BTC payı TAVANLI özsermayeye göre — hesapta tavandan fazla para varken (demo 5000 / tavan 1000) pay %20 görünüp
    // günlük sapmanın BTC beklentisi 5 kat küçük çıkıyordu (getiri zaten oncekiCap'e bölünüyor; payda aynı olmalı).
    this.durum.sonBtcPay = BindirmeBot._payda(Eson, this.ayar.sermayeTavani) > 0 ? qSon * fiyat / BindirmeBot._payda(Eson, this.ayar.sermayeTavani) : 0;
    if (this.ayar.btcAyak === 'perp') this.durum.sonBtFundingPay = { zaman: simdi, bt: qSon, net: BindirmeBot._net(hesapSon, this.btcSembol) };
    const an = this.durum.asgariNominal || { toplam: 0 };
    this.durum.asgariNominal = { toplam: (an.toplam || 0) + asgari, son: asgari, sonGun: rj.kararGun };
    if (sapma) this.durum.sapmaGecmisi = [...(this.durum.sapmaGecmisi || []), sapma].slice(-90);
    if (telafi) this.durum.telafiGecmisi = [...(this.durum.telafiGecmisi || []), telafi].slice(-30);
    this.durum.sonRapor = rapor;
    this._yaz();
    this._ozsermayeYaz({ simdi, gun: rj.kararGun, ozsermaye: Eson, ozsermayeCap: Math.min(Eson, this.ayar.sermayeTavani), btcFiyat: fiyat,
      btcDeger: qSon * fiyat, hesap: hesapSon, icerde: !!rj.icerde, asgari });
    // PLAN-DEMO-KABUL §8.2 #7 (U3): kırpılmayan günlük model sapması kaydı.
    if (sapma) this._kayitEkle('sapma.jsonl', { calisma: simdi, ...sapma });
    this.islemGecmisiGuncelle();
    // Felaket stopu: pozisyonlar bugünkü hedefe geldikten SONRA çapalanır.
    try { rapor.koruma = await this.koruma.guncelle(simdi); } catch (e) {
      rapor.koruma = { hatalar: [{ symbol: '', hata: e.message }] };
      this.kaydet('ERROR', `${this.adGorunen}: felaket stopu güncellenemedi: ${e.message}`);
      await this._bildir('alarm', 'felaket stopu güncellenemedi', [e.message], { anahtar: `fs-guncelle:${e.message.slice(0, 40)}` });
    }
    this._korumaKaydi('guncelle', rapor.koruma, simdi, BindirmeBot._netSayisi(hesapSon));
    const ozetMetin = `${rj.kararGun}: ${rj.icerde ? 'BTC LONG AÇIK' : 'BTC POZİSYON YOK (USDT)'} · BTC payı %${(rapor.btc.paySonra * 100).toFixed(0)} · kol ×${this.ayar.kolCarpani} (Donchian %${(kolRapor.agirlik.don * 100).toFixed(0)} / DCA %${(kolRapor.agirlik.dca * 100).toFixed(0)})${sapma ? ` · sapma ${(sapma.fark * 100).toFixed(2)} puan` : ''}`;
    this.kaydet('INFO', `${this.adGorunen} ${ozetMetin}`);
    // `basla` (§8.2 #9, I7): günlük çalışmanın başladığı an (healthchecks "start" ile aynı an); `zaman` bitiş.
    this._kalp({ zaman: Date.now(), basla: simdi, kararGun: rj.kararGun, sonKarar: ozetMetin, hata: null, kacirilanGun: telafi ? telafi.kacirilanGun : 0 });
    await this._calismaBildirimleri(rapor, kolRapor, hesapSon);
    return rapor;
  }

  /** Hesaptaki sıfırdan farklı net pozisyon sayısı (koruma kapsamı paydası için bilgi). */
  static _netSayisi(hesap) {
    try { return ((hesap && hesap.pozisyonlar) || []).filter(p => Math.abs(+p.miktar || 0) > 0).length; } catch { return null; }
  }

  /**
   * Felaket stopu kapsam kaydı (I4; koruma.json `olaylar` son 100'de kırpılıyor) → koruma.jsonl: güncelleme/denetim
   * başına konan · yerinde · hariç · hata · kaybolan (tetiklendi mi, pozisyon kaldı mı).
   */
  _korumaKaydi(tur, r, simdi, pozisyon = null) {
    if (!r) return;
    try {
      const semb = (l) => (l || []).map(x => x && x.symbol).filter(Boolean);
      this._kayitEkle('koruma.jsonl', { tur, calisma: simdi, atlandi: r.atlandi || null, pozisyon,
        konan: semb(r.konan), korunan: semb(r.korunan), haric: semb(r.haric), iptal: (r.iptal || []).length,
        hatalar: (r.hatalar || []).map(h => ({ symbol: h.symbol || '', hata: String(h.hata || '').slice(0, 160), belirsiz: !!h.belirsiz })),
        kaybolan: (r.kaybolan || []).map(k => ({ symbol: k.symbol, tetiklendi: !!k.tetiklendi, pozisyonKaldi: !!k.pozisyonKaldi })) });
    } catch { /* kayıt botu durdurmaz */ }
  }

  static _net(hesap, symbol) {
    let n = 0;
    for (const p of (hesap && hesap.pozisyonlar) || []) if (p.symbol === symbol) n += (p.side === 'short' ? -1 : 1) * Math.abs(+p.miktar || 0);
    return n;
  }

  /**
   * Demo BTC ayağının (bas, bit] aralığında ödediği/aldığı funding → gerçekleşen getiriye eklenecek düzeltme (U2).
   * Pay = btSanal / net — aralık başındaki (önceki çalışma sonu) değerler; yoksa (ilk sürüm geçişi) aralık sonundakiler
   * (bu çalışmanın BTC emrinden önce: qOnce + hesap).
   * @returns {{ fundingDuzeltme: number | 'okunamadı', btFunding?, fundingToplam?, fundingPay?, fundingSayi?, fundingHata? }}
   */
  async _btFundingDuzeltme(bas, bit, cap, hesap, qOnce) {
    const kayitli = this.durum.sonBtFundingPay;
    // Yedek (kayıtlı pay yok — sürüm geçişi): aralık SONUNDAKİ değerler = bu çalışmanın BTC emrinden ÖNCEKİ q ve hesap
    // (emir sonrası btSanal + emir öncesi net karıştırılırsa giriş gününde hayalî düzeltme, çıkışta 0 — denetim 2026-10-07).
    const bt = kayitli ? +kayitli.bt || 0 : (qOnce != null ? +qOnce || 0 : (this.btSanal()[this.btcSembol] || 0));
    const net = kayitli ? +kayitli.net || 0 : BindirmeBot._net(hesap, this.btcSembol);
    if (Math.abs(bt) < 1e-12) return { fundingDuzeltme: 0, btFunding: 0, fundingPay: 0 };   // BTC ayağı yoktu → funding'i yok
    const okunamadi = (hata) => {
      this.kaydet('WARN', `${this.adGorunen}: BTC ayağı funding okunamadı (${hata}) — uygulama farkı düzeltmesiz (ham)`);
      return { fundingDuzeltme: 'okunamadı', fundingHata: hata };
    };
    if (!(cap > 0)) return okunamadi('sermaye yok');
    if (Math.abs(net) < 1e-12) return okunamadi('BTC net pozisyonu 0 — BTC ayağı payı ayrıştırılamadı');
    let liste;
    try {
      const b = this._b();
      if (typeof b.fetchFundingHistory !== 'function') return okunamadi('borsa funding geçmişi vermiyor');
      liste = await b.fetchFundingHistory(this.btcSembol, bas + 1, 1000, { endTime: bit });
    } catch (e) { return okunamadi(e.message); }
    if (!Array.isArray(liste)) return okunamadi('geçersiz funding cevabı');
    const pencere = liste.filter(f => f && f.timestamp > bas && f.timestamp <= bit && (!f.symbol || f.symbol === this.btcSembol));
    if (pencere.some(f => !Number.isFinite(+f.amount))) return okunamadi('funding tutarı sayı değil');
    const toplam = pencere.reduce((a, f) => a + (+f.amount), 0);
    const pay = bt / net;
    const btFunding = toplam * pay;                    // işaretli: − ödenen / + alınan
    return { fundingDuzeltme: -btFunding / cap, btFunding, fundingToplam: toplam, fundingPay: pay, fundingSayi: pencere.length };
  }

  /** Bekleyen aralıkları gölgeyle kapatır, B bandını hesaplar; > %5 → ENGEL + alarm. */
  uygulamaGuncelle(bugun) {
    const golge = I.golgeOku(this.ayar.golgeDosya);
    const { kapanan, kalan } = I.golgeKapat(golge, this.ayar.ad, this.durum.golgeBekleyen || []);
    // Gölgesi hiç gelmeyecek kadar eski aralık (ör. ileri izleme başlamadan önce) atılır, sayılır.
    const tut = kalan.filter(b => !bugun || I.gunFarki(b.bit, bugun) <= 7);
    this.durum.golgeAtilan = (this.durum.golgeAtilan || 0) + (kalan.length - tut.length);
    this.durum.golgeBekleyen = tut;
    if (kapanan.length) this.durum.golgeFarklar = [...(this.durum.golgeFarklar || []), ...kapanan].slice(-180);
    for (const k of kapanan) this._kayitEkle('golge-farklar.jsonl', k);   // §8.2 #7 (U1/U2): kırpılmayan kopya
    for (const k of kapanan) if (k.telafi) {
      const t = (this.durum.telafiGecmisi || []).find(x => x.oncekiGun === k.bas && x.kararGun === k.bit);
      if (t) Object.assign(t, { gercek: k.gercek, golge: k.golge, fark: k.fark });
      this._bildir('uyari', `kaçırılan ${k.gun - 1} gün — gerçekleşen vs gölge`, [`${k.bas} → ${k.bit}: gerçekleşen %${(k.gercek * 100).toFixed(2)} · gölge (ideal) %${(k.golge * 100).toFixed(2)} · fark ${(k.fark * 100).toFixed(2)} puan`], { anahtar: `telafi:${k.bit}` });
    }
    const uyg = I.uygulamaOzeti(this.durum.golgeFarklar || [], bugun);
    const onceki = this.durum.sonBant;
    this.durum.sonBant = uyg.bant;
    const fundingNot = BindirmeBot._fundingNotu(uyg);
    if (uyg.bant === 'engel' && !this.durum.engel) {
      this.durum.engel = `uygulama sapması: 30 g birikimli |gerçekleşen − gölge| %${(uyg.birikimMutlak * 100).toFixed(2)} > %5${fundingNot}`;
      this.kaydet('ERROR', `${this.adGorunen}: ${this.durum.engel} — bot ENGEL (elle kaldırılır)`);
      this._engelOlay('engel', 'uygulama-sapmasi', this.durum.engel);
      this._bildir('alarm', 'ENGEL — uygulama sapması', [this.durum.engel, 'Bot yeni emir vermiyor. İncele, sonra panelden "Engeli kaldır".']);
    } else if (uyg.bant === 'incele' && onceki !== 'incele') {
      this._bildir('uyari', 'uygulama sapması İNCELE bandında', [`30 g birikimli |gerçekleşen − gölge| %${(uyg.birikimMutlak * 100).toFixed(2)} (%3–5)${fundingNot}`]);
    }
    return uyg;
  }

  /** Demo funding düzeltmesi notu (ham fark + okunamayan aralık); düzeltmesiz kayıtta boş. */
  static _fundingNotu(uyg) {
    if (!uyg || !('birikimHam' in uyg)) return '';
    const p = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}`;
    if (!('fundingDuzeltme' in uyg)) return ` (kısıtlı gölge — çekilebilir USDT kısıtı düzeltmeli ${p(uyg.birikim)} puan; ham ${p(uyg.birikimHam)} puan)`;
    return ` (demo BTC ayağı funding düzeltmeli ${p(uyg.birikim)} puan; ham ${p(uyg.birikimHam)} puan${uyg.fundingOkunamadi ? `; ${uyg.fundingOkunamadi} aralıkta funding okunamadı — o aralıklar ham` : ''})`;
  }

  async _calismaBildirimleri(rapor, kolRapor, hesap) {
    const b = rapor.btc;
    const y = kolRapor.yurutme || { donchian: [], dca: [], dcaKapanan: [], hatalar: [] };
    const kolEmir = y.donchian.reduce((a, d) => a + (d.emirler || []).filter(e => e.basarili).length, 0);
    const yeniMerdiven = (y.dca || []).filter(r => r.merdiven).length;
    const uy = rapor.uygulama;
    await this._bildir('ozet', `günlük özet ${rapor.gun}`, [
      `Karar: ${rapor.rejim.icerde ? 'BTC LONG AÇIK' : 'BTC POZİSYON YOK (USDT)'}${rapor.demoNot ? ` (${rapor.demoNot})` : ''}`,
      `BTC payı %${(b.paySonra * 100).toFixed(0)} (hedef %${(b.wHedef * 100).toFixed(0)})`,
      `Özsermaye ${rapor.ozsermaye.sonra.toFixed(2)} USDT`,
      `Kol payları: Donchian %${(kolRapor.agirlik.don * 100).toFixed(0)} · DCA %${(kolRapor.agirlik.dca * 100).toFixed(0)}`,
      `Açık pozisyon: ${hesap.pozisyonlar.length ? hesap.pozisyonlar.map(p => `${p.symbol.split('/')[0]} ${p.side === 'short' ? 'SHORT' : 'LONG'}`).join(', ') : 'yok'}`,
      rapor.sapma ? `Modele göre sapma: ${(rapor.sapma.fark * 100).toFixed(2)} puan (gerçek ${(rapor.sapma.gercek * 100).toFixed(2)} / model ${(rapor.sapma.beklenen * 100).toFixed(2)})` : 'Modele göre sapma: ardışık iki gün gerekir',
      uy && uy.kayit ? `Gölgeye göre 30 g birikimli fark: ${(uy.birikim * 100).toFixed(2)} puan (${uy.bant})${'birikimHam' in uy ? ` · BTC funding düzeltmeli; ham ${(uy.birikimHam * 100).toFixed(2)} puan${uy.fundingOkunamadi ? `, ${uy.fundingOkunamadi} aralıkta funding okunamadı` : ''}` : ''}` : 'Gölge karşılaştırması: kayıt bekleniyor',
      rapor.telafi ? `Kaçırılan gün: ${rapor.telafi.kacirilanGun} (yalnız bugünkü hedefe gidildi)` : null,
      rapor.asgariNominalAlti ? `Asgari nominal altı (verilmeyen) emir: ${rapor.asgariNominalAlti}` : null,
      b.kisit ? `BTC ayağı kısıtı (çoklu varlık): ${b.kisit}` : null,
    ]);
    if (b.islem || kolEmir || yeniMerdiven || y.dcaKapanan.length) {
      await this._bildir('islem', `işlemler ${rapor.gun}`, [
        b.islem ? `BTC ${b.islem.yon} ${(+b.islem.miktar).toFixed(6)} @ ${(+b.islem.fiyat).toFixed(2)} (${b.islem.sebep})` : null,
        kolEmir ? `Donchian: ${kolEmir} emir` : null,
        yeniMerdiven ? `DCA: ${yeniMerdiven} yeni merdiven` : null,
        y.dcaKapanan.length ? `DCA kapanan: ${y.dcaKapanan.map(k => k.symbol.split('/')[0]).join(', ')}` : null,
      ]);
    }
    if ((y.hatalar && y.hatalar.length) || b.hata && !b.asgariNominalAlti) {
      await this._bildir('alarm', 'çalışmada hata', [...(y.hatalar || []), b.hata && !b.asgariNominalAlti ? `BTC: ${b.hata}` : null]);
    }
    if (this.kol.durum.engel) await this._bildir('alarm', 'ENGEL — pozisyon uyuşmazlığı', [this.kol.durum.engel], { anahtar: 'engel-kol' });
  }

  /** Kol mutabakatı; çoklu varlık kipinde ayrıca cüzdan/mod denetimi (engel birleşir). Diğer kiplerde kol sonucu aynen. */
  async _mutabakat(kaynak = 'elle', ym = null) {
    const kolEngelOnce = this.kol.durum.engel;
    const m = await this.kol.mutabakat();
    if (this.cv) {
      const c = await this.cv.mutabakat();
      m.cokluVarlik = c;
      if (c.engel && !m.engel) m.engel = `çoklu varlık: ${c.engel}`;
    }
    this._mutabakatKaydi(kaynak, m, ym);
    if (m.engel && !kolEngelOnce) this._engelOlay('engel', `mutabakat-${kaynak}`, m.engel);
    else if (!this.kol.durum.engel && kolEngelOnce) this._engelOlay('engel-kalkti', `mutabakat-${kaynak}`, kolEngelOnce);
    return m;
  }

  /** Mutabakat sonucu (§8.2 #5, I1 "temiz gün") → mutabakat.jsonl. Kayıt hatası sonucu etkilemez. */
  _mutabakatKaydi(kaynak, m, ym, ek = {}) {
    try {
      const say = (x) => (Array.isArray(x) ? x.length : Number.isFinite(+x) ? +x : 0);
      const pz = m && m.pozisyon;
      this._kayitEkle('mutabakat.jsonl', { kaynak, temiz: !!m && !m.engel, engel: (m && m.engel) || null,
        pozisyonFark: pz && Array.isArray(pz.farklar) ? pz.farklar.map(f => ({ symbol: f.symbol, fark: f.fark })) : null,
        dcaCozulemeyen: m && m.dca ? say(m.dca.cozulemeyen) : null,
        yurutucu: ym ? { cozulen: say(ym.cozulen), cozulemeyen: say(ym.cozulemeyen), yabanciEmir: say(ym.yabanciEmir), hata: ym.hata || null } : null,
        yurutucuDurum: this.y.durum || null, ...ek });
    } catch { /* kayıt botu durdurmaz */ }
  }

  /** Saatlik marj denetimi; eşik aşılırsa alarm (aynı seviye/uyarı tekrar tekrar gönderilmez — anahtar). */
  async marjDenetle(simdi = Date.now()) {
    let m;
    try {
      const b = this._b();
      const [bakiye, poz] = await Promise.all([b.fetchBalance(), b.fetchPositions()]);
      m = marjDurumu(bakiye, poz, this.koruma.durum.stoplar || {});
    } catch (e) {
      // Geri çekilme (418/429): istek atılmadı; zaman yazılmaz → süre bitince ilk tik yeniden dener (F2).
      if (e && e.kod === 'GERI_CEKILME') return null;
      this.kaydet('WARN', `Marj denetimi okunamadı: ${e.message}`);
      this.durum.sonMarj = { zaman: simdi, hata: e.message }; this._yaz();
      this._kayitEkle('marj.jsonl', { olcum: simdi, hata: String(e.message).slice(0, 200) });
      return null;
    }
    this.durum.sonMarj = { zaman: simdi, oran: m.oran, seviye: m.seviye, uyarilar: m.uyarilar, enYakin: m.enYakin };
    this._yaz();
    // §8.2 #4 (I5): saatlik marj geçmişi — oran, en yakın likidasyon mesafesi, seviye, likidasyonu stoptan önce gelen sembol.
    this._kayitEkle('marj.jsonl', { olcum: simdi, oran: m.oran, seviye: m.seviye, enYakin: m.enYakin || null, uyarilar: m.uyarilar,
      likidasyonOnce: (m.pozisyonlar || []).filter(p => p.likidasyonOnce).map(p => p.symbol) });
    if (m.seviye !== 'normal') {
      this.kaydet(m.seviye === 'alarm' ? 'ERROR' : 'WARN', `${this.adGorunen} marj: ${m.uyarilar.join(' · ')}`);
      await this._bildir(m.seviye === 'alarm' ? 'alarm' : 'uyari', m.seviye === 'alarm' ? 'MARJ ALARMI' : 'marj uyarısı', m.uyarilar,
        { anahtar: `marj:${m.seviye}:${m.uyarilar.map(u => u.split(':')[0]).join(',')}` });   // 6 saatlik tekrar kısıtı (isletim)
    }
    return m;
  }

  /** Uygulama sapması ENGEL'ini elle kaldırır (kol mutabakat engeli mutabakatla kalkar). */
  /**
   * PARA YATIRMA / ÇEKME KAYDI (denetim O3, 62.1). Hesaba para eklenince/çekilince bot bunu getiri sanıyordu: gölge karşılaştırması
   * (B bandı) +%100 / −%x görüp ENGEL'e, risk tepesi (HWM) sahte düşüşle K1/K2'ye düşebiliyordu. Kayıt, borsadaki hareketle AYNI
   * tutarda ölçüm tabanlarını kaydırır: son özsermaye, risk durumu (tepe ve gün/hafta/ay başları), hesap kesicisi tabanı. Kendisi
   * para TAŞIMAZ. Çalışma sürerken yapılmaz; kâğıt modda anlamsız (kâğıt hesaba para yatırılmaz).
   * @param tutar USDT (+ yatırma, − çekme) · @returns kayıt
   */
  /** 69.3: bot + kol + yürütücü tavanlarını birlikte ayarlar (çalışırken). */
  _tavanAyarla(yeni) {
    this.ayar.sermayeTavani = yeni;
    if (this.kol && this.kol.ayar) this.kol.ayar.sermayeTavani = yeni;
    if (this.y && this.y.ayar) { this.y.ayar.maxEmirNominal = 3 * yeni; this.y.ayar.maxPozisyonNominal = 3 * yeni; }
  }

  /**
   * 69.3 TAVAN İZLEME: yatırma tavanı yükseltir, çekme düşürür (ayarlı tabanın altına inmez). Gerçek parada onaylı üst sınır
   * (canlı kapı G9) aşılmaz — aşacaksa tavan sınırda kalır ve "onaylı sınırı artırın" uyarısı gider. ayar.tavanAkis === false → kapalı.
   * @returns { eski, yeni, sinirli? } | null
   */
  /**
   * 69.6 Tavanın çıkabileceği üst sınır: gerçek parada onaylı üst sınır (canlı kapı); kapı yoksa ya da okunamazsa ayarlı tavanın
   * `tavanAkisKat` katı (varsayılan 5) — sahte/yanlış algılanan akış tavanı sınırsız büyütemez.
   */
  _tavanUstu() {
    const kat = this._tavanTaban * (this.ayar.tavanAkisKat > 0 ? this.ayar.tavanAkisKat : 5);
    if (typeof this.ayar.kapiFn === 'function') {
      let k = null; try { k = this.ayar.kapiFn(); } catch { k = null; }
      const ust = k && Number.isFinite(+k.ustSinir) && +k.ustSinir > 0 ? +k.ustSinir : null;
      if (ust != null) return ust;
    }
    return kat;
  }

  _tavanArtir(t) {
    if (this.ayar.tavanAkis === false || !Number.isFinite(t) || t === 0) return null;
    const eski = this.ayar.sermayeTavani;
    let yeni = Math.max(this._tavanTaban, eski + t), sinirli = null;
    const ust = this._tavanUstu();
    if (yeni > ust) { sinirli = ust; yeni = Math.max(Math.min(eski, ust), ust); }
    if (yeni === eski) return { eski, yeni, sinirli };
    this._tavanAyarla(yeni);
    this.durum.tavanEk = yeni - this._tavanTaban;
    this.kaydet('WARN', `${this.adGorunen}: sermaye tavanı ${eski} → ${yeni} USDT (${t > 0 ? 'yatırma' : 'çekme'} ${t > 0 ? '+' : ''}${+t.toFixed(2)})${sinirli != null ? ` — onaylı üst sınır ${sinirli} USDT` : ''}`);
    return { eski, yeni, sinirli };
  }

  /**
   * 69.3 SÜRPRİZ SERMAYE AKIŞI — borsadaki yatırma / çekme / dış aktarımlar (her günlük çalışmada, mutabakattan hemen sonra).
   *   perp / spot (yalnız vadeli cüzdan): GET /fapi/v1/income incomeType=TRANSFER (USDT; vadeli cüzdana giren/çıkan)
   *   coklu (gerçek tasarım: spot BTC + vadeli): /sapi/v1/capital/deposit/hisrec (başarılı) + /capital/withdraw/history (tamamlanan),
   *                                            USDT 1:1, BTC × mark; diğer coinler yalnız uyarı. Botun kendi spot↔vadeli aktarımları sayılmaz.
   *   kâğıt: yok. İlk çalıştırmada taban zamanı yazılır — geçmiş aktarımlar "yeni para" sayılmaz.
   * Okunamazsa uyarı, çalışma DURMAZ (elle kayıt — "Para yatırdım/çektim" — her zaman mümkün).
   * @returns [{ anahtar, tutar, zaman, kaynak, not }]
   */
  async _dissalAkislar(simdi = Date.now()) {
    if (this.ayar.mod === 'kagit') return [];
    const a = this.durum.akis;
    if (!a || !Number.isFinite(a.taban)) { this.durum.akis = { taban: simdi, bilinen: [] }; this._yaz(); return []; }
    const b = this._b();
    const bilinen = new Set(a.bilinen || []);
    const bas = a.taban - 60000;
    const out = [];
    if (this.ayar.btcAyak === 'coklu') {
      if (typeof b.sapiGetCapitalDepositHisrec !== 'function') return [];
      const fiyat = await this._btcFiyat().catch(() => null);
      const deger = (coin, m) => (coin === 'USDT' ? m : coin === this.ayar.varlik && fiyat > 0 ? m * fiyat : null);
      const yat = await b.sapiGetCapitalDepositHisrec({ startTime: bas, status: 1 });
      for (const x of Array.isArray(yat) ? yat : []) {
        const k = `y:${x.id || x.txId}`, m = +x.amount, z = +x.insertTime;
        if (bilinen.has(k) || !(m > 0) || !(z >= bas)) continue;
        const v = deger(x.coin, m);
        if (v == null) { this.kaydet('WARN', `${this.adGorunen}: ${m} ${x.coin} yatırıldı — bot bu coini sermayeye saymaz`); bilinen.add(k); continue; }
        out.push({ anahtar: k, tutar: v, zaman: z, kaynak: 'yatirma', not: `${m} ${x.coin} yatırma`, spot: true });
      }
      if (typeof b.sapiGetCapitalWithdrawHistory === 'function') {
        const cek = await b.sapiGetCapitalWithdrawHistory({ startTime: bas, status: 6 });
        for (const x of Array.isArray(cek) ? cek : []) {
          const k = `c:${x.id}`, m = +x.amount + (+x.transactionFee || 0), z = Date.parse(x.completeTime || x.applyTime) || +x.applyTime;
          if (bilinen.has(k) || !(m > 0) || !(z >= bas)) continue;
          const v = deger(x.coin, m);
          if (v == null) { bilinen.add(k); continue; }
          out.push({ anahtar: k, tutar: -v, zaman: z, kaynak: 'cekme', not: `${m} ${x.coin} çekme` });
        }
      }
    } else {
      if (typeof b.fapiPrivateGetIncome !== 'function') return [];
      const l = await b.fapiPrivateGetIncome({ incomeType: 'TRANSFER', startTime: bas, limit: 1000 });
      for (const x of Array.isArray(l) ? l : []) {
        const k = `t:${x.tranId != null ? x.tranId : `${x.asset}:${x.time}`}`, m = +x.income, z = +x.time;
        if (bilinen.has(k) || !Number.isFinite(m) || m === 0 || !(z >= bas)) continue;
        if (x.asset && x.asset !== 'USDT') { bilinen.add(k); this.kaydet('WARN', `${this.adGorunen}: vadeli cüzdana ${m} ${x.asset} aktarıldı — bot USDT dışını sermayeye saymaz`); continue; }
        out.push({ anahtar: k, tutar: m, zaman: z, kaynak: m > 0 ? 'aktarim-giris' : 'aktarim-cikis', not: `vadeli cüzdan aktarımı ${m > 0 ? '+' : ''}${m} USDT` });
      }
    }
    for (const x of out) bilinen.add(x.anahtar);
    this.durum.akis = { taban: a.taban, bilinen: [...bilinen].slice(-500) };
    return out;
  }

  /** Algılanan akışları uygular (ölçüm tabanları + tavan) ve haber verir. Hata çalışmayı durdurmaz. */
  async _akisDenetle(simdi = Date.now()) {
    let l = [];
    try { l = await this._dissalAkislar(simdi); } catch (e) { this.kaydet('WARN', `${this.adGorunen}: borsadaki yatırma/çekme geçmişi okunamadı: ${e.message} — elle kayıt yapılabilir`); return []; }
    for (const x of l) {
      // 69.6 (güvenlik testi Y3): çoklu varlıkta spot cüzdana gelen yatırma özsermayede SAYILMAZ (yabancı bakiye) — kullanıcı
      // "Engeli kaldır" ile kabul edene kadar bekler; uygulansaydı kesici ve risk katmanı sahte kayıp görürdü. Bekleyen varken
      // gelen çekme önce bekleyenden düşülür.
      const bek = this.durum.akisBekleyen;
      if (x.spot && x.tutar > 0) {
        this.durum.akisBekleyen = { tutar: ((bek && bek.tutar) || 0) + x.tutar, notlar: [...((bek && bek.notlar) || []), x.not].slice(-20), zaman: simdi };
        await this._bildir('uyari', 'spot cüzdana para yatırıldı — kabul bekliyor', [`${x.not} (≈ +${x.tutar.toFixed(2)} USDT) spot cüzdanda; bot bunu henüz sermayeye saymıyor.`,
          'Sizin yatırmanızsa bot sayfasında "Engeli kaldır" ile kabul edin: o zaman ölçüm tabanları ve tavan güncellenir. Değilse inceleyin.'], { anahtar: `akis:${x.anahtar}` });
        continue;
      }
      if (x.tutar < 0 && bek && bek.tutar > 0) {
        const dus = Math.min(bek.tutar, -x.tutar);
        bek.tutar -= dus; x.tutar += dus;
        if (!(bek.tutar > 1e-9)) this.durum.akisBekleyen = null;
        if (!(Math.abs(x.tutar) > 1e-9)) continue;
      }
      this._sermayeUygula(x.tutar, `otomatik: ${x.not}`, simdi, `otomatik-${x.kaynak}`);
      const t = this._tavanArtir(x.tutar);
      const satir = [`${x.tutar > 0 ? 'Yatırma' : 'Çekme'} algılandı: ${x.not} (≈ ${x.tutar > 0 ? '+' : ''}${x.tutar.toFixed(2)} USDT).`,
        'Ölçüm tabanları kaydırıldı (sapma bandı, risk tepesi ve hesap kesicisi yanlış alarm vermez).',
        t ? `Sermaye tavanı ${t.eski} → ${t.yeni} USDT.${t.sinirli != null ? ` Onaylı üst sınır ${t.sinirli} USDT — fazlası kullanılmıyor; artırmak için onay dosyasını güncelleyin.` : ''}` : null,
        x.tutar > 0 ? 'Yeni para bu çalışmada hedefe göre dağıtılır.' : null];
      await this._bildir(t && t.sinirli != null ? 'uyari' : 'bilgi', x.tutar > 0 ? 'sermaye artışı algılandı' : 'sermaye çekişi algılandı', satir, { anahtar: `akis:${x.anahtar}` });
    }
    if (l.length) this._yaz();
    else if (this.durum.akis) this._yaz();
    return l;
  }

  /**
   * Elle para yatırma/çekme kaydı ("Para yatırdım/çektim"). 69.6 (güvenlik testi Y2): onay metni `KAYIT` ister; tutar sonlu ve
   * özsermayeyle sınırlı (yatırma ≤ 3 × referans, çekme ≤ referans; referans = son ölçülen özsermaye, yoksa tavan); büyük kayıt
   * (> referansın %20'si) borsadaki özsermayede GÖRÜNMELİ (son özsermaye + tutar ± %30 referans) — görünmeyen yatırma/çekme
   * risk ve kesici tabanlarını kaydırmaz. Yanlış kayıt kesiciyi kör edemesin, sahte K3 yaptıramasın.
   */
  async sermayeDegisikligi(tutar, not = null, { simdi = Date.now(), onay = null } = {}) {
    const t = +tutar;
    if (!Number.isFinite(t) || t === 0) throw new Error('tutar sıfırdan farklı bir sayı olmalı (+ yatırma, − çekme, USDT)');
    if (this.ayar.mod === 'kagit') throw new Error('kâğıt modda para yatırma/çekme kaydı yok');
    if (this._calisma) throw new Error('bir çalışma sürüyor — bitince yeniden deneyin');
    if (String(onay || '').trim().toLocaleUpperCase('tr-TR') !== 'KAYIT') throw new Error('onay eksik: kaydı onaylamak için KAYIT yazın');
    const son = Number.isFinite(this.durum.sonOzsermaye) ? this.durum.sonOzsermaye : null;
    const ref = son > 0 ? son : (this.ayar.sermayeTavani || 0);
    if (!(ref > 0)) throw new Error('özsermaye henüz ölçülmedi — önce bir günlük çalışma gerekir');
    if (t > 3 * ref) throw new Error(`yatırma tutarı ${t} USDT çok büyük (en çok ${(3 * ref).toFixed(0)} = 3 × özsermaye) — tutarı denetleyin`);
    if (-t > ref) throw new Error(`çekme tutarı ${-t} USDT özsermayeden büyük (${ref.toFixed(0)} USDT)`);
    if (Math.abs(t) > 0.2 * ref) {
      let E = null;
      try { E = this.y && this.y.borsa ? await this._ozsermaye() : null; } catch { E = null; }
      if (!Number.isFinite(E) || son == null) throw new Error(`büyük kayıt (${t} USDT) borsadaki özsermayeyle doğrulanamadı — botu borsaya bağlayıp yeniden deneyin`);
      if (Math.abs(E - son - t) > 0.3 * ref) throw new Error(`kayıt borsada görünmüyor: son özsermaye ${son.toFixed(2)} + ${t} ≠ şu anki ${E.toFixed(2)} USDT — para henüz geçmediyse sonra deneyin (otomatik algılama zaten kaydeder)`);
    }
    const k = this._sermayeUygula(t, not, simdi);
    this._tavanArtir(t);
    this._yaz();
    return k;
  }

  /** 69.3: yatırma/çekme ölçüm tabanlarına uygulanır (elle kayıt ve otomatik algılama ortak). Çalışma içinden de çağrılır. */
  _sermayeUygula(t, not = null, simdi = Date.now(), kaynak = 'elle') {
    const once = { sonOzsermaye: this.durum.sonOzsermaye, kesici: this.durum.kesiciTaban ? { ...this.durum.kesiciTaban } : null };
    if (this.durum.sonOzsermaye != null) {
      this.durum.sonOzsermaye += t;
      this.durum.sonOzsermayeCap = Math.min(this.durum.sonOzsermaye, this.ayar.sermayeTavani);
    }
    const kt = this.durum.kesiciTaban;
    if (kt) {
      kt.hesap = (kt.hesap != null ? kt.hesap : kt.deger) + t;
      kt.deger = Math.max(0, Math.min(kt.deger + Math.min(t, 0) + Math.max(0, Math.min(t, this.ayar.sermayeTavani - kt.deger)), this.ayar.sermayeTavani));
      // 69.6 (Y2b): taban sıfıra indiyse kesici kör kalmasın — sonraki denetimde yeniden ölçülür.
      if (!(kt.deger > 0)) this.durum.kesiciTaban = null;
    }
    let risk = null;
    if (this.kol.riskDosya) {
      const RDm = require('../risk/durum');
      const r = RDm.yukle(this.kol.riskDosya);
      for (const k of ['hwm', 'ozsermaye', 'gunBasi', 'haftaBasi', 'ayBasi']) if (Number.isFinite(r[k])) r[k] = Math.max(0, r[k] + t);
      RDm.kaydet(r, this.kol.riskDosya);
      risk = { hwm: r.hwm };
    }
    const kt2 = this.durum.kesiciTaban;
    const kayit = { zaman: simdi, gun: gunStr(simdi), tutar: t, kaynak, not: not ? String(not).slice(0, 200) : null, once, sonra: { sonOzsermaye: this.durum.sonOzsermaye, kesici: kt2 ? { ...kt2 } : null, risk } };
    this.durum.sermayeAkislari = [...(this.durum.sermayeAkislari || []), kayit].slice(-100);
    if (t > 0) this.durum.sermayeDengesiBekliyor = true;   // 69.3: yatırılan para BTC ayağına ay başını beklemeden dağıtılır
    this._yaz();
    this.kaydet('WARN', `${this.adGorunen}: ${t > 0 ? 'para yatırma' : 'para çekme'} kaydı ${t > 0 ? '+' : ''}${t} USDT — ölçüm tabanları kaydırıldı${not ? ` (${kayit.not})` : ''}`);
    return kayit;
  }

  /**
   * 69.1 ÖZ DENETİM (lib/ozDenetim.js, PLAN-OZ-DENETIM.md). Öz denetim demo kipindeki bota (demo kabul) bunları ÇAĞIRMAZ.
   * GÜVENLİ KİP: günlük çalışma yapılmaz (yeni işlem yok); dakikalık koruma/marj denetimi sürer. Sebep geçince öz denetim kaldırır.
   * engelKoy: TAM KAPANMA = mevcut ENGEL (diske yazılır, yalnız "Engeli kaldır").
   */
  guvenliKipKoy(kaynak, metin, simdi = Date.now()) {
    if (this.durum.guvenliKip) return false;
    this.durum.guvenliKip = { kaynak: String(kaynak), metin: String(metin).slice(0, 300), zaman: simdi };
    this._yaz();
    if (this.y && typeof this.y.azaltmaKoy === 'function') this.y.azaltmaKoy(this.durum.guvenliKip.metin);   // 69.5
    this._engelOlay('guvenli-kip', kaynak, metin);
    this.kaydet('WARN', `${this.adGorunen}: GÜVENLİ KİP — ${metin} (yeni işlem açılmaz, stoplar korunur)`);
    return true;
  }

  /** @param kaynak verilirse yalnız o kaynağın koyduğu güvenli kip kalkar (öz denetim); verilmezse her türlüsü (kullanıcı). */
  guvenliKipKaldir(kaynak = null) {
    const g = this.durum.guvenliKip;
    if (!g || (kaynak && g.kaynak !== kaynak)) return null;
    this.durum.guvenliKip = null; this._yaz();
    if (this.y && typeof this.y.azaltmaKaldir === 'function') this.y.azaltmaKaldir();   // 69.5
    this._engelOlay('guvenli-kip-kalkti', kaynak || 'elle', g.metin);
    this.kaydet('INFO', `${this.adGorunen}: güvenli kip kalktı (${kaynak ? 'öz denetim' : 'elle'}: ${g.metin})`);
    return g;
  }

  engelKoy(kaynak, metin) {
    if (this.durum.engel) return false;
    this.durum.engel = String(metin).slice(0, 400);
    this._yaz();
    this._engelOlay('engel', kaynak, this.durum.engel);
    this.kaydet('ERROR', `${this.adGorunen}: ENGEL — ${this.durum.engel}`);
    return true;
  }

  /**
   * 69.3 ZORLA KAPANANLAR — Binance GET /fapi/v1/forceOrders (yalnız okuma): ADL (otomatik pozisyon azaltma) ve likidasyon emirleri.
   * Kâğıt borsada yok → null. @returns null | [{ id, symbol, tur: 'ADL'|'LIQUIDATION', side, miktar, fiyat, zaman }]
   */
  async zorlaKapananlar(basMs) {
    const b = this._b();
    if (!b || b.kagit || typeof b.fapiPrivateGetForceOrders !== 'function') return null;
    const l = await b.fapiPrivateGetForceOrders({ startTime: Math.floor(basMs), limit: 100 });
    return (Array.isArray(l) ? l : []).map(x => ({ id: String(x.orderId || x.clientOrderId || `${x.symbol}:${x.updateTime || x.time}`), symbol: x.symbol,
      tur: x.autoCloseType || (/^adl/i.test(String(x.clientOrderId || '')) ? 'ADL' : 'LIQUIDATION'), side: x.side, miktar: +x.executedQty || +x.origQty || 0,
      fiyat: +x.avgPrice || +x.price || 0, zaman: +x.updateTime || +x.time || null }));
  }

  /** Son `pencereMs` içindeki dakikalık döngü istisnaları. */
  tikHatalari(simdi = Date.now(), pencereMs = 30 * 60000) { return this._tikHatalari.filter(x => simdi - x.zaman < pencereMs); }

  engelKaldir() {
    const eski = this.durum.engel;
    this.durum.engel = null; this.durum.sonBant = null; this._yaz();
    if (this.y && typeof this.y.frenKaldir === 'function') this.y.frenKaldir();   // 69.3 emir freni
    if (this.cv) this.cv.bekleneniSifirla();   // çoklu varlık: borsadaki vadeli BTC yeni taban (sonraki mutabakat okur)
    // 69.6: kabul bekleyen spot yatırma artık botun kalıntısı (bekleneniSifirla spot bakiyeyi kabul etti) → ölçüm tabanlarına işlenir.
    const bek = this.durum.akisBekleyen;
    if (bek && bek.tutar > 0) {
      this.durum.akisBekleyen = null;
      this._sermayeUygula(bek.tutar, `kabul: ${(bek.notlar || []).join(', ')}`.slice(0, 200), Date.now(), 'kabul-yatirma');
      this._tavanArtir(bek.tutar);
      this._yaz();
    }
    if (eski) { this.kaydet('WARN', `${this.adGorunen}: ENGEL elle kaldırıldı (${eski})`); this._engelOlay('engel-kaldir', 'elle', eski); }
    return eski;
  }

  _hata(metin, simdi = Date.now()) {
    this.kaydet('ERROR', `${this.adGorunen}: ${metin}`);
    this._kalp({ zaman: simdi, hata: metin });
    return this._bildir('alarm', 'günlük çalışma yapılamadı', [metin], { anahtar: `hata:${metin.slice(0, 60)}` });
  }

  /**
   * Zamanlanmış günlük çalışma: önce GÜNLÜK MUTABAKAT (yürütücü + kol, kâğıt ve demo),
   * uyuşmazlıkta ENGEL + alarm; sonra yalnız bugünkü hedef.
   */
  async _gunlukCalisma(simdi = Date.now()) {
    if (this.durum.engel) { await this._hata(`ENGELLİ: ${this.durum.engel}`, simdi); return { engel: this.durum.engel }; }
    if (this.durum.guvenliKip) { await this._hata(`GÜVENLİ KİP: ${this.durum.guvenliKip.metin} — yeni işlem açılmadı`, simdi); return { engel: `güvenli kip: ${this.durum.guvenliKip.metin}`, guvenliKip: true }; }
    // C1 denetim #2: gerçek parada kapı (G1–G9 onayı, tavan, anahtar, healthchecks…) her günlük çalışmada yeniden denetlenir.
    // Kapalıysa çalışma YAPILMAZ (risk artıran emir yok) + alarm; acil durdurma ve borsadaki felaket stopları etkilenmez.
    if (typeof this.ayar.kapiFn === 'function') {
      let k; try { k = this.ayar.kapiFn(); } catch (e) { k = { izin: false, eksikler: [{ metin: `kapı okunamadı: ${e.message}` }] }; }
      // 69.6 (O3): çalışma anındaki tavan onaylı üst sınırı aşıyorsa (dosya kurcalama, eski kayıt) sınıra çekilir.
      if (k && Number.isFinite(+k.ustSinir) && +k.ustSinir > 0 && this.ayar.sermayeTavani > +k.ustSinir) {
        this.kaydet('WARN', `${this.adGorunen}: sermaye tavanı ${this.ayar.sermayeTavani} > onaylı üst sınır ${k.ustSinir} — sınıra çekildi`);
        this._tavanAyarla(+k.ustSinir); this.durum.tavanEk = +k.ustSinir - this._tavanTaban; this._yaz();
      }
      if (!k || !k.izin) {
        const metin = `gerçek para kapısı KAPANDI — günlük çalışma yapılmadı: ${((k && k.eksikler) || []).map(e => e.metin).join(' · ')}`;
        await this._hata(metin, simdi);
        return { engel: metin, kapi: true };
      }
    }
    const ym = await this.y.mutabakat();
    if (this.y.durum === 'AKTIF') await this._akisDenetle(simdi);   // 69.3 sürpriz yatırma/çekme
    // Çoklu varlık: mod kapalıysa (ilk geçiş / elle kapatıldı) mutabakattan ÖNCE açmayı dene — açılamazsa mutabakat ENGEL yazar.
    // Canlıda mod OTOMATİK AÇILMAZ (kullanıcı elle açar — BINANCE-BAGLANTI.md §2c).
    if (this.cv && this.cv.ayar.modOtomatikAc && this.y.ortam !== 'live' && this.y.durum === 'AKTIF') {
      try { await this.cv.modAc(); } catch (e) { this.kaydet('WARN', `çoklu varlık modu hazırlanamadı: ${e.message}`); }
    }
    if (this.y.durum === 'DURDURULDU' && (this.y.durmaTuru === 'GERI_CEKILME' || this.y.durmaTuru === 'BELIRSIZ')) {
      // Geri çekilme / belirsiz sonuç: kol mutabakatı ENGEL yazmaz (istek de atamaz); yürütücü süre bitince kendisi
      // mutabakat yapar (_tik), günlük çalışma 15 dk sonra yeniden denenir (F2).
      const metin = `yürütücü DURDURULDU [${this.y.durmaTuru}] — otomatik mutabakat bekleniyor: ${this.y.durmaSebebi}`;
      this._mutabakatKaydi('gunluk', { engel: metin }, ym, { ertelendi: true });
      await this._hata(metin, simdi);
      return { engel: metin, ertelendi: true };
    }
    const m = await this._mutabakat('gunluk', ym);
    if (m.engel) { await this._hata(`mutabakat: ${m.engel}`, simdi); return { engel: m.engel }; }
    // 69.6 (Y3): hesap kesicisi mutabakattan SONRA — spotta kabul edilmemiş (yabancı) bakiye varken mutabakat ENGEL verir, kesici
    // sahte kayıpla acil durdurma yapmaz. Saatlik kesici denetimi (_tik) aynen sürer.
    if (this.ayar.hesapKesicisi && this.y.durum === 'AKTIF') {
      const k = await this.kesiciDenetle(simdi);
      if (k && k.seviye === 'acil') { await this._kesiciAcil(k, true); return { engel: this.durum.engel }; }
    }
    return this._calistir({ simdi });
  }

  // ── Zamanlama (kalkanBot ile aynı örüntü; kolun kendi zamanlayıcısı ÇALIŞMAZ) ──
  async _tik(simdi = Date.now()) {
    if (!this.durum.calisiyor || !this.y.borsa || this.mesgul) return;
    this.mesgul = true;
    this._mesgulBas = simdi;
    let rid = null, gunluk = false;
    try {
      if (this.y.durum === 'DURDURULDU') await this._otomatikCikis();
      if (this.y.durum === 'AKTIF') {
        if (typeof this.y.borsa.tikle === 'function') await this.y.borsa.tikle(simdi);
        const s = await this.kol.dca.senkron();
        const sh = s.hatalar.filter(h => !/AZALTMA/.test(h));   // 69.5: güvenli kip reddi yürütücüde saatte bir yazılır
        if (sh.length) this.kaydet('WARN', `DCA senkron: ${sh.join(' · ')}`);
        // Geri çekilmede (418/429) koruma denetimi ve marj okuması hiç denenmez — süre bitince ilk tik yapar (F2).
        if (!this._geriCekilmede()) {
          if (this.koruma.aktif() && this.koruma.denetimZamani(simdi)) {
            try { this._korumaKaydi('denetim', await this.koruma.denetle(simdi), simdi); } catch (e) { this.kaydet('WARN', `Felaket stopu denetimi okunamadı: ${e.message}`); }
          }
          if (!this.durum.sonMarj || simdi - this.durum.sonMarj.zaman >= 3600e3) await this.marjDenetle(simdi);
          if (this.ayar.hesapKesicisi && (!this._sonKesici || simdi - this._sonKesici >= 3600e3)) {
            this._sonKesici = simdi;
            try {
              const k = await this.kesiciDenetle(simdi);
              if (k && k.seviye === 'acil') { await this._kesiciAcil(k, false); return; }
            } catch (e) { this.kaydet('WARN', `Hesap kesicisi okunamadı: ${e.message}`); }
          }
        }
      }
      const dun = gunStr(simdi - GUN);
      const zamani = this.durum.sonGun !== dun && simdi % GUN >= 2 * 60000;
      if (zamani && simdi - this._sonDeneme >= 15 * 60000) {       // başarısız denemeden sonra 15 dk bekle
        this._sonDeneme = simdi;
        gunluk = true;
        rid = this.saglik ? crypto.randomUUID() : null;
        this._saglik('start', null, rid);
        const r = await this.gunlukCalisma(simdi);
        const hatalar = BindirmeBot.raporHatalari(r);
        if (!r) this._saglik('fail', 'çalışma sonuç döndürmedi', rid);
        else if (r.engel) this._saglik('fail', `ENGEL: ${r.engel}`, rid);
        else if (hatalar.length) this._saglik('fail', `çalışmada hata: ${hatalar.join(' · ')}`, rid);
        else this._saglik('basari', null, rid);                    // başarı = gövdesiz GET
      }
    } catch (e) {
      // Yalnız GÜNLÜK ÇALIŞMA hatası fail ping'i alır; dakikalık DCA senkron hatası almaz (her dakika fail atmasın).
      if (gunluk) this._saglik('fail', `hata: ${e.message}`, rid);
      this._tikHatalari.push({ zaman: simdi, metin: String(e && e.message).slice(0, 200) });
      if (this._tikHatalari.length > 20) this._tikHatalari.splice(0, this._tikHatalari.length - 20);
      await this._hata(e.message, simdi);
    }
    finally { this.mesgul = false; }
  }

  /**
   * DURDURULDU'dan otomatik çıkış (F2): yürütücü geri çekilme/belirsiz kaynaklı durduysa ve süre bittiyse
   * kendisi mutabakat yapar (`y.otomatikCikis`). AKTIF'e dönünce: kolun yalnız yürütücü durumundan doğan
   * ENGEL'i kol mutabakatıyla yeniden değerlendirilir + Telegram bilgi. Otomatik deneme çözemez ve durdurma
   * ELLE türüne geçerse alarm. Elle müdahale gerektiren durdurmalarda (acil, çözülemeyen emir) hiçbir şey yapmaz.
   */
  async _otomatikCikis() {
    if (typeof this.y.otomatikCikis !== 'function') return null;
    let r;
    try { r = await this.y.otomatikCikis(); } catch (e) { this.kaydet('WARN', `Otomatik mutabakat yapılamadı: ${e.message}`); return null; }
    if (!r) return null;
    if (this.y.durum === 'AKTIF') {
      let kolNot = null;
      if (this.kol.durum.engel && /^yürütücü /.test(this.kol.durum.engel)) {
        try { const m = await this.kol.mutabakat(); kolNot = m.engel ? `kol ENGEL sürüyor: ${m.engel}` : 'kol mutabakatı temiz (yürütücü kaynaklı ENGEL kalktı)'; } catch (e) { kolNot = `kol mutabakatı yapılamadı: ${e.message}`; }
      }
      this.kaydet('SUCCESS', `${this.adGorunen}: yürütücü otomatik mutabakatla AKTIF (önceki [${r.onceki.tur}]: ${r.onceki.sebep})`);
      await this._bildir('bilgi', 'yürütücü otomatik olarak AKTIF', [`Önceki durdurma [${r.onceki.tur}]: ${r.onceki.sebep}`,
        'Geri çekilme bitti / belirsizlik çözüldü — otomatik mutabakat temiz.', kolNot]);
    } else if (this.y.durmaTuru === 'ELLE') {
      await this._bildir('alarm', 'yürütücü DURDURULDU — elle müdahale gerekli', [`Otomatik mutabakat çözemedi: ${this.y.durmaSebebi}`,
        'Panelden mutabakat ya da inceleme gerekir; bot yeni emir vermiyor.'], { anahtar: `oto-cikis-elle:${this.ayar.ad}` });
    }
    return r;
  }

  baslat() {
    this._ayakGerekli();
    this.durum.calisiyor = true; this._yaz();
    if (!this.zamanlayici) this.zamanlayici = setInterval(() => this._tik(), 60000);
    this.kaydet('INFO', `${this.adGorunen} botu başlatıldı (${this.ayar.mod === 'demo' ? 'DEMO hesap' : this.ayar.mod === 'canli' ? 'GERÇEK PARA' : 'kâğıt'} · sermaye tavanı ${this.ayar.sermayeTavani} USDT · BTC payı %${this.ayar.btcPay * 100}${this.ayar.btcAyak === 'perp' ? ' (perp LONG — demo yaklaşımı)' : this.ayar.btcAyak === 'coklu' ? ' (çoklu varlık: spot BTC vadeli teminat — gerçek tasarım)' : ''} · kol ×${this.ayar.kolCarpani})`);
  }

  durdur() {
    this.durum.calisiyor = false; this._yaz();
    if (this.zamanlayici) { clearInterval(this.zamanlayici); this.zamanlayici = null; }
    this.kaydet('INFO', `${this.adGorunen} botu durduruldu (pozisyon, emir ve BTC KAPATILMADI — gerekirse acil durdurma)`);
  }

  /**
   * ACİL (Y1, 61.7): süren günlük çalışmayla YARIŞMAZ. Önce yürütücü hemen DURDURULDU (süren çalışmanın pozisyon büyüten
   * emirleri kapıda kalır), BTC ayağı iptal bayrağına bakar; süren çalışma bitene kadar (en çok ACIL_BEKLEME_MS) beklenir,
   * SONRA pozisyonlar okunup kapatılır — acil pozisyonları okuduktan sonra dolan bir emir korumasız pozisyon bırakmaz.
   */
  async acilDurdur(sebep = 'kullanıcı') {
    this._acilIstek = true;
    try {
      if (this.cv) this.cv.iptalEt();
      if (this.y.borsa && typeof this.y._durdur === 'function') this.y._durdur(`acil durdurma (${sebep})`, 'ELLE', true);
      if (this._calisma) {
        const bekle = this._calisma.catch(() => null);
        const zaman = new Promise(r => setTimeout(() => r('zaman'), BindirmeBot.ACIL_BEKLEME_MS));
        if (await Promise.race([bekle, zaman]) === 'zaman') this.kaydet('WARN', `${this.adGorunen}: acil durdurma süren çalışmayı ${BindirmeBot.ACIL_BEKLEME_MS / 1000} sn bekledi, bitmedi — yine de uygulanıyor`);
      }
      return await this._acilDurdur(sebep);
    } finally { this._acilIstek = false; }
  }

  /** ACİL: kol acil durdurması (emir iptal + TÜM pozisyonlar piyasadan — perp BTC ayağı dahil) + spot BTC satılır. */
  async _acilDurdur(sebep = 'kullanıcı') {
    if (this.cv) this.cv.iptalEt();     // süren çoklu varlık alımının risk artıran sonraki adımı yapılmasın (acil nesli)
    this.durdur();
    // Önce felaket stopları: closePosition emri borsada kalırsa sonradan açılan pozisyonu kapatır.
    // Acil kapsamı: 429 geri çekilmesinde de stop iptali denenir (kesin 418 ban'da istek yok — rapor söyler).
    const iptalEt = () => this.koruma.hepsiniIptal();
    const koruma = await (typeof this.y.acilIstekleri === 'function' ? this.y.acilIstekleri(iptalEt) : iptalEt()).catch(e => ({ iptal: 0, hatalar: [e.message] }));
    const rapor = await this.kol.acilDurdur(sebep);
    rapor.koruma = koruma;
    if (koruma.hatalar.length) rapor.hatalar = [...(rapor.hatalar || []), ...koruma.hatalar.map(h => `felaket stopu ${h}`)];
    rapor.btc = null;
    if (this.ayar.btcAyak === 'perp') {
      const q = this.btSanal()[this.btcSembol] || 0;
      this.durum.btDuzeltme = +((this.durum.btDuzeltme || 0) - q).toFixed(12);   // pozisyon yürütücünün acil kapanışında kapandı
      rapor.btc = { perpKapatilan: q };
    } else if (this.ayar.btcAyak === 'coklu') {
      try {
        // Kol pozisyonları kapanamadıysa BTC teminatı ÇEKİLMEZ (teminatsız kalan pozisyon likide olur) — elle müdahale.
        const acilOku = (fn) => (typeof this.y.acilIstekleri === 'function' ? this.y.acilIstekleri(fn) : fn());
        const kalanPoz = (await acilOku(() => this._b().fetchPositions())).filter(p => Math.abs(+p.contracts || 0) > 0);
        if (kalanPoz.length) throw new Error(`kol pozisyonları kapanmadı (${kalanPoz.map(p => p.symbol.split('/')[0]).join(', ')}) — BTC teminatı çekilmedi; Binance'te pozisyonları elle kapatıp acili yeniden çalıştırın`);
        const r = await (typeof this.y.acilIstekleri === 'function' ? this.y.acilIstekleri(() => this.cv.acilSat(`acil (${sebep})`)) : this.cv.acilSat(`acil (${sebep})`));
        rapor.btc = { satilan: r.miktar, fiyat: r.fiyat, toz: r.toz, dilim: r.dilim, hata: r.hata || null };
        if (r.miktar > 0) this.durum.btcIslemler = [...(this.durum.btcIslemler || []), { zaman: Date.now(), gun: gunStr(Date.now()), yon: 'satım', miktar: r.miktar, fiyat: r.fiyat, ucret: r.ucretUsdt, sebep: `acil (${sebep})`, ayak: 'coklu' }].slice(-200);
        if (r.hata) (rapor.hatalar = rapor.hatalar || []).push(`BTC (çoklu varlık) satışı: ${r.hata}`);
      } catch (e) { (rapor.hatalar = rapor.hatalar || []).push(`BTC satışı: ${e.message}`); }
    } else {
      try {
        // Acil kapsamı (denetim F1+F2): bakiye okuması da 429'da muaf — yoksa acil çıkış BTC'yi satamıyordu.
        const q = await (typeof this.y.acilIstekleri === 'function' ? this.y.acilIstekleri(() => this.btcMiktari()) : this.btcMiktari());
        if (q > 0) {
          const o = await this.y.borsa.spotEmir(this.ayar.varlik, 'sell', q, { clientOrderId: `bd${this.ayar.ad.slice(0, 2)}_acil_${Date.now().toString(36)}` });
          rapor.btc = { satilan: o.amount, fiyat: o.average };
          this.durum.btcIslemler = [...(this.durum.btcIslemler || []), { zaman: Date.now(), gun: gunStr(Date.now()), yon: 'satım', miktar: o.amount, fiyat: o.average, ucret: o.ucret, sebep: `acil (${sebep})` }].slice(-200);
        }
      } catch (e) { (rapor.hatalar = rapor.hatalar || []).push(`BTC satışı: ${e.message}`); }
    }
    this.durum.sonW = null;
    this._yaz();
    this.islemGecmisiGuncelle();
    this._kalp({ zaman: Date.now(), sonKarar: `acil durdurma (${sebep})`, hata: null });
    this._kayitEkle('alarmlar.jsonl', { olay: 'acil-durdurma', sebep: String(sebep), iptal: rapor.iptal, kapatilan: (rapor.kapatilan || []).length, hatalar: rapor.hatalar || [] });
    await this._bildir('alarm', 'ACİL DURDURMA', [`sebep: ${sebep}`, `${rapor.iptal} emir iptal, ${rapor.kapatilan.length} pozisyon kapatma emri${(rapor.hatalar || []).length ? ` · hatalar: ${rapor.hatalar.join('; ')}` : ''}`], { anahtar: `acil:${Date.now()}` });
    return rapor;
  }

  /**
   * ACİL DURDURMAYI DENE: uzak (dolmayacak) küçük bir limit alış koyar, acil durdurmayı koşar,
   * sonra borsada bizim açık emir ve pozisyon kalmadığını doğrular; ardından mutabakat.
   * Bot çalışırken yapılmaz. Elle verilmiş (yabancı) emirlere dokunulmaz — sayılır.
   */
  async _acilDene() {
    if (this.durum.calisiyor) throw new Error('önce botu durdurun (acil deneme çalışan botta yapılmaz)');
    if (!this.y.borsa) throw new Error('borsaya bağlı değil');
    if (this.y.durum !== 'AKTIF') await this.y.mutabakat();
    const borsa = this._b();
    const say = async () => {
      const [emirler, poz] = await Promise.all([borsa.fetchOpenOrders(), borsa.fetchPositions()]);
      const bizim = emirler.filter(o => typeof o.clientOrderId === 'string' && o.clientOrderId.startsWith('ag-'));
      return { bizimEmir: bizim.length, yabanciEmir: emirler.length - bizim.length, pozisyon: poz.filter(p => Math.abs(+p.contracts || 0) > 0).length };
    };
    const mk = borsa.markets[this.btcSembol];
    const mark = await this._btcFiyat();
    const adim = (mk && mk.precision && mk.precision.amount) || 0.001;
    const minN = Math.max(this.ayar.minNominal, (mk && mk.limits && mk.limits.cost && mk.limits.cost.min) || 0) * 1.1;
    const fiyat = mark * 0.97;                                    // PERCENT_PRICE bandı (±%5) içinde, dolmaz
    const miktar = Math.ceil(minN / fiyat / adim) * adim;
    const deneme = await this.y.emirGonder({ symbol: this.btcSembol, side: 'buy', type: 'limit', amount: +miktar.toFixed(10), price: fiyat, bot: 'ad', neden: 'acil durdurma denemesi (uzak limit)' });
    const once = await say();
    const rapor = await this._acilDurdur('deneme');
    const sonra = await say();
    await this.y.mutabakat();
    const mt = await this._mutabakat('acil-deneme');
    const basarili = deneme.basarili && once.bizimEmir >= 1 && sonra.bizimEmir === 0 && sonra.pozisyon === 0 && !mt.engel;
    const sonuc = { basarili, deneme: { basarili: deneme.basarili, sebep: deneme.sebep || null, miktar, fiyat }, once, sonra, rapor, mutabakat: mt.engel || 'temiz', yurutucu: this.y.durum };
    this.kaydet(basarili ? 'SUCCESS' : 'ERROR', `${this.adGorunen}: acil durdurma denemesi ${basarili ? 'BAŞARILI' : 'BAŞARISIZ'} (önce ${once.bizimEmir} emir / ${once.pozisyon} pozisyon → sonra ${sonra.bizimEmir} / ${sonra.pozisyon})`);
    this.durum.sonAcilDeneme = { zaman: Date.now(), basarili, once, sonra };
    this._yaz();
    this._kayitEkle('alarmlar.jsonl', { olay: 'acil-deneme', basarili, once, sonra, mutabakat: mt.engel || 'temiz', denemeSebep: deneme.sebep || null });   // §8.2 #8
    return sonuc;
  }

  /** Panel kartı için (ağ çağrısı yok). */
  ozet(simdi = Date.now()) {
    const r = this.durum.sonRapor;
    const tanim = STRATEJILER[this.ayar.ad] || {};
    const kalp = I.kalpOku(this.ayar.dizin);
    let model = null;
    if (this.ayar.golgeDosya) { try { model = I.golgeModelDurumu(I.golgeOku(this.ayar.golgeDosya), this.ayar.ad); } catch { model = null; } }
    return {
      ad: this.ayar.ad, adGorunen: this.adGorunen, aciklama: tanim.aciklama || null, kayit: tanim.kayit || null,
      mod: this.ayar.mod, btcAyak: this.ayar.btcAyak, demoNot: this.ayar.btcAyak === 'perp' ? DEMO_NOT : null,
      kesici: this.ayar.hesapKesicisi ? { ...this.ayar.hesapKesicisi, taban: this.durum.kesiciTaban || null } : null,   // Ö6 (panel kartı)
      btcPay: this.ayar.btcPay, kolCarpani: this.ayar.kolCarpani, sermayeTavani: this.ayar.sermayeTavani,
      calisiyor: this.durum.calisiyor, sonGun: this.durum.sonGun, sonW: this.durum.sonW,
      engel: this.durum.engel || this.kol.durum.engel, bindirmeEngel: this.durum.engel, kolEngel: this.kol.durum.engel, guvenliKip: this.durum.guvenliKip || null,
      tavanTaban: this._tavanTaban, tavanEk: this.durum.tavanEk || 0, akisBekleyen: this.durum.akisBekleyen || null, sonAkislar: (this.durum.sermayeAkislari || []).slice(-5), fren: this.y && this.y.fren ? this.y.fren : null,
      ortam: this.y.ortam, yurutucu: this.y.borsa ? this.y.durum : 'BAGLI_DEGIL',
      rejim: r ? r.rejim : (this.durum.sonKuru ? this.durum.sonKuru.rejim : null),
      sonKarar: r ? { gun: r.gun, zaman: r.zaman, btc: r.btc, ozsermaye: r.ozsermaye, kolPay: r.kol.agirlik, risk: r.kol.risk && { kill: r.kol.risk.kill, K1: r.kol.risk.K1, K3: r.kol.risk.K3, kararSayisi: (r.kol.risk.kararlar || []).length } } : null,
      sonKuru: this.durum.sonKuru ? { zaman: this.durum.sonKuru.zaman, rejim: this.durum.sonKuru.rejim, btc: this.durum.sonKuru.btc, kolPay: this.durum.sonKuru.kol.agirlik } : null,
      sapmaGecmisi: (this.durum.sapmaGecmisi || []).slice(-30),
      btcIslemler: (this.durum.btcIslemler || []).slice(-20),
      esikler: this.esikler,
      kalp, kalpDurumu: I.kalpDurumu(kalp, simdi),
      telegram: this.bildirici ? this.bildirici.durum() : { bagli: false, neden: 'Telegram bağlı değil' },
      uygulama: I.uygulamaOzeti(this.durum.golgeFarklar || []), golgeFarklar: (this.durum.golgeFarklar || []).slice(-10),
      golgeBekleyen: (this.durum.golgeBekleyen || []).length, golgeAtilan: this.durum.golgeAtilan || 0,
      kucukSermaye: r && r.kucukSermaye ? r.kucukSermaye : { secim: this.ayar.kucukSermaye ?? 'oto', etkin: null, esik: 5000, not: KUCUK_NOT },
      model, telafiGecmisi: (this.durum.telafiGecmisi || []).slice(-10), asgariNominal: this.durum.asgariNominal,
      sonAcilDeneme: this.durum.sonAcilDeneme || null,
      koruma: this.koruma.ozet(), marj: this.durum.sonMarj || null, cokluVarlik: this.cv ? this.cv.ozet() : null,
      kol: { evren: this.kol.evren.ozet(), donchianSanal: this.kol.donSanal(), dca: this.kol.dca.ozet(), btcAyakSanal: this.ayar.btcAyak === 'perp' ? this.btSanal() : null },
    };
  }
}

/** Y1: acil durdurmanın süren günlük çalışmayı en çok bekleyeceği süre. */
BindirmeBot.ACIL_BEKLEME_MS = 30000;
/** O5: bir işlem bu süreden uzun sürerse bekçi "takıldı" alarmı verir. */
BindirmeBot.TAKILMA_MS = 30 * 60000;

module.exports = { BindirmeBot, DEMO_NOT };
