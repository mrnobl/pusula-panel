/**
 * İŞLEM GEÇMİŞİ — portföy botunun (Hücum / Denge) verdiği ve DOLAN emirlerinin kalıcı kaydı.
 *
 * Dosya `data/live/<bot>/islemler.jsonl` — YALNIZ EKLENİR (append-only), satır değiştirilmez.
 * Her satırın tekil bir `anahtar`ı vardır; aynı anahtar ikinci kez yazılmaz (idempotent).
 *
 * Üç kaynak:
 *   · `dolum`  (kaynak 'defter') — yürütücü defterindeki emirlerin dolan miktar ARTIŞLARI
 *     (emirler.jsonl). Kol (BTC ayağı / Donchian / DCA) bot etiketinden, sebep emirle birlikte
 *     yazılan `neden` alanından ("BTC ayağı — LONG AÇ (rejim girişi)", "DCA SO2", "DCA TP"...).
 *   · `dolum`  (kaynak 'spot')   — kâğıt modda spot BTC ayağı (durum.btcIslemler).
 *   · `borsa`  — borsanın `fetchMyTrades` kayıtları (gerçek dolum fiyatı + ücret). MUTABAKAT:
 *     görünümde bir emrin borsa işlemi varsa defterden türetilen satırın YERİNE onlar gösterilir;
 *     defterin dolan miktarı ile borsa işlemlerinin toplamı tutmazsa satır `fark` ile işaretlenir.
 *
 * Borsa çağrısı ORAN SINIRI için seyrek: `borsaMutabakat` en çok `enAzAralikMs`'de bir (5 dk).
 */
const fs = require('fs');
const path = require('path');

const KOL = { bt: 'BTC ayağı', kn: 'Donchian', kd: 'DCA', acil: 'acil', ad: 'acil deneme', dc: 'Donchian (Borsa sekmesi)' };
const kolAdi = (bot) => KOL[bot] || bot || 'bilinmiyor';
const etiketi = (cid) => { const m = /^ag-([a-z0-9]{1,8})-/.exec(String(cid || '')); return m ? m[1] : null; };
const EPS = 1e-12;

class IslemGecmisi {
  /** @param dizin bot dizini; null → yalnız bellek (testler) */
  constructor(dizin) {
    this.dosya = dizin ? path.join(dizin, 'islemler.jsonl') : null;
    this.kayitlar = [];
    this.anahtarlar = new Set();
    this.harita = new Map();         // anahtar → kayıt (borsaEk tamamlaması için)
    this._ekDenendi = new Set();     // bu süreçte tamamlaması denenmiş semboller (Binance'te artık yoksa tekrar sorulmaz)
    this.emirDolan = new Map();      // emirId → kaydedilmiş toplam dolan
    this.sonMutabakat = null;
    this._sonBorsa = 0;
    if (this.dosya && fs.existsSync(this.dosya)) {
      for (const s of fs.readFileSync(this.dosya, 'utf8').split('\n')) {
        if (!s.trim()) continue;
        let k; try { k = JSON.parse(s); } catch { continue; }   // yarım son satır
        this._bellege(k);
      }
    }
  }

  _bellege(k) {
    if (!k || !k.anahtar || this.anahtarlar.has(k.anahtar)) return false;
    this.anahtarlar.add(k.anahtar);
    if (k.tur === 'borsaEk') {                 // 64.6: eski borsa kaydını tamamlar (rol, kz) — görünümde ayrı satır değil
      const h = this.harita.get(k.hedef);
      if (h) { if (h.rol == null && k.rol != null) h.rol = k.rol; if (h.kz == null && k.kz != null) h.kz = k.kz; }
      return true;
    }
    this.harita.set(k.anahtar, k);
    this.kayitlar.push(k);
    if (k.tur === 'dolum' && k.emirId) this.emirDolan.set(k.emirId, (this.emirDolan.get(k.emirId) || 0) + (+k.miktar || 0));
    return true;
  }

  _ekle(k) {
    if (this.anahtarlar.has(k.anahtar)) return false;
    if (this.dosya) {
      fs.mkdirSync(path.dirname(this.dosya), { recursive: true });
      fs.appendFileSync(this.dosya, JSON.stringify(k) + '\n', 'utf8');
    }
    return this._bellege(k);
  }

  /** Defterdeki dolumların henüz yazılmamış artışlarını ekler. @returns eklenen sayısı */
  defterdenEkle(defter) {
    if (!defter || !defter.emirler) return 0;
    let n = 0;
    const emirler = [...defter.emirler.values()].sort((a, b) => (a.olusturma || 0) - (b.olusturma || 0));
    for (const e of emirler) {
      const dolan = +e.dolan || 0;
      if (!(dolan > 0) || !e.symbol) continue;
      const onceki = this.emirDolan.get(e.id) || 0;
      const delta = +(dolan - onceki).toFixed(12);
      if (delta <= EPS) continue;
      if (this._ekle({ tur: 'dolum', kaynak: 'defter', anahtar: `d:${e.id}:${dolan}`, zaman: e.guncelleme || e.olusturma || Date.now(),
        emirId: e.id, borsaId: e.borsaId || null, symbol: e.symbol, side: e.side, miktar: delta, fiyat: +e.ortFiyat || +e.price || null,
        tip: e.type || null, reduceOnly: !!e.reduceOnly, bot: e.bot || etiketi(e.id), kol: kolAdi(e.bot || etiketi(e.id)), neden: e.neden || null })) n++;
    }
    return n;
  }

  /** Kâğıt modda spot BTC ayağı işlemleri (BindirmeBot durum.btcIslemler). */
  spottanEkle(liste, varlik = 'BTC') {
    let n = 0;
    for (const x of liste || []) {
      if (!x || !x.zaman || !(+x.miktar > 0) || x.ayak === 'perp') continue;   // perp BTC dolumu defterden gelir
      const side = x.yon === 'alım' ? 'buy' : 'sell';
      if (this._ekle({ tur: 'dolum', kaynak: 'spot', anahtar: `s:${x.zaman}:${side}:${x.miktar}`, zaman: x.zaman, emirId: null, symbol: `${varlik}/USDT (spot)`,
        side, miktar: +x.miktar, fiyat: +x.fiyat || null, ucret: x.ucret != null ? +x.ucret : null, bot: 'bt', kol: 'BTC ayağı',
        neden: `BTC ayağı (spot) — ${side === 'buy' ? 'LONG AÇ' : 'LONG azalt/KAPAT'}${x.sebep ? ` (${x.sebep})` : ''}` })) n++;
    }
    return n;
  }

  /**
   * Borsanın işlem kayıtlarıyla tamamlar (gerçek fiyat + ücret). Hata atmaz.
   * @returns {{ yeni, semboller, atlandi?, hata? }}
   */
  async borsaMutabakat(borsa, defter, { simdi = Date.now(), enAzAralikMs = 5 * 60000, zorla = false } = {}) {
    if (!borsa || typeof borsa.fetchMyTrades !== 'function') return { yeni: 0, semboller: 0, atlandi: 'borsa fetchMyTrades desteklemiyor' };
    if (!zorla && simdi - this._sonBorsa < enAzAralikMs) return { yeni: 0, semboller: 0, atlandi: 'önbellek (oran sınırı)' };
    this._sonBorsa = simdi;
    const ilk = new Map();   // sembol → en eski emir zamanı
    for (const e of (defter && defter.emirler ? defter.emirler.values() : [])) {
      if (!(+e.dolan > 0) || !e.symbol) continue;
      const t = e.olusturma || e.guncelleme || simdi;
      if (!ilk.has(e.symbol) || t < ilk.get(e.symbol)) ilk.set(e.symbol, t);
    }
    const sonBorsa = new Map();
    const eksikEk = new Map();       // 64.6: rol (maker/taker) ya da gerçekleşen K/Z'si olmayan eski borsa kaydı → sembol başına en eski zaman
    for (const k of this.kayitlar) {
      if (k.tur !== 'borsa') continue;
      sonBorsa.set(k.symbol, Math.max(sonBorsa.get(k.symbol) || 0, k.zaman || 0));
      if ((k.rol == null || k.kz == null) && !this._ekDenendi.has(k.symbol)) eksikEk.set(k.symbol, Math.min(eksikEk.get(k.symbol) ?? Infinity, k.zaman || simdi));
    }
    let yeni = 0, tamamlanan = 0; const hatalar = [];
    for (const [symbol, t0] of ilk) {
      const since = sonBorsa.has(symbol) ? sonBorsa.get(symbol) : Math.max(0, t0 - 60000);
      try {
        for (const t of await this._pencereliCek(borsa, symbol, since, simdi)) if (this._ekle(this._borsaKaydi(symbol, t, simdi))) yeni++;
      } catch (e) { hatalar.push(`${symbol}: ${e.message}`); }
    }
    // 64.6: eski kayıtlara Binance Trade History'deki rol + gerçekleşen K/Z bir kez eklenir (dosya yalnız eklenir: 'borsaEk' satırı).
    for (const [symbol, t0] of eksikEk) {
      try {
        for (const t of await this._pencereliCek(borsa, symbol, Math.max(0, t0 - 1000), simdi)) {
          const anahtar = `t:${symbol}:${t.id}`, k = this.harita.get(anahtar);
          if (!k || (k.rol != null && k.kz != null)) continue;
          const yk = this._borsaKaydi(symbol, t, simdi);
          if (yk.rol == null && yk.kz == null) continue;
          if (this._ekle({ tur: 'borsaEk', anahtar: `e:${anahtar}`, hedef: anahtar, rol: yk.rol, kz: yk.kz })) tamamlanan++;
        }
        this._ekDenendi.add(symbol);
      } catch (e) { hatalar.push(`${symbol} (tamamlama): ${e.message}`); }
    }
    this.sonMutabakat = { zaman: simdi, yeni, tamamlanan, semboller: ilk.size, hata: hatalar.length ? hatalar.join(' · ') : null };
    return this.sonMutabakat;
  }

  /** ccxt işlemi → 'borsa' kaydı. rol = Binance "Role" (maker/taker), kz = "Realized Profit". */
  _borsaKaydi(symbol, t, simdi) {
    const kz = t.info && t.info.realizedPnl != null && Number.isFinite(+t.info.realizedPnl) ? +t.info.realizedPnl : null;
    const rol = t.takerOrMaker || (t.info && t.info.maker != null ? (t.info.maker === true || t.info.maker === 'true' ? 'maker' : 'taker') : null);
    return { tur: 'borsa', anahtar: `t:${symbol}:${t.id}`, zaman: t.timestamp || simdi, tradeId: String(t.id), order: t.order != null ? String(t.order) : null,
      clientOrderId: t.clientOrderId || null, symbol, side: t.side, miktar: +t.amount, fiyat: +t.price,
      ucret: t.fee && t.fee.cost != null ? +t.fee.cost : null, ucretBirim: t.fee && t.fee.currency || null, kz, rol };
  }

  /**
   * 64.6: Binance userTrades başlangıç–bitiş en çok 7 gün (ccxt yalnız `since` verilince since + 7 g'e kırpar). Eskiden tek çağrı
   * yapılıyordu: 7 günden uzun boşluk olan sembolde sonraki işlemler HİÇ gelmezdi (since ilerlemez). Haftalık pencerelerle now'a kadar.
   */
  async _pencereliCek(borsa, symbol, since, simdi, enCokPencere = 30) {
    // Kâğıt/test borsası 7 gün sınırı tanımaz: eskisi gibi tek çağrı.
    if (borsa.id !== 'binanceusdm' && typeof borsa.fapiPrivateGetUserTrades !== 'function') return ((await borsa.fetchMyTrades(symbol, since, 1000)) || []).filter(t => t && t.id != null);
    const HAFTA = 7 * 864e5 - 1;
    const out = [];
    let bas = Math.max(0, since, simdi - enCokPencere * (HAFTA + 1));   // Binance userTrades ~6 ay saklar; 30 hafta yeter
    for (let i = 0; i < enCokPencere + 1 && bas <= simdi; i++) {
      const bit = Math.min(bas + HAFTA, simdi);
      const l = (await borsa.fetchMyTrades(symbol, bas, 1000, { endTime: bit })) || [];
      for (const t of l) if (t && t.id != null) out.push(t);
      if (l.length >= 1000) { bas = Math.max(bas + 1, (l[l.length - 1].timestamp || bas) + 1); continue; }
      bas = bit + 1;
    }
    return out;
  }

  /**
   * Görünüm satırları (en yeni önce). Bir emrin borsa işlemi varsa onlar gösterilir (gerçek fiyat/ücret);
   * yoksa defter satırı. Borsa ↔ defter miktar farkı `fark` alanında.
   */
  satirlar() {
    const dolumlar = this.kayitlar.filter(k => k.tur === 'dolum');
    const borsa = this.kayitlar.filter(k => k.tur === 'borsa');
    const emirBilgi = new Map();     // borsaId / emirId → { kol, neden, emirId, dolan }
    for (const d of dolumlar) {
      if (!d.emirId) continue;
      const b = emirBilgi.get(d.emirId) || { kol: d.kol, neden: d.neden, emirId: d.emirId, bot: d.bot, dolan: 0, borsaId: d.borsaId };
      b.dolan += +d.miktar || 0; if (d.borsaId) b.borsaId = d.borsaId;
      emirBilgi.set(d.emirId, b);
    }
    const borsaIdden = new Map();
    for (const b of emirBilgi.values()) if (b.borsaId) borsaIdden.set(String(b.borsaId), b);
    const emirTrade = new Map();     // emirId → toplam borsa miktarı
    const satir = [];
    for (const t of borsa) {
      const b = (t.clientOrderId && emirBilgi.get(t.clientOrderId)) || (t.order && borsaIdden.get(t.order)) || null;
      const et = b ? b.bot : etiketi(t.clientOrderId);
      if (b) emirTrade.set(b.emirId, (emirTrade.get(b.emirId) || 0) + t.miktar);
      satir.push({ zaman: t.zaman, symbol: t.symbol, side: t.side, miktar: t.miktar, fiyat: t.fiyat, nominal: t.miktar * t.fiyat, ucret: t.ucret, kz: t.kz ?? null, rol: t.rol || null, tradeId: t.tradeId || null, emirNo: t.order || null,
        kol: b ? b.kol : (et ? kolAdi(et) : 'yabancı (botun değil)'), neden: b ? b.neden : null, emirId: b ? b.emirId : (t.clientOrderId || null), kaynak: 'borsa' });
    }
    for (const d of dolumlar) {
      if (d.emirId && emirTrade.has(d.emirId)) continue;    // borsa kaydı var → onlar gösterildi
      satir.push({ zaman: d.zaman, symbol: d.symbol, side: d.side, miktar: d.miktar, fiyat: d.fiyat, nominal: d.fiyat ? d.miktar * d.fiyat : null,
        ucret: d.ucret ?? null, kol: d.kol, neden: d.neden, emirId: d.emirId, kaynak: d.kaynak });
    }
    // Mutabakat farkı: defter dolanı ≠ borsa işlem toplamı
    const fark = new Map();
    for (const [id, q] of emirTrade) { const b = emirBilgi.get(id); if (b && Math.abs(b.dolan - q) > 1e-9 * Math.max(1, b.dolan)) fark.set(id, b.dolan - q); }
    for (const s of satir) if (s.emirId && fark.has(s.emirId)) s.fark = fark.get(s.emirId);
    satir.sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
    return satir;
  }

  /** Sayfalı + süzülmüş liste. */
  liste({ symbol = null, kol = null, sayfa = 1, boyut = 50, bas = null, bit = null } = {}) {
    const hepsi = this.satirlar();
    const tem = (x) => String(x || '').replace(' (spot)', '').split(':')[0];
    const sz = hepsi.filter(s => (!symbol || tem(s.symbol) === tem(symbol)) && (!kol || s.kol === kol) && (!bas || s.zaman >= bas) && (!bit || s.zaman <= bit));
    const toplamlar = { islem: sz.length, ucret: sz.reduce((a, s) => a + (s.ucret || 0), 0), kz: sz.reduce((a, s) => a + (s.kz || 0), 0), funding: null };
    const b = Math.min(200, Math.max(5, +boyut || 50));
    const toplamSayfa = Math.max(1, Math.ceil(sz.length / b));
    const p = Math.min(toplamSayfa, Math.max(1, +sayfa || 1));
    return {
      satirlar: sz.slice((p - 1) * b, p * b), toplam: sz.length, sayfa: p, toplamSayfa, boyut: b, toplamlar,
      semboller: [...new Set(hepsi.map(s => s.symbol))].sort(), kollar: [...new Set(hepsi.map(s => s.kol))].sort(),
      farkSayisi: new Set(hepsi.filter(s => s.fark != null).map(s => s.emirId)).size, sonMutabakat: this.sonMutabakat,
    };
  }
}

module.exports = { IslemGecmisi, kolAdi, KOL };

// ── Grafik verisi ───────────────────────────────────────────────────────────
/** Fiyat grafiği işaretleri: sembolün işlem satırları → { zaman, side, fiyat, kol, neden, miktar, tur }. */
function grafikIsaretleri(satirlar, symbol) {
  const temel = (s) => String(s || '').replace(' (spot)', '').split(':')[0];
  return (satirlar || []).filter(s => temel(s.symbol) === temel(symbol) && s.fiyat > 0).map(s => ({
    zaman: s.zaman, symbol: temel(s.symbol), side: s.side, fiyat: s.fiyat, miktar: s.miktar, kol: s.kol, neden: s.neden,
    // LONG AÇ (alış, DCA olmayan) yeşil yukarı · kapanış/TP (satış) kırmızı aşağı · DCA dolumları küçük
    tur: s.kol === 'DCA' && s.side === 'buy' ? 'dca' : s.side === 'buy' ? 'giris' : 'cikis',
  })).sort((a, b) => a.zaman - b.zaman);
}

/**
 * BOT SERMAYESİ TABANI (64.5) — yalnız panel/grafik türetimi; botun kararını etkilemez.
 * Hesapta sermaye tavanından fazla para varsa (demo: hesap ~5.000 $, Hücum-S tavanı 1.000 $) eski eğri min(E, tavan) / tavan
 * idi → her gün tam 1,00 (düz çizgi, "%0,0", "düşüş %0,0"). Artık botun KENDİ değeri: bot_t = tavan₀ + (E_t − E₀)
 * (hesapta yalnız bot işlem yapar; kâr/zarar tavanlı sermayeye eklenir), taban tavan₀. E₀ ≤ tavan ise hesap değeri
 * olduğu gibi (E_t / E₀). Panelden kaydedilen para yatırma/çekme (durum.sermayeAkislari, 62.1) ilk satırdan sonra olanlar
 * bot değerinden düşülür (yatırılan para bot kârı sayılmaz); kaydedilmeyen yatırma eğride sıçrama olarak görünür.
 * @returns {{ tur: 'tavan'|'hesap', sermaye: number, hesap0: number, deger: (E:number) => number }}
 */
function botSermayesiTabani(ilk) {
  const E0 = +ilk.ozsermaye, C0 = +ilk.ozsermayeCap;
  const tavanli = C0 > 0 && E0 > C0 * (1 + 1e-9);
  return tavanli
    ? { tur: 'tavan', sermaye: C0, hesap0: E0, deger: (E, akis = 0) => C0 + (E - E0) - akis }
    : { tur: 'hesap', sermaye: E0, hesap0: E0, deger: (E, akis = 0) => E - akis };
}

/**
 * Özsermaye (gerçekleşen, BOT SERMAYESİ üstünden — botSermayesiTabani) ↔ gölge (ideal, C0) ↔ BTC al-tut — hepsi ilk günde 1'e normalize.
 * @param satirlar ozsermayeOku() çıktısı (gün başına bir)
 * @param golge Map(gun → { hucum: {C0}, denge: {C0} }) (isletim.golgeOku)
 * @param akislar bot.durum.sermayeAkislari [{zaman, tutar}] (isteğe bağlı)
 * @returns {{ egri: [{gun, zaman, gercek, golge, btc, ozsermaye, botDeger}], kol, golgeEksik, taban: {tur, sermaye, hesap0, hesapSon, botSon} }}
 */
function ozsermayeKarsilastir(satirlar, golge, ad, akislar = []) {
  const s = (satirlar || []).filter(x => x.gun && x.ozsermaye > 0);
  if (!s.length) return { egri: [], kol: [] };
  const T = botSermayesiTabani(s[0]);
  const B0 = s[0].btcFiyat;
  const t0 = s[0].zaman || Date.parse(`${s[0].gun}T23:59:59Z`);
  const akisL = (Array.isArray(akislar) ? akislar : []).filter(a => a && Number.isFinite(+a.zaman) && Number.isFinite(+a.tutar)).map(a => ({ zaman: +a.zaman, tutar: +a.tutar }));
  let g = 1, sonGun = s[0].gun, golgeEksik = 0;
  const egri = s.map((x, i) => {
    if (i > 0) {
      // (sonGun, x.gun] aralığındaki gölge getirileri
      for (let d = new Date(Date.parse(`${sonGun}T00:00:00Z`) + 864e5); d.toISOString().slice(0, 10) <= x.gun; d = new Date(+d + 864e5)) {
        const r = golge && golge.get(d.toISOString().slice(0, 10));
        const v = r && r[ad] && r[ad].C0;
        if (Number.isFinite(v)) g *= 1 + v; else golgeEksik++;
      }
      sonGun = x.gun;
    }
    const akis = i > 0 ? akisL.filter(a => a.zaman > t0 && a.zaman <= (x.zaman || Date.parse(`${x.gun}T23:59:59Z`))).reduce((a, k) => a + k.tutar, 0) : 0;
    const botDeger = T.deger(x.ozsermaye, akis);
    return { gun: x.gun, zaman: x.zaman || null, gercek: botDeger / T.sermaye, golge: g, btc: B0 > 0 && x.btcFiyat > 0 ? x.btcFiyat / B0 : null, ozsermaye: x.ozsermaye, botDeger };
  });
  const kol = s.map(x => ({ gun: x.gun, btc: (x.kol && x.kol.btc) || 0, donchian: (x.kol && x.kol.donchian) || 0, dca: (x.kol && x.kol.dca) || 0, ozsermaye: x.ozsermaye }));
  const son = egri[egri.length - 1];
  return { egri, kol, golgeEksik, taban: { tur: T.tur, sermaye: T.sermaye, hesap0: T.hesap0, hesapSon: son.ozsermaye, botSon: son.botDeger } };
}

/**
 * 71.0 Botlar › Genel (günlük defter, getiri grafiği): işlem satırları → kısa liste (yeniden eskiye değil, ESKİDEN YENİYE),
 * en çok `enCok` (son olanlar). Takvim günü ve grafik noktası panelde yerel güne göre gruplanır (js/pages/botGetiri.js).
 * Alanlar: z zaman · s sembol (temel) · y alış/satış · m miktar · f fiyat · u ücret · kz gerçekleşen K/Z · kol · n neden.
 */
function grafikIslemleri(satirlar, enCok = 3000) {
  const temel = (x) => String(x || '').replace(' (spot)', '').split(':')[0];
  const l = (satirlar || []).filter(x => x && Number.isFinite(+x.zaman)).map(x => ({
    z: +x.zaman, s: temel(x.symbol), y: x.side, m: x.miktar ?? null, f: x.fiyat ?? null, u: x.ucret ?? null, kz: x.kz ?? null, kol: x.kol || null, n: x.neden || null,
  })).sort((a, b) => a.z - b.z);
  return l.length > enCok ? l.slice(l.length - enCok) : l;
}

module.exports.botSermayesiTabani = botSermayesiTabani;
module.exports.grafikIslemleri = grafikIslemleri;
module.exports.grafikIsaretleri = grafikIsaretleri;
module.exports.ozsermayeKarsilastir = ozsermayeKarsilastir;
