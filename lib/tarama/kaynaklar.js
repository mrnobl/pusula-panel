/**
 * COIN TARAMA — kaynak bağdaştırıcıları (hepsi anahtarsız, ücretsiz; referans/ARASTIRMA-ONCHAIN.md §2/§5).
 *
 * Sözleşme: her bağdaştırıcı { ad, kisaAd, araMs, destekler(coin) → true | 'neden', getir(coin, ctx) } ve getir şunu döner:
 *   { durum: 'ok', ham }                    kaynak cevap verdi, veri var
 *   { durum: 'bos', neden, ham? }           kaynak cevap verdi ama bu token için veri yok (kaybolma izi — HATA DEĞİL)
 *   { durum: 'hata', hata }                 erişilemedi / zaman aşımı / 5xx / hız sınırı (yeniden denendi)
 *   { durum: 'onbellek', ham, kaynakZamani } (yalnız RDAP) son sorgunun değeri, sorgu aralığı dolmadı
 * `ham` YALNIZ seçilmiş alanlar: sayılar Number(), metinler kısaltılmış (temizMetin) — dış veri hiçbir zaman yorumlanmaz.
 * `ctx` = { http (Istemci), fiyat (FiyatKaynagi), ayar, onceki (bu coinin önceki satırı | null), dex (bu taramanın
 * DexScreener sonucu | undefined), simdi, rdapBootstrap() }.
 */
'use strict';
const { AGLAR } = require('./aglar');
const { temizMetin, sayi, bayrak01 } = require('./ortak');

const YAKMA = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead', '0x0000000000000000000000000000000000000001',
  '1nc1nerator11111111111111111111111111111111']);
const tarihIso = (x) => {
  if (x === null || x === undefined || x === '' || x === 0 || x === '0') return null;
  const n = Number(x);
  const t = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(x));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
};
const hataSonuc = (r) => ({ durum: 'hata', hata: r.hata || `HTTP ${r.durum}`, ms: r.ms });

// ── GoPlus (EVM) ─────────────────────────────────────────────────────────
const goplus = {
  ad: 'goplus', kisaAd: 'GoPlus', araMs: 2500,
  destekler: (c) => (!AGLAR[c.ag] || !AGLAR[c.ag].goplus ? 'ağ desteklenmiyor (yalnız EVM)' : !c.sozlesme ? 'sözleşme adresi yok' : true),
  async getir(c, ctx) {
    const zincir = AGLAR[c.ag].goplus;
    const r = await ctx.http.json(`https://api.gopluslabs.io/api/v1/token_security/${zincir}?contract_addresses=${encodeURIComponent(c.sozlesme)}`, {
      host: 'goplus', araMs: this.araMs,
      hizKontrol: (j) => !!j && (Number(j.code) === 4029 || (Number(j.code) !== 1 && /too many|rate limit|limit exceeded/i.test(String(j.message || '')))) });
    if (!r.ok) return hataSonuc(r);
    const j = r.veri || {};
    if (Number(j.code) !== 1) return { durum: 'hata', hata: `GoPlus kodu ${temizMetin(j.code, 10)}: ${temizMetin(j.message, 80)}`, ms: r.ms };
    const sonuc = j.result || {};
    const x = sonuc[String(c.sozlesme).toLowerCase()] || Object.values(sonuc)[0];
    if (!x || typeof x !== 'object' || !Object.keys(x).length) return { durum: 'bos', neden: 'GoPlus bu sözleşmeyi tanımıyor', ms: r.ms };
    const ilk10 = (Array.isArray(x.holders) ? x.holders : []).slice(0, 10).map(h => ({
      adres: temizMetin(String(h.address || '').toLowerCase(), 64), pay: sayi(h.percent), sozlesme: bayrak01(h.is_contract) === true,
      kilitli: bayrak01(h.is_locked) === true, etiket: temizMetin(h.tag, 40) || null }));
    const lp = (Array.isArray(x.lp_holders) ? x.lp_holders : []).slice(0, 10).map(h => {
      const bitisler = (Array.isArray(h.locked_detail) ? h.locked_detail : []).map(d => tarihIso(d && d.end_time)).filter(Boolean).sort();
      return { adres: temizMetin(String(h.address || '').toLowerCase(), 64), pay: sayi(h.percent), kilitli: bayrak01(h.is_locked) === true, etiket: temizMetin(h.tag, 40) || null, kilitBitis: bitisler[0] || null, kilitBitisler: bitisler.slice(0, 5) };
    });
    return { durum: 'ok', ms: r.ms, ham: {
      holder: sayi(x.holder_count), toplamArz: sayi(x.total_supply), ilk10, lp, lpHolder: sayi(x.lp_holder_count),
      sahip: temizMetin(x.owner_address, 64) || null, yaratici: temizMetin(x.creator_address, 64) || null,
      mint: bayrak01(x.is_mintable), sahipGeriAlabilir: bayrak01(x.can_take_back_ownership), gizliSahip: bayrak01(x.hidden_owner),
      sahipBakiyeDegistirir: bayrak01(x.owner_change_balance), blacklist: bayrak01(x.is_blacklisted), beyazListe: bayrak01(x.is_whitelisted),
      vergiDegisebilir: bayrak01(x.slippage_modifiable), kisiselVergi: bayrak01(x.personal_slippage_modifiable), honeypot: bayrak01(x.is_honeypot),
      tamSatisYok: bayrak01(x.cannot_sell_all), transferDurdurulur: bayrak01(x.transfer_pausable), proxy: bayrak01(x.is_proxy),
      alisVergisi: sayi(x.buy_tax), satisVergisi: sayi(x.sell_tax),
      dex: (Array.isArray(x.dex) ? x.dex : []).slice(0, 5).map(d => ({ ad: temizMetin(d.name, 30), likidite: sayi(d.liquidity), cift: temizMetin(d.pair, 64) })),
    } };
  },
};

// ── RugCheck (Solana) ────────────────────────────────────────────────────
const rugcheck = {
  ad: 'rugcheck', kisaAd: 'RugCheck', araMs: 1500,
  destekler: (c) => (c.ag !== 'sol' ? 'yalnız Solana' : !c.sozlesme ? 'mint adresi yok' : true),
  async getir(c, ctx) {
    const r = await ctx.http.json(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(c.sozlesme)}/report`, { host: 'rugcheck', araMs: this.araMs });
    if (!r.ok) {
      if (r.durum === 404 || r.durum === 400) return { durum: 'bos', neden: `RugCheck bu token için rapor vermiyor (HTTP ${r.durum})`, ms: r.ms };
      return hataSonuc(r);
    }
    const j = r.veri || {};
    const bilinen = j.knownAccounts && typeof j.knownAccounts === 'object' ? j.knownAccounts : {};
    const ilk10 = (Array.isArray(j.topHolders) ? j.topHolders : []).slice(0, 10).map(h => {
      const b = bilinen[h.owner] || bilinen[h.address] || null;
      return { adres: temizMetin(h.owner || h.address, 64), pay: sayi(h.pct) == null ? null : sayi(h.pct) / 100, insider: !!h.insider,
        bilinen: b ? temizMetin(b.name || b.type, 40) : null };
    });
    const tok = j.token && typeof j.token === 'object' ? j.token : {};
    const lp = (Array.isArray(j.markets) ? j.markets : []).slice(0, 5).map(m => ({ pazar: temizMetin(m.marketType, 30), adres: temizMetin(m.pubkey, 64),
      kilitliPay: m.lp && sayi(m.lp.lpLockedPct) != null ? sayi(m.lp.lpLockedPct) / 100 : null, kilitliUsd: m.lp ? sayi(m.lp.lpLockedUSD) : null }));
    const kilitler = Object.values(j.lockers && typeof j.lockers === 'object' ? j.lockers : {}).slice(0, 10).map(l => ({ bitis: tarihIso(l && l.unlockDate), usd: sayi(l && l.usdcLocked) }));
    const mintY = j.mintAuthority !== undefined ? j.mintAuthority : tok.mintAuthority;
    const freezeY = j.freezeAuthority !== undefined ? j.freezeAuthority : tok.freezeAuthority;
    if (sayi(j.totalHolders) == null && !ilk10.length) return { durum: 'bos', neden: 'RugCheck raporu boş', ms: r.ms };
    return { durum: 'ok', ms: r.ms, ham: {
      holder: sayi(j.totalHolders), ilk10, lp, kilitler,
      mintYetkisi: mintY === undefined ? null : !!mintY, dondurmaYetkisi: freezeY === undefined ? null : !!freezeY,
      rugged: typeof j.rugged === 'boolean' ? j.rugged : null, puan: sayi(j.score_normalised != null ? j.score_normalised : j.score),
      riskler: (Array.isArray(j.risks) ? j.risks : []).slice(0, 12).map(x => ({ ad: temizMetin(x.name, 60), seviye: temizMetin(x.level, 12) })),
    } };
  },
};

// ── DexScreener ──────────────────────────────────────────────────────────
const dexscreener = {
  ad: 'dexscreener', kisaAd: 'DexScreener', araMs: 1100,
  destekler: (c) => (!AGLAR[c.ag] || !AGLAR[c.ag].dex ? 'ağ desteklenmiyor' : !c.sozlesme ? 'sözleşme adresi yok' : true),
  async getir(c, ctx) {
    const ag = AGLAR[c.ag].dex;
    const adres = String(c.sozlesme);
    const r = await ctx.http.json(`https://api.dexscreener.com/tokens/v1/${ag}/${encodeURIComponent(adres)}`, { host: 'dexscreener', araMs: this.araMs });
    if (!r.ok) return hataSonuc(r);
    const ayni = (a) => (AGLAR[c.ag].evm ? String(a || '').toLowerCase() === adres.toLowerCase() : String(a || '') === adres);
    const ciftler = (Array.isArray(r.veri) ? r.veri : (r.veri && Array.isArray(r.veri.pairs) ? r.veri.pairs : []))
      .filter(p => p && p.baseToken && p.quoteToken && (ayni(p.baseToken.address) || ayni(p.quoteToken.address)));
    // Ödenmiş tanıtım kayıtları (reklam / profil / topluluk devri / trend çubuğu) — ayrı uç; düşerse kaynak düşmez, not edilir.
    let siparisler = null, siparisHata = null;
    const o = await ctx.http.json(`https://api.dexscreener.com/orders/v1/${ag}/${encodeURIComponent(adres)}`, { host: 'dexscreener', araMs: this.araMs });
    if (o.ok) siparisler = (Array.isArray(o.veri) ? o.veri : []).slice(0, 20).map(x => ({ tur: temizMetin(x.type, 30), durum: temizMetin(x.status, 20), odeme: tarihIso(x.paymentTimestamp) }));
    else siparisHata = o.hata;
    if (!ciftler.length) return { durum: 'bos', neden: 'DexScreener\'da bu token için çift yok', ms: r.ms, ham: { ciftSayisi: 0, siparisler, siparisHata } };
    const lik = (p) => sayi(p.liquidity && p.liquidity.usd) || 0;
    const tabanCiftler = ciftler.filter(p => ayni(p.baseToken.address)).sort((a, b) => lik(b) - lik(a));
    const en = tabanCiftler[0] || null;
    const ilk = ciftler.map(p => sayi(p.pairCreatedAt)).filter(t => t > 0).sort((a, b) => a - b)[0];
    const siteler = [];
    for (const p of ciftler) for (const w of ((p.info && Array.isArray(p.info.websites)) ? p.info.websites : [])) { const u = temizMetin(w && w.url, 200); if (u && !siteler.includes(u)) siteler.push(u); }
    const boost = Math.max(0, ...ciftler.map(p => sayi(p.boosts && p.boosts.active) || 0));
    return { durum: 'ok', ms: r.ms, ham: {
      ciftSayisi: ciftler.length,
      toplamLikidite: ciftler.reduce((s, p) => s + lik(p), 0),
      hacim24: ciftler.reduce((s, p) => s + (sayi(p.volume && p.volume.h24) || 0), 0),
      fiyat: en ? sayi(en.priceUsd) : null,
      enLikitCift: en ? { dex: temizMetin(en.dexId, 30), adres: temizMetin(en.pairAddress, 64), likidite: lik(en), quote: temizMetin(en.quoteToken.symbol, 20) } : null,
      fdv: en ? sayi(en.fdv) : null, piyasaDegeri: en ? sayi(en.marketCap) : null,
      ilkCiftTarihi: ilk ? new Date(ilk).toISOString() : null,
      siteler: siteler.slice(0, 5), boostAktif: boost, siparisler, siparisHata,
    } };
  },
};

// ── RDAP (alan adı) ──────────────────────────────────────────────────────
/** Siteden kayıt edilebilir alan adı (kaba: son iki etiket; bilinen iki parçalı ccTLD'lerde son üç). */
function alanAdiCikar(url) {
  let h;
  try { h = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase(); } catch { return null; }
  h = h.replace(/^www\./, '');
  const p = h.split('.').filter(Boolean);
  if (p.length < 2) return null;
  const ikili = /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(p.slice(-2).join('.'));
  return p.slice(ikili ? -3 : -2).join('.');
}
function rdapAyristir(j, alanAdi) {
  const olay = (ad) => { const e = (Array.isArray(j.events) ? j.events : []).find(x => x && x.eventAction === ad); return e ? tarihIso(e.eventDate) : null; };
  const kayitci = (Array.isArray(j.entities) ? j.entities : []).find(e => Array.isArray(e.roles) && e.roles.includes('registrar')) || null;
  let ad = null, iana = null;
  if (kayitci) {
    const v = Array.isArray(kayitci.vcardArray) ? kayitci.vcardArray[1] : null;
    const fn = Array.isArray(v) ? v.find(x => Array.isArray(x) && x[0] === 'fn') : null;
    ad = fn ? temizMetin(fn[3], 80) : null;
    const pid = (Array.isArray(kayitci.publicIds) ? kayitci.publicIds : []).find(x => /iana/i.test(String(x.type || '')));
    iana = pid ? temizMetin(pid.identifier, 12) : null;
  }
  return { alanAdi, kayit: olay('registration'), bitis: olay('expiration'), guncelleme: olay('last changed'), kayitSirketi: ad, ianaId: iana };
}
const rdap = {
  ad: 'rdap', kisaAd: 'RDAP', araMs: 2000,
  destekler: () => true,
  async getir(c, ctx) {
    let alanAdi = c.alanAdi || null, kaynak = 'elle';
    if (!alanAdi && ctx.dex && ctx.dex.ham && Array.isArray(ctx.dex.ham.siteler) && ctx.dex.ham.siteler[0]) { alanAdi = alanAdiCikar(ctx.dex.ham.siteler[0]); kaynak = 'dexscreener'; }
    if (!alanAdi) return { durum: 'bos', neden: 'alan adı bilinmiyor (ayarlardan girin ya da DexScreener site bilgisi yok)' };
    const once = ctx.onceki && ctx.onceki.kaynaklar && ctx.onceki.kaynaklar.rdap;
    const gun = (ctx.ayar && ctx.ayar.rdapGun) || 7;
    if (once && (once.durum === 'ok' || once.durum === 'onbellek') && once.ham && once.ham.alanAdi === alanAdi) {
      const t0 = Date.parse(once.durum === 'onbellek' ? once.kaynakZamani : once.alindi);
      if (Number.isFinite(t0) && ctx.simdi() - t0 < gun * 864e5) return { durum: 'onbellek', ham: once.ham, kaynakZamani: new Date(t0).toISOString() };
    }
    const tld = alanAdi.split('.').pop();
    let taban = null;
    try { const b = await ctx.rdapBootstrap(); taban = b && b[tld] ? b[tld] : null; } catch { taban = null; }
    const adaylar = [taban ? `${taban.replace(/\/$/, '')}/domain/${encodeURIComponent(alanAdi)}` : null, `https://rdap.org/domain/${encodeURIComponent(alanAdi)}`].filter(Boolean);
    let son = null;
    for (const url of adaylar) {
      // eslint-disable-next-line no-await-in-loop
      const r = await ctx.http.json(url, { host: 'rdap', araMs: this.araMs, basliklar: { accept: 'application/rdap+json, application/json' } });
      if (r.ok && r.veri && (r.veri.objectClassName === 'domain' || r.veri.ldhName || r.veri.events)) {
        return { durum: 'ok', ms: r.ms, ham: { ...rdapAyristir(r.veri, alanAdi), alanAdiKaynak: kaynak, sunucu: temizMetin(new URL(url).host, 60) } };
      }
      son = r;
    }
    if (son && (son.durum === 404)) return { durum: 'bos', neden: `RDAP kaydı yok (${alanAdi}; .${tld} uzantısı RDAP sunmuyor olabilir)`, ham: { alanAdi, alanAdiKaynak: kaynak } };
    return { durum: 'hata', hata: (son && son.hata) || 'RDAP yanıtı okunamadı', ms: son && son.ms };
  },
};

// ── Borsa fiyatı (Binance / Bybit / OKX / Gate) ──────────────────────────
const borsa = {
  ad: 'borsa', kisaAd: 'Borsa', araMs: 300,
  destekler: () => true,
  async getir(c, ctx) {
    let k = c.fiyat, cozum = 'elle';
    if (!k) {
      ctx.cozumOnb = ctx.cozumOnb || new Map();
      if (!ctx.cozumOnb.has(c.sembol)) ctx.cozumOnb.set(c.sembol, await ctx.fiyat.cozumle(c.sembol));
      k = ctx.cozumOnb.get(c.sembol); cozum = 'otomatik';
    }
    if (!k) return { durum: 'bos', neden: 'merkezi borsada (Binance/Bybit/OKX/Gate) USDT paritesi bulunamadı' };
    const a = await ctx.fiyat.anlik(k);
    if (!a.ok) return a.bos ? { durum: 'bos', neden: a.hata, ham: { kaynak: `${k.borsa}-${k.piyasa}`, sembol: k.sembol, cozumleme: cozum } } : { durum: 'hata', hata: a.hata };
    return { durum: 'ok', ms: a.ms, ham: { kaynak: a.kaynak, sembol: a.sembol, fiyat: a.fiyat, hacim24: a.hacim24, cozumleme: cozum } };
  },
};

// ── GeckoTerminal (varsayılan KAPALI — CoinGecko koşulları) ───────────────
const geckoterminal = {
  ad: 'geckoterminal', kisaAd: 'GeckoTerminal', araMs: 2500,
  destekler: (c) => (!AGLAR[c.ag] || !AGLAR[c.ag].gecko ? 'ağ desteklenmiyor' : !c.sozlesme ? 'sözleşme adresi yok' : true),
  async getir(c, ctx) {
    const ag = AGLAR[c.ag].gecko, a = encodeURIComponent(AGLAR[c.ag].evm ? c.sozlesme.toLowerCase() : c.sozlesme);
    const i = await ctx.http.json(`https://api.geckoterminal.com/api/v2/networks/${ag}/tokens/${a}/info`, { host: 'geckoterminal', araMs: this.araMs });
    if (!i.ok) return i.durum === 404 ? { durum: 'bos', neden: 'GeckoTerminal bu token\'ı tanımıyor', ms: i.ms } : hataSonuc(i);
    const t = await ctx.http.json(`https://api.geckoterminal.com/api/v2/networks/${ag}/tokens/${a}`, { host: 'geckoterminal', araMs: this.araMs });
    const ia = (i.veri && i.veri.data && i.veri.data.attributes) || {};
    const ta = (t.ok && t.veri && t.veri.data && t.veri.data.attributes) || {};
    const h = ia.holders || {}, d = h.distribution_percentage || {};
    const pay = (x) => (sayi(x) == null ? null : sayi(x) / 100);
    return { durum: 'ok', ms: i.ms, ham: {
      holder: sayi(h.count), dagilim: { ilk10: pay(d.top_10), ikinci20: pay(d['11_30']), ucuncu20: pay(d['31_50']), kalan: pay(d.rest) },
      fiyat: sayi(ta.price_usd), hacim24: sayi(ta.volume_usd && ta.volume_usd.h24), rezerv: sayi(ta.total_reserve_in_usd), piyasaDegeri: sayi(ta.market_cap_usd),
      fiyatHata: t.ok ? null : t.hata,
    } };
  },
};

// ── CoinGecko (varsayılan KAPALI) ────────────────────────────────────────
const coingecko = {
  ad: 'coingecko', kisaAd: 'CoinGecko', araMs: 6500,
  destekler: (c) => (c.coingeckoId || (AGLAR[c.ag] && AGLAR[c.ag].cg && c.sozlesme) ? true : 'CoinGecko kimliği / sözleşme yok'),
  async getir(c, ctx) {
    const p = 'localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false';
    const url = c.coingeckoId ? `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(c.coingeckoId)}?${p}`
      : `https://api.coingecko.com/api/v3/coins/${AGLAR[c.ag].cg}/contract/${encodeURIComponent(AGLAR[c.ag].evm ? c.sozlesme.toLowerCase() : c.sozlesme)}?${p}`;
    const r = await ctx.http.json(url, { host: 'coingecko', araMs: this.araMs });
    if (!r.ok) return r.durum === 404 ? { durum: 'bos', neden: 'CoinGecko kaydı yok (silinmiş olabilir)', ms: r.ms } : hataSonuc(r);
    const j = r.veri || {}, m = j.market_data || {};
    return { durum: 'ok', ms: r.ms, ham: {
      id: temizMetin(j.id, 80), kategoriler: (Array.isArray(j.categories) ? j.categories : []).filter(Boolean).slice(0, 12).map(x => temizMetin(x, 60)),
      fiyat: sayi(m.current_price && m.current_price.usd), hacim24: sayi(m.total_volume && m.total_volume.usd), piyasaDegeri: sayi(m.market_cap && m.market_cap.usd),
      dolasim: sayi(m.circulating_supply), toplamArz: sayi(m.total_supply),
    } };
  },
};

/** Çalıştırma sırası: önce paralel grup (DexScreener dahil), sonra DexScreener'a bağlı RDAP. */
const KAYNAKLAR = { goplus, rugcheck, dexscreener, borsa, geckoterminal, coingecko, rdap };
const SIRA = { paralel: ['goplus', 'rugcheck', 'dexscreener', 'borsa', 'geckoterminal', 'coingecko'], sonra: ['rdap'] };

module.exports = { KAYNAKLAR, SIRA, alanAdiCikar, rdapAyristir, tarihIso, YAKMA };
