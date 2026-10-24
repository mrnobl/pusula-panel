'use strict';
/**
 * YAPAY ZEKÂ NOTLARI (74.1) — SABİT SORGU ŞABLONLARIYLA ÜCRETSİZ KAYNAKLAR (ağ yalnız verilen `fetch` ile; öz testte sahte).
 * ═══════════════════════════════════════════════════════════════════════════
 *   coin   · Google Haberler RSS — sabit şablon: `"<SEMBOL>" (crypto OR token OR coin) (hack OR exploit OR delist OR delisting
 *            OR "trading halt") when:7d` (anahtarsız, İngilizce baskı). Yalnız başlık + kısa açıklama + bağlantı + tarih.
 *          · Binance duyuruları — "Delisting" kataloğu (161), son 30 gün başlıkları; günde TEK istek, sembol kelime sınırıyla eşlenir.
 *   bist   · KAP bildirim listesi (son 1 gün, tek istek; lib/bildirimUreticileri.js ile aynı uç) + şirket başına en çok 1 bildirim
 *            sayfası (finansal rapor sayfası okunmaz — bilanço özeti ayrı türde). İstekler arası ≥ 20 sn (73.5 KAP kuralı).
 *   nasdaq · SEC EDGAR: company_tickers.json (30 gün önbellek) → submissions/CIK…json → son 3 günün 8-K / 10-Q / 10-K'si;
 *            8-K'nin ana belgesi okunur (≤ 1 / şirket), 10-Q / 10-K yalnız BAŞLIK. User-Agent "Pusula/<sürüm>" (kişisel bilgi yok),
 *            istekler arası ≥ 1 sn (SEC sınırı 10/sn).
 * Ücretli uç YOK; Google Search "grounding" (faturalı) YOK.
 */
const T = require('./temizle');

const GUN = 864e5;
const KAP = 'https://www.kap.org.tr/tr/api';
const KAP_SAYFA = 'https://www.kap.org.tr/tr/Bildirim/';
const TARAYICI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const SEC_TICKER = 'https://www.sec.gov/files/company_tickers.json';
const SEC_SUB = (cik) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`;
const SEC_BELGE = (cik, acc, belge) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(acc).replace(/-/g, '')}/${encodeURIComponent(belge)}`;
const BINANCE_DELIST = 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=161&pageNo=1&pageSize=30';
const BINANCE_DUYURU = (kod) => `https://www.binance.com/en/support/announcement/${encodeURIComponent(kod)}`;

/** Saf: coin sorgu şablonu → Google Haberler RSS adresi. Sembol yalnız [A-Z0-9] (şablon dışı metin giremez). */
function haberAdresi(sembol) {
  const s = String(sembol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
  if (!s) return null;
  const q = `"${s}" (crypto OR token OR coin) (hack OR exploit OR delist OR delisting OR "trading halt") when:7d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}
/** Saf: başlıkta sembol kelime sınırıyla geçiyor mu ("ETH" "ETHFI"de sayılmaz). */
function sembolGeciyor(metin, sembol) {
  const s = String(sembol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 2) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${s}([^A-Za-z0-9]|$)`).test(String(metin || '').toUpperCase());
}
const gunOnce = (iso, simdi, gun) => { const t = Date.parse(iso || ''); return !Number.isFinite(t) || simdi - t <= gun * GUN; };

function olustur(o = {}) {
  const fetchFn = o.fetch || ((...a) => fetch(...a));
  const bekle = o.bekle || ((ms) => new Promise(r => setTimeout(r, ms)));
  const simdi = o.simdi || Date.now;
  const ua = o.ua || 'Pusula';
  const sonIstek = {};
  /** Ev sahibi başına en az `ms` aralık. */
  async function sirala(host, ms) { const b = (sonIstek[host] || 0) + ms - simdi(); if (b > 0) await bekle(b); sonIstek[host] = simdi(); }
  async function al(url, { host, aralik = 1500, basliklar = {}, metin = false, yontem = 'GET', govde = null, zamanAsimi = 45000 } = {}) {
    await sirala(host || new URL(url).host, aralik);
    const r = await fetchFn(url, { method: yontem, headers: { 'User-Agent': ua, ...basliklar }, body: govde, redirect: 'follow', signal: AbortSignal.timeout(zamanAsimi) });
    if (!r.ok) throw Object.assign(new Error(`${new URL(url).host} HTTP ${r.status}`), { status: r.status });
    return metin ? r.text() : r.json();
  }

  /** coin: Google Haberler (sabit şablon). @returns [{ url, tarih, baslik, metin, kaynakAd }] */
  async function haberler(sembol, enCok = 6) {
    const url = haberAdresi(sembol);
    if (!url) return [];
    const xml = await al(url, { host: 'news.google.com', aralik: 3000, metin: true });
    return T.rssOgeleri(xml, { enCok: 30 }).filter(x => gunOnce(x.tarih, simdi(), 8)).slice(0, enCok)
      .map(x => ({ url: x.link, tarih: x.tarih, baslik: x.baslik, metin: [x.baslik, x.aciklama, x.kaynak ? `Yayın: ${x.kaynak}` : ''].filter(Boolean).join('\n'), kaynakAd: 'Google Haberler' }));
  }

  /** coin: Binance "Delisting" duyuruları (son 30 gün) — günde tek istek, sonra sembolle süzülür. */
  async function binanceDelist() {
    const j = await al(BINANCE_DELIST, { host: 'www.binance.com', aralik: 2000, basliklar: { 'User-Agent': TARAYICI_UA, Accept: 'application/json' } });
    const kat = j && j.data && Array.isArray(j.data.catalogs) ? j.data.catalogs : [];
    const l = [];
    for (const c of kat) for (const a of c.articles || []) {
      const t = Number(a.releaseDate);
      if (!a.code || !a.title) continue;
      const tarih = Number.isFinite(t) ? new Date(t).toISOString() : null;
      if (!gunOnce(tarih, simdi(), 30)) continue;
      l.push({ url: BINANCE_DUYURU(a.code), tarih, baslik: T.htmlTemizle(a.title, { enCok: 300 }), metin: T.htmlTemizle(a.title, { enCok: 300 }), kaynakAd: 'Binance duyuruları' });
    }
    return l;
  }

  /** bist: KAP bildirim listesi (son 1 gün, tüm türler) — tek istek. */
  async function kapListe() {
    const g = (t) => new Date(t).toISOString().slice(0, 10);
    const govde = { fromDate: g(simdi() - GUN), toDate: g(simdi()), memberType: 'IGS', mkkMemberOidList: [], inactiveMkkMemberOidList: [], disclosureClass: '', subjectList: [], isLate: '', mainSector: '', sector: '', subSector: '', marketOid: '', index: '', bdkReview: '', bdkMemberOidList: [], year: '', term: '', ruleType: '', period: '', fromSrc: false, srcCategory: '', disclosureIndexList: [] };
    const j = await al(`${KAP}/disclosure/members/byCriteria`, { host: 'www.kap.org.tr', aralik: 20000, yontem: 'POST', govde: JSON.stringify(govde), zamanAsimi: 60000,
      basliklar: { 'User-Agent': TARAYICI_UA, 'Content-Type': 'application/json', 'Accept-Language': 'tr' } });
    return Array.isArray(j) ? j : [];
  }
  /** bist: tek KAP bildirim sayfası → temizlenmiş metin. */
  async function kapSayfa(index) {
    const ham = await al(KAP_SAYFA + encodeURIComponent(index), { host: 'www.kap.org.tr', aralik: 20000, metin: true, zamanAsimi: 90000, basliklar: { 'User-Agent': TARAYICI_UA } });
    const coz = String(ham).replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\n/g, '\n');
    return T.htmlTemizle(coz, { enCok: 9000 });
  }

  /** nasdaq: sembol → CIK haritası (önbellek `o.onbellek` { oku(), yaz(x) }, 30 gün). */
  async function secCikHaritasi() {
    const ob = o.onbellek ? o.onbellek.oku() : null;
    if (ob && ob.zaman && simdi() - ob.zaman < 30 * GUN && ob.harita && Object.keys(ob.harita).length) return ob.harita;
    const j = await al(SEC_TICKER, { host: 'www.sec.gov', aralik: 1100 });
    const h = {};
    for (const v of Object.values(j || {})) if (v && v.ticker && v.cik_str) h[String(v.ticker).toUpperCase()] = Number(v.cik_str);
    if (o.onbellek && Object.keys(h).length) o.onbellek.yaz({ zaman: simdi(), harita: h });
    return h;
  }
  /** nasdaq: şirketin son başvuruları (son `gun` gün; 8-K, 10-Q, 10-K, 6-K). */
  async function secBasvurular(cik, gun = 3) {
    const j = await al(SEC_SUB(cik), { host: 'data.sec.gov', aralik: 1100 });
    const r = (j && j.filings && j.filings.recent) || {};
    const out = [];
    const n = Array.isArray(r.form) ? r.form.length : 0;
    for (let i = 0; i < n && i < 60; i++) {
      const form = String(r.form[i] || '');
      if (!/^(8-K|10-Q|10-K|6-K)(\/A)?$/.test(form)) continue;
      const tarih = r.filingDate ? r.filingDate[i] : null;
      if (!tarih || simdi() - Date.parse(`${tarih}T00:00:00Z`) > gun * GUN) continue;
      out.push({ form, tarih, acc: r.accessionNumber[i], belge: r.primaryDocument ? r.primaryDocument[i] : null, aciklama: r.primaryDocDescription ? String(r.primaryDocDescription[i] || '') : '', maddeler: r.items ? String(r.items[i] || '') : '', ad: j.name || null });
    }
    return out;
  }
  /** nasdaq: 8-K ana belgesi → temizlenmiş metin. */
  async function secBelge(cik, acc, belge) {
    const ham = await al(SEC_BELGE(cik, acc, belge), { host: 'www.sec.gov', aralik: 1100, metin: true });
    return { url: SEC_BELGE(cik, acc, belge), metin: T.htmlTemizle(ham, { enCok: 12000 }) };
  }

  return { haberler, binanceDelist, kapListe, kapSayfa, secCikHaritasi, secBasvurular, secBelge };
}

module.exports = { olustur, haberAdresi, sembolGeciyor, SEC_BELGE, KAP_SAYFA, BINANCE_DUYURU };
