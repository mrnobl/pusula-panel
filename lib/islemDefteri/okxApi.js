/**
 * İŞLEM DEFTERİ — OKX SALT OKUMA EŞİTLEMESİ (sürüm 64.7). EMİR VERMEZ: yalnız GET uçları çağrılır (aşağıdaki UC listesi;
 * başka yol imzalanmaz). Belge: https://www.okx.com/docs-v5/en/ (REST Authentication, Trade › Get transaction details
 * (last 3 months), Account › Get bills details (last 3 months — "bills-archive"; 5 istek / 2 sn), Account › Get account configuration).
 *
 *   imza(gizli, zamanDamgasi, yontem, yolSorgu, govde)  Base64(HMAC-SHA256(gizli, ts + METHOD + requestPath(+?query) + body))
 *   izinOku(anahtar)          GET /api/v5/account/config → data[0].perm ("read_only" / "read_only,trade" / "…,withdraw")
 *   izinDegerlendir(perm)     → { durum: 'salt-okuma' | 'yasak' | 'bilinmiyor', izinler: [...] }  (yalnız "read_only" kabul;
 *        trade / withdraw ya da TANINMAYAN herhangi bir izin 'yasak'; izin bildirilmezse 'bilinmiyor' → elle onay)
 *   esitle({ anahtar, D, hesapId, imlec, tamTarama, simdi, bekle })  fills-history (SPOT/MARGIN/SWAP/FUTURES/OPTION, son 3 ay) +
 *        bills-archive (son 3 ay): fonlama 8, aktarım 1, vadeli işlem 2, teslim 3 / tasfiye 5 / ADL 9 (pnl → kz), faiz 7 (→ ucret);
 *        spot işlem bill'leri ALINMAZ, tanınmayan türler sayılıp özette uyarı olur. 3 aydan eski geçmiş API'den gelmez: OKX
 *        dosyasıyla (Trading history CSV, 1 yıla kadar) yüklenir; dosya ile API'nin örtüşen dolumları depo.iceAktarPlan'da çift sayılır.
 *        Artımlı: her uç için imlec[uç].durak = son eşitlemede görülen EN YENİ satır (türü ne olursa olsun — yalnız spot işlemi
 *        olan hesap her gün 3 ayı yeniden taramaz); en yeniden geriye sayfalanır, durağa ya da kayıtta olan billId'ye gelince durur.
 *        Sayfa tavanı (uç başına 400 sayfa / eşitleme) aşılırsa kalan aralık imlec[uç].devam olarak saklanır; sonraki eşitleme
 *        kaldığı yerden sürer. tamTarama (OKX dosya yüklemesi geri alınınca) durakları yok sayar: 3 ayın tamamı yeniden taranır.
 *        Hız: istekler arası ≥ 250 ms (fills-history 10 istek / 2 sn, bills-archive 5 istek / 2 sn sınırının altında).
 * Anahtar nesnesi { apiKey, secret, passphrase } YALNIZ bu modülün içinde kullanılır; hiçbir yanıta, kayda, günlüğe yazılmaz.
 * Hata mesajları SABİT metindir (guvenliMesaj): fetch / undici hatasının e.message'ı (başlık değerini, yani sırrı içerebilir)
 * asla dışarı verilmez.
 */
'use strict';
const crypto = require('crypto');
const M = require('./model');
const MT = require('./metin');

const TABAN = 'https://www.okx.com';
const UC = { config: '/api/v5/account/config', fills: '/api/v5/trade/fills-history', bills: '/api/v5/account/bills-archive',
  degerleme: '/api/v5/asset/asset-valuation' };   // yeni panel F4 (K-E): bütün hesapların USD toplamı (lib/islemDefteri/bakiye.js)
const INST_TURLERI = ['SPOT', 'MARGIN', 'SWAP', 'FUTURES', 'OPTION'];
const SAYFA_TAVAN = 400;          // tek eşitlemede uç başına en çok 400 sayfa (40 000 satır)
const ARA_MS = 260;

function imza(gizli, ts, yontem, yolSorgu, govde = '') {
  return crypto.createHmac('sha256', String(gizli)).update(`${ts}${String(yontem).toUpperCase()}${yolSorgu}${govde || ''}`).digest('base64');
}

/** Yalnız yazdırılabilir ASCII (HTTP başlık değeri olabilecek; CR, LF, NUL ve ASCII dışı yok). */
const BASLIK_GUVENLI = /^[\x20-\x7E]{1,128}$/;

/** Anahtar biçimi (değer döndürmez, mesajda değer YOK): apiKey UUID, secret 32 onaltılık, passphrase 1–64 yazdırılabilir ASCII. */
function anahtarBicimi(a) {
  if (!a || typeof a !== 'object') return 'anahtar yok';
  const k = String(a.apiKey == null ? '' : a.apiKey), g = String(a.secret == null ? '' : a.secret), p = String(a.passphrase == null ? '' : a.passphrase);
  if (!BASLIK_GUVENLI.test(k) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k.trim())) return 'API Key biçimi geçersiz (OKX: 8-4-4-4-12 harf/rakam)';
  if (!BASLIK_GUVENLI.test(g) || !/^[0-9A-Fa-f]{32}$/.test(g.trim())) return 'Secret Key biçimi geçersiz (OKX: 32 harf/rakam)';
  if (!p) return 'Passphrase boş';
  if (p.length > 64) return 'Passphrase çok uzun (en çok 64 karakter)';
  if (!BASLIK_GUVENLI.test(p)) return 'Passphrase yalnız İngilizce harf, rakam ve klavye işaretleri içerebilir (Türkçe harf, satır sonu, sekme olamaz)';
  return null;
}

/** Bu modülün kendi (sır içermeyen, sabit) hatası. */
const guvenliHata = (mesaj) => Object.assign(new Error(mesaj), { okxGuvenli: true });
/** Dışarı verilecek hata metni: yalnız bu modülün sabit mesajları; başka her hata yalnız adıyla (e.message ASLA). */
const guvenliMesaj = (e) => (e && e.okxGuvenli ? e.message : `beklenmeyen hata (${(e && e.name) || 'Error'})`);

function izinDegerlendir(perm) {
  if (perm == null || perm === '') return { durum: 'bilinmiyor', izinler: [] };
  const izinler = String(perm).split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!izinler.length) return { durum: 'bilinmiyor', izinler };
  // Yalnız "read_only" kabul: trade, withdraw ve OKX'in ileride ekleyebileceği TANINMAYAN her izin reddedilir.
  if (izinler.every(x => x === 'read_only')) return { durum: 'salt-okuma', izinler };
  return { durum: 'yasak', izinler };
}

/** Tek imzalı GET (yalnız UC listesindeki yollar). Hata mesajında anahtar YOK (yalnız guvenliHata). */
async function getir(anahtar, yol, sorgu, ops = {}) {
  if (!Object.values(UC).includes(yol)) throw guvenliHata('izin verilmeyen OKX yolu');
  const bicim = anahtarBicimi(anahtar);   // kayıtlı eski anahtar da denetlenir: başlığa geçersiz değer hiç gitmez
  if (bicim) throw guvenliHata(`OKX anahtarı geçersiz: ${bicim}`);
  const qs = Object.entries(sorgu || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const yolSorgu = qs ? `${yol}?${qs}` : yol;
  const ts = new Date(ops.simdi ? ops.simdi() : Date.now()).toISOString();
  const fetchFn = ops.fetch || ((...a) => globalThis.fetch(...a));
  let r, metin;
  try {
    r = await fetchFn(TABAN + yolSorgu, {
      method: 'GET',
      headers: { 'OK-ACCESS-KEY': String(anahtar.apiKey).trim(), 'OK-ACCESS-SIGN': imza(String(anahtar.secret).trim(), ts, 'GET', yolSorgu), 'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': String(anahtar.passphrase), accept: 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    });
    metin = await r.text();
  } catch (e) {
    // undici 'Headers.append: "<değer>" is an invalid header value' gibi hatalar sırrı içerebilir → yalnız hata adı
    throw guvenliHata(`OKX'e bağlanılamadı (${(e && e.name) || 'Error'})`);
  }
  let j = null;
  try { j = JSON.parse(metin); } catch (e) { throw guvenliHata(`OKX yanıtı okunamadı (HTTP ${Number(r.status) || '?'})`); }
  if (!j || typeof j !== 'object') throw guvenliHata(`OKX yanıtı okunamadı (HTTP ${Number(r.status) || '?'})`);
  if (!r.ok || String(j.code) !== '0') {
    const kod = j.code != null && /^\d{1,6}$/.test(String(j.code)) ? String(j.code) : String(Number(r.status) || '?');
    const ac = { 50111: 'API Key geçersiz', 50113: 'imza geçersiz (Secret yanlış)', 50105: 'Passphrase yanlış', 50110: 'IP adresi anahtarın beyaz listesinde değil', 50011: 'istek sınırı aşıldı — biraz sonra yeniden', 50102: 'saat farkı (bilgisayarın saatini eşitleyin)', 50114: 'yetki yok' }[kod];
    throw guvenliHata(`OKX reddetti (kod ${kod}${ac ? ': ' + ac : ''})`);
  }
  return Array.isArray(j.data) ? j.data : [];
}

async function izinOku(anahtar, ops = {}) {
  const d = await getir(anahtar, UC.config, null, ops);
  const c = d[0] || {};
  return { perm: c.perm != null ? String(c.perm) : null, uid: null, ...izinDegerlendir(c.perm) };
}

/** fills-history satırı → normal kayıt (kaynakId = billId; bills-archive'deki aynı satırla aynı anahtar). */
function dolumKaydi(f) {
  const s = M.okxSembol(f.instId, f.instType);
  const fee = MT.sayi(f.fee);
  const pnl = MT.sayi(f.fillPnl);
  const vadeli = s.piyasa === 'vadeli';
  return {
    tur: 'islem', islemTuru: 'dolum', kaynak: 'okx-api', kaynakId: `bill:${f.billId || `${f.instId}:${f.tradeId}`}`,
    zaman: Number(f.fillTime || f.ts), sembol: s.sembol, piyasa: s.piyasa, yon: String(f.side).toLowerCase() === 'buy' ? 'al' : 'sat',
    miktar: Math.abs(MT.sayi(f.fillSz) || 0), fiyat: MT.sayi(f.fillPx) || 0, kontrat: vadeli ? 'sözleşme adedi (OKX sz)' : null,
    ucret: { tutar: -(fee || 0), para: String(f.feeCcy || s.para || '').toUpperCase() },   // OKX: eksi = ödenen ücret, artı = iade (maker rebate)
    gerceklesenKar: vadeli ? (pnl != null ? pnl : null) : null,
    pozisyonYonu: f.posSide === 'long' || f.posSide === 'short' ? f.posSide : null,
    pozisyonId: null, para: s.para, ham: MT.hamKisalt({ instType: f.instType, instId: f.instId, tradeId: f.tradeId, ordId: f.ordId, billId: f.billId, side: f.side, posSide: f.posSide, fillSz: f.fillSz, fillPx: f.fillPx, fee: f.fee, feeCcy: f.feeCcy, fillPnl: f.fillPnl, execType: f.execType, ts: f.ts })
  };
}

/** bills-archive türleri: işlenenler (diğerleri sayılıp eşitleme özetinde uyarı olur). */
const BILL_TIPLERI = { 1: 'aktarım', 2: 'işlem', 3: 'teslim', 5: 'tasfiye', 7: 'faiz', 8: 'fonlama', 9: 'ADL' };
const BILL_KZ = { 3: 'OKX teslim (delivery)', 5: 'OKX tasfiye (liquidation)', 9: 'OKX ADL (otomatik kapatma)' };

/**
 * bills-archive satırı → normal kayıt, kayıt dizisi ya da null. type 8 fonlama · type 1 aktarım (işlem hesabına giriş/çıkış) ·
 * type 2 vadeli işlem (SWAP/FUTURES/OPTION; kâr = pnl, ücret = fee) — spot ve marjin işlem bill'leri atlanır (her para birimi için
 * ayrı satır olabilir; dolum kaydıyla karışmasın) · type 3 teslim / 5 tasfiye / 9 ADL → kz (pnl) + varsa ücret (fee; kimlik
 * "bill:<id>:fee") · type 7 faiz → ucret (balChg; eksi = ödenen). Aynı billId fills-history'de dolum olarak da gelirse dolum kalır.
 */
function billKaydi(b) {
  const tip = String(b.type);
  const zaman = Number(b.ts || b.fillTime);
  const para = String(b.ccy || '').toUpperCase();
  const ham = MT.hamKisalt({ billId: b.billId, type: b.type, subType: b.subType, instType: b.instType, instId: b.instId, ccy: b.ccy, balChg: b.balChg, pnl: b.pnl, fee: b.fee, sz: b.sz, px: b.px, ts: b.ts });
  if (BILL_KZ[tip]) {
    const s = b.instId ? M.okxSembol(b.instId, b.instType) : { sembol: null };
    const pnl = MT.sayi(b.pnl), fee = MT.sayi(b.fee);
    const out = [];
    if (pnl) out.push({ tur: 'kz', kaynak: 'okx-api', kaynakId: `bill:${b.billId}`, zaman, sembol: s.sembol, piyasa: 'vadeli', para, tutar: pnl, ham, not: BILL_KZ[tip] });
    if (fee) out.push({ tur: 'ucret', kaynak: 'okx-api', kaynakId: `bill:${b.billId}:fee`, zaman, sembol: s.sembol, piyasa: 'vadeli', para, tutar: fee, ham, not: `${BILL_KZ[tip]} ücreti` });
    return out.length > 1 ? out : out[0] || null;
  }
  if (tip === '7') {
    const v = MT.sayi(b.balChg);
    if (!v) return null;
    const s = b.instId ? M.okxSembol(b.instId, b.instType) : { sembol: null };
    return { tur: 'ucret', kaynak: 'okx-api', kaynakId: `bill:${b.billId}`, zaman, sembol: s.sembol, piyasa: 'vadeli', para, tutar: v, ham, not: 'OKX faiz (interest)' };
  }
  if (tip === '8') {
    const s = b.instId ? M.okxSembol(b.instId, b.instType) : { sembol: null };
    return { tur: 'fonlama', kaynak: 'okx-api', kaynakId: `bill:${b.billId}`, zaman, sembol: s.sembol, piyasa: 'vadeli', para, tutar: MT.sayi(b.balChg) || MT.sayi(b.pnl) || 0, ham };
  }
  if (tip === '1') {
    const v = MT.sayi(b.balChg) || 0;
    if (!v) return null;
    return { tur: v > 0 ? 'para-giris' : 'para-cikis', kaynak: 'okx-api', kaynakId: `bill:${b.billId}`, zaman, sembol: null, para, tutar: v, ham, not: 'işlem hesabına aktarım' };
  }
  if (tip === '2' && /^(SWAP|FUTURES|OPTION)$/.test(String(b.instType || '').toUpperCase())) {
    const s = M.okxSembol(b.instId, b.instType);
    const sub = String(b.subType);
    const yon = ['1', '3', '6'].includes(sub) ? 'al' : ['2', '4', '5'].includes(sub) ? 'sat' : (MT.sayi(b.sz) >= 0 ? 'al' : 'sat');
    const miktar = Math.abs(MT.sayi(b.sz) || 0);
    if (!miktar) return null;
    return {
      tur: 'islem', islemTuru: 'dolum', kaynak: 'okx-api', kaynakId: `bill:${b.billId}`, zaman, sembol: s.sembol, piyasa: 'vadeli', yon,
      miktar, fiyat: MT.sayi(b.px) || 0, kontrat: 'sözleşme adedi (OKX sz)', ucret: { tutar: -(MT.sayi(b.fee) || 0), para },
      gerceklesenKar: MT.sayi(b.pnl), pozisyonYonu: sub === '5' || sub === '3' ? 'long' : sub === '6' || sub === '4' ? 'short' : null, para: s.para || para, ham
    };
  }
  return null;
}

const bekleVarsayilan = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Eşitleme: yeni kayıtlar (normal kayıt dizisi) + özet + yeni imleç. D: depo durumu (çift denetimi: etkin anahtarlar + bastırılan —
 * kullanıcının iptal ettiği / geri aldığı satır geri gelmez), hesapId. imlec: önceki eşitlemenin { [uç]: { durak, devam } }'u
 * (okx-durum.json; api.js saklar). tamTarama: durak yok sayılır, bilinen satırda durulmaz (3 ayın tamamı).
 * Geriye sayfalama `after=<en eski billId>` ile. Sayfa bütçesi uç başına SAYFA_TAVAN (en yeni bölüm + kalan aralıklar birlikte).
 */
async function esitle({ anahtar, D, hesapId, fetch, simdi, bekle = bekleVarsayilan, log = () => {}, imlec = null, tamTarama = false, sayfaTavan = SAYFA_TAVAN }) {
  const bas = D.bastirilan || new Map();
  const bilinen = (kid) => { const a = M.anahtar(hesapId, 'okx-api', kid); return D.anahtarlar.has(a) || bas.has(a); };
  const yeni = [];
  const ozet = { istek: 0, dolum: 0, bill: 0, atlanan: 0, sayfa: {}, tavan: [], atlananTur: {}, uyarilar: [] };
  const ops = { fetch, simdi };
  const eskiImlec = (imlec && typeof imlec === 'object') ? imlec : {};
  const yeniImlec = {};
  const zamanOf = (x) => Number(x.ts || x.fillTime) || 0;

  /** Tek aralık: `after`tan (null = en yeni) geriye; `durak`a (önceki en yeni satır) ya da (durBilinen ise) bilinen satıra gelince durur. */
  async function tara(yol, sabit, cevir, ad, after, durak, durBilinen, butce) {
    let enYeni = null, tavan = false;
    for (;;) {
      if (butce.kalan <= 0) { tavan = true; break; }
      if (ozet.istek) await bekle(ARA_MS);
      const d = await getir(anahtar, yol, { ...sabit, limit: 100, after }, ops);
      ozet.istek++; butce.kalan--;
      ozet.sayfa[ad] = (ozet.sayfa[ad] || 0) + 1;
      if (!d.length) break;
      let dur = false;
      for (const x of d) {
        if (!enYeni) enYeni = { billId: String(x.billId || ''), ts: zamanOf(x) };
        if (durak && (String(x.billId) === durak.billId || zamanOf(x) < durak.ts)) { dur = true; break; }
        if (ad === 'bills' && !BILL_TIPLERI[String(x.type)]) { const t = String(x.type); ozet.atlananTur[t] = (ozet.atlananTur[t] || 0) + 1; }
        const c = cevir(x);
        const l = !c ? [] : Array.isArray(c) ? c : [c];
        if (!l.length) { ozet.atlanan++; continue; }
        for (const k of l) {
          if (bilinen(k.kaynakId) || bilinen(k.kaynakId.replace(/:fee$/, ''))) { if (durBilinen) dur = true; continue; }
          yeni.push(k);
        }
      }
      after = d[d.length - 1].billId;
      if (dur || d.length < 100 || !after) break;
    }
    return { enYeni, tavan, after };
  }

  async function uc(yol, sabit, cevir, ad) {
    const st = eskiImlec[ad] || {};
    const butce = { kalan: sayfaTavan };
    const kalan = [];
    // 1) en yeniden önceki durağa kadar (tam taramada sona kadar)
    const r1 = await tara(yol, sabit, cevir, ad, null, tamTarama ? null : (st.durak || null), !tamTarama, butce);
    if (r1.tavan) kalan.push({ after: r1.after, durak: tamTarama ? null : (st.durak || null) });
    // 2) önceki eşitlemelerde tavan yüzünden kalan aralıklar (kaldığı yerden; tam taramada gereksiz — 1. adım hepsini kapsar)
    for (const seg of (tamTarama ? [] : (Array.isArray(st.devam) ? st.devam : []))) {
      if (!seg || !seg.after) continue;
      if (butce.kalan <= 0) { kalan.push(seg); continue; }
      const r = await tara(yol, sabit, cevir, ad, seg.after, seg.durak || null, false, butce);
      if (r.tavan) kalan.push({ after: r.after, durak: seg.durak || null });
    }
    yeniImlec[ad] = { durak: r1.enYeni || st.durak || null, devam: kalan };
    if (kalan.length) {
      ozet.tavan.push(ad);
      log('WARN', `OKX ${ad}: sayfa tavanı (${sayfaTavan}) — kalan aralık saklandı, sonraki eşitleme kaldığı yerden sürer`);
    }
  }

  for (const it of INST_TURLERI) await uc(UC.fills, { instType: it }, dolumKaydi, `fills-${it}`);
  ozet.dolum = yeni.length;
  await uc(UC.bills, {}, billKaydi, 'bills');
  ozet.bill = yeni.length - ozet.dolum;
  // Aynı billId hem fills hem bills'ten gelebilir (vadeli dolum, tasfiye dolumu) — ilk gelen (fills, daha ayrıntılı) kalır;
  // o billId'nin bills'ten gelen ücret satırı ("bill:<id>:fee") da düşer (ücret dolumun içinde).
  const gorulen = new Set();
  const tekil = yeni.filter(k => {
    if (gorulen.has(k.kaynakId) || gorulen.has(k.kaynakId.replace(/:fee$/, ''))) return false;
    gorulen.add(k.kaynakId); return true;
  });
  const tt = Object.entries(ozet.atlananTur);
  if (tt.length) ozet.uyarilar.push(`OKX'in işlenmeyen hareket türleri atlandı: ${tt.map(([t, n]) => `tür ${t} (${n})`).join(', ')} — performansa girmedi.`);
  if (ozet.tavan.length) ozet.uyarilar.push(`Çok satır var: ${ozet.tavan.join(', ')} için sayfa tavanına gelindi; kalanı sonraki eşitlemede kaldığı yerden gelir.`);
  return { kayitlar: tekil, ozet, imlec: yeniImlec };
}

module.exports = { imza, anahtarBicimi, izinDegerlendir, izinOku, getir, dolumKaydi, billKaydi, esitle, guvenliMesaj, guvenliHata, UC, INST_TURLERI, TABAN, BILL_TIPLERI, SAYFA_TAVAN };
