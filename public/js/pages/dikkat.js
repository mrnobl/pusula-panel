/**
 * DİKKAT LİSTESİ — #/tarama/kacin (sürüm 64.1) `AG.pages.dikkat`
 * ═══════════════════════════════════════════════════════════════════════════
 * Günlük arşivin (sunucu, her gece) keşfettiği coinlerde 16 kapılı "KAÇIN" kuralı (kural-v1, deneme 780) ve
 * KENDİNİ DENETLEME: listeye yeni giren her coin + aynı gün, aynı likidite diliminden 3 rastgele kontrol coini 90 gün izlenir;
 * "listeye aldığımız coin gerçekten sorun yaşadı mı?" sorusu kontrol grubuna göre yanıtlanır (karne). Sunucu: lib/tarama/dikkatPanel.js.
 *
 * LİSTE BİR ALIM/SATIM SİNYALİ DEĞİLDİR ve hiçbir bota bağlı değildir. Karne ara görünümdür: hüküm yalnız ön kayıttaki günde.
 * Kural değişikliği = yeni sürüm (kural-v2) + yeni deneme numarası; v1 paralel sürer (PLAN-DIKKAT-V1-ONKAYIT §9).
 * Sunucu verisi her zaman textContent (AG.dom.el) ile yazılır.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const bul = (id) => (doc ? doc.getElementById(id) : null);
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const ikonla = () => { if (global.lucide && global.lucide.createIcons) global.lucide.createIcons(); };

  // karne: null → ilk çizimde t0 yoksa 'isinma' (68.6: asıl görünüm t0'dan önce hep 0 gösteriyordu)
  const DURUM = { kip: null, tur: 'kacin', gun: null, karne: null, secili: null, ara: '', tumu: false };
  let sonDurum = null, sonListe = null;
  /** 68.6: kapı adı / açıklama / tehlike kademesi — YEREL uçtan (durum sunucudan gelse de rozetler bu bilgisayarın sürümüyle). */
  let KURAL = null;

  /* ── Biçim ──────────────────────────────────────────────────────────── */
  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const tr = (x, d = 0) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const yuzde = (x, d = 0) => (sayiMi(x) ? `%${tr(x * 100, d)}` : '—');
  function kisaUsd(x) {
    if (!sayiMi(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e9) return `$${tr(x / 1e9, 2)} mr`;
    if (a >= 1e6) return `$${tr(x / 1e6, 2)} M`;
    if (a >= 1e3) return `$${tr(x / 1e3, 1)} bin`;
    return `$${tr(x, 0)}`;
  }
  function fiyatMetni(x) {
    if (!sayiMi(x)) return '—';
    const a = Math.abs(x);
    return `$${x.toLocaleString('tr-TR', { maximumFractionDigits: a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8 })}`;
  }
  const KANAT = { cex: 'Borsa (Binance)', dex: 'DEX' };
  const SONUC = { coktu: 'çöktü', temiz: 'sorun yok' };
  const COKUS = { a: 'fiyat %80+ düştü', b: 'delist / likidite bitti', c: 'veri kayboldu (14 g)' };

  /** Kapı → { kod, ad, aciklama, kademe (1 en tehlikeli … 5) }; bilinmeyen kod kademe 5. */
  function kapiBilgi(kod, k) {
    const x = k || KURAL || {};
    return { kod, ad: (x.ad && x.ad[kod]) || kod, aciklama: (x.aciklama && x.aciklama[kod]) || '', kademe: (x.tehlike && x.tehlike[kod]) || 5 };
  }
  /** Kapı kodları en tehlikeliden en hafife (aynı kademede kod numarası). */
  function kapiSirala(kodlar, k) {
    const no = (c) => Number(String(c).replace(/\D/g, '')) || 0;
    return (kodlar || []).slice().sort((a, b) => (kapiBilgi(a, k).kademe - kapiBilgi(b, k).kademe) || (no(a) - no(b)));
  }
  function kapiRozet(kod) {
    const b = kapiBilgi(kod);
    return el('span', { class: `badge badge-isi-${b.kademe}`, title: `${b.kod} — ${b.ad}${b.aciklama ? `: ${b.aciklama}` : ''}`, text: b.kod });
  }

  /** Son kayıt günü kaç gün önce (UTC günleri); gün yoksa null. */
  function gunOnce(gun, simdi = Date.now()) {
    const t = Date.parse(`${gun}T00:00:00Z`);
    return Number.isFinite(t) ? Math.floor((simdi - t) / 86400000) : null;
  }

  /* ── Saf görünüm modelleri (öz test bunları sınar) ──────────────────── */

  /** Üst sayılar. */
  function sayilarModel(d) {
    const o = (d && d.ozet) || null;
    if (!o) return [{ etiket: 'Dikkat listesi', deger: '—', alt: 'henüz hesaplanmış gün yok' }];
    const acik = d.karne ? (d.karne.asil.olay.acik + d.karne.isinma.olay.acik) : 0;
    return [
      { etiket: `KAÇIN (${o.gun})`, deger: `${tr(o.kacin)} / ${tr(o.token)}`, alt: 'listedeki / incelenen coin', ton: o.kacin ? 'tone-danger' : null },
      { etiket: 'Bugün yeni giren', deger: tr((o.yeniGiren || []).length), alt: o.oncekiGun ? `${o.oncekiGun} gününe göre` : 'ilk gün — kıyas yok' },
      { etiket: 'Yetersiz veri', deger: tr(o.yetersiz), alt: 'güvenlik kaynağı cevap vermedi', ton: o.yetersiz > o.token * 0.3 ? 'tone-warning' : null },
      { etiket: 'Takipteki olay', deger: tr(acik), alt: '90 gün izlenen (kontrolleriyle)' },
    ];
  }

  /** Karne satırları: olay ve kontrol grubu. */
  function karneModel(k) {
    if (!k) return null;
    const satir = (ad, x) => ({ ad, n: x.n, kapanan: x.kapanan, acik: x.acik, coktu: x.coktu, oran: x.oran, erken30: x.erken30 });
    return {
      gruplar: [satir('Dikkat listesine giren', k.olay), satir('Kontrol (rastgele, aynı dilim)', k.kontrol)],
      fark: k.fark, yanlisAlarm: k.yanlisAlarm,
      kapilar: Object.entries(k.kapi || {}).map(([kod, x]) => ({ kod, ad: x.ad, n: x.n, kapanan: x.kapanan, coktu: x.coktu, isabet: x.oran, yanlisAlarm: x.yanlisAlarm, yalniz: x.yalniz, aday: degisiklikAdayi(x, k.kontrol) })),
      cokusNedeni: k.cokusNedeni,
    };
  }

  /**
   * Gözden geçirme işareti (BİLGİ): kapanmış ≥ 20 olayı olan ve çöküş oranı kontrol grubunun oranını AŞMAYAN kapı ayırt
   * etmiyor demektir → kural-v2'de eşiği değişmeye ya da çıkarılmaya ADAY. Karar kullanıcının; değişiklik yeni sürümle yapılır.
   */
  function degisiklikAdayi(x, kontrol) {
    if (!x || x.kapanan < 20 || !kontrol || kontrol.oran == null || x.oran == null) return null;
    return x.oran <= kontrol.oran ? 'ayırt etmiyor' : null;
  }

  /** Liste satırı. */
  function satirModel(r) {
    return {
      anahtar: r.anahtar, sembol: r.sembol || r.anahtar, kanat: KANAT[r.kanat] || r.kanat, ag: r.ag || '—',
      kapilar: kapiSirala((r.dogru || []).map(x => x.kod)), metinler: (r.dogru || []).map(x => `${x.kod}: ${x.metin || ''}`),
      bilgi: (r.bilgi || []).map(b => b.kod), yeni: !!r.yeni, yetersiz: !!r.yetersiz,
      fiyat: fiyatMetni(r.fiyat), likidite: kisaUsd(r.likidite),
      pencere: r.pencere ? `${r.pencere.tur === 'olay' ? 'olay' : 'kontrol'} #${r.pencere.olayNo} (${r.pencere.bas})` : '—',
    };
  }

  /* ── Çizim ──────────────────────────────────────────────────────────── */
  function sayilarCiz(d) {
    const k = bul('dikkatSayilar');
    if (!k) return;
    doldur(k, sayilarModel(d).map(s => el('div', { class: 'ana-sayi' }, [
      el('span', { class: 'stat-title', text: s.etiket }),
      el('span', { class: `stat-value stat-value-sm sayi ${s.ton || ''}`.trim(), text: s.deger }),
      s.alt ? el('span', { class: 'hint hint-sm mb-0', text: s.alt }) : null,
    ])));
  }

  function seritCiz(d) {
    const k = bul('dikkatSerit');
    if (!k) return;
    const l = [];
    if (d.hata) l.push(el('p', { class: 'hint tone-danger mb-2', text: `Son günün dikkat hesabı başarısız oldu (${d.hata.gun}): ${d.hata.hata}. Arşiv kaydı etkilenmedi.` }));
    if (d.isinma) l.push(el('p', { class: 'hint mb-2', text: `Isınma dönemi: evren eşikleri ilk 30 resmî kayıt gününden sonra bir kez sabitlenecek. O güne kadar liste ve takip ÖN İZLEMEDİR, ön kayıtlı değerlendirmeye (H-DL1) girmez.${d.t0 ? '' : ' Değerlendirme başlangıcı (t0) henüz belli değil.'}` }));
    const sunucu = !!d.evKaynak;
    if (sunucu && d.evKaynak.eski) l.push(el('p', { class: 'hint tone-warning mb-2', text: `Sunucuya şu an ulaşılamıyor; son okunan sunucu verisi gösteriliyor (${d.evKaynak.zaman || '?'}).` }));
    if (d.kip === 'deneme') l.push(el('p', { class: 'hint tone-warning mb-2', text: sunucu
      ? 'Sunucuda henüz resmî kayıt yok; sunucunun deneme kaydı gösteriliyor. Resmî kayıt sunucunun gece görevinde (her gece 03:30) üretilir.'
      : `Deneme kaydı gösteriliyor (bu bilgisayar, son kayıt ${d.sonGun || '—'}). Gece görevi bu bilgisayarda kurulu değil, liste burada kendiliğinden yenilenmez; sunucu bağlantısı kurulunca resmî kayıt sunucudan gelir.` }));
    const once = d.sonGun ? gunOnce(d.sonGun) : null;
    if (d.kip === 'resmi' && once != null && once > 1) l.push(el('p', { class: 'hint tone-warning mb-2', text: `Son resmî kayıt günü ${d.sonGun} (${once} gün önce). Gece görevi her gün yeni kayıt yazmalı; sunucuda "PusulaDikkatArsiv" görevini denetleyin (Sistem › Kurulum denetimi).` }));
    doldur(k, l);
    k.classList.toggle('is-hidden', !l.length);
  }

  function filtreCiz(l) {
    const k = bul('dikkatFiltre');
    if (!k) return;
    const s = (l && l.sayim) || {};
    const dugme = (tur, metin) => el('button', { type: 'button', class: `btn btn-sm ${DURUM.tur === tur ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': DURUM.tur === tur ? 'true' : 'false',
      onclick: () => { DURUM.tur = tur; DURUM.tumu = false; listeYukle(); } }, [el('span', { text: metin })]);
    const gunSec = el('select', { id: 'selDikkatGun', class: 'form-control', 'aria-label': 'Gün' }, ((l && l.gunler) || []).slice().reverse().map(g => el('option', { value: g, text: g })));
    if (l && l.gun) gunSec.value = l.gun;
    gunSec.addEventListener('change', () => { DURUM.gun = gunSec.value; DURUM.tumu = false; listeYukle(); });
    const araGir = el('input', { type: 'search', id: 'inpDikkatAra', class: 'form-control', placeholder: 'Coin ara (ör. PEPE)', 'aria-label': 'Coin ara', value: DURUM.ara || '', autocomplete: 'off' });
    araGir.addEventListener('input', () => { DURUM.ara = araGir.value; if (sonListe) listeCiz(sonListe, sonDurum); });
    doldur(k, [
      el('div', { class: 'row row-wrap gap-2' }, [dugme('kacin', `KAÇIN ${s.kacin != null ? s.kacin : ''}`), dugme('yeni', `Yeni giren ${s.yeni != null ? s.yeni : ''}`), dugme('yetersiz', `Yetersiz veri ${s.yetersiz != null ? s.yetersiz : ''}`)]),
      araGir,
      gunSec,
    ]);
  }

  function listeCiz(l, d) {
    const k = bul('dikkatTablo');
    if (!k) return;
    if (!l || !l.gun) { doldur(k, [el('p', { class: 'hint mb-0', text: 'Henüz dikkat listesi hesaplanmış bir gün yok. Gece arşiv koşusundan sonra burada görünür.' })]); return; }
    // Sıra: bugün yeni girenler önce, sonra sembol. İlk SINIR satır; arama tüm satırlarda; "Tümünü göster" hepsini açar.
    const ara = String(DURUM.ara || '').trim().toLocaleUpperCase('tr-TR');
    const modeller = listeModel(l.satirlar, ara);
    const gorunen = DURUM.tumu || ara ? modeller : modeller.slice(0, SINIR);
    const satirlar = gorunen.map(m => el('tr', null, [
      el('td', null, [el('span', { class: 'row row-wrap gap-1' }, [el('strong', { text: m.sembol }), m.yeni ? el('span', { class: 'badge badge-danger', text: 'yeni' }) : null])]),
      el('td', { text: `${m.kanat} · ${m.ag}` }),
      el('td', { title: m.metinler.join('\n') }, m.kapilar.length ? [el('span', { class: 'row row-wrap gap-1' }, m.kapilar.map(kapiRozet))] : [el('span', { class: 'tone-muted', text: m.yetersiz ? 'güvenlik verisi yok' : '—' })]),
      el('td', { class: 'sayi', text: m.fiyat }), el('td', { class: 'sayi', text: m.likidite }),
      el('td', { text: m.pencere }),
      el('td', null, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => coinAc(m.anahtar) }, [el('span', { text: 'Ayrıntı' })])]),
    ]));
    doldur(k, [
      satirlar.length ? AG.tablo.kutulu({ id: 'tblDikkat', sinif: 'table-dense', siralanabilir: 'dikkat', basliklar: ['Coin', 'Kanat · ağ', 'Doğru çıkan kapılar', 'Fiyat', 'DEX likiditesi', 'Takip', ''], satirlar })
        : el('p', { class: 'hint mb-0', text: ara ? `"${DURUM.ara}" bu listede yok.` : DURUM.tur === 'kacin' ? 'Bu gün dikkat listesinde coin yok.' : 'Bu filtrede coin yok.' }),
      gorunen.length < modeller.length ? el('div', { class: 'row-end mt-3' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnDikkatTumu', onclick: () => { DURUM.tumu = true; listeCiz(l, d); ikonla(); } }, [el('span', { text: `Tümünü göster (${modeller.length})` })])]) : null,
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: `${l.gun} · ${l.sayim.hepsi} coin incelendi. Kapı kodunun üstüne gelince kuralı, satırın üstüne gelince o günkü gerekçesi görünür. Renk: kırmızı en tehlikeli, sarı en hafif.` }),
      sozlukCiz(),
    ]);
  }

  /** 68.6: K kodları sözlüğü — tehlike sırasıyla, ısı rengiyle; açılır/kapanır. */
  function sozlukCiz() {
    if (!KURAL || !KURAL.ad) return null;
    const kodlar = kapiSirala(Object.keys(KURAL.ad));
    const bilgi = new Set(KURAL.bilgi || []);
    return el('details', { class: 'mt-3', id: 'dikkatSozluk' }, [
      el('summary', { text: 'K kodları ne anlama geliyor? (16 kural, en tehlikeliden en hafife)' }),
      el('div', { class: 'kapi-olcek mt-3 mb-3' }, [el('span', { class: 'hint hint-sm mb-0', text: 'Tehlike:' }),
        ...[1, 2, 3, 4, 5].map(n => el('span', { class: `badge badge-isi-${n}`, text: n === 1 ? '1 en yüksek' : n === 5 ? '5 en düşük' : String(n) }))]),
      el('dl', { class: 'kapi-sozluk' }, kodlar.flatMap(kd => { const b = kapiBilgi(kd); return [
        el('dt', null, [kapiRozet(kd)]),
        el('dd', null, [el('strong', { text: b.ad }), el('span', { text: ` — ${b.aciklama}${bilgi.has(kd) && !/Bilgi rozeti/.test(b.aciklama) ? ' Bilgi rozeti: listeye sokmaz.' : ''}` })]),
      ]; })),
      el('p', { class: 'hint hint-sm mt-3 mb-0' }, [el('a', { href: '#/kilavuz/dikkat-listesi/kurallar', text: 'Kuralların kaynakları ve eşikleri kılavuzda →' })]),
    ]);
  }

  const SINIR = 25;
  /** Liste satırları → görünüm modeli: arama (sembol ya da anahtar, büyük/küçük harf duyarsız), yeni girenler önce, sonra sembol. */
  function listeModel(satirlar, ara) {
    const a = String(ara || '').toLocaleUpperCase('tr-TR');
    return (satirlar || []).map(satirModel)
      .filter(m => !a || String(m.sembol).toLocaleUpperCase('tr-TR').includes(a) || String(m.anahtar).toLocaleUpperCase('tr-TR').includes(a))
      .sort((x, y) => (y.yeni - x.yeni) || String(x.sembol).localeCompare(String(y.sembol), 'tr'));
  }

  function karneCiz(d) {
    const k = bul('dikkatKarne');
    if (!k) return;
    if (!DURUM.karne) DURUM.karne = d.t0 ? 'asil' : 'isinma';
    const sec = DURUM.karne === 'isinma' ? d.karne.isinma : d.karne.asil;
    const m = karneModel(sec);
    const dugme = (a, metin) => el('button', { type: 'button', class: `btn btn-sm ${DURUM.karne === a ? 'btn-primary' : 'btn-secondary'}`, 'aria-pressed': DURUM.karne === a ? 'true' : 'false',
      onclick: () => { DURUM.karne = a; karneCiz(sonDurum); ikonla(); } }, [el('span', { text: metin })]);
    const grupSatir = m.gruplar.map(g => el('tr', null, [
      el('td', { text: g.ad }), el('td', { class: 'sayi', text: tr(g.n) }), el('td', { class: 'sayi', text: tr(g.kapanan) }), el('td', { class: 'sayi', text: tr(g.coktu) }),
      el('td', { class: 'sayi', text: yuzde(g.oran, 1) }), el('td', { class: 'sayi', text: tr(g.erken30) }),
    ]));
    const kapiSatir = m.kapilar.filter(x => x.n > 0).sort((a, b) => (kapiBilgi(a.kod).kademe - kapiBilgi(b.kod).kademe) || (b.n - a.n)).map(x => el('tr', null, [
      el('td', null, [el('span', { class: 'row row-wrap gap-1' }, [kapiRozet(x.kod), el('span', { text: KURAL ? kapiBilgi(x.kod).ad : x.ad })])]), el('td', { class: 'sayi', text: tr(x.n) }), el('td', { class: 'sayi', text: tr(x.kapanan) }), el('td', { class: 'sayi', text: tr(x.coktu) }),
      el('td', { class: 'sayi', text: yuzde(x.isabet, 1) }), el('td', { class: 'sayi', text: yuzde(x.yanlisAlarm, 1) }), el('td', { class: 'sayi', text: `${tr(x.yalniz.n)} / ${tr(x.yalniz.coktu)}` }),
      el('td', { class: x.aday ? 'tone-warning' : 'tone-muted', text: x.aday || '—' }),
    ]));
    doldur(k, [
      el('div', { class: 'row row-wrap gap-2 mb-3' }, [dugme('asil', 'Değerlendirme (t0 sonrası)'), dugme('isinma', 'Ön izleme (ısınma)')]),
      karneDurum(d),
      el('p', { class: 'hint mb-3 max-w-prose', text: 'Listeye giren her coin ve aynı gün, aynı likidite diliminden rastgele seçilen 3 kontrol coini 90 gün izlenir. Çöküş: fiyat %80+ düştü, delist / likidite bitti ya da veri 14 gün kayboldu. Dikkat listesi işe yarıyorsa listedekilerin çöküş oranı kontrolden belirgin yüksek olmalı.' }),
      AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Grup', 'Coin', '90 günü dolan', 'Çöken', 'Çöküş oranı', 'İlk 30 günde çöken'], satirlar: grupSatir }),
      el('dl', { class: 'kv-list kv-sik mt-3 mb-4' }, [
        el('dt', { text: 'Fark (liste − kontrol)' }), el('dd', { class: 'sayi', text: m.fark == null ? 'henüz 90 günü dolan yok' : `${m.fark >= 0 ? '+' : ''}${tr(m.fark * 100, 1)} puan` }),
        el('dt', { text: 'Yanlış alarm (sorun yaşamayan liste coini)' }), el('dd', { class: 'sayi', text: yuzde(m.yanlisAlarm, 1) }),
        el('dt', { text: 'Çöküş nedeni (liste)' }), el('dd', { text: Object.entries(m.cokusNedeni).map(([kd, n]) => `${COKUS[kd] || kd} ${n}`).join(' · ') || '—' }),
      ]),
      el('h4', { class: 'card-title-sm mb-2', text: 'Kapı karnesi — hangi kural işe yarıyor?' }),
      kapiSatir.length ? AG.tablo.kutulu({ id: 'tblDikkatKapi', sinif: 'table-dense', basliklar: ['Kapı', 'Coin', '90 günü dolan', 'Çöken', 'İsabet', 'Yanlış alarm', 'Yalnız bu kapı (coin / çöken)', 'Gözden geçirme'], satirlar: kapiSatir })
        : el('p', { class: 'hint mb-0', text: 'Bu görünümde henüz olay yok.' }),
      el('p', { class: 'hint hint-sm mt-3 mb-0', text: '"Ayırt etmiyor": 90 günü dolan en az 20 coinde bu kapının çöküş oranı kontrolden yüksek değil. Bu tablo ara görünümdür, hüküm değildir; mevcut kural (kural-v1) buna bakılarak DEĞİŞTİRİLMEZ. Yeni bir sürüm (kural-v2) önerilebilir: v2 önerildiği günden SONRAKİ olaylarla, kendi numarasıyla ayrıca sınanır, v1 yanında çalışmaya devam eder, eski kayıt silinmez.' }),
    ]);
  }

  /** 68.6: karnenin şu an neyi gösterdiği — sıfırların nedeni ve ilk sonucun tarihi. */
  function karneDurum(d) {
    const i = d.karne.isinma, acik = i.olay.acik + i.kontrol.acik;
    const ilk = d.ilkKapanis ? ` İlk 90 günü dolacak pencere: ${d.ilkKapanis}; "Çöken" ve "Çöküş oranı" o günden sonra dolmaya başlar.` : '';
    if (DURUM.karne === 'asil' && !d.t0) return el('p', { class: 'hint tone-warning mb-3 max-w-prose', text: `Değerlendirme henüz başlamadı: t0, ilk 30 resmî kayıt gününden sonra belirlenir. Bu görünümde o güne kadar her şey 0 görünür; şu an izlenenleri "Ön izleme (ısınma)" gösterir (${tr(acik)} açık pencere).` });
    if (DURUM.karne === 'isinma') return el('p', { class: 'hint mb-3 max-w-prose', text: acik ? `Isınma: ${tr(i.olay.n)} liste coini + ${tr(i.kontrol.n)} kontrol coini izleniyor, henüz hiçbirinin 90 günü dolmadı.${ilk}` : 'Isınma: henüz izlenen coin yok.' });
    return null;
  }

  function hukumCiz(d) {
    const k = bul('dikkatHukum');
    if (!k) return;
    const h = d.hdl1 || {};
    const b = d.bilinmiyor || {};
    const kv = (a, v) => [el('dt', { text: a }), el('dd', { class: 'sayi', text: v == null ? '—' : String(v) })];
    doldur(k, [
      el('dl', { class: 'kv-list kv-sik mb-3' }, [
        ...kv('Kural', `${d.kural.surum} · deneme ${d.kural.deneme} · SHA ${String(d.kural.sha).slice(0, 12)}…`),
        ...kv('Değerlendirme başlangıcı (t0)', h.t0 || 'eşikler sabitlenince'),
        ...kv('Ara rapor (hüküm yok)', h.araRapor || '—'),
        ...kv('Hüküm günü', h.hukumGunu || 't0 + 286 gün'),
        ...kv('Kapsamdaki olay / kontrol', h.olay != null ? `${h.olay} / ${h.kontrol}` : '—'),
        ...kv('Durum', h.durum === 'bekliyor' ? `bekliyor — ${h.neden}` : h.durum === 'SONUCSUZ' ? `SONUÇSUZ — ${h.neden}` : h.durum ? `${h.durum} (istatistik ${tr(h.istatistik * 100, 1)} puan; %90 aralık ${tr(h.aralik90[0] * 100, 1)} … ${tr(h.aralik90[1] * 100, 1)})` : '—'),
        ...kv('Bilinmiyor oranı (son ay)', b.aylar && b.aylar.length ? `${yuzde(b.aylar[b.aylar.length - 1].oran, 1)} (${b.aylar[b.aylar.length - 1].ay})${b.sonucsuzRiski ? ' — 2 ay üst üste ≥ %30: SONUÇSUZ kuralı' : ''}` : '—'),
      ]),
      el('p', { class: 'hint hint-sm mb-0', text: 'KABUL: listedekilerin çöküş oranı kontrolden yüksek ve %90 aralık sıfırın üstünde. Aksi RED. Olay < 30 ya da çöküş < 5 ise SONUÇSUZ. Bu kural ölçümden önce yazıldı ve değişmez.' }),
    ]);
  }

  async function coinAc(anahtar) {
    DURUM.secili = anahtar;
    const k = bul('dikkatAyrinti');
    if (!k) return;
    k.classList.remove('is-hidden');
    doldur(k, [el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]);
    let v; try { v = await AG.api.dikkat.coin(anahtar, DURUM.kip); } catch (e) { v = { success: false, error: e.message }; }
    if (!v || !v.success) { doldur(k, [AG.bildirim.hataKutusu((v && v.error) || 'sunucu yanıt vermedi', { baslik: 'Coin geçmişi okunamadı' })]); return; }
    const ad = v.ad || {};
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-3' }, [
        el('h3', { class: 'card-title m-0', text: `${v.sembol || anahtar}${v.kanat ? ` · ${KANAT[v.kanat] || v.kanat}` : ''}${v.ag ? ` · ${v.ag}` : ''}` }),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { DURUM.secili = null; k.classList.add('is-hidden'); doldur(k, []); } }, [el('span', { text: 'Kapat' })]),
      ]),
      el('p', { class: 'hint hint-sm mb-3', text: `Anahtar: ${anahtar}` }),
      v.gecmis.length ? el('ul', { class: 'tarama-bayrak-liste mb-4' }, kapiSirala(v.gecmis[v.gecmis.length - 1].dogru || []).map(kd => el('li', null, [kapiRozet(kd), el('strong', { text: ` ${KURAL ? kapiBilgi(kd).ad : (ad[kd] || kd)}` }), el('span', { text: ` — ${((v.gecmis[v.gecmis.length - 1].kapilar || {})[kd] || {}).metin || ''}` })]))) : null,
      el('h4', { class: 'card-title-sm mb-2', text: 'Son kayıt günleri' }),
      AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Gün', 'KAÇIN', 'Kapılar', 'Fiyat', 'Likidite', 'Holder'], satirlar: v.gecmis.slice().reverse().map(g => el('tr', null, [
        el('td', { text: g.gun }), el('td', { class: g.kacin ? 'tone-danger' : null, text: g.kacin ? 'evet' : g.yetersiz ? 'yetersiz veri' : 'hayır' }),
        el('td', { text: (g.dogru || []).join(', ') || '—' }), el('td', { class: 'sayi', text: fiyatMetni(g.fiyat) }), el('td', { class: 'sayi', text: kisaUsd(g.likidite) }), el('td', { class: 'sayi', text: sayiMi(g.holder) ? tr(g.holder) : '—' }),
      ])) }),
      el('h4', { class: 'card-title-sm mt-4 mb-2', text: 'Takip pencereleri' }),
      v.pencereler.length ? AG.tablo.kutulu({ sinif: 'table-dense', basliklar: ['Olay', 'Rol', 'Başlangıç', 'Başlangıç fiyatı', 'En düşük', 'Sonuç'], satirlar: v.pencereler.map(p => el('tr', null, [
        el('td', { text: `#${p.olayNo}${p.isinma ? ' (ön izleme)' : ''}` }), el('td', { text: p.tur === 'olay' ? 'listeye girdi' : 'kontrol' }), el('td', { text: p.bas }),
        el('td', { class: 'sayi', text: fiyatMetni(p.fiyat0) }), el('td', { class: 'sayi', text: p.enDusuk == null ? '—' : yuzde(p.enDusuk, 0) }),
        el('td', { class: p.sonuc === 'coktu' ? 'tone-danger' : null, text: p.sonuc ? `${SONUC[p.sonuc]}${p.cokusMetin ? ` — ${p.cokusMetin}` : ''} (${p.kapandi})` : 'izleniyor' }),
      ])) }) : el('p', { class: 'hint mb-0', text: 'Bu coin için takip penceresi yok.' }),
    ]);
    ikonla();
  }

  async function listeYukle() {
    let l; try { l = await AG.api.dikkat.liste({ kip: DURUM.kip, gun: DURUM.gun, tur: DURUM.tur }); } catch (e) { l = { success: false, error: e.message }; }
    const k = bul('dikkatTablo');
    if (!l || !l.success) { if (k) doldur(k, [AG.bildirim.hataKutusu((l && l.error) || 'sunucu yanıt vermedi', { baslik: 'Dikkat listesi okunamadı', yeniden: listeYukle })]); return; }
    sonListe = l;
    filtreCiz(l); listeCiz(l, sonDurum); ikonla();
  }

  async function yukle() {
    if (!KURAL) { try { const r = await AG.api.dikkat.kurallar(); if (r && r.success) KURAL = r; } catch (e) { /* rozetler kodla, açıklamasız */ } }
    let d; try { d = await AG.api.dikkat.durum(DURUM.kip); } catch (e) { d = { success: false, error: e.message }; }
    if (!d || !d.success) { const k = bul('dikkatTablo'); if (k) doldur(k, [AG.bildirim.hataKutusu((d && d.error) || 'sunucu yanıt vermedi', { baslik: 'Dikkat listesi okunamadı', yeniden: yukle })]); return; }
    sonDurum = d;
    DURUM.kip = d.kip;
    const kipSec = bul('selDikkatKip');
    if (kipSec) kipSec.value = d.kip;
    sayilarCiz(d); seritCiz(d); karneCiz(d); hukumCiz(d);
    await listeYukle();
  }

  function baslat() {
    if (!doc || !doc.addEventListener) return;
    const kipSec = bul('selDikkatKip');
    if (kipSec) kipSec.addEventListener('change', () => { DURUM.kip = kipSec.value; DURUM.gun = null; yukle(); });
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-dikkat') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.dikkat = { yukle, coinAc, sayilarModel, karneModel, satirModel, listeModel, degisiklikAdayi, kisaUsd, fiyatMetni, kapiBilgi, kapiSirala, gunOnce };
  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', baslat);
  else baslat();
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.dikkat;
})(typeof window !== 'undefined' ? window : globalThis);
