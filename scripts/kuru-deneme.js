#!/usr/bin/env node
/**
 * KURU DENEME KOŞUCUSU (69.2, lib/kuruDeneme.js) — bir botun bugünkü kararını VERİLEN kod köküyle (eski ya da yeni sürümün
 * `lib/` kopyası) EMİR GÖNDERMEDEN hesaplar; tek satır JSON yazar. Güncelleyici iki kez çağırır (eski kod, yeni kod) ve sonuçları
 * karşılaştırır. Botun veri dizininin KOPYASIYLA çalışır — gerçek bot dosyalarına, gerçek hesaba dokunmaz.
 *
 *   node scripts/kuru-deneme.js --kok <kod kökü> --dizin <bot verisi kopyası> --ad denge --mod kagit --btcAyak coklu
 *        --tavan 10000 --k 15 --bakiye 10000 [--kucuk oto] [--strateji denge] [--borsa okx]
 *
 * Kip: mod 'kagit' → "karar": kâğıt borsa kopyası + anahtarsız piyasa verisi (ccxt, yalnız okuma) → mutabakat + calistir({kuru}).
 *      mod 'demo' / 'canli' → "yükleme": bot yalnız kurulur ve özeti alınır; hesaba bağlanılmaz (demo kabul: demo hesaba başka
 *      araç dokunmaz). Yeni kodun botun kayıtlarını açabildiği, ENGEL / bozuk dosya görmediği denetlenir.
 * 76.7 --borsa okx (bot kaydındaki işlem borsası Binance DEĞİLSE güncelleyici verir): botun sunucudaki kuruluşu gibi — yürütücü
 *      ayarına borsa, bot ayarına islemBorsasi + evren aday 'veri'; kâğıt borsa pazar KURALLARINI o borsanın anahtarsız pazar
 *      istemcisinden (lib/live/borsalar/<borsa>.js pazarIstemcisi — yalnız loadMarkets), mum/ticker/mark yine Binance'ten. Ağ kalkanı
 *      bu koşuda Binance + o borsanın herkese açık veri adresine izin verir (lib/kuruDeneme KALKAN_OKX_KODU). --borsa verilmezse
 *      (Binance botu) yol BİREBİR eskisi.
 * Çıktı: { ok, kip, karar?, hata?, sureMs }
 */
'use strict';
const path = require('path');
const arg = process.argv.slice(2);
const deger = (ad, v = null) => { const i = arg.indexOf(`--${ad}`); return i >= 0 ? arg[i + 1] : v; };
const bas = Date.now();
const yaz = (o) => { process.stdout.write(JSON.stringify({ ...o, sureMs: Date.now() - bas }) + '\n'); };

/** Saf: kuru rapor → karşılaştırılan özet (eski ve yeni kodda aynı alanlar). */
function kararOzeti(r, m) {
  const btc = (r && r.btc) || {};
  const kol = (r && r.kol) || {};
  return {
    gun: r ? r.gun : null,
    rejimIcerde: r && r.rejim ? !!r.rejim.icerde : null,
    btcSebep: btc.sebep || null,
    btcWHedef: Number.isFinite(btc.wHedef) ? +btc.wHedef.toFixed(4) : null,
    btcYon: Number.isFinite(btc.fark) && Number.isFinite(btc.fiyat) && Math.abs(btc.fark) * btc.fiyat > 10 ? Math.sign(btc.fark) : 0,
    btcHata: btc.hata || null,
    kolSemboller: kol.evren && Array.isArray(kol.evren.semboller) ? [...kol.evren.semboller].sort() : null,
    kolRisk: kol.risk ? { kill: !!kol.risk.kill, K1: !!kol.risk.K1, K3: !!kol.risk.K3 } : null,
    kolHata: kol.yurutme && kol.yurutme.hatalar && kol.yurutme.hatalar.length ? kol.yurutme.hatalar.slice(0, 3).map(String) : null,
    ozsermaye: r && r.ozsermaye && Number.isFinite(r.ozsermaye.once) ? +r.ozsermaye.once.toFixed(2) : null,
    mutabakatEngel: m && m.engel ? String(m.engel).slice(0, 200) : null,
  };
}

async function main() {
  const kok = path.resolve(deger('kok'));
  const dizin = path.resolve(deger('dizin'));
  const ad = deger('ad'), mod = deger('mod', 'kagit'), btcAyak = deger('btcAyak', 'spot');
  const tavan = +deger('tavan', 10000), k = +deger('k', 15), bakiye = +deger('bakiye', 10000);
  const kucukHam = deger('kucuk', 'oto');
  // 74.4 (A1 2a): strateji (STRATEJILER anahtarı) — yoksa ad. Kairos/Tao'da ad ile aynı → bot ayarına hiç yazılmaz (eski lib kopyası zaten yok sayar).
  const strateji = deger('strateji', null);
  const stratejiAyar = strateji && strateji !== ad ? { strateji } : {};
  const kucukSermaye = kucukHam === 'true' ? true : kucukHam === 'false' ? false : 'oto';
  // 76.7: işlem borsası (yalnız Binance dışı botta verilir; Binance botunda nesneler eskisiyle BİREBİR)
  const borsaKim = deger('borsa', null);
  if (borsaKim && !/^[a-z]{2,12}$/.test(borsaKim)) throw new Error(`geçersiz --borsa: ${borsaKim}`);
  const disBorsa = borsaKim && borsaKim !== 'binance' ? borsaKim : null;
  const L = (p) => require(path.join(kok, 'lib', ...p.split('/')));
  const { BindirmeBot } = L('live/bindirmeBot');
  const { CanliYurutucu } = L('live/yurutucu');
  const sessiz = () => {};
  const bd = disBorsa ? L('live/borsalar').al(disBorsa) : null;
  const yAyar = { dizin, maxEmirNominal: 3 * tavan, maxPozisyonNominal: 3 * tavan, cokluVarlik: btcAyak === 'coklu', kaydet: sessiz };
  if (bd) yAyar.borsa = bd.kimlik;
  const y = new CanliYurutucu(yAyar);
  const botAyar = { ad, ...stratejiAyar, dizin, sermayeTavani: tavan, evren: { k }, kaydet: sessiz, mod, btcAyak, bildirici: null, golgeDosya: null, saglik: null, kucukSermaye, hesapKesicisi: null, kapiFn: null };
  if (bd) { botAyar.islemBorsasi = bd.ad; botAyar.evren = { ...botAyar.evren, aday: 'veri' }; }
  const bot = new BindirmeBot(y, botAyar);
  if (mod !== 'kagit') {
    let o = null;
    try { o = bot.ozet(); } catch (e) { return yaz({ ok: false, kip: 'yukleme', hata: `özet alınamadı: ${e.message}` }); }
    return yaz({ ok: true, kip: 'yukleme', karar: { bozuk: bot.bozuk || null, engel: (o && o.engel) || null, sonGun: o ? o.sonGun : null, calisiyor: o ? !!o.calisiyor : null } });
  }
  const ccxt = require('ccxt');
  const { KagitBorsa } = L('live/kagitBorsa');
  const veri = new ccxt.binanceusdm({ enableRateLimit: true });
  let pazar = {};
  if (bd) {
    if (typeof bd.pazarIstemcisi !== 'function') throw new Error(`${bd.ad}: kâğıt pazar kuralları okunamıyor (bağdaştırıcıda pazar istemcisi yok)`);
    pazar = { pazarKaynagi: bd.pazarIstemcisi() };   // anahtarsız; yalnız loadMarkets (herkese açık uç)
  }
  const borsa = new KagitBorsa({ veri, bakiye, dosya: path.join(dizin, 'kagit-borsa.json'), ...pazar });
  await y.baglanKagit(borsa);
  let m = null;
  try { m = await bot.mutabakat(); } catch (e) { m = { engel: `mutabakat hata verdi: ${e.message}` }; }
  const r = await bot.calistir({ kuru: true });
  return yaz({ ok: true, kip: 'karar', karar: kararOzeti(r, m) });
}

if (require.main === module) {
  // Zaman aşımı: güncelleyici de keser; burada da 4 dk sonra kendini bitirir (asılı ağ çağrısı kalmasın).
  setTimeout(() => { yaz({ ok: false, hata: 'zaman aşımı (4 dk)' }); process.exit(2); }, 4 * 60000).unref();
  main().then(() => process.exit(0)).catch((e) => { yaz({ ok: false, hata: String((e && e.message) || e).slice(0, 400) }); process.exit(1); });
}
module.exports = { kararOzeti };
