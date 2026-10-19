/**
 * VERİ ekranı › "Günlük arşiv" kartı — dikkat listesi F1 ileriye dönük ham arşivi (lib/tarama/arsiv.js, GET /api/tarama/arsiv).
 * ═══════════════════════════════════════════════════════════════════════════
 * Salt okunur. Resmî kayıt (data/tarama/, Görev Zamanlayıcı `--resmi`): son kayıt günü, kayıt günü sayısı, kesintisiz gün
 * (hedef 7), boşluk günleri, manifest zinciri sağlam mı (satır zinciri + son 7 günün dosya SHA'sı), son koşunun evren
 * büyüklüğü (CEX / DEX) ve kaynak başına ok / boş / hata / kota / uygulanmaz. Deneme kipi (data/tarama/deneme/) ayrı satırda,
 * resmî sayaçlara girmez. Sunucu verisi her zaman textContent (AG.dom.el); işaretleme ayrıştıran yazım yok.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);

  const KAYNAK_AD = { goplus: 'GoPlus', rugcheck: 'RugCheck', geckoterminal: 'GeckoTerminal', dexSiparis: 'DexScreener sipariş', dexscreener: 'DexScreener',
    borsa: 'Borsa', defillama: 'DefiLlama', coingecko: 'CoinGecko', github: 'GitHub', snapshot: 'Snapshot' };

  /** B-32 (61.1): Veri ekranında tek tarih biçimi — "2026-10-10" → "10.10.2026"; ISO zaman → "10.10.2026 04:31". */
  function gunTr(g) {
    if (!g) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(g));
    if (!m) return String(g);
    if (!m[4]) return `${m[3]}.${m[2]}.${m[1]}`;
    const t = new Date(g);
    return Number.isFinite(t.getTime()) ? `${t.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : String(g);
  }

  /** Saf: kip özeti → { metin, tur } rozet. */
  function zincirRozet(k) {
    if (!k || !k.satir) return { metin: 'kayıt yok', tur: null };
    return k.gecerli ? { metin: 'zincir sağlam', tur: 'iyi' } : { metin: `zincir BOZUK (${(k.hatalar || []).length})`, tur: 'tehlike' };
  }
  function kipSatiri(k, ad, esikGun, hedef) {
    const r = zincirRozet(k);
    const p = [];
    if (k && k.satir) {
      p.push(`son kayıt günü ${gunTr(k.sonGun)}`, `${k.gunSayisi} kayıt günü`);
      if (ad === 'Resmî') p.push(`kesintisiz ${k.kesintisiz} gün (hedef ${hedef})`, `eşik sabitlemeye ${Math.max(0, esikGun - k.gunSayisi)} gün`);
      p.push(k.bosluklar && k.bosluklar.length ? `${k.bosluklar.length} boşluk: ${k.bosluklar.slice(-5).map(gunTr).join(', ')}${k.bosluklar.length > 5 ? ' …' : ''}` : 'boşluk yok');
      if (k.baslangic) p.push(`başlangıç ${gunTr(k.baslangic)}`);
    }
    return el('div', { class: 'mb-2' }, [
      el('strong', { text: `${ad}: ` }),
      el('span', { class: `pf-rozet${r.tur ? ' pf-rozet-' + r.tur : ''}`, text: r.metin, title: k && k.hatalar && k.hatalar.length ? k.hatalar.map(h => `#${h.no} ${h.gun || ''} ${h.neden}`).join('\n') : null }),
      el('span', { class: 'pf-kucuk', text: p.length ? ` · ${p.join(' · ')}${k.dogrulama ? ` · doğrulama: ${k.dogrulama}` : ''}` : ' · henüz koşmadı' })
    ]);
  }
  function kaynakTablosu(s) {
    const ks = s.kaynakOzet || {};
    const satirlar = Object.keys(ks).sort().map(ad => {
      const x = ks[ad];
      return el('tr', null, [el('td', { class: 'pf-sola', text: KAYNAK_AD[ad] || ad }), ...['ok', 'bos', 'onbellek', 'hata', 'kota', 'belirsiz', 'uygulanmaz'].map(d => el('td', { text: String(x[d] || 0) }))]);
    });
    return AG.tablo.kutulu({ sinif: 'pf-tablo pf-veri-tablo', basliklar: ['Kaynak', 'ok', 'boş', 'önbellek', 'hata', 'kota', 'belirsiz', 'uygulanmaz'], satirlar });
  }
  function ciz(k, d) {
    if (!k) return;
    if (!d) { doldur(k, [el('span', { text: 'Günlük arşiv durumu okunamadı.' })]); return; }
    const son = (d.resmi && d.resmi.sonKosu) || (d.deneme && d.deneme.sonKosu) || null;
    const parca = [kipSatiri(d.resmi, 'Resmî', d.esikGun, d.hedefKesintisiz), kipSatiri(d.deneme, 'Deneme', d.esikGun, d.hedefKesintisiz)];
    if (d.kilit && !d.kilit.bayat) parca.push(el('p', { class: 'hint hint-sm mb-2', text: `Koşu sürüyor (${d.kilit.kip || '?'}, ${gunTr(d.kilit.bas)} başladı).` }));
    if (son) {
      const e = son.evren || {};
      const kn = (x) => (x ? `aday ${x.aday} · girdi ${x.girdi} · elendi ${x.elendi} · izlenen ${x.izleme}` : '—');
      parca.push(el('p', { class: 'hint hint-sm mb-2', text: `Son koşu ${gunTr(son.gun)} (${son.neden}, ${son.sureSn} sn) — CEX: ${kn(e.cex)} · DEX: ${kn(e.dex)} · ${son.anlik} token anlık görüntü${son.tokenHata ? ` · ${son.tokenHata} token işlenemedi (hata satırı)` : ''}` }));
      parca.push(kaynakTablosu(son));
    }
    parca.push(el('p', { class: 'hint hint-sm mt-2 mb-0', title: 'npm run tarama:gunluk -- --neden zamanlanmis --resmi', text: 'Resmî kayıt sunucuda Görev Zamanlayıcı ile her gece koşar; deneme koşuları resmî sayaçlara girmez. "Hata", "kota" ve "belirsiz" (CoinGecko eşlemesi tek anlamlı değil) bilinmiyor sayılır, "uygulanmaz" (ağa uygun değil, eşleme yok) paydaya girmez. Liste üretilmez — eşikler 30 resmî kayıt gününden sonra bir kez sabitlenir.' }));
    doldur(k, parca);
  }
  async function yukle() {
    const k = bul('veriArsiv');
    if (!k) return;
    let d = null;
    try { const r = await AG.api.tarama.arsiv(); d = r.success ? r : null; } catch (e) { d = null; }
    ciz(k, d);
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-veri') yukle(); });
    const baslat = () => { const p = bul('tab-veri'); if (p && p.classList && p.classList.contains('active')) yukle(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat); else baslat();
  }

  AG.pages = AG.pages || {};
  AG.pages.gunlukArsiv = { yukle, ciz, zincirRozet };
})(typeof window !== 'undefined' ? window : globalThis);
