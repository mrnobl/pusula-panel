/**
 * COIN TARAMA — kayıt satırından metrikler ve KIRMIZI BAYRAKLAR (saf fonksiyonlar, ağ yok).
 *
 * BAYRAK BİR ALIM/SATIM SİNYALİ DEĞİLDİR. Puan da değildir: yalnız "şuna bak" listesi. Eşiklerin isabet/yanlış alarm
 * oranı bilinmiyor (ileriye dönük kayıt birikince ölçülecek) — ARASTIRMA-ONCHAIN.md §5, ARASTIRMA-PUMP.md.
 *
 * Değişim bayrakları (ilk 10 payı, adres boşaltma, holder, likidite, kilitli LP) bir ÖNCEKİ taramayla karşılaştırır;
 * önceki tarama yoksa üretilmez. Durum bayrakları (sahip yetkisi, mint, blacklist, vergi, honeypot, rugged, paralı
 * tanıtım, yeni alan adı, LP kilidi bitiyor) her taramada yeniden değerlendirilir. "Kayboldu" son N taramaya bakar.
 */
'use strict';
const { YAKMA } = require('./kaynaklar');

const ACIKLAMA = Object.freeze({
  ilk10_artis: 'Ayıklanmış ilk 10 holder payı arttı (yoğunlaşma)',
  ilk10_azalis: 'Ayıklanmış ilk 10 holder payı azaldı (büyük cüzdanlar dağıtıyor olabilir)',
  ilk10_adres_bosaltma: 'İlk 10\'daki bir adres payının önemli kısmını bıraktı (ana cüzdandan boşaltma adayı)',
  holder_dusus: 'Holder sayısı düştü',
  likidite_dusus: 'DEX likiditesi düştü (çekilme ya da fiyat düşüşü)',
  lp_kilit_bitiyor: 'LP kilidi yakında bitiyor',
  lp_kilit_azaldi: 'Kilitli LP payı azaldı',
  sahip_yetkisi: 'Sözleşme sahibi yetkileri sürüyor (sahipliği geri alma / gizli sahip / bakiye değiştirme)',
  mint_yetkisi: 'Yeni token basılabiliyor (mint yetkisi)',
  blacklist: 'Kara liste / dondurma yetkisi var',
  vergi_degisebilir: 'Alım-satım vergisi sonradan değiştirilebilir',
  honeypot: 'Satış engelli olabilir (honeypot / tamamı satılamıyor)',
  rugged: 'RugCheck "rugged" diyor',
  parali_tanitim: 'DexScreener\'da paralı tanıtım (boost / ödenmiş reklam ya da profil)',
  alan_adi_yeni: 'Alan adı token\'dan hemen önce kaydedilmiş (site token için aceleyle açılmış olabilir)',
  veri_kayboldu: 'Fiyat ve hacim verisi kayboldu (hiçbir kaynakta yok)',
});

const ok = (row, k) => { const x = row && row.kaynaklar && row.kaynaklar[k]; return x && (x.durum === 'ok' || x.durum === 'onbellek') ? x.ham || {} : null; };

/** İlk 10'dan ayıklanmış pay: sözleşme / kilitli / etiketli / yakma / insider-dışı bilinen hesap hariç (kaba — etiketsiz borsa EOA görünür). */
function ayiklanmis(ilk10, kaynak) {
  if (!Array.isArray(ilk10) || !ilk10.length) return null;
  const temiz = ilk10.filter(h => h && Number.isFinite(h.pay) && !YAKMA.has(String(h.adres || '').toLowerCase()) && !YAKMA.has(String(h.adres || ''))
    && (kaynak === 'rugcheck' ? !h.bilinen : (!h.sozlesme && !h.kilitli && !h.etiket)));
  return { pay: temiz.reduce((s, h) => s + h.pay, 0), adet: temiz.length };
}

// ── Çift / pazar eşlemeli karşılaştırma (2026-10-20) ───────────────────────
/**
 * DexScreener `tokens/v1` her çağrıda token'ın çiftlerinden DEĞİŞEN bir alt küme döndürüyor (gerçek kayıt: MET aynı hafta
 * $1,9 M → $95 bin → $1,7 M → $149 M — her seferinde TEK ve farklı çift; RE $3.551 → $45). Toplam likidite karşılaştırması bu
 * yüzden neredeyse her gün sahte "likidite düştü" üretiyordu. Artık yalnız İKİ TARAMADA DA görülen çiftler (pairAddress)
 * karşılaştırılır.
 *
 * KAPSAM EŞİĞİ: ortak çiftler, toplam likiditesi BÜYÜK olan günün toplamının en az `CIFT_KAPSAM` (%50) kadarını taşımalı;
 * yoksa "ölçülemedi — çift kümesi değişti" (bayrak yok). Gerekçe: büyük gün paydadır; ortak çiftler onun yarısını bile
 * taşımıyorsa karşılaştırma likiditenin çoğunu görmüyor demektir (likidite yeni havuza taşındı ya da API bugün başka çiftleri
 * verdi). Yarıdan fazlası görülüyorsa aynı çiftlerdeki ≥ %30'luk düşüş gerçek bir çekilmedir. %50 ölçülmüş bir değer değil,
 * "likiditenin çoğunu görüyor muyuz" eşiği; Kaçın kurallarında (K11, kural-v1.1) dondurulmuş kopyası `K11_kapsam`.
 * Bilinen sınır: çift listeden tümüyle düşerse (gerçek çekilmede de olabilir) ölçülemedi sayılır — o durumu "veri kayboldu" yakalar.
 *
 * @param once, simdi  { ciftler: { [çiftAdresi]: likidite $ } | null, toplam: toplam likidite $ (dönen tüm çiftler) }
 * @returns { olculdu: true, once, simdi, ortak } (ortak çiftlerin iki gündeki toplamı) | { olculdu: false, neden }
 */
const CIFT_KAPSAM = 0.5;
function ortakLikidite(once, simdi, kapsam = CIFT_KAPSAM) {
  const a = once && once.ciftler, b = simdi && simdi.ciftler;
  if (!a) return { olculdu: false, neden: 'önceki kayıtta çift listesi yok (eski kayıt) — ölçülemedi' };
  if (!b) return { olculdu: false, neden: 'bugün çift listesi yok — ölçülemedi' };
  const ortak = Object.keys(a).filter(k => Object.prototype.hasOwnProperty.call(b, k));
  if (!ortak.length) return { olculdu: false, neden: 'ortak çift yok — çift kümesi değişti, ölçülemedi' };
  const top = (m, ks) => ks.reduce((s, k) => s + (Number.isFinite(m[k]) ? m[k] : 0), 0);
  // Gün toplamı: kayıttaki toplam (ilk 20 çiftle kesilmiş haritadan büyük olabilir); yoksa haritanın toplamı
  const tA = Math.max(Number.isFinite(once.toplam) ? once.toplam : 0, top(a, Object.keys(a)));
  const tB = Math.max(Number.isFinite(simdi.toplam) ? simdi.toplam : 0, top(b, Object.keys(b)));
  const oA = top(a, ortak), oB = top(b, ortak);
  const [buyuk, ortakBuyuk] = tA >= tB ? [tA, oA] : [tB, oB];
  if (!(buyuk > 0)) return { olculdu: false, neden: 'likidite 0 — ölçülemedi' };
  if (ortakBuyuk / buyuk < kapsam) return { olculdu: false, neden: `ortak ${ortak.length} çift büyük günün likiditesinin %${Math.round(ortakBuyuk / buyuk * 100)}'ini taşıyor (< %${Math.round(kapsam * 100)}) — çift kümesi değişti, ölçülemedi` };
  return { olculdu: true, once: oA, simdi: oB, ortak: ortak.length };
}
/** DexScreener ham → { çiftAdresi: likidite $ } (ham.ciftler yoksa — 2026-10-20 öncesi kayıt — null). EVM adresi küçük harfe. */
function ciftHaritasi(h) {
  if (!h || !Array.isArray(h.ciftler) || !h.ciftler.length) return null;
  const m = {};
  for (const c of h.ciftler) {
    if (!c || !c.adres || !Number.isFinite(c.lik)) continue;
    const k = /^0x/i.test(c.adres) ? String(c.adres).toLowerCase() : String(c.adres);
    m[k] = (m[k] || 0) + c.lik;
  }
  return Object.keys(m).length ? m : null;
}
/** RugCheck ham.lp → [{ adres, pay, usd }] (kilitli payı sayı olan pazarlar) | null. */
function lpPazarlari(h) {
  const l = (h && Array.isArray(h.lp) ? h.lp : []).filter(x => x && x.adres && Number.isFinite(x.kilitliPay))
    .map(x => ({ adres: String(x.adres), pay: Math.min(1, x.kilitliPay), usd: Number.isFinite(x.kilitliUsd) ? x.kilitliUsd : 0 }));
  return l.length ? l : null;
}
/**
 * Kilitli LP payı AYNI pazarda (RugCheck pazar adresi). RugCheck `markets` sırası taramadan taramaya değişiyor (gerçek kayıt:
 * MET 2026-10-20'de ilk sıraya kilitsiz bir DLMM pazarı geçti → "ilk pazar" %100 → %0, sahte lp_kilit_azaldi).
 * Referans = ÖNCEKİ taramada kilitli USD'si en büyük pazar (sıradan bağımsız); bugün listede yoksa ölçülemedi.
 * @returns { olculdu: true, adres, once, simdi } | { olculdu: false, neden }
 */
function ayniPazarLp(once, simdi) {
  if (!Array.isArray(once) || !Array.isArray(simdi)) return { olculdu: false, neden: 'pazar listesi yok (eski kayıt) — ölçülemedi' };
  const ref = [...once].sort((x, y) => y.usd - x.usd || y.pay - x.pay || String(x.adres).localeCompare(String(y.adres)))[0];
  const b = ref && simdi.find(x => x.adres === ref.adres);
  if (!b) return { olculdu: false, neden: 'önceki ana pazar bugün listede yok — ölçülemedi' };
  return { olculdu: true, adres: ref.adres, once: ref.pay, simdi: b.pay };
}

/**
 * Alan adı kaydı ile ilk DEX çifti arasındaki gün farkı. { gun ≥ 0, yon: 'once' | 'sonra' } ya da null.
 * 'once' = alan adı token'dan önce alınmış (bayrak adayı); 'sonra' = token'dan sonra (yalnız bilgi).
 */
function alanAdiFarki(m) {
  if (!m || !m.alanAdiKayit || !m.ilkCift) return null;
  const fark = (Date.parse(m.ilkCift) - Date.parse(m.alanAdiKayit)) / 864e5;
  if (!Number.isFinite(fark)) return null;
  return { gun: Math.abs(fark), yon: fark >= 0 ? 'once' : 'sonra' };
}

/** Satır → düz metrikler (panel tablosu, seri, bayrak girdisi). Veri yoksa null — 0 UYDURULMAZ. */
function metrikler(row) {
  const gp = ok(row, 'goplus'), rc = ok(row, 'rugcheck'), dx = ok(row, 'dexscreener'), bo = ok(row, 'borsa'), gt = ok(row, 'geckoterminal'),
    cg = ok(row, 'coingecko'), rd = ok(row, 'rdap');
  const zincir = gp ? { kaynak: 'goplus', h: gp } : rc ? { kaynak: 'rugcheck', h: rc } : null;
  const ilk10 = zincir ? zincir.h.ilk10 : null;
  const ham = Array.isArray(ilk10) && ilk10.length ? ilk10.reduce((s, h) => s + (Number.isFinite(h.pay) ? h.pay : 0), 0) : (gt && gt.dagilim ? gt.dagilim.ilk10 : null);
  const ayk = zincir ? ayiklanmis(ilk10, zincir.kaynak) : null;
  // LP kilidi: GoPlus lp_holders kilitli payı + en yakın bitiş; RugCheck pazarların kilitli payı (en likit ilk pazar) + kilitçiler.
  let lpKilitliPay = null, lpKilitBitis = null;
  if (gp && Array.isArray(gp.lp) && gp.lp.length) {
    lpKilitliPay = gp.lp.filter(x => x.kilitli && Number.isFinite(x.pay)).reduce((s, x) => s + x.pay, 0);
    lpKilitBitis = gp.lp.map(x => x.kilitBitis).filter(Boolean).sort()[0] || null;
  } else if (rc) {
    const p = (rc.lp || []).find(x => Number.isFinite(x.kilitliPay));
    lpKilitliPay = p ? p.kilitliPay : null;
    lpKilitBitis = (rc.kilitler || []).map(x => x.bitis).filter(Boolean).sort()[0] || null;
  }
  const fiyat = bo && Number.isFinite(bo.fiyat) ? bo.fiyat : dx && Number.isFinite(dx.fiyat) ? dx.fiyat : gt && Number.isFinite(gt.fiyat) ? gt.fiyat : cg && Number.isFinite(cg.fiyat) ? cg.fiyat : null;
  const hacim = bo && Number.isFinite(bo.hacim24) ? bo.hacim24 : dx && Number.isFinite(dx.hacim24) ? dx.hacim24 : gt && Number.isFinite(gt.hacim24) ? gt.hacim24 : null;
  const siparis = dx && Array.isArray(dx.siparisler) ? dx.siparisler.filter(s => s && /approved|processing|active/i.test(String(s.durum || ''))) : [];
  return {
    fiyat, fiyatKaynak: bo && Number.isFinite(bo.fiyat) ? bo.kaynak : dx && Number.isFinite(dx.fiyat) ? 'dexscreener' : gt && Number.isFinite(gt.fiyat) ? 'geckoterminal' : cg && Number.isFinite(cg.fiyat) ? 'coingecko' : null,
    hacim24: hacim, dexHacim24: dx ? dx.hacim24 : null,
    likidite: dx && Number.isFinite(dx.toplamLikidite) ? dx.toplamLikidite : (gt && Number.isFinite(gt.rezerv) ? gt.rezerv : null),
    ciftLik: dx ? ciftHaritasi(dx) : null,   // likidite_dusus yalnız bununla (ortak çiftler); `likidite` gösterim içindir
    holder: gp && Number.isFinite(gp.holder) ? gp.holder : rc && Number.isFinite(rc.holder) ? rc.holder : gt && Number.isFinite(gt.holder) ? gt.holder : null,
    ilk10Ham: Number.isFinite(ham) ? ham : null,
    ilk10Ayk: ayk ? ayk.pay : null, ilk10AykAdet: ayk ? ayk.adet : null,
    ilk10Adresler: Array.isArray(ilk10) ? ilk10.filter(h => h && h.adres && Number.isFinite(h.pay)).map(h => ({ adres: h.adres, pay: h.pay, temiz: zincir.kaynak === 'rugcheck' ? !h.bilinen : (!h.sozlesme && !h.kilitli && !h.etiket) })) : null,
    lpKilitliPay, lpKilitBitis, lpPazarlar: !(gp && Array.isArray(gp.lp) && gp.lp.length) && rc ? lpPazarlari(rc) : null,
    sahipYetkisi: gp ? (gp.sahipGeriAlabilir === true || gp.gizliSahip === true || gp.sahipBakiyeDegistirir === true) : null,
    mint: gp ? gp.mint : rc ? rc.mintYetkisi : null,
    blacklist: gp ? (gp.blacklist === true || gp.transferDurdurulur === true) : rc ? rc.dondurmaYetkisi : null,
    vergiDegisebilir: gp ? (gp.vergiDegisebilir === true || gp.kisiselVergi === true) : null,
    honeypot: gp ? (gp.honeypot === true || gp.tamSatisYok === true) : null,
    rugged: rc ? rc.rugged : null,
    boost: dx ? (dx.boostAktif || 0) : null, siparisler: siparis,
    ilkCift: dx ? dx.ilkCiftTarihi : null,
    alanAdi: rd ? rd.alanAdi : null, alanAdiKayit: rd ? rd.kayit : null, kayitSirketi: rd ? rd.kayitSirketi : null,
    kategoriler: cg ? cg.kategoriler : null,
    // "Yok" yalnız kaynaklar CEVAP VERİP boş döndüyse: fiyat kaynaklarından biri hata verdiyse bilinmiyor (kayboldu sayılmaz).
    fiyatYok: !(Number.isFinite(fiyat) && fiyat > 0) && !(Number.isFinite(hacim) && hacim > 0)
      && !['borsa', 'dexscreener', 'geckoterminal', 'coingecko'].some(k => row && row.kaynaklar && row.kaynaklar[k] && row.kaynaklar[k].durum === 'hata'),
  };
}

const pct = (x) => `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
const puan = (x) => `${x > 0 ? '+' : ''}${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan`;

/**
 * @param seri [{ zaman, m: metrikler }] eski → yeni (bu coinin satırları)
 * @param esikler ayar.esikler
 * @param simdi ms
 * @returns [{ kod, metin, ayrinti }]
 */
function bayraklar(seri, esikler, simdi = Date.now()) {
  const out = [];
  if (!Array.isArray(seri) || !seri.length) return out;
  const E = esikler || {};
  const son = seri[seri.length - 1].m;
  const ekle = (kod, ayrinti) => out.push({ kod, metin: ACIKLAMA[kod], ayrinti });
  /** Bu alanı taşıyan önceki satır (son hariç). */
  const onceki = (alan) => { for (let i = seri.length - 2; i >= 0; i--) { const v = seri[i].m[alan]; if (v !== null && v !== undefined) return { m: seri[i].m, zaman: seri[i].zaman }; } return null; };

  // İlk 10 payı (ayıklanmış) değişimi
  if (Number.isFinite(son.ilk10Ayk)) {
    const o = onceki('ilk10Ayk');
    if (o) {
      const d = son.ilk10Ayk - o.m.ilk10Ayk, e = (E.ilk10DegisimPuan || 5) / 100;
      if (d >= e) ekle('ilk10_artis', `${pct(o.m.ilk10Ayk)} → ${pct(son.ilk10Ayk)} (${puan(d)}; eşik ±${E.ilk10DegisimPuan} puan)`);
      if (d <= -e) ekle('ilk10_azalis', `${pct(o.m.ilk10Ayk)} → ${pct(son.ilk10Ayk)} (${puan(d)}; eşik ±${E.ilk10DegisimPuan} puan)`);
    }
  }
  // Adres düzeyi boşaltma: önceki ilk 10'daki temiz (EOA) adres
  if (Array.isArray(son.ilk10Adresler)) {
    const o = onceki('ilk10Adresler');
    if (o && Array.isArray(o.m.ilk10Adresler)) {
      const simdiki = new Map(son.ilk10Adresler.map(h => [h.adres, h.pay]));
      const enAz = Math.min(...son.ilk10Adresler.map(h => h.pay).filter(Number.isFinite), Infinity);
      const e = (E.adresDususPuan || 2) / 100;
      const bosaltan = [];
      for (const h of o.m.ilk10Adresler) {
        if (!h.temiz) continue;
        // İlk 10'dan düştüyse yeni payı en fazla listedeki en küçük pay kadardır (üst sınır) — kesin değil, "en az" düşüş.
        const yeni = simdiki.has(h.adres) ? simdiki.get(h.adres) : (Number.isFinite(enAz) ? enAz : 0);
        if (h.pay - yeni >= e) bosaltan.push(`${String(h.adres).slice(0, 8)}… ${pct(h.pay)} → ${simdiki.has(h.adres) ? pct(yeni) : `ilk 10 dışı (≤ ${pct(yeni)})`}`);
      }
      if (bosaltan.length) ekle('ilk10_adres_bosaltma', `${bosaltan.slice(0, 3).join(' · ')}${bosaltan.length > 3 ? ` (+${bosaltan.length - 3})` : ''}; eşik ${E.adresDususPuan} puan`);
    }
  }
  // Holder düşüşü
  if (Number.isFinite(son.holder)) {
    const o = onceki('holder');
    if (o && o.m.holder > 0) {
      const d = son.holder / o.m.holder - 1;
      if (d <= -(E.holderDususPct || 5) / 100) ekle('holder_dusus', `${o.m.holder.toLocaleString('tr-TR')} → ${son.holder.toLocaleString('tr-TR')} (${pct(d)}; eşik −%${E.holderDususPct})`);
    }
  }
  // Likidite düşüşü — YALNIZ iki taramada da görülen çiftler (ortakLikidite). Çift listesi olmayan eski satırla bayrak YOK:
  // eski toplam karşılaştırması DexScreener'ın değişen çift alt kümesi yüzünden gürültüydü (bayrak susar, yanlış alarm vermez).
  if (son.ciftLik) {
    const o = onceki('ciftLik');
    const r = o ? ortakLikidite({ ciftler: o.m.ciftLik, toplam: o.m.likidite }, { ciftler: son.ciftLik, toplam: son.likidite }) : null;
    if (r && r.olculdu && r.once > 0) {
      const d = r.simdi / r.once - 1;
      if (d <= -(E.likiditeDususPct || 30) / 100) ekle('likidite_dusus', `${r.ortak} ortak çift: $${Math.round(r.once).toLocaleString('tr-TR')} → $${Math.round(r.simdi).toLocaleString('tr-TR')} (${pct(d)}; eşik −%${E.likiditeDususPct})`);
    }
  }
  // LP kilidi
  if (son.lpKilitBitis) {
    const kalan = (Date.parse(son.lpKilitBitis) - simdi) / 864e5;
    if (Number.isFinite(kalan) && kalan <= (E.lpKilitKalanGun || 30)) ekle('lp_kilit_bitiyor', kalan < 0 ? `kilit ${son.lpKilitBitis.slice(0, 10)} tarihinde bitti` : `${Math.ceil(kalan)} gün kaldı (${son.lpKilitBitis.slice(0, 10)}; eşik ${E.lpKilitKalanGun} gün)`);
  }
  if (son.lpPazarlar) {
    // RugCheck: aynı pazar (ayniPazarLp). Pazar listesi olmayan eski satırla bayrak yok (pazar sırası değişimi sahte alarm veriyordu).
    const o = onceki('lpPazarlar');
    const r = o ? ayniPazarLp(o.m.lpPazarlar, son.lpPazarlar) : null;
    if (r && r.olculdu && r.once - r.simdi >= (E.lpKilitDususPuan || 20) / 100) ekle('lp_kilit_azaldi', `pazar ${String(r.adres).slice(0, 8)}…: ${pct(r.once)} → ${pct(r.simdi)} (eşik ${E.lpKilitDususPuan} puan)`);
  } else if (Number.isFinite(son.lpKilitliPay)) {
    // GoPlus (EVM): kilitli LP holder paylarının TOPLAMI — sıradan bağımsız, eskisi gibi.
    const o = onceki('lpKilitliPay');
    if (o && !o.m.lpPazarlar && o.m.lpKilitliPay - son.lpKilitliPay >= (E.lpKilitDususPuan || 20) / 100) ekle('lp_kilit_azaldi', `${pct(o.m.lpKilitliPay)} → ${pct(son.lpKilitliPay)} (eşik ${E.lpKilitDususPuan} puan)`);
  }
  // Durum bayrakları
  if (son.sahipYetkisi === true) ekle('sahip_yetkisi', 'GoPlus: can_take_back_ownership / hidden_owner / owner_change_balance');
  if (son.mint === true) ekle('mint_yetkisi', 'GoPlus is_mintable ya da Solana mint yetkisi açık');
  if (son.blacklist === true) ekle('blacklist', 'GoPlus is_blacklisted / transfer_pausable ya da Solana freeze yetkisi açık');
  if (son.vergiDegisebilir === true) ekle('vergi_degisebilir', 'GoPlus slippage_modifiable');
  if (son.honeypot === true) ekle('honeypot', 'GoPlus is_honeypot / cannot_sell_all');
  if (son.rugged === true) ekle('rugged', 'RugCheck rugged = true');
  if ((son.boost || 0) > 0 || (son.siparisler && son.siparisler.length)) {
    const turler = [...new Set((son.siparisler || []).map(s => s.tur))].filter(Boolean);
    ekle('parali_tanitim', [son.boost > 0 ? `aktif boost ${son.boost}` : null, turler.length ? `ödenmiş: ${turler.join(', ')}` : null].filter(Boolean).join(' · '));
  }
  if (son.alanAdiKayit && son.ilkCift) {
    // Ö13 / B-30 (61.1): yalnız token'dan ÖNCE (0…eşik gün) alınmış alan adı kırmızı bayrak. Token'dan SONRA
    // alınan alan adı olağan (çoğu proje önce token, sonra site açar) → bayrak DEĞİL; Ayrıntı'da bilgi satırı
    // (alanAdiFarki). Eskiden fark < 0 da eşiğin altında sayılıp "12 gün SONRA" bayrağı üretiyordu.
    const fark = alanAdiFarki(son);
    if (fark && fark.yon === 'once' && fark.gun <= (E.alanAdiGun || 30)) ekle('alan_adi_yeni', `${son.alanAdi}: kayıt ${son.alanAdiKayit.slice(0, 10)}, ilk DEX çifti ${son.ilkCift.slice(0, 10)} (${Math.round(fark.gun)} gün önce; eşik ${E.alanAdiGun || 30} gün)${son.kayitSirketi ? ` · ${son.kayitSirketi}` : ''}`);
  }
  // Kayboldu: son N taramada fiyat da hacim de yok, daha önce vardı
  const N = Math.max(1, Math.round(E.kayipTarama || 2));
  if (seri.length > N && seri.slice(-N).every(s => s.m.fiyatYok) && seri.slice(0, -N).some(s => !s.m.fiyatYok)) {
    const sonVar = [...seri].reverse().find(s => !s.m.fiyatYok);
    ekle('veri_kayboldu', `son ${N} taramada fiyat/hacim yok; son görüldüğü ${sonVar ? String(sonVar.zaman).slice(0, 10) : '—'}`);
  }
  return out;
}

module.exports = { metrikler, bayraklar, ayiklanmis, alanAdiFarki, ortakLikidite, ciftHaritasi, lpPazarlari, ayniPazarLp, CIFT_KAPSAM, ACIKLAMA };
