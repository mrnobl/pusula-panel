/**
 * HESAPLAR GÖRÜNÜMÜ — "Borsada/hesaplarda gerçekte ne var?" (PLAN-PANEL-PUSULA §2, P3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SALT OKUMA birleştirme katmanı. Panelde dağınık duran 4 pozisyon ve 5 emir/işlem tablosunun
 * (kâğıt motor dock'u, Borsa kutuları, bot işlem paneli, emir defteri) verisini TEK biçime getirir:
 *
 *   anlik()      → bağlantılar (hesap başına: ortam, durum, bakiye, son mutabakat, saat farkı),
 *                  pozisyonlar (kaynak: hucum | denge | elle | kagit …) ve açık emirler
 *   islemler(f)  → açık emirler + geçmiş işlemler (hesap kaydı `hesap-islemleri.jsonl` + kâğıt motor),
 *                  süzgeç (durum, kaynak, sembol, tarih), sayfa, toplamlar
 *   csv(f)       → aynı süzgeçle CSV (UTF-8 BOM, `;` ayraç — hesapIslemleri.csv ile aynı biçim)
 *
 * ⚠ Bu modül EMİR VERMEZ, durum YAZMAZ ve lib/live/ içinde hiçbir şeyi değiştirmez; yalnız yürütücünün
 * (`y.hesap()`, `y.ozet()`, `y.defter.al()`) ve botun dışa açık okuma fonksiyonlarını çağırır. Borsa okuması
 * hesap başına `onbellekMs` (15 sn) önbelleklenir: panel 10 sn'de bir sorsa da Binance'e en çok 15 sn'de bir gidilir.
 *
 * AYNI HESABI PAYLAŞANLAR: demo modundaki portföy botu ile Hesaplar ekranının elle bağlantısı aynı demo hesapta
 * olabilir. Hesap bir kez okunur; pozisyon botun kollarında (ya da BTC ayağında) varsa botun, yoksa "elle" sayılır.
 */
'use strict';

const KAYNAK_AD = {
  hucum: 'Kairos', denge: 'Tao', elle: 'Elle', kagit: 'Kâğıt test', acil: 'Acil fren',
  donchianBot: 'Donchian (arşiv)', kalkan: 'Kalkan', funding: 'Fonlama', bilinmeyen: 'Bilinmeyen'
};
const ORTAM_AD = { testnet: 'demo', live: 'canlı', kagit: 'kâğıt', motor: 'kâğıt motor' };

const temel = (s) => String(s || '').replace(' (spot)', '').split(':')[0];
const sayiMi = (x) => x != null && x !== '' && Number.isFinite(+x);
const sayi = (x) => (sayiMi(x) ? +x : null);

/** Hesap kimliği → ekranda okunur ad. */
function hesapAdi(hesap) {
  if (hesap === 'testnet') return 'Demo hesap';
  if (hesap === 'live') return 'Canlı hesap';
  if (hesap === 'kagit-motor') return 'Kâğıt test hesabı';
  const m = /^kagit-(.+)$/.exec(String(hesap || ''));
  if (m) return `${KAYNAK_AD[m[1]] || m[1]} kâğıt hesabı`;
  return String(hesap || '—');
}

/** tr-TR `toLocaleString` dizgesi ("7.10.2026 14:03:09") → ms (yerel saat); okunamazsa null. */
function trZaman(s) {
  if (typeof s === 'number') return s;
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  if (!m) { const t = Date.parse(s); return Number.isFinite(t) ? t : null; }
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
}

/** Botun sanal kolları: { 'ETH/USDT:USDT': { Donchian: 0.4, DCA: 0.1 } }. Okunamayan kol atlanır. */
function botKollari(bot) {
  const kollar = {};
  const ekle = (o, ad) => { for (const [s, q] of Object.entries(o || {})) if (Math.abs(+q) > 1e-12) (kollar[s] = kollar[s] || {})[ad] = +q; };
  if (!bot) return kollar;
  try { if (bot.ayar && bot.ayar.btcAyak === 'perp' && typeof bot.btSanal === 'function') ekle(bot.btSanal(), 'BTC ayağı'); } catch { /* yok */ }
  try { ekle(bot.kol.donSanal(), 'Donchian'); } catch { /* yok */ }
  try { ekle(bot.kol.dca.sanalMiktarlar(), 'DCA'); } catch { /* yok */ }
  return kollar;
}

const HARIC_NEDEN = 'BTC ayağı — bilerek stopsuz (demo kararı)';
/**
 * 67.5: pozisyonun botun koruma stopundan hariç tutulan payı (yalnız okuma). Bot ayarı btcAyak 'perp' ve sembol botun BTC
 * sembolüyse hariç pay = BTC ayağının sanal miktarı (bindirmeBot haricFn ile aynı). Korunan pay (net − hariç) sıfır / ters
 * işaretli / borsanın asgari miktarından küçükse stop BEKLENMEZ → { tamami: true }; aksi halde kısmi stop beklenir.
 * @returns null | { haric, korunan, tamami }
 */
function botHaric(bot, symbol, p, kol) {
  try {
    if (!bot || !bot.ayar || bot.ayar.btcAyak !== 'perp' || !symbol || symbol !== bot.btcSembol) return null;
    let haric = kol && sayiMi(kol['BTC ayağı']) ? +kol['BTC ayağı'] : null;
    if (haric == null && typeof bot.btSanal === 'function') haric = +(bot.btSanal() || {})[symbol] || 0;
    if (!(Math.abs(haric) > 1e-12)) return null;
    const q = (p.side === 'short' || p.yon === 'short' ? -1 : 1) * Math.abs(+p.miktar || 0);
    let korunanVar;
    if (bot.koruma && typeof bot.koruma._korunan === 'function') korunanVar = !!bot.koruma._korunan(symbol, q);   // saf hesap (borsa çağrısı yok)
    else { const k = q - haric; korunanVar = Math.sign(k) === Math.sign(q) && Math.abs(k) > Math.abs(q) * 1e-6; }
    const korunan = Math.sign(q - haric) === Math.sign(q) ? q - haric : 0;
    return { haric, korunan, tamami: !korunanVar };
  } catch { return null; }
}

/** Botun felaket stopları (borsada bekleyen koruma emri): { symbol: { fiyat, id, belirsiz } } + etkin mi. */
function botKoruma(bot) {
  try {
    if (!bot || !bot.koruma) return { aktif: false, stoplar: {} };
    const o = bot.koruma.ozet();
    return { aktif: !!o.aktif, stoplar: o.stoplar || {} };
  } catch { return { aktif: false, stoplar: {} }; }
}

/**
 * Panel tarih süzgeci (YYYY-AA-GG) → ms aralığı, KULLANICININ gününe göre. Tablo zamanı tarayıcının yerel saatiyle
 * yazar; gün sınırı UTC olsaydı Türkiye'de 00:00–03:00 arasındaki işlemler bir önceki güne düşerdi.
 * tzDk = tarayıcının `getTimezoneOffset()` değeri (TR: -180); yoksa ya da akıl dışıysa UTC günü (eski davranış).
 */
function gunAraligi(bas, bit, tzDk) {
  const tz = sayiMi(tzDk) && Math.abs(+tzDk) <= 14 * 60 ? +tzDk * 60000 : 0;
  const gun = (g, son) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(g || ''));
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (new Date(t).getUTCDate() !== +m[3] || new Date(t).getUTCMonth() !== +m[2] - 1) return null;
    return t + (son ? 86400000 - 1 : 0) + tz;
  };
  return { bas: gun(bas, false), bit: gun(bit, true) };
}

class HesaplarGorunum {
  /**
   * @param o.yurutuculer () → [{ kaynak, hesap, y, bot? }] — bağlı olsun olmasın HER yürütücü (bağlantı kartı için)
   * @param o.kagitMotor  () → { positions, tickerMap, orders, trades, calisiyor } | null (kâğıt işlem motoru)
   * @param o.hesapIslemleri HesapIslemleri örneği (suz(f)) | null
   * @param o.anahtarlar  () → { testnet: { kayitli, son4 }, live: { kayitli, son4 } }
   */
  constructor(o = {}) {
    this.yurutuculer = o.yurutuculer || (() => []);
    this.kagitMotor = o.kagitMotor || (() => null);
    this.hesapIslemleri = o.hesapIslemleri || null;
    this.anahtarlar = o.anahtarlar || (() => ({}));
    this.simdi = o.simdi || (() => Date.now());
    this.onbellekMs = o.onbellekMs ?? 15000;
    this._onbellek = new Map();          // hesap → { zaman, veri, hata }
  }

  /** Hesap başına tek borsa okuması (önbellekli). */
  async _hesapOku(hesap, y, zorla) {
    const o = this._onbellek.get(hesap);
    if (!zorla && o && this.simdi() - o.zaman < this.onbellekMs) return o;
    let veri = null, hata = null;
    try { veri = await y.hesap(); } catch (e) { hata = e.message || String(e); }
    const k = { zaman: this.simdi(), veri, hata };
    this._onbellek.set(hesap, k);
    return k;
  }

  /** Yürütücüleri hesaba göre gruplar; aynı hesabı paylaşanlar tek grupta. */
  _gruplar() {
    const g = new Map();
    for (const x of this.yurutuculer() || []) {
      if (!x || !x.hesap) continue;
      if (!g.has(x.hesap)) g.set(x.hesap, { hesap: x.hesap, uyeler: [] });
      g.get(x.hesap).uyeler.push(x);
    }
    return [...g.values()];
  }

  async anlik({ zorla = false } = {}) {
    const baglantilar = [], pozisyonlar = [], acikEmirler = [];
    for (const grup of this._gruplar()) {
      const bagli = grup.uyeler.find(u => u.y && u.y.borsa);
      const kaynaklar = grup.uyeler.map(u => u.kaynak);
      const satir = { hesap: grup.hesap, hesapAd: hesapAdi(grup.hesap), kaynaklar, kaynakAdlari: kaynaklar.map(k => KAYNAK_AD[k] || k),
        bagli: !!bagli, ortam: null, durum: 'BAGLI_DEGIL', durmaSebebi: null, bakiye: null, sonMutabakat: null, saatFarkMs: null,
        okundu: null, hata: null, pozisyonSayisi: 0, acikEmirSayisi: 0, ucretBuAy: this._ucretBuAy(grup.hesap) };
      baglantilar.push(satir);
      if (!bagli) continue;
      let oz = {};
      try { oz = bagli.y.ozet() || {}; } catch { /* özet okunamadı */ }
      satir.ortam = bagli.y.ortam || oz.ortam || null;
      satir.durum = oz.durum || 'AKTIF';
      satir.durmaSebebi = oz.durmaSebebi || null;
      const m = oz.sonMutabakat;
      satir.sonMutabakat = m ? { zaman: m.zaman || null, hata: m.hata || null, cozulen: m.cozulen ?? null,
        cozulemeyen: Array.isArray(m.cozulemeyen) ? m.cozulemeyen.length : (m.cozulemeyen ?? null), yabanciEmir: m.yabanciEmir ?? null } : null;
      satir.saatFarkMs = oz.saatOlcum && sayiMi(oz.saatOlcum.fark) ? +oz.saatOlcum.fark : null;

      const ok = await this._hesapOku(grup.hesap, bagli.y, zorla);
      satir.okundu = ok.zaman;
      if (ok.hata || !ok.veri) { satir.hata = ok.hata || 'hesap okunamadı'; continue; }
      const h = ok.veri;
      satir.bakiye = h.bakiye || null;

      // Bot üyeleri: kollar + koruma (aynı hesapta en çok bir portföy botu — demo hesap tek).
      const botUye = grup.uyeler.find(u => u.bot && u.y && u.y.borsa) || grup.uyeler.find(u => u.bot);
      const elleUye = grup.uyeler.find(u => u.kaynak === 'elle');
      const kollar = botUye ? botKollari(botUye.bot) : {};
      const koruma = botUye ? botKoruma(botUye.bot) : { aktif: false, stoplar: {} };
      const btcSembol = botUye && botUye.bot ? botUye.bot.btcSembol : null;
      const korumaIdleri = new Set(Object.values(koruma.stoplar).map(s => s && s.id).filter(Boolean));

      // 67.5: botun koruma stopundan BİLEREK hariç tuttuğu pay (Hücum demo BTC ayağı, btcAyak 'perp' — lib/live/korumaEmri haricFn,
      // kullanıcı kararı 2026-10-07). Yalnız okunur: korumaEmri._korunan saf hesabı (borsaya gitmez) ya da aynı kural.
      const haricBilgi = (symbol, p) => botHaric(botUye && botUye.bot, symbol, p, kollar[symbol]);
      const stopEmri = (symbol) => (h.acikEmirler || []).find(o => o.symbol === symbol && /stop/i.test(String(o.type || '')));
      for (const p of h.pozisyonlar || []) {
        const kol = kollar[p.symbol] || {};
        const botun = botUye && (!elleUye || Object.keys(kol).length > 0 || p.symbol === btcSembol);
        const kaynak = botun ? botUye.kaynak : (elleUye ? 'elle' : grup.uyeler[0].kaynak);
        let kr;
        const st = botun ? koruma.stoplar[p.symbol] : null;
        const hr = botun ? haricBilgi(p.symbol, p) : null;
        if (st && sayiMi(st.fiyat)) kr = { durum: st.belirsiz ? 'belirsiz' : 'borsada', fiyat: +st.fiyat, ...(hr ? { haricPay: hr.haric, neden: HARIC_NEDEN } : {}) };
        else if (hr && hr.tamami) kr = { durum: 'haric', fiyat: null, neden: HARIC_NEDEN, haricPay: hr.haric };
        else {
          const se = stopEmri(p.symbol);
          if (se) kr = { durum: 'borsada', fiyat: sayi(se.fiyat) };
          else if (botun && koruma.aktif) kr = { durum: 'yok', fiyat: null };
          else if (botun && satir.ortam === 'kagit') kr = { durum: 'gerekmez', fiyat: null };
          else kr = { durum: 'yok', fiyat: null };
        }
        pozisyonlar.push({
          kaynak, kaynakAd: KAYNAK_AD[kaynak] || kaynak, hesap: grup.hesap, hesapAd: satir.hesapAd, ortam: satir.ortam,
          symbol: p.symbol, yon: p.side === 'short' ? 'short' : 'long', miktar: sayi(p.miktar), giris: sayi(p.giris), mark: sayi(p.mark),
          kz: sayi(p.gerceklesmemis), nominal: sayiMi(p.nominal) ? Math.abs(+p.nominal) : (sayiMi(p.mark) && sayiMi(p.miktar) ? Math.abs(p.miktar * p.mark) : null),
          likidasyon: sayiMi(p.likidasyon) && +p.likidasyon > 0 ? +p.likidasyon : null, kaldirac: sayi(p.kaldirac), koruma: kr,
          kollar: kol, spot: false, kapatilabilir: false
        });
      }

      // Kâğıt modda BTC ayağı SPOT (vadeli pozisyon değil) — ayrı satır.
      if (botUye && botUye.bot && botUye.bot.ayar && botUye.bot.ayar.btcAyak === 'spot' && typeof botUye.bot.btcMiktari === 'function') {
        try {
          const q = await botUye.bot.btcMiktari();
          if (q > 0) {
            let f = null;
            try { f = await botUye.bot._btcFiyat(); } catch { /* fiyat yok */ }
            pozisyonlar.unshift({ kaynak: botUye.kaynak, kaynakAd: KAYNAK_AD[botUye.kaynak] || botUye.kaynak, hesap: grup.hesap, hesapAd: satir.hesapAd,
              ortam: satir.ortam, symbol: `${botUye.bot.ayar.varlik || 'BTC'}/USDT (spot)`, yon: 'long', miktar: q, giris: null, mark: sayi(f), kz: null,
              nominal: sayiMi(f) ? q * f : null, likidasyon: null, kaldirac: null, koruma: { durum: 'gerekmez', fiyat: null },
              kollar: { 'BTC ayağı': q }, spot: true, kapatilabilir: false });
          }
        } catch { /* spot okunamadı — satır yok */ }
      }

      for (const o of h.acikEmirler || []) {
        // Emir hangi yürütücünün defterinde? (aynı hesabı paylaşanlar ayrı defter tutar)
        let sahip = null, d = null;
        if (o.clientOrderId) {
          for (const u of grup.uyeler) {
            try { const x = u.y && u.y.defter && typeof u.y.defter.al === 'function' ? u.y.defter.al(o.clientOrderId) : null; if (x) { sahip = u; d = x; break; } } catch { /* defter okunamadı */ }
          }
        }
        let kaynak;
        if (!o.bizim) kaynak = 'elle';
        else if (korumaIdleri.has(o.clientOrderId)) kaynak = botUye.kaynak;
        else if (/^ag-dc-/.test(o.clientOrderId || '')) kaynak = 'donchianBot';
        else if (sahip) kaynak = sahip.kaynak;
        else kaynak = elleUye ? 'elle' : (botUye ? botUye.kaynak : grup.uyeler[0].kaynak);
        const neden = korumaIdleri.has(o.clientOrderId) ? 'Felaket stopu (koruma emri)' : (d && (d.neden || d.sebep)) || (!o.bizim ? 'botun değil (borsa arayüzünden)' : null);
        acikEmirler.push({
          zaman: sayi(o.zaman), kaynak, kaynakAd: KAYNAK_AD[kaynak] || kaynak, hesap: grup.hesap, hesapAd: satir.hesapAd,
          symbol: o.symbol, side: o.side, tur: o.type || null, miktar: sayi(o.miktar), fiyat: sayi(o.fiyat), dolan: sayi(o.dolan),
          durum: 'açık', neden, id: o.clientOrderId || o.id || null,
          // Yalnız Hesaplar ekranının elle bağlantısındaki KENDİ emirlerimiz panelden iptal edilir (/api/exchange/cancel).
          iptalEdilebilir: !!(o.bizim && o.clientOrderId && elleUye && kaynak === 'elle')
        });
      }
      // DCA: fiyat bandı dışında yerelde bekleyen emirler (borsaya henüz gitmedi).
      if (botUye && botUye.bot && botUye.bot.kol && botUye.bot.kol.dca) {
        try {
          for (const s of botUye.bot.kol.dca.ozet().semboller || []) for (const e of s.emirler || []) {
            if (e.durum !== 'BEKLIYOR') continue;
            acikEmirler.push({ zaman: null, kaynak: botUye.kaynak, kaynakAd: KAYNAK_AD[botUye.kaynak] || botUye.kaynak, hesap: grup.hesap, hesapAd: satir.hesapAd,
              symbol: s.symbol, side: e.rol === 'TP' ? 'sell' : 'buy', tur: 'limit', miktar: sayi(e.miktar), fiyat: sayi(e.fiyat), dolan: 0,
              durum: 'yerelde bekliyor', neden: e.rol === 'BO' ? 'DCA giriş' : e.rol === 'TP' ? 'DCA kâr al' : `DCA ${e.rol}`, id: null, iptalEdilebilir: false });
          }
        } catch { /* DCA özeti yok */ }
      }
      satir.pozisyonSayisi = pozisyonlar.filter(p => p.hesap === grup.hesap).length;
      satir.acikEmirSayisi = acikEmirler.filter(e => e.hesap === grup.hesap).length;
    }

    // Kâğıt işlem motoru (Araştırma › Kâğıt test) — "kâğıt" kaynağı, ayrı hesap.
    const km = this._kagit();
    if (km) {
      const satir = { hesap: 'kagit-motor', hesapAd: hesapAdi('kagit-motor'), kaynaklar: ['kagit'], kaynakAdlari: [KAYNAK_AD.kagit], bagli: true,
        ortam: 'motor', durum: km.calisiyor ? 'AKTIF' : 'BEKLIYOR', durmaSebebi: null, bakiye: km.bakiye, sonMutabakat: null, saatFarkMs: null,
        okundu: this.simdi(), hata: null, pozisyonSayisi: 0, acikEmirSayisi: 0 };
      baglantilar.push(satir);
      for (const p of km.positions) {
        const t = (km.tickerMap || {})[p.symbol];
        const mark = sayi(p.currentPrice) ?? (t ? sayi(t.last) : null) ?? sayi(p.entryPrice);
        const miktar = Math.abs(+p.amount || 0);
        const kisa = p.side ? p.side === 'short' : (+p.amount < 0);
        const kz = sayiMi(p.pnlUSDT) ? +p.pnlUSDT : (mark != null && sayiMi(p.entryPrice) ? (kisa ? -1 : 1) * miktar * (mark - p.entryPrice) : null);
        const sl = sayiMi(p.slLevel) && +p.slLevel > 0 ? +p.slLevel : null;
        pozisyonlar.push({
          kaynak: 'kagit', kaynakAd: KAYNAK_AD.kagit, hesap: 'kagit-motor', hesapAd: satir.hesapAd, ortam: 'motor',
          symbol: p.symbol, yon: kisa ? 'short' : 'long', miktar, giris: sayi(p.entryPrice), mark, kz,
          nominal: mark != null ? miktar * mark : null, likidasyon: sayiMi(p.liqPrice) && +p.liqPrice > 0 ? +p.liqPrice : null,
          kaldirac: sayi(p.leverage), koruma: sl != null ? { durum: 'motor', fiyat: sl } : { durum: 'yok', fiyat: null },
          kollar: {}, spot: false, kapatilabilir: true, tp: sayiMi(p.tp1Level) && +p.tp1Level > 0 ? +p.tp1Level : null
        });
      }
      for (const o of km.orders.filter(x => x.status === 'İşlemde' || x.status === 'Bekliyor')) {
        acikEmirler.push({ zaman: trZaman(o.orderTime), kaynak: 'kagit', kaynakAd: KAYNAK_AD.kagit, hesap: 'kagit-motor', hesapAd: satir.hesapAd,
          symbol: o.symbol, side: KAGIT_YON[o.side] || o.side, tur: o.type || null, miktar: sayi(o.amount), fiyat: sayi(o.limitPrice || o.stopPrice),
          dolan: null, durum: 'açık', neden: null, id: o.id || null, iptalEdilebilir: false });
      }
      satir.pozisyonSayisi = pozisyonlar.filter(p => p.hesap === 'kagit-motor').length;
      satir.acikEmirSayisi = acikEmirler.filter(e => e.hesap === 'kagit-motor').length;
    }

    const ozet = { pozisyon: pozisyonlar.length, acikEmir: acikEmirler.length, kz: 0, kzVar: false, bagliHesap: baglantilar.filter(b => b.bagli).length, hesap: baglantilar.length };
    for (const p of pozisyonlar) if (p.kz != null) { ozet.kz += p.kz; ozet.kzVar = true; }
    return { zaman: this.simdi(), baglantilar, pozisyonlar, acikEmirler, ozet, anahtarlar: this.anahtarlar() || {} };
  }

  /** 62.7 Borsa hesapları: hesabın bu takvim ayında ödediği işlem ücreti (USDT; hesap kaydından). Kayıt yoksa null. */
  _ucretBuAy(hesap) {
    if (!this.hesapIslemleri) return null;
    const d = new Date(this.simdi());
    const bas = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    let t = 0, var_ = false;
    try {
      for (const k of this.hesapIslemleri.suz({ hesap, bas })) if (k.ucret != null && (!k.ucretBirim || k.ucretBirim === 'USDT')) { t += +k.ucret || 0; var_ = true; }
    } catch { return null; }
    return var_ ? t : 0;
  }

  _kagit() {
    let km = null;
    try { km = this.kagitMotor(); } catch { km = null; }
    if (!km) return null;
    return { positions: km.positions || [], tickerMap: km.tickerMap || {}, orders: km.orders || [], trades: km.trades || [], calisiyor: !!km.calisiyor, bakiye: km.bakiye || null };
  }

  /** Kâğıt motor işlemleri → hesap kaydıyla aynı satır biçimi (kaynak "kagit"). Ücret, aynı anın emir kaydından. */
  _kagitGecmis() {
    const km = this._kagit();
    if (!km) return [];
    const emirler = km.orders.filter(o => o.status === 'Gerçekleşti');
    return km.trades.map((t, i) => {
      const zaman = Date.parse(t.timestamp);
      const tip = String(t.type || '').toUpperCase();
      const side = tip === 'BUY' || tip === 'COVER' ? 'buy' : 'sell';
      const e = emirler.find(o => o.symbol === t.symbol && +o.amount === +t.amount && +o.fillPrice === +t.price);
      const kapanis = tip === 'SELL' || tip === 'COVER';
      return { tur: 'islem', anahtar: `k:${t.id || i}`, hesap: 'kagit-motor', zaman: Number.isFinite(zaman) ? zaman : null, symbol: t.symbol, side,
        miktar: sayi(t.amount), fiyat: sayi(t.price), ucret: e ? sayi(e.fee) : null, ucretBirim: 'USDT', kz: kapanis ? sayi(t.profitUSDT) : null,
        kaynak: 'kagit', neden: t.reason || null, emirNo: e ? e.id : null };
    });
  }

  /** Geçmiş satırları (hesap kaydı + kâğıt motor), süzgeçli, yeniden eskiye. */
  _gecmis(f) {
    let liste = [];
    if (this.hesapIslemleri && f.hesap !== 'kagit-motor') liste = this.hesapIslemleri.suz({ hesap: f.hesap || undefined, bas: f.bas, bit: f.bit, symbol: f.symbol, kaynak: f.kaynak === 'kagit' ? '__yok__' : f.kaynak });
    if ((!f.kaynak || f.kaynak === 'kagit') && (!f.hesap || f.hesap === 'kagit-motor')) {
      liste = liste.concat(this._kagitGecmis().filter(k => (!f.bas || (k.zaman != null && k.zaman >= f.bas)) && (!f.bit || (k.zaman != null && k.zaman <= f.bit))
        && (!f.symbol || temel(k.symbol) === temel(f.symbol))));
    }
    return liste.map(k => ({
      grup: 'gecmis', zaman: k.zaman, kaynak: k.kaynak, kaynakAd: KAYNAK_AD[k.kaynak] || k.kaynak, hesap: k.hesap, hesapAd: hesapAdi(k.hesap),
      symbol: k.symbol, side: k.side || null, tur: k.tur === 'funding' ? 'fonlama' : 'dolum', miktar: k.tur === 'funding' ? null : sayi(k.miktar),
      fiyat: sayi(k.fiyat), ucret: sayi(k.ucret), ucretBirim: k.ucretBirim || null, kz: sayi(k.kz), tutar: k.tur === 'funding' ? sayi(k.tutar) : null,
      durum: k.tur === 'funding' ? 'fonlama' : 'doldu', neden: k.neden || null, id: k.clientOrderId || k.emirNo || null
    })).sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
  }

  /**
   * Tek emir/işlem listesi. f: { durum: '' | 'acik' | 'gecmis', hesap (62.7: tek hesabın satırları), kaynak, symbol, bas (ms), bit (ms), sayfa, boyut }
   * Açık emirler (şimdi) üstte, geçmiş işlemler yeniden eskiye.
   */
  async islemler(f = {}) {
    const durum = f.durum === 'acik' || f.durum === 'gecmis' ? f.durum : '';
    let acik = [];
    let an = null;
    if (durum !== 'gecmis') {
      an = await this.anlik({});
      acik = an.acikEmirler.filter(e => (!f.hesap || e.hesap === f.hesap) && (!f.kaynak || e.kaynak === f.kaynak) && (!f.symbol || temel(e.symbol) === temel(f.symbol))
        && (!f.bas || e.zaman == null || e.zaman >= f.bas) && (!f.bit || e.zaman == null || e.zaman <= f.bit)).map(e => ({ grup: 'acik', ...e }));
    }
    const gecmis = durum === 'acik' ? [] : this._gecmis(f);
    const hepsi = acik.concat(gecmis);
    const b = Math.min(500, Math.max(5, +f.boyut || 50));
    const toplamSayfa = Math.max(1, Math.ceil(hepsi.length / b));
    const sayfa = Math.min(toplamSayfa, Math.max(1, +f.sayfa || 1));
    const toplamlar = { acik: acik.length, islem: 0, ucret: 0, kz: 0, fonlama: 0 };
    for (const k of gecmis) {
      if (k.tur === 'fonlama') { toplamlar.fonlama += k.tutar || 0; continue; }
      toplamlar.islem++;
      if (k.ucret != null && (!k.ucretBirim || k.ucretBirim === 'USDT')) toplamlar.ucret += k.ucret;
      if (k.kz != null) toplamlar.kz += k.kz;
    }
    toplamlar.net = toplamlar.kz - toplamlar.ucret + toplamlar.fonlama;
    // Süzgeç seçenekleri süzgeçten BAĞIMSIZ (seçim daraltınca liste kısalmasın).
    const tumGecmis = this._gecmis({});
    const kaynaklar = [...new Set([...tumGecmis.map(k => k.kaynak), ...((an || { acikEmirler: [] }).acikEmirler.map(e => e.kaynak))])].sort();
    return { satirlar: hepsi.slice((sayfa - 1) * b, sayfa * b), toplam: hepsi.length, sayfa, toplamSayfa, boyut: b, toplamlar,
      kaynaklar: kaynaklar.map(k => ({ kod: k, ad: KAYNAK_AD[k] || k })) };
  }

  /** CSV (UTF-8 BOM, `;`): süzgece uyan TÜM satırlar (sayfasız). */
  async csv(f = {}) {
    // Açık emirler bir kez okunur (anlik önbelleği); 500 satırı aşan liste sayfa sayfa birleştirilir.
    const r = await this.islemler({ ...f, sayfa: 1, boyut: 500 });
    let satirlar = r.satirlar;
    for (let p = 2; p <= r.toplamSayfa; p++) satirlar = satirlar.concat((await this.islemler({ ...f, sayfa: p, boyut: 500 })).satirlar);
    const kac = (v) => { if (v == null) return ''; const s = String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const bas = ['zaman_utc', 'grup', 'kaynak', 'hesap', 'sembol', 'yon', 'tur', 'miktar', 'fiyat', 'durum', 'ucret', 'gerceklesen_kz', 'fonlama', 'sebep', 'kimlik'];
    const sat = satirlar.map(k => [k.zaman ? new Date(k.zaman).toISOString() : '', k.grup === 'acik' ? 'acik_emir' : 'gecmis', k.kaynak, k.hesap, k.symbol, k.side || '',
      k.tur || '', k.miktar, k.fiyat, k.durum, k.ucret, k.kz, k.tutar, k.neden, k.id].map(kac).join(';'));
    return '﻿' + [bas.join(';'), ...sat].join('\r\n') + '\r\n';
  }
}

const KAGIT_YON = { AL: 'buy', SAT: 'sell', SHORT: 'sell', COVER: 'buy' };

module.exports = { botHaric, HARIC_NEDEN, HesaplarGorunum, hesapAdi, trZaman, gunAraligi, botKollari, KAYNAK_AD, ORTAM_AD };
