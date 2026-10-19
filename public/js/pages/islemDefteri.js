/**
 * İŞLEM DEFTERİM — Portföy › "İşlem defterim" alt sekmesi (sürüm 64.7) `AG.pages.islemDefteri`
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcının KENDİ kripto ve FX işlemleri (OKX, Binance geçmişi, MetaTrader 4/5) — botlar burada değil (Botlar ekranı),
 * Portföyüm'ün yatırım defterinden ayrı. Sunucu lib/islemDefteri (uçlar /api/islem-defteri/*).
 * Bölümler: üst (hesap seçici, yenile, tutarları gizle) · yazma/ev bandı · sayılar · birikimli K/Z (ya da bakiye) + tepeden düşüş ·
 * aylık çubuk + yıl × ay tablosu · sembol tablosu (sembole tıkla → fiyat grafiği + alım/satım işaretleri, seri diskte varsa) ·
 * uzun/kısa + tutma süresi · işlem listesi (süzgeç, sayfa) · HESAPLAR VE YÜKLEME (.pm-yazma: yalnız sunucudaki masaüstü panel):
 * hesap ekle / düzenle (MT sunucu saat farkı), OKX salt okuma anahtarı + Şimdi eşitle, dosya önizle → Kaydet, yükleme geçmişi
 * (Geri al = ters kayıt).
 * Kurallar: DOM yalnız AG.dom.el, tablolar AG.tablo, renkler token sınıfları (inline stil yok), istekler yalnız AG.api.islemDefteri.
 * Tutarlar `.pm-tutar` — üst çubuktaki $ / ₺ / Gizli seçicisinin "Gizli"si (localStorage 'pusula.portfoy.gorunum', F6) burada da geçerli.
 * 64.8: geliştirme bilgisayarında (sunucu bağlantısı + yazma jetonu) yazma düğmeleri açık — değişiklik sunucuya gider, sunucu kapalıysa kuyrukta
 * bekler (bant + Kuyruk paneli: js/pages/evKuyruk.js); OKX anahtarı o bilgisayarın kendisinde, eşitleme yalnız elle.
 * 65.0: Binance hesap kartında salt okuma anahtarı (API Key + Secret Key) + Şimdi eşitle + Anahtarı sil; vadeli okuma sonucu ve spot tam tarama
 * ilerlemesi (binanceMetinleri — saf). OKX bölümüyle aynı kurallar (data-kilit telefon, sır panele gelmez).
 * Telegram'a hiçbir şey gitmez (K6). Sır (API anahtarı) panele hiç gelmez; yalnız "anahtar kayıtlı ✓ · izinler".
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const api = () => AG.api.islemDefteri;
  /** 64.8 başarı metni: geliştirme bilgisayarında yazma sunucuya gider; sunucu kapalıysa kuyruğa girer (yanıt kuyrukta: true). */
  const basariMetni = (r, metin) => (r && r.kuyrukta ? (AG.evKuyruk ? AG.evKuyruk.kuyrukMetni(r) : 'Kuyruğa alındı.') : metin);

  const GORUNUM_ANAHTAR = 'pusula.portfoy.gorunum';   // F6: üst çubuk $ / ₺ / Gizli (pano.js yazar)
  const DOSYA_TAVAN = 7 * 1024 * 1024;
  const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const SAAT_KIPLERI = [['sabit', 'Sabit fark'], ['abd-yaz', 'Otomatik: kışın +2, ABD yaz saatinde +3']];
  const TUR_AD = { islem: 'İşlem', fonlama: 'Fonlama', swap: 'Swap', kz: 'Gerçekleşen K/Z', ucret: 'Ücret', 'para-giris': 'Para girişi', 'para-cikis': 'Para çıkışı' };

  let veri = null;           // GET /ozet
  let liste = null;          // GET /islemler
  let secHesap = '';
  let grafikTur = 'net';     // 'net' | 'bakiye'
  let onizleme = null;       // { govde, sonuc }
  let yukleniyor = false;
  const suzgec = { sembol: '', bas: '', bit: '', yon: '', kaynak: '', tur: '', sayfa: 1 };
  let fiyatSembol = null;

  function oku(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function gizliMi() { try { const g = JSON.parse(oku(GORUNUM_ANAHTAR) || 'null'); return !!g && g.para === 'gizli'; } catch (e) { return false; } }
  function yaz(k, v) { try { if (global.localStorage) global.localStorage.setItem(k, v); } catch (e) { /* özel pencere */ } }

  /* ── Saf biçim ve modeller (scripts/islem-defteri-selftest.js sınar) ─────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const SIMGE = { USD: '$', USDT: '$', USDC: '$' };
  /** "$1.234,50" · "−$60,00" · başka birimde "1.234,50 EUR". */
  function para(x, birim = 'USD', b = 2) {
    if (!sayiMi(x)) return '—';
    const n = Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
    const eksi = x < 0 && /[1-9]/.test(n) ? '−' : '';
    return SIMGE[birim] ? `${eksi}${SIMGE[birim]}${n}` : `${eksi}${n} ${birim}`;
  }
  function isaretliPara(x, birim, b) { const s = para(x, birim, b); return sayiMi(x) && x > 0 && /[1-9]/.test(s) ? '+' + s : s; }
  const oranBicim = (x, b = 1) => (sayiMi(x) ? `%${(x * 100).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}` : '—');
  function karFaktoru(t) { if (!t) return '—'; if (t.karFaktoruSonsuz) return '∞ (kayıp yok)'; return sayiMi(t.karFaktoru) ? t.karFaktoru.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'; }
  /** Süre: "45 dk" · "3,5 sa" · "2,1 gün". */
  function sure(ms) {
    if (!sayiMi(ms)) return '—';
    const dk = ms / 60000;
    if (dk < 90) return `${Math.round(dk)} dk`;
    if (dk < 48 * 60) return `${(dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`;
    return `${(dk / 1440).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün`;
  }
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-9 ? 'tone-muted' : x > 0 ? 'tone-success' : 'tone-danger');
  const tarihSaat = (t) => (sayiMi(t) ? AG.fmt.tarihSaat(t) : '—');
  const tarihK = (t) => (sayiMi(t) ? AG.fmt.tarih(t) : '—');
  /** Miktar: en çok 8 anlamlı basamak, Türkçe. */
  const miktar = (x) => (sayiMi(x) ? (+x.toPrecision(8)).toLocaleString('tr-TR', { maximumFractionDigits: 8 }) : '—');

  /** Sayı kutularının modeli (perf.toplam). */
  function kutuModeli(p) {
    const t = (p && p.toplam) || {};
    const b = (p && p.birim) || 'USD';
    return [
      { id: 'net', etiket: 'Net kâr / zarar', deger: isaretliPara(t.net, b), tonDeger: t.net, alt: 'gerçekleşen − ücret + fonlama + swap', tutar: true },
      { id: 'gerceklesen', etiket: 'Gerçekleşen kâr', deger: isaretliPara(t.gerceklesen, b), tonDeger: t.gerceklesen, alt: 'spot FIFO · vadeli ve FX kaynağın kârı', tutar: true },
      { id: 'ucret', etiket: 'Ücret / komisyon', deger: para(-(t.ucret || 0), b), tonDeger: -(t.ucret || 0), alt: 'işlem ücretleri + MT komisyon ve vergi', tutar: true },
      { id: 'fonlama', etiket: 'Fonlama + swap', deger: isaretliPara((t.fonlama || 0) + (t.swap || 0), b), tonDeger: (t.fonlama || 0) + (t.swap || 0), alt: `fonlama ${para(t.fonlama, b)} · swap ${para(t.swap, b)}`, tutar: true },
      { id: 'islem', etiket: 'İşlem · kazanma oranı', deger: `${t.islem || 0} · ${oranBicim(t.kazanmaOrani, 0)}`, alt: `${t.kazanan || 0} kazanan · ${t.kaybeden || 0} kaybeden` },
      { id: 'kf', etiket: 'Kâr faktörü · işlem başı', deger: karFaktoru(t), alt: `işlem başı ortalama ${isaretliPara(t.beklenen, b)}`, altTutar: true },
      { id: 'dusus', etiket: 'En derin düşüş', deger: para(t.maxDusus, b), tonDeger: t.maxDusus, alt: t.maxDususGun ? `birikimli K/Z'de tepeden · ${t.maxDususGun}` : 'birikimli K/Z\'de tepeden', tutar: true },
      { id: 'akis', etiket: 'Para girişi / çıkışı', deger: `${para(t.paraGiris, b, 0)} / ${para(t.paraCikis, b, 0)}`, alt: 'performansa girmez', tutar: true }
    ];
  }

  /** Aylık çubuk modeli: [{ ay, v }] → { cubuklar: [{ x, y, w, h, v, ay, arti }], sifirY, W, H } (SVG koordinatı). */
  function aylikCubukModeli(l, W = 720, H = 160) {
    const v = (l || []).filter(x => sayiMi(x.v));
    if (!v.length) return null;
    const enB = Math.max(0, ...v.map(x => x.v)), enK = Math.min(0, ...v.map(x => x.v));
    const ust = 8, alt = 22, ic = H - ust - alt, aralik = (enB - enK) || 1;
    const y = (d) => ust + ic * (enB - d) / aralik;
    const genis = W / v.length, w = Math.max(2, Math.min(36, genis * 0.7));
    return { W, H, sifirY: y(0), cubuklar: v.map((x, i) => ({ ay: x.ay, v: x.v, arti: x.v >= 0, x: i * genis + (genis - w) / 2, w, y: Math.min(y(0), y(x.v)), h: Math.max(1, Math.abs(y(x.v) - y(0))) })) };
  }

  /** ArrayBuffer → base64 (parça parça; büyük dosyada yığın taşmasın). */
  function base64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return global.btoa ? global.btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }

  /** İşlem listesi satırının "ayrıntı" metni. */
  function satirAyrinti(x) {
    if (x.tur === 'islem' && x.islemTuru === 'pozisyon') return `${x.yon === 'al' ? 'Alış' : 'Satış'} ${miktar(x.miktar)} lot · ${x.acilisFiyat} → ${x.fiyat} · açılış ${tarihSaat(x.acilisT)}`;
    if (x.tur === 'islem') return `${x.yon === 'al' ? 'Alış' : 'Satış'} ${miktar(x.miktar)} @ ${miktar(x.fiyat)}${x.ucret && x.ucret.tutar ? ` · ücret ${miktar(x.ucret.tutar)} ${x.ucret.para || ''}` : ''}`;
    return `${TUR_AD[x.tur] || x.tur}${x.not ? ` · ${x.not}` : ''}`;
  }
  /** Satırın K/Z sütunu (işaretli, kendi para biriminde). */
  function satirKz(x) {
    if (x.tur === 'islem') {
      if (x.islemTuru === 'pozisyon') return (x.gerceklesenKar || 0) + (x.komisyon || 0) + (x.vergi || 0) + (x.swap || 0);
      return sayiMi(x.gerceklesenKar) && x.gerceklesenKar !== 0 ? x.gerceklesenKar : null;
    }
    return x.tutar;
  }

  const tutar = (metin, ek) => el('span', { class: `pm-tutar${ek ? ' ' + ek : ''}`, text: metin });
  const ikon = (ad) => el('i', { class: 'tone-primary', 'data-lucide': ad });
  const bolumBaslik = (ikonAd, metin) => el('h3', { class: 'card-title mb-3' }, [ikon(ikonAd), el('span', { text: ' ' + metin })]);
  const dugme = (metin, f, sinif = 'btn-secondary btn-sm', ek = {}) => el('button', { type: 'button', class: `btn ${sinif}`, onclick: f, ...ek }, [el('span', { text: metin })]);
  const hesapAdi = (id) => { const h = ((veri && veri.hesaplar) || []).find(x => x.id === id); return h ? h.ad : id; };
  const yazmaAcik = () => !!(veri && veri.yazma && veri.yazma.acik);

  /* ── Bölümler ───────────────────────────────────────────────────────── */
  function ustCiz() {
    const k = bul('idfUst');
    if (!k) return;
    const hesaplar = (veri && veri.hesaplar) || [];
    const hS = el('select', { id: 'selIdfHesap', class: 'form-control control-sm', 'aria-label': 'Hesap', onchange: (e) => { secHesap = e.target.value; suzgec.sayfa = 1; fiyatSembol = null; yukle(true); } },
      [el('option', { value: '', text: 'Bütün hesaplar' }), ...hesaplar.map(h => el('option', { value: h.id, text: `${h.ad} · ${h.turAd}${h.aktif ? '' : ' (kapalı)'}` }))]);
    hS.value = secHesap;
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2' }, [
        el('div', null, [el('h3', { class: 'card-title m-0' }, [ikon('notebook-pen'), el('span', { text: ' İşlem defterim' })]),
          el('p', { class: 'hint hint-sm mb-0', text: 'Kendi kripto ve FX işlemlerin: OKX, Binance geçmişi, MetaTrader. Botların işlemleri burada değil (Botlar). Portföyüm\'den ayrı tutulur.' })]),
        el('div', { class: 'pf-dugmeler idf-secici' }, [
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Hesap' }), hS]),
          dugme('Yenile', () => yukle(true), 'btn-secondary btn-sm', { id: 'btnIdfYenile' })
        ])
      ])
    ]);
  }

  function bantCiz() {
    const k = bul('idfBant');
    if (!k) return;
    const m = [];
    if (veri && veri.evKaynak) m.push({ s: veri.evKaynak.eski ? 'uyari' : 'bilgi', t: veri.evKaynak.eski ? `Sunucudaki panele şu an ulaşılamıyor — son okunan kayıt gösteriliyor (${tarihSaat(veri.evKaynak.zaman)}).` : `Kayıtlar sunucudan okunuyor (${tarihSaat(veri.evKaynak.zaman)}).` });
    // 64.8: bu bilgisayarın yazma/kuyruk durumu (bu bilgisayarın Node sunucusu, uzaktaki sunucudan gelen yanıta yazar: yazma.ev + evYazma) — AG.evKuyruk.bantModeli
    if (veri && veri.evKaynak && veri.yazma && veri.yazma.ev && AG.evKuyruk) m.push(...AG.evKuyruk.bantModeli(veri));
    // Sunucu bağlantısıyla okunan yanıtta sunucu paneli bu isteği telefon kademesi sayar — bu bilgisayarın mesajı ayrı (D6).
    else if (veri && veri.evKaynak) m.push({ s: 'bilgi', t: 'Kayıtlar sunucuda tutulur; bu bilgisayar yalnız görüntüler (sunucu bağlantısı). Yükleme, hesap ve OKX/Binance anahtarı sunucudaki panelden.' });
    else if (veri && veri.yazma && !veri.yazma.acik) m.push({ s: 'bilgi', t: veri.yazma.neden === 'telefon' ? 'Telefondan yalnız izlenir; dosya yükleme ve hesap ayarları sunucunun panelinden.' : veri.yazma.neden });
    for (const h of (veri && veri.hatalar) || []) m.push({ s: 'kritik', t: h });
    for (const u of (veri && veri.performans && veri.performans.uyarilar) || []) m.push({ s: 'uyari', t: u.mesaj });
    const kuyruk = AG.evKuyruk ? AG.evKuyruk.kuyrukPaneli(veri, { onEk: 'Idf', onDegisti: () => yukle(true) }) : null;
    k.classList.toggle('is-hidden', !m.length && !kuyruk);
    doldur(k, m.length || kuyruk ? [m.length ? el('ul', { class: 'pf-uyari-liste' }, m.map(x => el('li', { class: `pf-uyari pf-uyari-${x.s}`, text: x.t }))) : null, kuyruk] : []);
  }

  function sayilarCiz() {
    const k = bul('idfSayilar');
    if (!k) return;
    const p = veri.performans;
    if (!p.toplam.kayit) {
      doldur(k, [el('p', { class: 'hint mb-0', text: (veri.hesaplar || []).length ? 'Bu seçimde henüz işlem yok. Aşağıdaki "Hesaplar ve yükleme" bölümünden dosya yükle ya da OKX\'i eşitle.' : 'Henüz hesap yok. Aşağıdaki "Hesaplar ve yükleme" bölümünden ilk hesabını aç (ör. OKX), sonra işlem geçmişini yükle.' })]);
      return;
    }
    doldur(k, [
      el('div', { class: 'ana-sayilar', id: 'idfKutular' }, kutuModeli(p).map(x => el('div', { class: 'ana-sayi', 'data-kutu': x.id }, [
        el('span', { class: 'stat-title', text: x.etiket }),
        el('span', { class: `stat-value stat-value-sm sayi${x.tonDeger != null ? ' ' + ton(x.tonDeger) : ''}` }, [x.tutar ? tutar(x.deger) : el('span', { text: x.deger })]),
        el('span', { class: 'hint hint-sm mb-0' }, [x.altTutar || x.tutar ? tutar(x.alt) : el('span', { text: x.alt })])
      ]))),
      p.ek ? ekCiz(p) : null,
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: `${tarihK(p.toplam.ilk)} → ${tarihK(p.toplam.son)} · ${p.toplam.kayit} kayıt (${p.toplam.dolum} dolum, ${p.toplam.pozisyon} MT pozisyonu)${p.birim !== 'USD' ? ` · tutarlar ${p.birim} (dolar kuru diskte yok)` : ' · tutarlar dolar'}${p.toplam.ortulen ? ` · ${p.toplam.ortulen} hareket satırı dolumla aynı olduğu için sayılmadı` : ''}.` })
    ]);
  }

  /** Yeni panel F4 (§5): gün kazanma, ücret ÷ brüt, seriler, toparlanma, işlem skoru, gün × saat ısı (lib/islemDefteri/analiz.js ekOlcutler). */
  function ekCiz(p) {
    const e = p.ek, b = p.birim || 'USD';
    const kutu = (etiket, deger, alt) => el('div', { class: 'p-gosterge' }, [el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: etiket }), el('span', { class: 'p-yeni', text: 'yeni' })]),
      el('p', { class: 'p-gosterge-deger', text: deger }), el('p', { class: 'p-gosterge-alt', text: alt })]);
    const enB = Math.max(1e-9, ...e.isi.hucreler.flat().map(h => Math.abs(h.net)));
    const hucre = (h, gun, dilim) => {
      const o = h.net / enB, s = !h.n ? '' : o >= 0.5 ? ' pn-isi-p3' : o > 0.15 ? ' pn-isi-p2' : o > 0 ? ' pn-isi-p1' : o <= -0.5 ? ' pn-isi-n3' : o < -0.15 ? ' pn-isi-n2' : o < 0 ? ' pn-isi-n1' : '';
      return el('span', { class: `pn-isi-hucre${s}`, title: `${gun} ${dilim}:00 (4 saat) ·${h.n} işlem · ${isaretliPara(h.net, b)}` });
    };
    return el('div', { class: 'idf-ek' }, [
      el('div', { class: 'p-serit' }, [
        kutu('Gün kazanma %', oranBicim(e.gunKazanma, 0), `${e.kazananGun} kârlı / ${e.islemGunu} işlem günü`),
        kutu('Ücret ÷ brüt kâr', oranBicim(e.ucretBrut, 0), 'komisyon kârın ne kadarını yiyor'),
        kutu('Seriler', `+${e.enUzunKazancSerisi} / −${e.enUzunKayipSerisi}`, `en uzun kazanç / kayıp · şu an ${e.simdikiSeri > 0 ? '+' : ''}${e.simdikiSeri}`),
        kutu('Toparlanma faktörü', sayiMi(e.toparlanmaFaktoru) ? e.toparlanmaFaktoru.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—', 'net K/Z ÷ en derin düşüş'),
        kutu('İşlem skoru', e.skor.puan == null ? '—' : `${e.skor.puan}/100`, e.skor.eksenler.map(x => `${x.ad} ${x.puan == null ? '—' : Math.round(x.puan)}`).join(' · '))
      ]),
      el('div', { class: 'idf-isi-kutu' }, [
        el('p', { class: 'p-gosterge-etiket' }, [el('span', { text: 'Gün × saat (yerel) — net K/Z' }), el('span', { class: 'p-yeni', text: 'yeni' })]),
        el('div', { class: 'pn-isi idf-isi', role: 'img', 'aria-label': 'Gün ve saate göre net kâr/zarar ısı haritası' }, [
          el('span'), ...e.isi.dilimler.map(d => el('span', { class: 'pn-isi-bas', text: d })),
          ...e.isi.gunler.flatMap((g, i) => [el('span', { class: 'pn-isi-bas', text: g }), ...e.isi.hucreler[i].map((h, j) => hucre(h, g, e.isi.dilimler[j]))])
        ]),
        el('p', { class: 'hint hint-sm mb-0', text: 'Hangi gün ve saatte kaybediyorum? Yeşil kâr, kırmızı zarar (en büyük hücreye göre). İşlem skoru TradeZella ağırlıklarıyla (kılavuzda).' })
      ])
    ]);
  }

  function grafikCiz() {
    const k = bul('idfGrafik');
    if (!k) return;
    const p = veri.performans;
    const bakiyeVar = (p.bakiyeSeri || []).length > 1;
    if (!bakiyeVar) grafikTur = 'net';
    const sec = bakiyeVar ? el('div', { class: 'pf-dugmeler', role: 'group', 'aria-label': 'Grafik' }, [['net', 'Birikimli K/Z'], ['bakiye', 'Bakiye (para girişleri dahil)']].map(([a, t]) =>
      el('button', { type: 'button', class: `btn btn-xs ${grafikTur === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': grafikTur === a ? 'true' : 'false', onclick: () => { grafikTur = a; grafikCiz(); } }, [el('span', { text: t })]))) : null;
    const kap = el('div', { id: 'idfGrafikKap', class: 'pm-tutar-grafik' });
    const dkap = el('div', { id: 'idfDususKap' });
    doldur(k, [el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [bolumBaslik('line-chart', grafikTur === 'bakiye' ? 'Bakiye' : 'Birikimli kâr / zarar (net)'), sec]), kap,
      el('h4', { class: 'pf-bolum-baslik mt-3', text: 'Tepeden düşüş (birikimli K/Z\'nin en yüksek noktasından)' }), dkap,
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: grafikTur === 'bakiye' ? 'Bakiye = bilinen para girişi/çıkışı + net K/Z (yüklenen dosyalarda olan hareketlerle; eksik hareket varsa gerçek bakiyeden sapar).' : 'Her gün kapanan işlemlerin kârı, ücretler ve fonlama eklenir; para yatırıp çekmek bu çizgiyi değiştirmez.' })]);
    const b = p.birim === 'USD' ? '$' : p.birim;
    AG.grafik.ana(kap, { seri: grafikTur === 'bakiye' ? p.bakiyeSeri : p.seri, dusus: false, log: false, birim: b, etiket: grafikTur === 'bakiye' ? 'Bakiye' : 'Birikimli net K/Z', ad: 'İşlem defteri', bicim: (v) => para(v, p.birim) });
    AG.grafik.ana(dkap, { seri: p.dususSeri, dusus: false, log: false, birim: b, etiket: 'Tepeden düşüş', ad: 'Tepeden düşüş', bicim: (v) => para(v, p.birim) });
  }

  function aylikCiz() {
    const k = bul('idfAylik');
    if (!k) return;
    const p = veri.performans;
    const bas = bolumBaslik('calendar-range', 'Aylık kâr / zarar (net)');
    // viewBox kabın genişliğinde: yazı her ekranda aynı boyda kalsın (ölçeklenmesin)
    const m = aylikCubukModeli(p.aylikCubuk, Math.max(320, Math.round((k.clientWidth || 760) - 40)), 170);
    if (!m) { doldur(k, [bas, el('p', { class: 'hint hint-sm mb-0', text: 'Henüz ay yok.' })]); return; }
    const svg = AG.dom.svg('svg', { class: 'idf-cubuk pm-tutar', viewBox: `0 0 ${m.W} ${m.H}`, role: 'img', 'aria-label': 'Aylık net kâr/zarar çubukları' }, [
      AG.dom.svg('line', { x1: 0, x2: m.W, y1: m.sifirY.toFixed(1), y2: m.sifirY.toFixed(1), class: 'grf-cubuk-sifir' }),
      ...m.cubuklar.map(c => AG.dom.svg('rect', { x: c.x.toFixed(1), y: c.y.toFixed(1), width: c.w.toFixed(1), height: c.h.toFixed(1), rx: 2, class: c.arti ? 'grf-cubuk-arti' : 'grf-cubuk-eksi' }, [AG.dom.svg('title', { text: `${c.ay}: ${isaretliPara(c.v, p.birim)}` })])),
      ...m.cubuklar.filter((c, i) => m.cubuklar.length <= 14 || i % Math.ceil(m.cubuklar.length / 12) === 0).map(c => AG.dom.svg('text', { x: (c.x + c.w / 2).toFixed(1), y: m.H - 6, 'text-anchor': 'middle', class: 'grf-cubuk-deger', text: `${AY_KISA[+c.ay.slice(5, 7) - 1]} ${c.ay.slice(2, 4)}` }))
    ]);
    const hucre = (v) => el('td', { class: `sayi ${ton(v)}` }, [sayiMi(v) ? tutar(isaretliPara(v, p.birim, 0)) : el('span', { text: '' })]);
    doldur(k, [bas, svg,
      AG.tablo.kutulu({ id: 'tblIdfAylik', sinif: 'table-dense pf-tablo pm-aylik', basliklar: ['Yıl', ...AY_KISA, 'Yıl'],
        satirlar: p.aylik.map(y => el('tr', null, [el('td', { class: 'fw-semibold', text: y.yil }), ...y.aylar.map(hucre), (() => { const c = hucre(y.toplam); c.classList.add('fw-semibold'); return c; })()])) }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Ay, işlemin KAPANDIĞI güne göre (yerel saat). Ücret ve fonlama kendi gününe yazılır.' })]);
  }

  function sembollerCiz() {
    const k = bul('idfSemboller');
    if (!k) return;
    const p = veri.performans;
    const bas = bolumBaslik('list-ordered', 'Sembollere göre');
    if (!p.semboller.length) { doldur(k, [bas, el('p', { class: 'hint hint-sm mb-0', text: 'Henüz işlem yok.' })]); return; }
    const satirlar = p.semboller.map(s => el('tr', { 'data-sembol': s.sembol }, [
      el('td', { class: 'pf-sola' }, [el('button', { type: 'button', class: 'idf-sembol', onclick: () => fiyatAc(s.sembol), title: 'Fiyat grafiği ve alım/satım işaretleri' }, [el('span', { class: 'fw-semibold', text: s.sembol })]), el('div', { class: 'pf-kucuk', text: s.piyasa || '' })]),
      el('td', { class: 'sayi', text: String(s.islem) }),
      el('td', { class: 'sayi', text: oranBicim(s.kazanmaOrani, 0) }),
      el('td', { class: `sayi ${ton(s.net)}` }, [tutar(isaretliPara(s.net, p.birim))]),
      el('td', { class: 'sayi' }, [tutar(isaretliPara(s.ortKazanc, p.birim))]),
      el('td', { class: 'sayi' }, [tutar(isaretliPara(s.ortKayip, p.birim))]),
      el('td', { class: 'sayi', text: karFaktoru(s) }),
      el('td', { class: `sayi ${ton(s.beklenen)}` }, [tutar(isaretliPara(s.beklenen, p.birim))]),
      el('td', { class: 'sayi tone-danger' }, [tutar(para(s.enBuyukKayip, p.birim))]),
      el('td', { class: 'sayi' }, [tutar(para(s.ucret, p.birim))]),
      el('td', { class: `sayi ${ton(s.fonlama + s.swap)}` }, [tutar(isaretliPara(s.fonlama + s.swap, p.birim))])
    ]));
    doldur(k, [bas,
      AG.tablo.kutulu({ id: 'tblIdfSembol', sinif: 'table-dense pf-tablo', siralanabilir: true, basliklar: ['Sembol', 'İşlem', 'Kazanma', 'Net', 'Ort. kazanç', 'Ort. kayıp', 'Kâr faktörü', 'İşlem başı', 'En büyük kayıp', 'Ücret', 'Fonlama / swap'], satirlar }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'İşlem = kapanış (spot: eşlenen satış; vadeli: kârı olan dolum; MetaTrader: kapanan pozisyon). Net = gerçekleşen − bütün ücretler + fonlama + swap. Kâr faktörü = kazançlar toplamı ÷ kayıplar toplamı. Sembole tıkla: fiyat grafiği.' }),
      el('div', { id: 'idfFiyat', class: 'mt-3' })]);
    if (fiyatSembol) fiyatAc(fiyatSembol);
  }

  async function fiyatAc(sembol) {
    fiyatSembol = sembol;
    const k = bul('idfFiyat');
    if (!k) return;
    doldur(k, [el('p', { class: 'hint hint-sm mb-0', text: `${sembol}: fiyat serisi okunuyor…` })]);
    try {
      const r = await api().fiyat(sembol, secHesap);
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      const kap = el('div', { id: 'idfFiyatKap' });
      doldur(k, [el('div', { class: 'row-between row-wrap gap-2' }, [el('h4', { class: 'pf-bolum-baslik m-0', text: `${sembol} — fiyat ve işlemlerin` }), dugme('Kapat', () => { fiyatSembol = null; doldur(k, []); }, 'btn-secondary btn-xs')]),
        r.seri && r.seri.length > 1 ? kap : el('p', { class: 'hint hint-sm mb-0 tone-warning', text: r.not || 'Fiyat serisi yok.' }),
        r.kaynak ? el('p', { class: 'hint hint-sm mb-0', text: `Kaynak: ${r.kaynak}. ▲ alım · ▼ satım (aynı gün birden çok işlem tek işarette).` }) : null]);
      if (r.seri && r.seri.length > 1) AG.grafik.ana(kap, { seri: r.seri, dusus: false, isaretler: r.isaretler, etiket: `${sembol} günlük kapanış`, ad: sembol });
    } catch (e) { doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'Fiyat grafiği okunamadı' })]); }
  }

  function yonCiz() {
    const k = bul('idfYon');
    if (!k) return;
    const p = veri.performans;
    const satir = (ad, y) => el('tr', null, [el('td', { class: 'pf-sola fw-semibold', text: ad }), el('td', { class: 'sayi', text: String(y.islem) }), el('td', { class: 'sayi', text: oranBicim(y.kazanmaOrani, 0) }),
      el('td', { class: `sayi ${ton(y.net)}` }, [tutar(isaretliPara(y.net, p.birim))]), el('td', { class: 'sayi', text: karFaktoru(y) }), el('td', { class: `sayi ${ton(y.beklenen)}` }, [tutar(isaretliPara(y.beklenen, p.birim))])]);
    const s = p.sure;
    doldur(k, [bolumBaslik('arrow-up-down', 'Uzun / kısa ve tutma süresi'),
      el('div', { class: 'mp-iki idf-iki' }, [
        el('div', { class: 'mp-blok' }, [AG.tablo.kutulu({ id: 'tblIdfYon', sinif: 'table-dense pf-tablo', basliklar: ['Yön', 'İşlem', 'Kazanma', 'Net', 'Kâr faktörü', 'İşlem başı'], satirlar: [satir('Uzun (long)', p.yonler.long), satir('Kısa (short)', p.yonler.short)] }),
          el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Spot satışları uzun sayılır. Yalnız kâr satırı olan (yönü bilinmeyen) işlemler bu tabloya girmez.' })]),
        el('div', { class: 'mp-blok', id: 'idfSure' }, s ? [AG.tablo.kutulu({ id: 'tblIdfSure', sinif: 'table-dense pf-tablo', basliklar: ['Tutma süresi', ''], satirlar: [
          ['Ortalama', sure(s.ortMs)], ['Ortanca', sure(s.medyanMs)], ['En kısa', sure(s.enKisaMs)], ['En uzun', sure(s.enUzunMs)], ['Kazananlarda ort.', sure(s.kazananOrtMs)], ['Kaybedenlerde ort.', sure(s.kaybedenOrtMs)]
        ].map(([a, b]) => el('tr', null, [el('td', { class: 'pf-sola', text: a }), el('td', { class: 'sayi', text: b })])) }), el('p', { class: 'hint hint-sm mt-2 mb-0', text: `${s.adet} MetaTrader pozisyonu (açılış → kapanış).` })]
          : [el('p', { class: 'hint hint-sm mb-0', text: 'Tutma süresi yalnız MetaTrader pozisyonlarında (açılış ve kapanış saati raporda) hesaplanır.' })])
      ])]);
  }

  function listeCiz() {
    const k = bul('idfListe');
    if (!k) return;
    const kaynaklar = (veri && veri.sabitler && veri.sabitler.kaynaklar) || {};
    const girdi = (id, ad, tip, deger, ek = {}) => el('label', { class: 'pf-alan' }, [el('span', { text: ad }), el('input', { id, type: tip, class: 'form-control control-sm', value: deger || '', ...ek })]);
    const secim = (id, ad, secenekler, deger) => { const s = el('select', { id, class: 'form-control control-sm' }, secenekler.map(([v, t]) => el('option', { value: v, text: t }))); s.value = deger || ''; return el('label', { class: 'pf-alan' }, [el('span', { text: ad }), s]); };
    const uygula = () => {
      suzgec.sembol = (bul('inpIdfSembol') || {}).value || ''; suzgec.bas = (bul('inpIdfBas') || {}).value || ''; suzgec.bit = (bul('inpIdfBit') || {}).value || '';
      suzgec.yon = (bul('selIdfYon') || {}).value || ''; suzgec.kaynak = (bul('selIdfKaynak') || {}).value || ''; suzgec.tur = (bul('selIdfTur') || {}).value || '';
      suzgec.sayfa = 1; listeYukle();
    };
    const l = liste;
    const satirlar = l ? l.satirlar.map(x => {
      const kz = satirKz(x);
      return el('tr', { 'data-kayit': x.id }, [
        el('td', { class: 'sayi', text: tarihSaat(x.t) }),
        el('td', { class: 'pf-sola' }, [el('div', { class: 'fw-semibold', text: x.sembol || '—' }), el('div', { class: 'pf-kucuk', text: `${hesapAdi(x.hesap)} · ${kaynaklar[x.kaynak] || x.kaynak}` })]),
        el('td', { class: 'pf-sola', text: x.tur === 'islem' ? (x.islemTuru === 'pozisyon' ? 'Pozisyon' : x.piyasa === 'spot' ? 'Spot' : 'Vadeli') : (TUR_AD[x.tur] || x.tur) }),
        el('td', { class: 'pf-sola' }, [tutar(satirAyrinti(x))]),
        el('td', { class: `sayi ${ton(kz)}` }, [sayiMi(kz) ? tutar(isaretliPara(kz, x.para || 'USD')) : el('span', { text: '' })]),
        el('td', null, [yazmaAcik() ? dugme('İptal', () => kayitIptal(x), 'btn-secondary btn-xs', { 'data-kilit': 'telefon', title: 'Bu satırı etkisiz yap (ters kayıt; silinmez)' }) : null])
      ]);
    }) : [];
    doldur(k, [bolumBaslik('list', 'İşlemler'),
      el('div', { id: 'idfSuzgec', class: 'pf-dugmeler mb-2' }, [
        girdi('inpIdfSembol', 'Sembol', 'text', suzgec.sembol, { placeholder: 'BTC, EURUSD…' }), girdi('inpIdfBas', 'Başlangıç', 'date', suzgec.bas), girdi('inpIdfBit', 'Bitiş', 'date', suzgec.bit),
        secim('selIdfYon', 'Yön', [['', 'Hepsi'], ['al', 'Alış'], ['sat', 'Satış']], suzgec.yon),
        secim('selIdfTur', 'Tür', [['', 'Hepsi'], ['islem', 'Yalnız işlemler'], ['hareket', 'Fonlama, ücret, para hareketi']], suzgec.tur),
        secim('selIdfKaynak', 'Kaynak', [['', 'Hepsi'], ...Object.entries(kaynaklar)], suzgec.kaynak),
        dugme('Süz', uygula, 'btn-primary btn-sm', { id: 'btnIdfSuz' })
      ]),
      !l ? el('p', { class: 'hint hint-sm mb-0', text: 'Okunuyor…' }) : !l.toplam ? el('p', { class: 'hint hint-sm mb-0', text: 'Bu süzgeçte kayıt yok.' }) :
        AG.tablo.kutulu({ id: 'tblIdfIslem', sinif: 'table-dense pf-tablo', basliklar: ['Zaman', 'Sembol / hesap', 'Tür', 'Ayrıntı', 'K/Z', ''], satirlar }),
      l && l.toplam ? el('div', { class: 'row-between row-wrap gap-2 mt-2', id: 'idfSayfa' }, [
        el('span', { class: 'hint hint-sm mb-0', text: `${l.toplam} kayıt · sayfa ${l.sayfa} / ${l.sayfaSayisi} · zamanlar yerel saat (MetaTrader için hesabın sunucu saat farkı uygulanmış)` }),
        el('div', { class: 'pf-dugmeler' }, [dugme('‹ Önceki', () => { suzgec.sayfa = Math.max(1, l.sayfa - 1); listeYukle(); }, 'btn-secondary btn-xs', { disabled: l.sayfa <= 1 ? 'disabled' : null }),
          dugme('Sonraki ›', () => { suzgec.sayfa = Math.min(l.sayfaSayisi, l.sayfa + 1); listeYukle(); }, 'btn-secondary btn-xs', { disabled: l.sayfa >= l.sayfaSayisi ? 'disabled' : null })])
      ]) : null]);
  }

  async function kayitIptal(x) {
    const ok_ = await AG.onayla({ baslik: 'Bu satır etkisiz yapılsın mı?', metin: `${x.sembol || TUR_AD[x.tur]} · ${tarihSaat(x.t)}. Satır SİLİNMEZ: ters kayıt eklenir, hesaplara katılmaz. Bütün dosyayı geri almak için Yükleme geçmişi › Geri al.`, onay: 'Etkisiz yap', tehlikeli: true });
    if (!ok_) return;
    const r = await api().iptal(x.id, 'elle iptal');
    AG.bildirim.bildir(r && r.success ? basariMetni(r, 'Satır etkisiz yapıldı.') : `İptal edilemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) yukle(true);
  }

  /* ── Hesaplar ve yükleme (yazma) ───────────────────────────────────── */
  function hesaplarCiz() {
    const k = bul('idfHesaplar');
    if (!k) return;
    if (!yazmaAcik()) {
      const hs = (veri && veri.hesaplar) || [];
      doldur(k, [bolumBaslik('wallet', 'Hesaplar'), hs.length ? AG.tablo.kutulu({ id: 'tblIdfHesapOku', sinif: 'table-dense pf-tablo', basliklar: ['Hesap', 'Tür', 'Para', 'Kayıt', 'Eşitleme'],
        satirlar: hs.map(h => { const b = h.okx || h.binance; return el('tr', null, [el('td', { class: 'pf-sola fw-semibold', text: h.ad }), el('td', { class: 'pf-sola', text: h.turAd }), el('td', { text: h.paraBirimi }), el('td', { class: 'sayi', text: String(h.kayit) }),
          el('td', { class: 'pf-sola', text: b ? (b.anahtar ? `anahtar kayıtlı ✓ · izinler: ${(b.izinler || []).join(', ') || 'doğrulandı (elle)'}${b.sonEsitleme ? ` · son eşitleme ${tarihSaat(Date.parse(b.sonEsitleme))}` : ''}${h.binance && h.binance.tarama ? ` · ${binanceMetinleri(h.binance).tarama}` : ''}` : 'anahtar yok') : '' })]); }) }) : el('p', { class: 'hint hint-sm mb-0', text: 'Hesap yok.' }),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: veri && veri.yazma && veri.yazma.ev && veri.yazma.neden ? veri.yazma.neden : 'Yükleme, hesap ekleme ve OKX/Binance anahtarı yalnız sunucunun panelinden.' })]);
      return;
    }
    const turler = (veri.sabitler && veri.sabitler.hesapTurleri) || {};
    const hesaplar = veri.hesaplar || [];
    const kart = (h) => {
      const parcalar = [
        el('div', { class: 'row-between row-wrap gap-2' }, [el('div', null, [el('div', { class: 'fw-semibold', text: h.ad }), el('div', { class: 'pf-kucuk', text: `${h.turAd} · ${h.paraBirimi} · ${h.kayit} kayıt${h.not ? ' · ' + h.not : ''}` })]),
          el('div', { class: 'pf-dugmeler' }, [dugme(h.aktif ? 'Kapat' : 'Aç', () => hesapGuncelle(h.id, { aktif: !h.aktif }), 'btn-secondary btn-xs', { 'data-kilit': 'telefon', title: 'Kapalı hesap kayıtlarıyla görünmeye devam eder; yalnız OKX/Binance otomatik eşitlemesi durur' })])])
      ];
      if (/^fx-mt/.test(h.hesapTuru) || h.hesapTuru === 'diger') {
        const kipS = el('select', { id: `selIdfSaatKipi-${h.id}`, class: 'form-control control-sm' }, SAAT_KIPLERI.map(([v, t]) => el('option', { value: v, text: t })));
        kipS.value = h.saatKipi === 'abd-yaz' ? 'abd-yaz' : 'sabit';
        parcalar.push(el('div', { class: 'pf-dugmeler mt-2' }, [
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Sunucu saati' }), kipS]),
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Sabit fark (saat, UTC\'ye göre)' }), el('input', { id: `inpIdfSaat-${h.id}`, type: 'number', step: '0.25', min: '-12', max: '14', class: 'form-control control-sm', value: String(h.sunucuSaatFarki) })]),
          dugme('Kaydet', () => hesapGuncelle(h.id, { saatKipi: (bul(`selIdfSaatKipi-${h.id}`) || {}).value || 'sabit', sunucuSaatFarki: (bul(`inpIdfSaat-${h.id}`) || {}).value }), 'btn-secondary btn-sm', { 'data-kilit': 'telefon' }),
          el('span', { class: 'hint hint-sm mb-0', text: 'MetaTrader saatleri aracı kurumun sunucu saatidir. Çoğu kurum kışın UTC+2, ABD yaz saatinde (Mart\'ın 2. pazarı – Kasım\'ın 1. pazarı) UTC+3 kullanır: "Otomatik" bunu kendisi uygular. "Sabit" seçiliyken yazdığın fark her zaman uygulanır (0 = rapordaki saat olduğu gibi).' })]));
      }
      if (h.hesapTuru === 'kripto-okx') parcalar.push(okxBolumu(h));
      if (h.hesapTuru === 'kripto-binance') parcalar.push(binanceBolumu(h));
      return el('div', { class: 'idf-hesap-kart', 'data-hesap': h.id }, parcalar);
    };
    const turS = el('select', { id: 'selIdfYeniTur', class: 'form-control control-sm', onchange: (e) => { const p = bul('inpIdfYeniPara'); if (p) p.value = (turler[e.target.value] || {}).para || 'USD'; } },
      Object.entries(turler).map(([a, t]) => el('option', { value: a, text: t.ad })));
    doldur(k, [bolumBaslik('wallet', 'Hesaplar'),
      hesaplar.length ? el('div', { class: 'idf-hesaplar' }, hesaplar.map(kart)) : el('p', { class: 'hint hint-sm', text: 'Henüz hesap yok — önce hesap aç.' }),
      el('details', { id: 'idfYeniHesapKat', class: 'hs-kat-mini mt-3', open: hesaplar.length ? null : 'open' }, [el('summary', { text: '+ hesap aç' }),
        el('div', { class: 'pf-dugmeler mt-2', id: 'idfYeniHesap' }, [
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Ad' }), el('input', { id: 'inpIdfYeniAd', type: 'text', class: 'form-control control-sm', placeholder: 'ör. OKX ana hesap', maxlength: '60' })]),
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Tür' }), turS]),
          el('label', { class: 'pf-alan' }, [el('span', { text: 'Para birimi' }), el('input', { id: 'inpIdfYeniPara', type: 'text', class: 'form-control control-sm', value: 'USDT', maxlength: '6' })]),
          dugme('Hesabı aç', hesapEkle, 'btn-primary btn-sm', { id: 'btnIdfHesapAc', 'data-kilit': 'telefon' })
        ]),
        el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Para birimi: kripto için USDT; MetaTrader için raporun "Currency" değeri (USD, EUR…). Hesap silinmez; kapatılabilir.' })])]);
  }

  function okxBolumu(h) {
    const o = h.okx || {};
    if (o.anahtar) {
      return el('div', { class: 'idf-okx mt-2', id: `idfOkx-${h.id}` }, [
        el('p', { class: 'mb-1' }, [el('span', { class: 'tone-success fw-semibold', text: 'Salt okuma anahtarı kayıtlı ✓' }), el('span', { class: 'pf-kucuk', text: ` · izinler: ${(o.izinler || []).join(', ') || 'OKX bildirmedi (elle doğrulandı)'}` })]),
        el('p', { class: 'hint hint-sm mb-1', text: `${o.sonEsitleme ? `Son eşitleme ${tarihSaat(Date.parse(o.sonEsitleme))}${o.sonOzet ? (o.sonOzet.kuyrukta ? ' — satırlar kuyrukta (sunucu kapalıydı)' : ` — ${o.sonOzet.eklenen} yeni satır`) : ''}` : 'Henüz eşitlenmedi'} · ${o.bilgisayar === 'gelistirme' ? `bu bilgisayarın anahtarı: yalnız elle "Şimdi eşitle" (çekilen satırlar sunucuya gider; otomatik günlük eşitleme yalnız sunucuda${o.evAnahtar ? ' — sunucuda da anahtar kayıtlı, orada her gün kendiliğinden' : ' — sunucuda anahtar yok'})` : 'her gün kendiliğinden (sunucu açıkken)'}. OKX son 3 ayı verir; daha eskisi için dosya yükleyin.` }),
        o.sonHata ? el('p', { class: 'hint hint-sm tone-danger mb-1', text: `Son hata: ${o.sonHata}` }) : null,
        o.tamTarama ? el('p', { class: 'hint hint-sm mb-1', text: 'OKX dosyası geri alındı: sonraki eşitleme son 3 ayı baştan tarar (dosyanın çifti diye atlanan dolumlar geri gelir).' }) : null,
        ...((o.sonOzet && o.sonOzet.uyarilar) || []).map(u => el('p', { class: 'hint hint-sm tone-warning mb-1', text: u })),
        el('div', { class: 'pf-dugmeler' }, [dugme('Şimdi eşitle', (e) => okxEsitle(h, e.currentTarget), 'btn-primary btn-sm', { id: `btnIdfEsitle-${h.id}`, 'data-kilit': 'telefon' }),
          dugme('Anahtarı sil', () => okxSil(h), 'btn-secondary btn-sm', { 'data-kilit': 'telefon' })])
      ]);
    }
    const g = (id, ad, tip, ek = {}) => el('label', { class: 'pf-alan' }, [el('span', { text: ad }), el('input', { id: `${id}-${h.id}`, type: tip, class: 'form-control control-sm', autocomplete: 'off', spellcheck: 'false', ...ek })]);
    return el('div', { class: 'idf-okx mt-2', id: `idfOkx-${h.id}` }, [
      el('p', { class: 'hint hint-sm mb-1', text: o.bilgisayar === 'gelistirme'
        ? `OKX salt okuma anahtarı (isteğe bağlı) — BU bilgisayar için: "Şimdi eşitle" son 3 ayı OKX'ten burada çeker ve sunucuya gönderir (sunucu kapalıysa kuyrukta bekler). Otomatik günlük eşitleme yalnız sunucuda${o.evAnahtar ? ' (sunucuda anahtar kayıtlı)' : ' — sunucuda da anahtar kaydedersen orada her gün kendiliğinden gelir'}. YALNIZ "Read" izinli anahtar kabul edilir. Anahtar bu bilgisayarda saklanır, sunucuya gitmez, ekrana bir daha gelmez.`
        : 'OKX salt okuma anahtarı (isteğe bağlı): her gün son 3 ayın işlemleri ve fonlaması kendiliğinden gelir. YALNIZ "Read" izinli anahtar kabul edilir — Trade, Withdraw ya da başka herhangi bir izni olan anahtar reddedilir. Anahtar bu bilgisayarda saklanır, ekrana bir daha gelmez.' }),
      el('div', { class: 'pf-dugmeler' }, [g('inpIdfOkxKey', 'API Key', 'text'), g('inpIdfOkxSecret', 'Secret Key', 'password'), g('inpIdfOkxPass', 'Passphrase', 'password')]),
      el('label', { class: 'row-inline gap-2 mt-1' }, [el('input', { id: `chkIdfOkxOnay-${h.id}`, type: 'checkbox' }), el('span', { class: 'hint hint-sm mb-0', text: 'Yalnız okuma (Read) izinli olduğunu doğruladım (OKX izinleri bildirmezse gerekir)' })]),
      el('div', { class: 'pf-dugmeler mt-1' }, [dugme('Anahtarı dene ve kaydet', (e) => okxKaydet(h, e.currentTarget), 'btn-primary btn-sm', { id: `btnIdfOkxKaydet-${h.id}`, 'data-kilit': 'telefon' })])
    ]);
  }

  /**
   * 65.0 Binance kartının saf metinleri (öz testte de): vadeli okuma sonucu, spot tam tarama ilerlemesi, son eşitleme satırı.
   * b = /ozet hesap.binance (sır yok).
   */
  function binanceMetinleri(b) {
    const o = b || {};
    const v = o.vadeli;
    const vadeli = !v ? 'vadeli okuma: henüz denenmedi' : v.kabul ? 'vadeli okuma: Binance kabul etti ✓' : `vadeli okuma için Binance bu anahtarı kabul etmedi: ${v.hata || 'bilinmeyen hata'}`;
    const T = o.tarama;
    const tarama = T && T.n ? `spot tam tarama: ${T.i} / ${T.n} çift${o.bilgisayar === 'gelistirme' ? ' — devam etmek için yeniden "Şimdi eşitle"' : ' — sunucu her saat kaldığı yerden sürdürür'}`
      : o.tamBitti ? `spot tam tarama bitti (${String(o.tamBitti).slice(0, 10)}); sonraki eşitlemeler yalnız işlem görülen ve bakiyesi olan çiftleri sorar` : null;
    const oz = o.sonOzet;
    const son = o.sonEsitleme ? `Son eşitleme ${tarihSaat(Date.parse(o.sonEsitleme))}${oz ? (oz.kuyrukta ? ' — satırlar kuyrukta (sunucu kapalıydı)' : ` — ${oz.eklenen} yeni satır${oz.cift ? `, ${oz.cift} çift (zaten kayıtlı)` : ''}`) : ''}` : 'Henüz eşitlenmedi';
    return { vadeli, vadeliTon: !v ? 'pf-kucuk' : v.kabul ? 'tone-success' : 'tone-warning', tarama, son };
  }

  function binanceBolumu(h) {
    const o = h.binance || {};
    const m = binanceMetinleri(o);
    if (o.anahtar) {
      return el('div', { class: 'idf-okx mt-2', id: `idfBinance-${h.id}` }, [
        el('p', { class: 'mb-1' }, [el('span', { class: 'tone-success fw-semibold', text: 'Salt okuma anahtarı kayıtlı ✓' }), el('span', { class: 'pf-kucuk', text: ` · izinler: ${(o.izinler || []).join(', ') || 'okuma'}` })]),
        el('p', { class: `hint hint-sm mb-1 ${m.vadeliTon}`, text: m.vadeli }),
        el('p', { class: 'hint hint-sm mb-1', text: `${m.son} · ${o.bilgisayar === 'gelistirme' ? `bu bilgisayarın anahtarı: yalnız elle "Şimdi eşitle" (çekilen satırlar sunucuya gider; otomatik günlük eşitleme yalnız sunucuda${o.evAnahtar ? ' — sunucuda da anahtar kayıtlı, orada her gün kendiliğinden' : ' — sunucuda anahtar yok'})` : 'her gün kendiliğinden (sunucu açıkken)'}. Binance vadelide son 6 ayın işlemlerini, son 3 ayın fonlama/hareketlerini verir; spotta bütün geçmişi.` }),
        m.tarama ? el('p', { class: 'hint hint-sm mb-1', id: `idfBinanceTarama-${h.id}`, text: m.tarama }) : null,
        o.sonHata ? el('p', { class: 'hint hint-sm tone-danger mb-1', text: `Son hata: ${o.sonHata}` }) : null,
        o.tamTarama ? el('p', { class: 'hint hint-sm mb-1', text: 'Binance dosyası geri alındı: sonraki eşitleme vadeli 6 ayı ve bilinen spot çiftleri baştan tarar (dosyanın çifti diye atlanan satırlar geri gelir).' }) : null,
        ...((o.sonOzet && o.sonOzet.uyarilar) || []).filter(u => !/^Spot tam tarama: \d+ \/ \d+/.test(u)).map(u => el('p', { class: 'hint hint-sm tone-warning mb-1', text: u })),
        el('div', { class: 'pf-dugmeler' }, [dugme(o.tarama ? 'Şimdi eşitle (taramaya devam)' : 'Şimdi eşitle', (e) => binanceEsitle(h, e.currentTarget), 'btn-primary btn-sm', { id: `btnIdfBinanceEsitle-${h.id}`, 'data-kilit': 'telefon' }),
          dugme('Anahtarı sil', () => binanceSil(h), 'btn-secondary btn-sm', { 'data-kilit': 'telefon' })])
      ]);
    }
    const g = (id, ad, tip) => el('label', { class: 'pf-alan' }, [el('span', { text: ad }), el('input', { id: `${id}-${h.id}`, type: tip, class: 'form-control control-sm', autocomplete: 'off', spellcheck: 'false' })]);
    return el('div', { class: 'idf-okx mt-2', id: `idfBinance-${h.id}` }, [
      el('p', { class: 'hint hint-sm mb-1', text: o.bilgisayar === 'gelistirme'
        ? `Binance salt okuma anahtarı (isteğe bağlı) — BU bilgisayar için: "Şimdi eşitle" Binance'ten burada çeker ve sunucuya gönderir (sunucu kapalıysa kuyrukta bekler). Otomatik günlük eşitleme yalnız sunucuda${o.evAnahtar ? ' (sunucuda anahtar kayıtlı)' : ' — sunucuda da anahtar kaydedersen orada her gün kendiliğinden gelir'}. YALNIZ "Okumayı etkinleştir" izni açık anahtar kabul edilir. Anahtar bu bilgisayarda saklanır, sunucuya gitmez, ekrana bir daha gelmez.`
        : 'Binance salt okuma anahtarı (isteğe bağlı): spot işlemlerinin bütün geçmişi, vadeli işlemler ve fonlama her gün kendiliğinden gelir — dosya indirmek gerekmez. YALNIZ "Okumayı etkinleştir" izni açık anahtar kabul edilir — işlem, vadeli, marjin, çekim, aktarım ya da başka herhangi bir izni açık anahtar reddedilir. Anahtar bu bilgisayarda saklanır (botun anahtarından ayrı), ekrana bir daha gelmez.' }),
      el('div', { class: 'pf-dugmeler' }, [g('inpIdfBnKey', 'API Key', 'text'), g('inpIdfBnSecret', 'Secret Key', 'password')]),
      el('div', { class: 'pf-dugmeler mt-1' }, [dugme('Anahtarı dene ve kaydet', (e) => binanceKaydet(h, e.currentTarget), 'btn-primary btn-sm', { id: `btnIdfBnKaydet-${h.id}`, 'data-kilit': 'telefon' })])
    ]);
  }

  function yuklemeCiz() {
    const k = bul('idfYukleme');
    if (!k) return;
    if (!yazmaAcik()) { k.classList.add('is-hidden'); return; }
    k.classList.remove('is-hidden');
    const hesaplar = (veri.hesaplar || []).filter(h => h.aktif);
    const hS = el('select', { id: 'selIdfYukleHesap', class: 'form-control control-sm' }, hesaplar.map(h => el('option', { value: h.id, text: `${h.ad} · ${h.turAd}` })));
    if (secHesap && hesaplar.some(h => h.id === secHesap)) hS.value = secHesap;
    doldur(k, [bolumBaslik('upload', 'Dosya yükle'),
      hesaplar.length ? el('div', { class: 'pf-dugmeler', id: 'idfYukleForm' }, [
        el('label', { class: 'pf-alan' }, [el('span', { text: 'Hesap' }), hS]),
        el('label', { class: 'pf-alan' }, [el('span', { text: 'Dosya (CSV ya da MetaTrader HTML raporu)' }), el('input', { id: 'inpIdfDosya', type: 'file', accept: '.csv,.txt,.htm,.html', class: 'form-control control-sm' })]),
        dugme('Önizle', onizle, 'btn-primary btn-sm', { id: 'btnIdfOnizle', 'data-kilit': 'telefon' })
      ]) : el('p', { class: 'hint hint-sm mb-0', text: 'Önce bir hesap aç.' }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Desteklenenler: OKX "Trading history" CSV · Binance spot ve USDⓈ-M vadeli "Trade History" CSV, vadeli "Transaction History" CSV · MetaTrader 4 "Detailed Statement" ve MetaTrader 5 "History" raporu (HTML). Excel (XLSX) dosyasını önce CSV olarak kaydedin. Dosya bu bilgisayardan dışarı gitmez; aynı satır ikinci kez eklenmez.' }),
      el('div', { id: 'idfOnizleme', class: 'mt-3' })]);
    onizlemeCiz();
  }

  function onizlemeCiz() {
    const k = bul('idfOnizleme');
    if (!k) return;
    if (!onizleme) { doldur(k, []); return; }
    const o = onizleme.sonuc;
    const say = (a, b) => el('li', null, [el('span', { class: 'fw-semibold', text: a + ': ' }), el('span', { text: b })]);
    const turler = Object.entries(o.turler || {}).map(([t, n]) => `${t === 'dolum' ? 'dolum' : t === 'pozisyon' ? 'MT pozisyonu' : (TUR_AD[t] || t).toLowerCase()} ${n}`).join(', ');
    doldur(k, [el('div', { class: 'idf-onizleme', id: 'idfOnizlemeKutu' }, [
      el('h4', { class: 'pf-bolum-baslik', text: `Önizleme — ${o.kaynakAd} (${o.bicim})` }),
      el('ul', { class: 'idf-ozet-liste' }, [
        say('Dosya', `${o.dosyaAdi || '—'} · ${o.kodlama} · özet ${o.sha256}`),
        say('Satır', `${o.satir} okundu · ${o.gecerli} eklenecek · ${o.cift} zaten kayıtlı (çift)${o.bastirilan ? ` · ${o.bastirilan} daha önce geri alınmış/iptal (eklenmeyecek)` : ''} · ${o.atlanan} atlandı · ${o.hata} hatalı`),
        say('Türler', turler || '—'),
        say('Tarih aralığı', o.aralik ? `${tarihSaat(o.aralik.bas)} → ${tarihSaat(o.aralik.bit)}${o.sunucuSaati ? (o.saatKipi === 'abd-yaz' ? ' (sunucu saati: kışın +2, ABD yaz saatinde +3 uygulandı)' : ` (sunucu saat farkı ${o.sunucuSaatFarki} sa uygulandı)`) : ''}` : '—'),
        say('Semboller', (o.semboller || []).map(s => `${s.sembol} (${s.adet})`).join(', ') || '—'),
        o.hesapBilgi && o.hesapBilgi.para ? say('Rapordaki hesap', `${o.hesapBilgi.numara || ''} ${o.hesapBilgi.para}`.trim()) : null
      ]),
      (o.uyarilar || []).length ? el('ul', { class: 'pf-uyari-liste' }, o.uyarilar.map(u => el('li', { class: 'pf-uyari pf-uyari-uyari', text: u }))) : null,
      // Geri alınmış / iptal edilmiş satırlar kendiliğinden geri gelmez; yalnız bu kutu işaretlenirse (yeniden önizlenir)
      o.yenidenAlinabilir ? el('label', { class: 'row-inline gap-2 mt-1', id: 'idfYenidenAlEtiket' }, [
        el('input', { id: 'chkIdfYenidenAl', type: 'checkbox', 'data-kilit': 'telefon', checked: o.yenidenAl ? 'checked' : null, onchange: (e) => onizle({ yenidenAl: !!e.target.checked }) }),
        el('span', { class: 'hint hint-sm mb-0', text: `Daha önce geri aldığım / iptal ettiğim ${o.yenidenAlinabilir} satırı bilerek yeniden ekle` })]) : null,
      (o.hatalar || []).length ? el('ul', { class: 'pf-uyari-liste' }, o.hatalar.slice(0, 10).map(h => el('li', { class: 'pf-uyari pf-uyari-kritik', text: `satır ${h.sira}: ${h.mesaj}` }))) : null,
      (o.ornek || []).length ? AG.tablo.kutulu({ id: 'tblIdfOrnek', sinif: 'table-dense pf-tablo', basliklar: ['Zaman', 'Tür', 'Sembol', 'Ayrıntı', 'K/Z'],
        satirlar: o.ornek.map(x => el('tr', null, [el('td', { class: 'sayi', text: tarihSaat(x.t) }), el('td', { class: 'pf-sola', text: x.tur === 'islem' ? (x.islemTuru === 'pozisyon' ? 'Pozisyon' : x.piyasa) : (TUR_AD[x.tur] || x.tur) }),
          el('td', { class: 'pf-sola', text: x.sembol || '—' }), el('td', { class: 'pf-sola' }, [tutar(satirAyrinti({ ...x, acilisT: null }))]),
          el('td', { class: 'sayi' }, [tutar(sayiMi(x.gerceklesenKar) && x.gerceklesenKar !== 0 ? isaretliPara(x.gerceklesenKar, x.para || 'USD') : sayiMi(x.tutar) ? isaretliPara(x.tutar, x.para || 'USD') : '')])])) }) : null,
      el('div', { class: 'pf-dugmeler mt-2' }, [
        dugme(o.gecerli ? `Kaydet (${o.gecerli} satır)` : 'Eklenecek satır yok', yukleKaydet, 'btn-primary btn-sm', { id: 'btnIdfKaydet', 'data-kilit': 'telefon', disabled: o.gecerli ? null : 'disabled' }),
        dugme('Vazgeç', () => { onizleme = null; onizlemeCiz(); }, 'btn-secondary btn-sm')
      ])
    ])]);
  }

  function gecmisCiz() {
    const k = bul('idfGecmis');
    if (!k) return;
    const l = ((veri && veri.yuklemeler) || []).filter(y => !secHesap || y.hesap === secHesap);
    doldur(k, [bolumBaslik('history', 'Yükleme geçmişi'),
      l.length ? AG.tablo.kutulu({ id: 'tblIdfYukleme', sinif: 'table-dense pf-tablo', basliklar: ['Zaman', 'Hesap', 'Kaynak', 'Dosya', 'Eklenen', 'Çift / atlanan / hatalı', 'Aralık', ''],
        satirlar: l.map(y => el('tr', { class: y.geriAlindi ? 'pm-iptal' : '', 'data-yukleme': y.id }, [
          el('td', { class: 'sayi', text: tarihSaat(Date.parse(y.zaman)) }), el('td', { class: 'pf-sola', text: hesapAdi(y.hesap) }), el('td', { class: 'pf-sola', text: y.kaynakAd }),
          el('td', { class: 'pf-sola pf-kucuk', text: y.dosyaAdi || '(API)' }), el('td', { class: 'sayi', text: String(y.eklenen) }), el('td', { class: 'sayi', text: `${y.cift || 0} / ${y.atlanan || 0} / ${y.hata || 0}` }),
          el('td', { class: 'pf-kucuk', text: y.aralik ? `${tarihK(y.aralik.bas)} → ${tarihK(y.aralik.bit)}` : '—' }),
          el('td', null, [y.geriAlindi ? el('span', { class: 'pf-kucuk tone-muted', text: `geri alındı ${tarihK(Date.parse(y.geriAlmaZamani))}` }) : yazmaAcik() ? dugme('Geri al', () => geriAl(y), 'btn-secondary btn-xs', { 'data-kilit': 'telefon' }) : null])
        ])) }) : el('p', { class: 'hint hint-sm mb-0', text: 'Henüz yükleme yok.' }),
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Geri al: o yüklemenin bütün satırları etkisiz olur (silinmez; ters kayıt). Sonra doğru dosyayı yeniden yükleyebilirsin.' })]);
  }

  /* ── Eylemler ───────────────────────────────────────────────────────── */
  async function hesapEkle(e) {
    const ad = ((bul('inpIdfYeniAd') || {}).value || '').trim();
    const r = await api().hesapEkle({ ad, tur: (bul('selIdfYeniTur') || {}).value, paraBirimi: ((bul('inpIdfYeniPara') || {}).value || '').trim() });
    AG.bildirim.bildir(r && r.success ? basariMetni(r, `"${ad}" hesabı açıldı.`) : `Hesap açılamadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? (r.kuyrukta ? 'uyari' : 'ok') : 'hata');
    if (r && r.success) { if (r.hesap) secHesap = r.hesap; yukle(true); }
    void e;
  }
  async function hesapGuncelle(id, g) {
    const r = await api().hesapGuncelle(id, g);
    AG.bildirim.bildir(r && r.success ? basariMetni(r, 'Hesap güncellendi.') : `Güncellenemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) yukle(true);
  }
  async function okxKaydet(h, d) {
    const deger = (id) => ((bul(`${id}-${h.id}`) || {}).value || '');
    const govde = { hesap: h.id, apiKey: deger('inpIdfOkxKey').trim(), secret: deger('inpIdfOkxSecret').trim(), passphrase: deger('inpIdfOkxPass'), saltOkumaOnay: !!(bul(`chkIdfOkxOnay-${h.id}`) || {}).checked };
    if (d) AG.dom.mesgul(d, 'Deneniyor…');
    try {
      const r = await api().okxAnahtar(govde);
      AG.bildirim.bildir(r && r.success ? `Anahtar kaydedildi ✓ (izinler: ${(r.izinler || []).join(', ') || 'elle doğrulandı'}). Şimdi eşitleyebilirsin.` : (r && r.error) || 'yanıt yok', r && r.success ? 'ok' : 'hata');
      if (r && r.success) yukle(true);
    } finally { if (d) AG.dom.hazir(d); for (const id of ['inpIdfOkxSecret', 'inpIdfOkxPass']) { const x = bul(`${id}-${h.id}`); if (x) x.value = ''; } }
  }
  async function okxSil(h) {
    const ok_ = await AG.onayla({ baslik: 'OKX anahtarı silinsin mi?', metin: 'Kayıtlı işlemler kalır; yalnız otomatik eşitleme durur. OKX\'te de anahtarı silebilirsin.', onay: 'Sil', tehlikeli: true });
    if (!ok_) return;
    const r = await api().okxAnahtarSil(h.id);
    AG.bildirim.bildir(r && r.success ? 'Anahtar silindi.' : `Silinemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) yukle(true);
  }
  async function okxEsitle(h, d) {
    if (d) AG.dom.mesgul(d, 'Eşitleniyor…');
    try {
      const r = await api().okxEsitle(h.id);
      AG.bildirim.bildir(r && r.success ? (r.kuyrukta ? `OKX'ten ${r.cekilen} satır alındı; sunucu kapalı — kuyruğa alındı, sunucu açılınca eklenir.` : `OKX eşitlendi: ${r.eklenen} yeni satır.`) : `Eşitlenemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
      if (r && r.success) yukle(true);
    } finally { if (d) AG.dom.hazir(d); }
  }

  async function binanceKaydet(h, d) {
    const deger = (id) => ((bul(`${id}-${h.id}`) || {}).value || '');
    const govde = { hesap: h.id, apiKey: deger('inpIdfBnKey').trim(), secret: deger('inpIdfBnSecret').trim() };
    if (d) AG.dom.mesgul(d, 'Deneniyor…');
    try {
      const r = await api().binanceAnahtar(govde);
      const ok_ = r && r.success;
      AG.bildirim.bildir(ok_ ? `Anahtar kaydedildi ✓ (izinler: ${(r.izinler || []).join(', ')}). ${r.vadeliOkuma ? 'Vadeli okuma: Binance kabul etti.' : (r.uyari || '')} Şimdi eşitleyebilirsin.` : (r && r.error) || 'yanıt yok', ok_ ? (r.vadeliOkuma ? 'ok' : 'uyari') : 'hata');
      if (ok_) yukle(true);
    } finally { if (d) AG.dom.hazir(d); const x = bul(`inpIdfBnSecret-${h.id}`); if (x) x.value = ''; }
  }
  async function binanceSil(h) {
    const ok_ = await AG.onayla({ baslik: 'Binance anahtarı silinsin mi?', metin: 'Kayıtlı işlemler kalır; yalnız otomatik eşitleme durur. Binance\'te de anahtarı silebilirsin. Botun anahtarına dokunulmaz.', onay: 'Sil', tehlikeli: true });
    if (!ok_) return;
    const r = await api().binanceAnahtarSil(h.id);
    AG.bildirim.bildir(r && r.success ? 'Anahtar silindi.' : `Silinemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) yukle(true);
  }
  async function binanceEsitle(h, d) {
    if (d) AG.dom.mesgul(d, 'Eşitleniyor… (ilk eşitleme birkaç dakika sürebilir)');
    try {
      const r = await api().binanceEsitle(h.id);
      const T = r && r.ozet && r.ozet.tarama;
      const ek = T && !T.bitti ? ` Spot tam tarama: ${T.i} / ${T.n} çift.` : '';
      AG.bildirim.bildir(r && r.success ? (r.kuyrukta ? `Binance'ten ${r.cekilen} satır alındı; sunucu kapalı — kuyruğa alındı, sunucu açılınca eklenir.${ek}` : `Binance eşitlendi: ${r.eklenen} yeni satır.${ek}`) : `Eşitlenemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
      if (r && r.success) yukle(true);
    } finally { if (d) AG.dom.hazir(d); }
  }

  function dosyaOku(dosya) {
    return new Promise((coz, red) => {
      const fr = new global.FileReader();
      fr.onload = () => coz(fr.result);
      fr.onerror = () => red(new Error('dosya okunamadı'));
      fr.readAsArrayBuffer(dosya);
    });
  }
  /** Önizle. ek.yenidenAl verilirse aynı dosya (önceki gövde) o seçimle yeniden önizlenir. */
  async function onizle(ek) {
    const yeniden = ek && typeof ek === 'object' && 'yenidenAl' in ek && onizleme;
    const inp = bul('inpIdfDosya'), hesap = (bul('selIdfYukleHesap') || {}).value;
    const dosya = inp && inp.files && inp.files[0];
    if (!yeniden && !dosya) { AG.bildirim.bildir('Önce dosyayı seç.', 'uyari'); return; }
    if (!yeniden && dosya.size > DOSYA_TAVAN) { AG.bildirim.bildir(`Dosya çok büyük (${(dosya.size / 1048576).toFixed(1)} MB; en çok 7 MB) — dönemi bölüp ayrı ayrı yükle.`, 'hata'); return; }
    const d = bul('btnIdfOnizle');
    if (d) AG.dom.mesgul(d, 'Okunuyor…');
    try {
      const govde = yeniden ? { ...onizleme.govde, yenidenAl: ek.yenidenAl === true } : { hesap, dosyaAdi: dosya.name, icerik: base64(await dosyaOku(dosya)) };
      const r = await api().onizle(govde);
      if (!r || !r.success) { AG.bildirim.bildir(`Dosya okunamadı: ${(r && r.error) || 'yanıt yok'}`, 'hata'); onizleme = null; }
      else onizleme = { govde, sonuc: r };
      onizlemeCiz();
    } catch (e) { AG.bildirim.bildir(e.message, 'hata'); } finally { if (d) AG.dom.hazir(d); }
  }
  async function yukleKaydet() {
    if (!onizleme) return;
    const d = bul('btnIdfKaydet');
    if (d) AG.dom.mesgul(d, 'Kaydediliyor…');
    try {
      const r = await api().yukle(onizleme.govde);
      AG.bildirim.bildir(r && r.success ? basariMetni(r, `${r.eklenen} satır kaydedildi (${r.cift} çift atlandı).`) : `Kaydedilemedi: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
      if (r && r.success) { onizleme = null; const inp = bul('inpIdfDosya'); if (inp) inp.value = ''; yukle(true); }
    } finally { if (d) AG.dom.hazir(d); }
  }
  async function geriAl(y) {
    const ok_ = await AG.onayla({ baslik: 'Bu yükleme geri alınsın mı?', metin: `${y.kaynakAd} · ${y.dosyaAdi || 'API eşitlemesi'} · ${y.eklenen} satır. Satırlar silinmez, ters kayıtla etkisiz olur; bu geri alınamaz (dosyayı yeniden yükleyebilirsin).`, onay: 'Geri al', tehlikeli: true });
    if (!ok_) return;
    const r = await api().geriAl(y.id, 'elle geri alındı');
    AG.bildirim.bildir(r && r.success ? basariMetni(r, `${y.eklenen} satır etkisiz yapıldı.`) : `Geri alınamadı: ${(r && r.error) || 'yanıt yok'}`, r && r.success ? 'ok' : 'hata');
    if (r && r.success) yukle(true);
  }

  /* ── İskelet ve yükleme ─────────────────────────────────────────────── */
  function iskelet(kap) {
    if (!kap) return false;
    doldur(kap, [el('div', { id: 'idfKok', class: `pm-kok${gizliMi() ? ' pm-gizli' : ''}` }, [
      el('div', { id: 'idfUst', class: 'glass-panel panel-pad mb-3' }),
      el('div', { id: 'idfBant', class: 'is-hidden mb-3' }),
      el('div', { id: 'idfSayilar', class: 'glass-panel panel-pad', 'aria-live': 'polite' }),
      el('div', { id: 'idfGrafik', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfAylik', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfSemboller', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfYon', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfListe', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfHesaplar', class: 'glass-panel panel-pad mt-4' }),
      el('div', { id: 'idfYukleme', class: 'glass-panel panel-pad mt-4 pm-yazma is-hidden' }),
      el('div', { id: 'idfGecmis', class: 'glass-panel panel-pad mt-4' })
    ])]);
    return true;
  }

  function ciz() {
    if (!veri) return;
    const kok = bul('idfKok');
    if (kok && kok.classList) kok.classList.toggle('pm-gizli', gizliMi());
    ustCiz(); bantCiz();
    if (veri.performans) { sayilarCiz(); if (veri.performans.toplam.kayit) { grafikCiz(); aylikCiz(); sembollerCiz(); yonCiz(); } else for (const id of ['idfGrafik', 'idfAylik', 'idfSemboller', 'idfYon']) { const k = bul(id); if (k) doldur(k, []); } }
    listeCiz(); hesaplarCiz(); yuklemeCiz(); gecmisCiz();
    for (const id of ['idfGrafik', 'idfAylik', 'idfSemboller', 'idfYon']) { const k = bul(id); if (k) k.classList.toggle('is-hidden', !(veri.performans && veri.performans.toplam.kayit)); }
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function listeYukle() {
    try {
      const r = await api().islemler({ hesap: secHesap, ...suzgec });
      if (!r || !r.success) throw new Error((r && r.error) || 'yanıt yok');
      liste = r;
      listeCiz();
    } catch (e) { const k = bul('idfListe'); if (k) doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'İşlemler okunamadı', yeniden: listeYukle })]); }
  }

  async function yukle(zorla) {
    const kap = bul('pfIslemDefteriKok');
    if (!kap) return;
    if (!bul('idfKok')) iskelet(kap);
    if (yukleniyor) return;
    if (!zorla && veri) { ciz(); return; }
    yukleniyor = true;
    try {
      const r = await api().ozet(secHesap);
      if (!r || !r.success) {
        if (secHesap && r && /bulunamadı/.test(r.error || '')) { secHesap = ''; yukleniyor = false; return yukle(true); }
        throw new Error((r && r.error) || 'sunucu yanıt vermedi');
      }
      veri = r;
      ciz();
      await listeYukle();
    } catch (e) {
      const k = bul('idfSayilar');
      if (k) doldur(k, [AG.bildirim.hataKutusu(e.message, { baslik: 'İşlem defteri okunamadı', yeniden: () => yukle(true) })]);
    } finally { yukleniyor = false; }
  }

  AG.pages = AG.pages || {};
  AG.pages.islemDefteri = {
    yukle, iskelet, para, isaretliPara, oranBicim, karFaktoru, sure, kutuModeli, aylikCubukModeli, base64, satirAyrinti, satirKz, binanceMetinleri,
    _ciz: { ustCiz, bantCiz, sayilarCiz, grafikCiz, aylikCiz, sembollerCiz, yonCiz, listeCiz, hesaplarCiz, yuklemeCiz, onizlemeCiz, gecmisCiz, ciz },
    _durum: { veriAyarla: (v) => { veri = v; }, listeAyarla: (l) => { liste = l; }, onizlemeAyarla: (o) => { onizleme = o; }, veri: () => veri }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.islemDefteri;
})(typeof window !== 'undefined' ? window : globalThis);
