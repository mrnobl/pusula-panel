/**
 * VERİ EKRANI — #/veri `AG.pages.veri` (63.2; kullanıcıyla taslak 1–2 üzerinden)
 * ═══════════════════════════════════════════════════════════════════════════
 * "Verilerim güncel mi, bir kaynak bozulursa ne etkilenir?"
 *   · #veriOzet — üç büyük durum: Bot ve portföy verisi (güncel / toplam, GET /api/veri/durum) · Coin tarama kaynakları
 *     (çalışan / toplam, GET /api/tarama/kaynak-sagligi) · Günlük arşiv (zincir sağlam mı, GET /api/tarama/arsiv).
 *   · #veriKok — kullanana göre KATLI gruplar: Botlar · Portföy ve modeller · Araştırma. Her satırda "Kim kullanıyor"
 *     etiketleri (KULLANAN). Sorunsuz grup kapalı, sorunlu (bayat / hata) grup açık gelir.
 *   · #veriGrupTarama (içinde #veriDikkat — portfoy.js dikkatKaynakCiz) ve #veriGrupArsiv (içinde #veriArsiv —
 *     gunlukArsiv.js) — aynı kural: sorun varsa açık.
 *   · 73.3 #veriGrupKayit (içinde #veriKayit) — İleriye kayıt: sunucunun ham veri kayıtçıları (GET /api/ileri-kayit/durum):
 *     kayıtçı başına son yazım, bugünkü satır, disk + aylık tahmin, durum / hata; tasfiye akışlarının bağlantısı. kayitOzet() saf.
 * Güncelle düğmeleri POST /api/veri/guncelle (araştırma modunda sunucu reddeder). DOM yalnız AG.dom; sunucu metni metin.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  let yoklama = null;

  /** 72.0: görünen bot adı kimlikten (AG.botAd yoksa yedek ad). */
  const BA = (k, y) => (AG && AG.botAd && AG.botAd.ad(k)) || y;
  const KAI = BA('hucum', 'Kairos'), TAO = BA('denge', 'Tao');
  /** Kaynak → grup ve kullananlar (kod incelemesinden: hangi bot / model / ekran bu veriyi okuyor). Bilinmeyen → Araştırma. */
  const KULLANAN = {
    'binance-market-db': { grup: 'bot', kim: [KAI, TAO, 'Backtest'] },
    'binance-pit-arsiv': { grup: 'bot', kim: [KAI, TAO], not: 'coin sepetinin geçmiş üyeleri' },
    'binance-tradfi-listesi': { grup: 'bot', kim: [KAI, TAO], not: 'altın, hisse vb. coin sepetinden çıkarılır' },
    'kol-onbellegi': { grup: 'bot', kim: [KAI, TAO, BA('m-837', 'Simurg')], ad: 'Coin sepeti önbelleği', not: 'eski adı kol önbelleği' },
    'usdtry': { grup: 'portfoy', kim: ['Portföyüm', BA('m-bist-m10', 'Lydia')] },
    'tefas': { grup: 'portfoy', kim: ['Portföyüm'] },
    'yahoo-nasdaq': { grup: 'portfoy', kim: [BA('m-qqq-m10', 'Nova')] },
    'yahoo-bist': { grup: 'portfoy', kim: [BA('m-bist-m10', 'Lydia')] },
    'yahoo-gercek-varlik': { grup: 'portfoy', kim: ['Portföyüm kıyasları', 'Laboratuvar'], ad: 'Yahoo kıyas serileri', not: 'eski adı Yahoo H2 serileri' },
    'tufe': { grup: 'portfoy', kim: ['Portföyüm kıyasları'] },
    'evds-mevduat': { grup: 'portfoy', kim: ['Portföyüm kıyasları'] },
    'yahoo-portfoy': { grup: 'arastirma', kim: ['Laboratuvar'] },
    'katalog-onbellegi': { grup: 'arastirma', kim: ['Laboratuvar', 'model grafikleri'] },
    'ileri-bollinger': { grup: 'arastirma', kim: ['İleri test'] },
    'coin-tarama': { grup: 'arastirma', kim: ['Coin tarama'] }
  };
  const GRUPLAR = [['bot', 'Botlar'], ['portfoy', 'Portföy ve modeller'], ['arastirma', 'Araştırma']];
  const ROZET = { guncel: ['güncel', 'iyi'], bayat: ['bayat', 'uyari'], hata: ['hata', 'tehlike'], calisiyor: ['güncelleniyor', 'bilgi'], hic: ['hiç güncellenmedi', 'uyari'] };

  /** Saf: kaynak sorunlu mu (bayat / hata; harici kaynağın kendi zamanlaması sorun değil). */
  const sorunlu = (x) => x && (x.durum === 'hata' || x.durum === 'bayat');
  /** Saf: kaynakları gruplara ayır → [{ kimlik, ad, satirlar, guncel, toplam, sorun }]. */
  function gruplar(kaynaklar) {
    return GRUPLAR.map(([kimlik, ad]) => {
      const satirlar = (kaynaklar || []).filter(x => ((KULLANAN[x.ad] || {}).grup || 'arastirma') === kimlik);
      return { kimlik, ad, satirlar, guncel: satirlar.filter(x => !sorunlu(x)).length, toplam: satirlar.length, sorun: satirlar.some(sorunlu) };
    }).filter(g => g.toplam);
  }
  /** Saf: üç büyük durum. */
  function ozet(v, t, a) {
    const k = (v && v.kaynaklar) || [];
    const veri = v ? { deger: `${k.filter(x => !sorunlu(x)).length} / ${k.length} güncel`, ton: k.some(x => x.durum === 'hata') ? 'tehlike' : k.some(sorunlu) ? 'uyari' : 'iyi',
      alt: k.length ? `son güncelleme ${sonZaman(k)}` : '' } : { deger: 'okunamadı', ton: 'uyari', alt: '' };
    const s = (t && t.satirlar) || [];
    const bozuk = s.filter(x => x.son && (x.son.durum === 'hata' || x.son.durum === 'kismi'));
    const anahtar = s.filter(x => x.son && x.son.durum === 'anahtar_gerekli').length;
    const tarama = t ? { deger: `${s.length - bozuk.length} / ${s.length} çalışıyor`, ton: bozuk.some(x => x.son.durum === 'hata') ? 'tehlike' : bozuk.length ? 'uyari' : 'iyi',
      alt: [bozuk.length ? `${bozuk.length} kaynakta sorun` : '', anahtar ? `${anahtar} kaynak anahtar bekliyor (beklenen)` : ''].filter(Boolean).join(' · ') || 'hepsi yanıt veriyor' } : { deger: 'okunamadı', ton: 'uyari', alt: '' };
    const r = a && a.resmi;
    const arsiv = !a ? { deger: 'okunamadı', ton: 'uyari', alt: '' }
      : !r || !r.satir ? { deger: 'kayıt yok', ton: 'notr', alt: 'resmî kayıt sunucuda' }
        : r.gecerli ? { deger: 'zincir sağlam', ton: 'iyi', alt: `son kayıt ${r.sonGun || '—'} · ${r.gunSayisi} gün` } : { deger: 'zincir BOZUK', ton: 'tehlike', alt: `${(r.hatalar || []).length} hata` };
    return { veri, tarama, arsiv, taramaSorun: !t || bozuk.length > 0, arsivSorun: !!(a && r && r.satir && !r.gecerli) };
  }
  function sonZaman(k) {
    const t = k.map(x => Date.parse(x.sonBasari || '')).filter(Number.isFinite);
    if (!t.length) return '—';
    const d = new Date(Math.max(...t));
    return AG.fmt && AG.fmt.tarihSaat ? AG.fmt.tarihSaat(d.getTime()) : d.toLocaleString('tr-TR');
  }
  const trGun = (g) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(g || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : (g || '—'); };
  const kisaZaman = (z) => (z && AG.fmt && AG.fmt.tarihSaat ? AG.fmt.tarihSaat(Date.parse(z)) : '—');

  /* ── 73.3 İleriye kayıt ─────────────────────────────────────────────── */
  const KAYIT_ROZET = { iyi: ['yazıyor', 'iyi'], uyari: ['6 saattir yazmıyor', 'uyari'], hata: ['hata', 'tehlike'], bekliyor: ['ilk yazım bekleniyor', 'bilgi'], kapali: ['kapalı', null] };
  const sayiTr = (n) => (Number(n) || 0).toLocaleString('tr-TR');
  const mbTr = (b) => `${((Number(b) || 0) / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
  const virgul = (x) => String(x == null ? '—' : x).replace('.', ',');
  /** Saf: İleriye kayıt özeti → { deger, ton, alt, sorun }. */
  function kayitOzet(d) {
    if (!d) return { deger: 'okunamadı', ton: 'uyari', alt: '', sorun: true };
    const l = d.kayitcilar || [];
    if (!d.calisiyor) return { deger: 'çalışmıyor', ton: 'notr', alt: d.neden || 'kayıtçılar yalnız sunucuda çalışır', sorun: false };
    const hata = l.filter(x => x.durum === 'hata').length, uyari = l.filter(x => x.durum === 'uyari').length;
    const yazan = l.filter(x => x.durum === 'iyi').length;
    return {
      deger: `${yazan} / ${l.length} yazıyor`, ton: hata ? 'tehlike' : uyari ? 'uyari' : 'iyi',
      alt: [d.disk ? `disk ${virgul(d.disk.toplamMB)} MB · ~${d.disk.aylikTahminMB} MB/ay` : '', hata ? `${hata} kayıtçıda hata` : '', uyari ? `${uyari} kayıtçı gecikiyor` : ''].filter(Boolean).join(' · '),
      sorun: hata + uyari > 0
    };
  }
  function akisMetni(a) {
    const ad = { binance: 'Binance', okx: 'OKX', bybit: 'Bybit' }[a.ad] || a.ad;
    return `${ad}: ${a.bagli ? 'bağlı' : 'bağlı değil'}${a.abone ? ` (${a.abone} sembol)` : ''} · ${sayiTr(a.satir)} tasfiye${a.yenidenBaglanma ? ` · ${a.yenidenBaglanma} yeniden bağlanma` : ''}${a.sonHata ? ` · ${a.sonHata}` : ''}`;
  }
  function kayitCiz(d) {
    const k = bul('veriKayit');
    if (!k || !AG.dom) return;
    const { el, doldur } = AG.dom;
    if (!d) { doldur(k, [el('p', { class: 'hint mb-0', text: 'İleriye kayıt durumu okunamadı.' })]); return; }
    const satir = (x) => {
      const [metin, tur] = KAYIT_ROZET[x.durum] || [x.durum || '—', null];
      return el('tr', { title: x.kaynak || null }, [
        el('td', { class: 'pf-sola', 'data-etiket': 'Kayıtçı' }, [el('strong', { text: x.kisaAd }), el('div', { class: 'pf-kucuk', text: x.kaynak || '' })]),
        el('td', { class: 'pf-sola', 'data-etiket': 'Sıklık', text: x.siklik || '—' }),
        el('td', { class: 'pf-sag sayi', 'data-etiket': 'Son yazım', text: kisaZaman(x.sonYazim) }),
        el('td', { class: 'pf-sag sayi', 'data-etiket': 'Bugün', text: `${sayiTr(x.bugunSatir)} satır` }),
        el('td', { class: 'pf-sag sayi', 'data-etiket': 'Disk', text: `${mbTr(x.disk && x.disk.bayt)} · ~${x.disk ? virgul(x.disk.aylikTahminMB) : '—'} MB/ay` }),
        el('td', { 'data-etiket': 'Durum' }, [
          el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: metin }),
          x.sonHata ? el('div', { class: 'pf-kucuk', text: `Hata: ${x.sonHata}` }) : null,
          x.akislar && x.akislar.length ? el('div', { class: 'pf-kucuk', text: x.akislar.map(akisMetni).join(' — ') }) : null
        ])
      ]);
    };
    const o = kayitOzet(d);
    const metin = d.calisiyor
      ? `Toplam ${virgul(d.disk.toplamMB)} MB · tahmini büyüme ~${d.disk.aylikTahminMB} MB/ay (sıkıştırılmış) · saklama: ${d.disk.saklama}. Bir kayıtçı ${d.esikSaat || 6} saatten uzun yazmazsa Sağlık sarı olur.${d.kararPenceresi ? ' Şu an botların karar penceresi: yeni indirme başlamaz.' : ''}`
      : `Kayıtçılar burada çalışmıyor — ${o.alt}.`;
    doldur(k, [
      el('p', { class: 'hint hint-sm mb-2', id: 'veriKayitOzet', text: metin }),
      AG.tablo.kutulu({ sinif: 'pf-tablo pf-veri-tablo', basliklar: ['Kayıtçı', 'Sıklık', 'Son yazım', 'Bugün', 'Disk', 'Durum'], satirlar: (d.kayitcilar || []).map(satir) })
    ]);
  }

  /* ── Çizim ───────────────────────────────────────────────────────────── */
  const TON = { iyi: 'tone-success', uyari: 'tone-warning', tehlike: 'tone-danger', notr: 'tone-muted' };
  function ozetCiz(o) {
    const k = bul('veriOzet');
    if (!k) return;
    const { el, doldur } = AG.dom;
    const kutu = (etiket, x, id) => el('div', { class: 'ana-sayi', id }, [
      el('span', { class: 'stat-title', text: etiket }),
      el('span', { class: `stat-value stat-value-sm sayi ${TON[x.ton] || ''}`, text: x.deger }),
      x.alt ? el('span', { class: 'hint hint-sm mb-0', text: x.alt }) : null
    ]);
    doldur(k, [kutu('Bot ve portföy verisi', o.veri, 'veriOzet-veri'), kutu('Coin tarama kaynakları', o.tarama, 'veriOzet-tarama'), kutu('Günlük arşiv', o.arsiv, 'veriOzet-arsiv')]);
  }

  function satir(x) {
    const { el } = AG.dom;
    const u = KULLANAN[x.ad] || { kim: [] };
    const [metin, tur] = ROZET[x.durum] || [x.durum || '—', null];
    return el('tr', { title: x.aciklama || null }, [
      el('td', { class: 'pf-sola', 'data-etiket': 'Kaynak' }, [
        el('strong', { text: u.ad || x.kisaAd || x.ad }),
        u.not ? el('span', { class: 'hint hint-sm mb-0', text: ` (${u.not})` }) : null,
        el('div', { class: 'pf-kucuk', text: x.hata ? `Hata: ${x.hata}` : x.bayatNeden ? x.bayatNeden : x.tazelik || '' })
      ]),
      el('td', { class: 'pf-sola', 'data-etiket': 'Kim kullanıyor' }, (u.kim || []).map(ad => el('span', { class: 'veri-kullanan', text: ad }))),
      el('td', { class: 'pf-sag sayi', 'data-etiket': 'Son veri', text: x.veriGunu ? trGun(x.veriGunu) : '—' }),
      el('td', { class: 'pf-sag sayi', 'data-etiket': 'Son güncelleme', text: kisaZaman(x.sonBasari) }),
      el('td', { 'data-etiket': 'Durum' }, [el('span', { class: `pf-rozet${tur ? ' pf-rozet-' + tur : ''}`, text: x.tur === 'harici' ? `${metin} · kendi zamanlaması` : metin })]),
      el('td', { 'data-etiket': '' }, [x.tur === 'harici' ? null : el('button', { type: 'button', class: 'btn btn-secondary btn-xs', title: `${u.ad || x.kisaAd || x.ad}: şimdi güncelle`, onclick: (e) => guncelle(e.currentTarget, x.ad) }, [el('span', { text: 'Güncelle' })])])
    ]);
  }

  function gruplarCiz(v) {
    const k = bul('veriKok');
    if (!k) return;
    const { el, doldur } = AG.dom;
    if (!v) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Veri durumu okunamadı.' })]); return; }
    const l = gruplar(v.kaynaklar);
    doldur(k, [
      ...l.map(g => {
        const d = el('details', { class: 'glass-panel veri-grup', id: `veriGrup-${g.kimlik}` }, [
          el('summary', null, [
            el('span', { class: `borsa-isik borsa-isik-${g.sorun ? (g.satirlar.some(x => x.durum === 'hata') ? 'tehlike' : 'uyari') : 'iyi'}`, 'aria-hidden': 'true' }),
            el('strong', { text: g.ad }),
            el('span', { class: 'hint hint-sm mb-0', text: ` — ${g.satirlar.map(x => (KULLANAN[x.ad] || {}).ad || x.kisaAd || x.ad).join(', ')} — ${g.guncel} / ${g.toplam} güncel` })
          ]),
          AG.tablo.kutulu({ sinif: 'pf-tablo pf-veri-tablo', basliklar: ['Kaynak', 'Kim kullanıyor', 'Son veri', 'Son güncelleme', 'Durum', ''], satirlar: g.satirlar.map(satir) })
        ]);
        d.open = g.sorun;
        return d;
      }),
      el('div', { class: 'row row-wrap gap-2 mt-3' }, [
        el('button', { type: 'button', class: 'btn btn-secondary btn-xs', id: 'btnVeriBayat', disabled: v.calisiyor ? true : undefined, onclick: (e) => guncelle(e.currentTarget, null) }, [el('span', { text: v.calisiyor ? 'Güncelleniyor…' : 'Bayatları güncelle' })]),
        el('span', { class: 'hint hint-sm mb-0', text: 'Otomatik: sunucu açılışından ~2 dk sonra ve her gece 04:30 sonrası bayat olanlar güncellenir.' })
      ])
    ]);
  }

  async function guncelle(dugme, kaynak) {
    AG.dom.mesgul(dugme, 'Başlatılıyor…');
    try {
      const r = await AG.api.veri.guncelle(kaynak || null, !!kaynak);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      if (AG.bildir) AG.bildir(r.kuyrukta ? 'Güncelleme sürüyor; istek sıraya eklendi.' : 'Veri güncellemesi başlatıldı.', 'bilgi');
    } catch (e) { if (AG.bildir) AG.bildir(`Veri güncellenemedi: ${e.message}`, 'hata'); }
    finally { AG.dom.hazir(dugme); yukle(); }
  }

  function katliGrupCiz(id, ozetId, baslik, x, sorun) {
    const d = bul(id), s = bul(ozetId);
    if (!d || !s || !AG.dom) return;
    const { el, doldur } = AG.dom;
    doldur(s, [el('span', { class: `borsa-isik borsa-isik-${x.ton === 'iyi' ? 'iyi' : x.ton === 'tehlike' ? 'tehlike' : x.ton === 'notr' ? 'notr' : 'uyari'}`, 'aria-hidden': 'true' }),
      el('strong', { text: baslik }), el('span', { class: 'hint hint-sm mb-0', text: ` — ${x.deger}${x.alt ? ` · ${x.alt}` : ''}` })]);
    if (!d.dataset.ilk) { d.dataset.ilk = '1'; d.open = !!sorun; }
  }

  async function yukle() {
    if (!bul('veriKok')) return;
    const al = (f) => f().then(r => (r && r.success !== false ? r : null)).catch(() => null);
    const [v, t, a, ik] = await Promise.all([
      al(() => AG.api.veri.durum()),
      AG.api.tarama && AG.api.tarama.kaynakSagligi ? al(() => AG.api.tarama.kaynakSagligi()) : Promise.resolve(null),
      AG.api.tarama && AG.api.tarama.arsiv ? al(() => AG.api.tarama.arsiv()) : Promise.resolve(null),
      AG.api.ileriKayit ? al(() => AG.api.ileriKayit.durum()) : Promise.resolve(null)
    ]);
    const o = ozet(v, t, a);
    ozetCiz(o);
    gruplarCiz(v);
    katliGrupCiz('veriGrupTarama', 'veriGrupTaramaOzet', 'Coin tarama kaynakları', o.tarama, o.taramaSorun);
    katliGrupCiz('veriGrupArsiv', 'veriGrupArsivOzet', 'Günlük arşiv', o.arsiv, o.arsivSorun);
    const ko = kayitOzet(ik);
    kayitCiz(ik);
    katliGrupCiz('veriGrupKayit', 'veriGrupKayitOzet', 'İleriye kayıt', ko, true);   // yalnız kendi alt sayfasında görünür → hep açık
    global.clearTimeout(yoklama);
    if (v && v.calisiyor) yoklama = global.setTimeout(yukle, 4000);
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-veri') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.veri = { yukle, gruplar, ozet, KULLANAN, sorunlu, kayitOzet };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.veri;
})(typeof window !== 'undefined' ? window : globalThis);
