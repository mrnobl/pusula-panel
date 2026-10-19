/**
 * EMİR ÖN KONTROLÜ — Binance'in reddedeceği emri GÖNDERMEDEN yakalar.
 *
 * Kurallar borsanın kendi pazar tanımından (ccxt `market`, ortam başına
 * borsadan yüklenmiş) okunur; sabit yazılmaz — demo ve prod filtreleri farklı.
 *
 * Yuvarlama YÖNÜ bilinçli:
 *   miktar      → adıma AŞAĞI (yukarı yuvarlamak bakiye/limit aşımı demek)
 *   alış limiti → tick'e AŞAĞI, satış limiti → tick'e YUKARI
 *                 (en yakına yuvarlamak limiti istenmeyen yöne kaydırırdı;
 *                 ccxt priceToPrecision en yakına yuvarlar)
 *
 * Döndürür: { gecerli, emir (düzeltilmiş), hatalar[], uyarilar[] }
 * Hata kodları Binance'inkilerle eşleşir ki panel aynı dili konuşsun.
 */

function ondalik(adim) {
  const s = String(adim);
  if (s.includes('e-')) return +s.split('e-')[1];
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * `x`i `adim`ın katına yuvarla. yon: 'asagi' | 'yukari'. Kayan nokta artığına dayanıklı.
 * Tolerans GÖRELİ (n · 1e-12, en az 1e-9): kayan noktanın hatası büyüklükle ölçeklenir.
 * Mutlak 1e-9, n = x/adım ≳ 1e7 iken (büyük sermaye × ucuz coin) artığı yakalayamıyordu —
 * 25965.061999999998 / 0.001 bir adım eksik yuvarlanıyor, TP pozisyonun tamamını
 * kapatamıyor, kalan asgari altı artık -4003 ile deal'i kilitliyordu (PLAN-TEST M1, aday 3).
 * n · 1e-12 adımdan çok küçük: gerçek bir kesir (≥ 1e-6 adım) yine doğru yöne yuvarlanır.
 */
function adimaYuvarla(x, adim, yon) {
  if (!(adim > 0)) return x;
  const n = x / adim;
  const tol = Math.max(1e-9, Math.abs(n) * 1e-12);
  const k = yon === 'yukari' ? Math.ceil(n - tol) : Math.floor(n + tol);
  return +(k * adim).toFixed(ondalik(adim));
}

/**
 * @param market ccxt pazarı (precision TICK_SIZE kipinde: precision.price = tick, precision.amount = adım)
 * @param emir { side: 'buy'|'sell', type: 'market'|'limit', amount, price?, reduceOnly? }
 * @param piyasa { markFiyati } — piyasa emrinde nominal ve PERCENT_PRICE için
 */
function onKontrol(market, emir, piyasa = {}) {
  const hatalar = [], uyarilar = [];
  if (!market) return { gecerli: false, emir, hatalar: [{ kod: -1121, mesaj: 'Sembol bilinmiyor' }], uyarilar };
  const e = { ...emir };
  if (!['buy', 'sell'].includes(e.side)) hatalar.push({ kod: -1102, mesaj: `side buy|sell olmalı: ${e.side}` });
  if (!['market', 'limit'].includes(e.type)) hatalar.push({ kod: -1116, mesaj: `bu panelden yalnız market|limit: ${e.type}` });

  const adim = market.precision && market.precision.amount;
  const tick = market.precision && market.precision.price;
  const lim = market.limits || {};

  // Miktar
  if (!(e.amount > 0)) hatalar.push({ kod: -1013, mesaj: 'miktar pozitif olmalı' });
  else {
    const yuvarlak = adimaYuvarla(e.amount, adim, 'asagi');
    if (yuvarlak !== e.amount) uyarilar.push(`miktar adıma (${adim}) aşağı yuvarlandı: ${e.amount} → ${yuvarlak}`);
    e.amount = yuvarlak;
    const minQ = lim.amount && lim.amount.min;
    const maxQ = e.type === 'market' ? ((lim.market && lim.market.max) || (lim.amount && lim.amount.max)) : (lim.amount && lim.amount.max);
    if (minQ && e.amount < minQ) hatalar.push({ kod: -4003, mesaj: `miktar en az ${minQ} (yuvarlanmış: ${e.amount})` });
    if (maxQ && e.amount > maxQ) hatalar.push({ kod: -4005, mesaj: `miktar en çok ${maxQ}${e.type === 'market' ? ' (piyasa emri sınırı)' : ''}` });
  }

  // Fiyat
  if (e.type === 'limit') {
    if (!(e.price > 0)) hatalar.push({ kod: -1013, mesaj: 'limit emirde fiyat gerekli' });
    else {
      const yon = e.side === 'buy' ? 'asagi' : 'yukari';
      const yuvarlak = adimaYuvarla(e.price, tick, yon);
      if (yuvarlak !== e.price) uyarilar.push(`fiyat tick'e (${tick}) ${yon === 'asagi' ? 'aşağı' : 'yukarı'} yuvarlandı: ${e.price} → ${yuvarlak}`);
      e.price = yuvarlak;
      // PERCENT_PRICE — mark fiyatına göre bant (ccxt bunu limits.price'a koymaz; info'dan okunur)
      const pp = ((market.info && market.info.filters) || []).find(f => f.filterType === 'PERCENT_PRICE');
      if (pp && piyasa.markFiyati > 0) {
        const ust = piyasa.markFiyati * +pp.multiplierUp, alt = piyasa.markFiyati * +pp.multiplierDown;
        if (e.price > ust || e.price < alt) hatalar.push({ kod: -4131, mesaj: `fiyat mark bandı dışında [${alt.toFixed(2)}, ${ust.toFixed(2)}]` });
      }
    }
  }

  // Nominal (MIN_NOTIONAL) — reduceOnly kapanışlar muaf sayılır, uyarı verilir
  const fiyat = e.type === 'limit' ? e.price : piyasa.markFiyati;
  const nominal = fiyat > 0 && e.amount > 0 ? fiyat * e.amount : null;
  const minN = lim.cost && lim.cost.min;
  if (nominal != null && minN && nominal < minN) {
    if (e.reduceOnly) uyarilar.push(`nominal ${nominal.toFixed(2)} < en az ${minN} — yalnız-azaltan emir olarak gönderilecek`);
    else hatalar.push({ kod: -4164, mesaj: `nominal en az ${minN} USDT (bu emir ${nominal.toFixed(2)})` });
  }
  if (nominal == null && e.type === 'market') uyarilar.push('mark fiyatı yok — nominal denetlenemedi');

  return { gecerli: hatalar.length === 0, emir: e, nominal, hatalar, uyarilar };
}

module.exports = { onKontrol, adimaYuvarla, ondalik };
