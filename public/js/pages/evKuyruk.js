/**
 * EVE YAZMA + KUYRUK — ortak arayüz parçası (sürüm 64.8) `AG.evKuyruk`
 * ═══════════════════════════════════════════════════════════════════════════
 * Geliştirme bilgisayarında (araştırma modu + sunucu bağlantısı) İşlem defterim ve Portföyüm kayıtları sunucuda
 * tutulur; buradan girilen değişiklik sunucuya gider, sunucu kapalıysa sırayla bekler (sunucu: lib/evYazma.js, uçlar /api/ev-kuyruk*,
 * /api/ev-tasima/portfoyum*). Bu dosya iki sayfanın (js/pages/islemDefteri.js, js/pages/portfoyum.js) ortak parçalarını verir:
 *   bantModeli(veri)        sunucudan okunan /ozet yanıtındaki `yazma` + `evYazma`'dan durum satırları [{ s, t }] (saf; öz testte sınanır)
 *   kuyrukPaneli(veri, ops) bekleyen / reddedilen değişikliklerin katlı listesi + "Şimdi gönder" + "Kuyruktan çıkar"
 *   tasimaKarti(kap, ops)   Portföyüm: "Bu bilgisayardaki Portföyüm kayıtlarını sunucuya taşı" (kuru deneme → onay)
 *   sarmala(api, okuma)     yazma çağrısı kuyruğa girdiyse ek bildirim ("sunucu kapalı — kuyrukta")
 * Kurallar: DOM yalnız AG.dom.el, renkler token sınıfları (inline stil yok), istekler yalnız AG.api.evKuyruk.
 */
(function (global) {
  'use strict';
  const AG = global.AG = global.AG || {};
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const api = () => AG.api.evKuyruk;
  const dugme = (metin, f, sinif = 'btn-secondary btn-sm', ek = {}) => el('button', { type: 'button', class: `btn ${sinif}`, onclick: f, ...ek }, [el('span', { text: metin })]);
  const saat = (z) => { const t = typeof z === 'number' ? z : Date.parse(z); return Number.isFinite(t) ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };

  /** Saf: durum satırları. veri.yazma.ev yoksa (sunucu, telefon, sunucu bağlantısız) boş. */
  function bantModeli(veri) {
    const y = veri && veri.yazma, k = (veri && veri.evYazma) || {};
    if (!y || !y.ev) return [];
    const m = [];
    if (!y.acik) { m.push({ s: 'bilgi', t: y.neden || 'Bu bilgisayar sunucudaki kayıtları yalnız gösterir.' }); return m; }
    const bekleyen = k.bekleyen || 0, hata = k.hata || 0;
    if (bekleyen) {
      const ozetler = (k.ogeler || []).filter(x => x.durum === 'bekliyor').slice(0, 5).map(x => x.ozet);
      m.push({ s: 'uyari', t: `Sunucu kapalı: ${bekleyen} değişiklik kuyrukta — sunucu açılınca sırayla kendiliğinden gönderilir.${ozetler.length ? ' Bekleyenler: ' + ozetler.join(' · ') : ''}${bekleyen > ozetler.length && ozetler.length ? ' …' : ''}` });
    } else m.push({ s: 'bilgi', t: 'Değişiklikler sunucuya gönderilir (kayıtların tek yeri sunucu); sunucu kapalıysa burada sırayla bekler.' });
    if (hata) m.push({ s: 'kritik', t: `${hata} değişikliği sunucu kabul etmedi — aşağıdaki "Kuyruk" bölümünde nedenini görüp kuyruktan çıkarabilirsin.` });
    // F10c: kuyruğun başı 401/403 ile takıldıysa kendiliğinden düzelmez — ne yapılacağı açıkça
    if (bekleyen && k.kafaReddi) m.push({ s: 'kritik', t: k.kafaReddi.mesaj || 'Sunucu bu bilgisayarın yazmasını kabul etmiyor — sunucudaki Pusula\'yı 64.8\'e güncelleyin ya da jetonu yenileyin.' });
    if (k.bozuk) m.push({ s: 'kritik', t: `Kuyruk dosyasında okunamayan ${k.bozuk} satır var (data/ev-kuyruk.jsonl) — silinmedi; geliştirme sohbetine bildirin.` });
    return m;
  }

  /** Kuyruğa giren yazmanın kullanıcı metni. */
  function kuyrukMetni(r) { return (r && r.mesaj) || 'Sunucuya şu an ulaşılamıyor — değişiklik kuyruğa alındı; sunucu açılınca gönderilir.'; }

  /** Katlı kuyruk listesi (bekleyen/hata yoksa null). ops.onDegisti: liste değişince sayfayı yenile. */
  function kuyrukPaneli(veri, ops = {}) {
    const k = (veri && veri.evYazma) || {};
    const l = (k.ogeler || []).filter(x => x.durum === 'bekliyor' || x.durum === 'hata');
    if (!veri || !veri.yazma || !veri.yazma.ev || !l.length) return null;
    const yenile = () => { if (typeof ops.onDegisti === 'function') ops.onDegisti(); };
    const gonder = async (e) => {
      const d = e && e.currentTarget;
      if (d) AG.dom.mesgul(d, 'Gönderiliyor…');
      try {
        const r = await api().gonder();
        AG.bildir(r && r.success ? (r.gonderilen ? `${r.gonderilen} değişiklik sunucuya gönderildi${r.kalan ? ` (${r.kalan} bekliyor)` : ''}.` : (r.durdu ? `Gönderilemedi: ${r.durdu}` : 'Gönderilecek değişiklik yok.')) : `Gönderilemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success && r.gonderilen ? 'ok' : 'uyari', { sure: 9000 });
        yenile();
      } finally { if (d) AG.dom.hazir(d); }
    };
    const cikar = async (x) => {
      const ok_ = await AG.onayla({ baslik: 'Kuyruktan çıkarılsın mı?', metin: `"${x.ozet}" — sunucu bu değişikliği kabul etmedi (${x.sonHata || 'neden yok'}). Çıkarınca sunucuya hiç gitmez; gerekirse doğrusunu yeniden gir.`, onay: 'Çıkar', tehlikeli: true });
      if (!ok_) return;
      const r = await api().cikar(x.id);
      AG.bildir(r && r.success ? 'Kuyruktan çıkarıldı.' : `Çıkarılamadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
      yenile();
    };
    const bek = l.filter(x => x.durum === 'bekliyor').length, hata = l.length - bek;
    return el('details', { class: 'hs-kat-mini mt-2', id: `${ops.onEk || 'ev'}Kuyruk`, open: hata ? 'open' : null }, [
      el('summary', { text: `Kuyruk (${bek} bekliyor${hata ? ` · ${hata} kabul edilmedi` : ''})` }),
      el('div', { class: 'mt-2' }, [
        AG.tablo.kutulu({ id: `tbl${ops.onEk || 'Ev'}Kuyruk`, sinif: 'table-dense pf-tablo', basliklar: ['Zaman', 'Değişiklik', 'Durum', ''],
          satirlar: l.map(x => el('tr', { 'data-kuyruk': x.id }, [
            el('td', { class: 'sayi', text: saat(x.zaman) }),
            el('td', { class: 'pf-sola', text: x.ozet }),
            el('td', { class: `pf-sola ${x.durum === 'hata' ? 'tone-danger' : 'tone-warning'}`, text: x.durum === 'hata' ? `kabul edilmedi: ${x.sonHata || ''}` : `bekliyor${x.sonHata ? ` (son deneme: ${x.sonHata})` : ''}` }),
            el('td', null, [x.durum === 'hata' ? dugme('Kuyruktan çıkar', () => cikar(x), 'btn-secondary btn-xs') : null])
          ])) }),
        el('div', { class: 'pf-dugmeler mt-2' }, [dugme('Şimdi gönder', gonder, 'btn-primary btn-sm', { id: `btn${ops.onEk || 'Ev'}KuyrukGonder` })]),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Bekleyenler sırayla gönderilir (her dakika ve her yeni değişiklikten sonra kendiliğinden). Sunucu bir değişikliği kabul etmezse silinmez; burada nedeniyle kalır.' })
      ])
    ]);
  }

  /** Yazma çağrıları kuyruğa girdiyse ek bildirim. okuma: kuyruğa girmeyen (okuyan) yöntem adları. */
  function sarmala(a, okuma) {
    if (!a || a.__evSarili) return a;
    const o = { __evSarili: true };
    for (const [ad, f] of Object.entries(a)) {
      o[ad] = (typeof f !== 'function' || (okuma && okuma.has(ad))) ? f : async (...x) => {
        const r = await f(...x);
        if (r && r.kuyrukta) AG.bildir(kuyrukMetni(r), 'uyari', { sure: 9000 });
        return r;
      };
    }
    return o;
  }

  /* ── Portföyüm bir kezlik taşıma kartı ───────────────────────────────── */
  let tasimaOnizleme = null;
  async function tasimaKarti(kap, ops = {}) {
    if (!kap || !AG.api || !AG.api.evKuyruk) return;
    let d;
    try { d = await api().tasimaDurum(); } catch (e) { d = null; }
    if (!d || !d.success || !d.gerekli) { AG.dom.doldur(kap, []); kap.classList.add('is-hidden'); return; }
    kap.classList.remove('is-hidden');
    const yenile = () => { if (typeof ops.onDegisti === 'function') ops.onDegisti(); };
    const liste = (baslik, l, sinif) => (l && l.length ? el('details', { class: 'hs-kat-mini mt-2', open: sinif === 'kritik' ? 'open' : null }, [el('summary', { text: `${baslik} (${l.length})` }),
      el('ul', { class: 'pf-uyari-liste mt-2' }, l.slice(0, 200).map(x => el('li', { class: `pf-uyari pf-uyari-${sinif}`, text: x.neden ? `${x.ozet} — ${x.neden}` : x.ozet })))]) : null);
    const onizle = async (e) => {
      const b = e && e.currentTarget; if (b) AG.dom.mesgul(b, 'Sunucuyla karşılaştırılıyor…');
      try {
        const r = await api().tasimaOnizle();
        if (!r || !r.success) { AG.bildir(`Önizlenemedi: ${(r && r.error) || 'yanıt yok'}`, 'hata', { sure: 12000 }); tasimaOnizleme = null; }
        else tasimaOnizleme = r;
        ciz();
      } finally { if (b) AG.dom.hazir(b); }
    };
    const onayla = async (e) => {
      const s = tasimaOnizleme && tasimaOnizleme.sayilar;
      const ok_ = await AG.onayla({ baslik: 'Kayıtlar sunucuya taşınsın mı?', metin: `${s ? s.eklenecek : '?'} kayıt sunucudaki Portföyüm'e eklenecek; sunucuda zaten olan ${s ? s.zatenVar : '?'} kayıt eklenmeyecek. Sunucu o anda yeniden karşılaştırır (çift eklemez). Bu bilgisayardaki dosya silinmez, "taşındı" diye işaretlenir.`, onay: 'Sunucuya taşı' });
      if (!ok_) return;
      const b = e && e.currentTarget; if (b) AG.dom.mesgul(b, 'Gönderiliyor…');
      try {
        const r = await api().tasimaOnayla();
        AG.bildir(r && r.success ? (r.kuyrukta ? kuyrukMetni(r) : `${r.eklenenSayi || 0} kayıt sunucuya taşındı.`) : `Taşınamadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? (r.kuyrukta ? 'uyari' : 'ok') : 'hata', { sure: 10000 });
        if (r && r.success) { tasimaOnizleme = null; yenile(); tasimaKarti(kap, ops); }
      } finally { if (b) AG.dom.hazir(b); }
    };
    function ciz() {
      const o = tasimaOnizleme;
      AG.dom.doldur(kap, [el('div', { class: 'glass-panel panel-pad mb-4', id: 'pmTasimaKart' }, [
        el('h3', { class: 'card-title mb-2' }, [el('i', { class: 'tone-primary', 'data-lucide': 'house' }), el('span', { text: ' Bu bilgisayardaki Portföyüm kayıtlarını sunucuya taşı' })]),
        el('p', { class: 'hint hint-sm mb-2', text: `Portföyüm artık sunucudan okunuyor. Bu bilgisayarda daha önce girilmiş ${d.yerelKayit} kayıt var ve ekranda görünmüyor. Bir kez sunucuya taşıyabilirsin: önce karşılaştır (hangisi sunucuda zaten var), sonra onayla. Dosya silinmez.` }),
        d.bayrak && d.bayrak.durum === 'hata' ? el('p', { class: 'hint hint-sm tone-danger mb-2', text: `Önceki taşıma sunucuda kabul edilmedi: ${d.bayrak.hata || ''}` }) : null,
        o ? el('div', null, [
          el('p', { class: 'mb-1', text: `Eklenecek ${o.sayilar.eklenecek} · sunucuda zaten var ${o.sayilar.zatenVar} · eklenemeyecek ${o.sayilar.eklenemez} · taşınmayacak (iptal edilmiş) ${o.sayilar.atlanan}` }),
          liste('Eklenecek', o.eklenecek, 'bilgi'), liste('Sunucuda zaten var', o.zatenVar, 'bilgi'), liste('Eklenemeyecek', o.eklenemez, 'kritik'), liste('Taşınmayacak', o.atlanan, 'uyari')
        ]) : null,
        el('div', { class: 'pf-dugmeler mt-2' }, [
          dugme(o ? 'Yeniden karşılaştır' : 'Sunucuyla karşılaştır (kuru deneme)', onizle, o ? 'btn-secondary btn-sm' : 'btn-primary btn-sm', { id: 'btnPmTasimaOnizle' }),
          o && o.sayilar.eklenecek ? dugme(`Onayla — ${o.sayilar.eklenecek} kaydı sunucuya taşı`, onayla, 'btn-primary btn-sm', { id: 'btnPmTasimaOnayla' }) : null
        ])
      ])]);
      if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    }
    ciz();
  }

  AG.evKuyruk = { bantModeli, kuyrukMetni, kuyrukPaneli, sarmala, tasimaKarti };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.evKuyruk;
  void doc;
})(typeof window !== 'undefined' ? window : globalThis);
