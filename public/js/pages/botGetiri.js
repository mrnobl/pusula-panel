/**
 * BOT GETİRİSİ — Botlar › <bot> › Genel "günlük defter" + Botlar › Özet (71.0, kullanıcıyla taslak 1, C düzeni) `AG.pages.botGetiri`
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı 2026-10-22: "çalışan botların performansını göremiyorum, işlemlerin getiri grafiği yok". Grafik vardı ama kayıt
 * 20 günden kısayken backtest açılıyordu. Cevaplar: C düzeni · % ↔ $ düğmesi · kıyas yalnız BTC al-tut · düşüş şeridi YOK ·
 * işlemler grafikte nokta (dokununca ayrıntı) · her zaman gerçek sonuç önce · Özet: kartlar + karşılaştırma tablosu (portföy
 * botları dahil) · "kim kazandırdı" bölümü.
 *
 * Bot sayfası (js/pages/botlar.js iskelet çağırır, kaplar orada):
 *   #botDefterOzet-<ad>   başlangıçtan getiri · BTC al-tut · fark · 8 kutu · kim kazandırdı (katkiSatirlari)
 *   #botTakvim-<ad>       ay takvimi (günlük sonuç, renk koyuluğu = hareket büyüklüğü) · ‹ › · güne dokun → o günün işlemleri
 *   grafik                botlar.js grafikCiz (Chart.js) — seriler buradaki `grafikSerileri`nden
 * Veri: GET /api/bindirme/:ad/grafik?mumsuz=1 → ozsermaye { egri [{gun, zaman, gercek, btc, botDeger}], kol, taban } + islemler
 * [{z, s, y, m, f, u, kz, kol, n}] (lib/live/islemGecmisi.js grafikIslemleri). GÜN = ölçüm günü: botun günlük çalışması ~03:00'te
 * hesap değerini yazar; o satırın YEREL tarihi (zaman yoksa karar günü + 1). Günlük sonuç = bir önceki ölçüme göre değişim.
 *
 * Kim kazandırdı (yaklaşık, kayıttan): BTC ayağı = Σ önceki gün BTC tutarı × BTC'nin o günkü değişimi; coin sepeti = toplam
 * değişim − BTC ayağı (Donchian + DCA + ücret + fonlama birlikte). Donchian / DCA ayrımı yalnız GERÇEKLEŞEN K/Z'den (Binance
 * "Realized Profit"; açık pozisyon dahil değil). Botun kararını etkilemez; YALNIZ OKUR. Kurallar: AG.dom, AG.tablo, inline stil yok.
 * Takvim düğmeleri .bot-serbest: araştırma / telefon kilidi (js/pages/kabuk.js KILITLI) yalnız eylem düğmelerini kapatır.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
  const iki = (n) => String(n).padStart(2, '0');
  const yerelGun = (t) => { const d = new Date(t); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };
  const gunEkle = (g, n) => { const d = new Date(Date.parse(`${g}T12:00:00Z`) + n * 864e5); return d.toISOString().slice(0, 10); };
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const yz = (x, b = 2) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}%${Math.abs(x * 100).toFixed(b).replace('.', ',')}` : '—');
  const puan = (x, b = 2) => (sayiMi(x) ? `${Math.abs(x * 100).toFixed(b).replace('.', ',')}` : '—');
  const para = (x, b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${Math.abs(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b })}` : '—');
  const ton = (x) => (!sayiMi(x) || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'tone-success' : 'tone-danger');
  const gunMetni = (g, yil) => { if (!g) return '—'; const d = new Date(`${g}T12:00:00Z`); return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', ...(yil ? { year: 'numeric' } : {}), timeZone: 'UTC' }); };
  const saat = (t) => { try { return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  // ── Saf hesaplar ─────────────────────────────────────────────────────────
  /** Saf: eğri → ölçüm günleri [{ gun, karar, gercek, btc, deger, btcDeger, r }] (gün başına son ölçüm; r = önceki ölçüme göre). */
  function gunler(egri) {
    const m = new Map();
    for (const x of egri || []) {
      if (!x || !x.gun || !sayiMi(x.gercek) || !(x.gercek > 0)) continue;
      const gun = sayiMi(x.zaman) ? yerelGun(x.zaman) : gunEkle(x.gun, 1);
      m.set(gun, { gun, karar: x.gun, gercek: x.gercek, btc: sayiMi(x.btc) && x.btc > 0 ? x.btc : null, deger: sayiMi(x.botDeger) ? x.botDeger : null });
    }
    const l = [...m.values()].sort((a, b) => (a.gun < b.gun ? -1 : 1));
    const d0 = l.length ? l[0].deger : null;
    l.forEach((x, i) => {
      x.r = i ? x.gercek / l[i - 1].gercek - 1 : null;
      x.btcDeger = sayiMi(d0) && sayiMi(x.btc) ? d0 * x.btc : null;
    });
    return l;
  }

  /** Saf: işlemler → Map(yerel gün → [işlem]) (zaman sırasıyla). */
  function islemGunleri(islemler) {
    const m = new Map();
    for (const x of islemler || []) {
      if (!x || !sayiMi(x.z)) continue;
      const g = yerelGun(x.z);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(x);
    }
    for (const l of m.values()) l.sort((a, b) => a.z - b.z);
    return m;
  }

  /** Saf: kol adı → kısa grup (Donchian · DCA · BTC ayağı · diğer). */
  const kolGrup = (k) => (/donchian/i.test(k || '') ? 'Donchian' : /dca/i.test(k || '') ? 'DCA' : /btc/i.test(k || '') ? 'BTC ayağı' : 'diğer');

  /** Saf: özet — getiri, BTC, fark, gün istatistikleri, en derin düşüş, işlem / ücret / gerçekleşen K/Z (başlangıçtan bu yana). */
  function ozet(G, islemler) {
    const l = G || [];
    if (l.length < 2) return null;
    const ilk = l[0], son = l[l.length - 1];
    const rl = l.slice(1).map(x => x.r).filter(sayiMi);
    let tepe = -Infinity, dd = 0;
    for (const x of l) { tepe = Math.max(tepe, x.gercek); dd = Math.min(dd, x.gercek / tepe - 1); }
    const b0 = l.find(x => sayiMi(x.btc)), b1 = [...l].reverse().find(x => sayiMi(x.btc));
    const getiri = son.gercek / ilk.gercek - 1, btc = b0 && b1 && b0 !== b1 ? b1.btc / b0.btc - 1 : null;
    const t0 = Date.parse(`${ilk.gun}T00:00:00`);
    const isl = (islemler || []).filter(x => sayiMi(x.z) && (!Number.isFinite(t0) || x.z >= t0 - 864e5));
    return {
      bas: ilk.gun, son: son.gun, gunSay: l.length - 1, getiri, btc, fark: sayiMi(btc) ? getiri - btc : null,
      kazanan: rl.filter(r => r > 0).length, olculen: rl.length, ort: rl.length ? rl.reduce((a, r) => a + r, 0) / rl.length : null,
      enIyi: rl.length ? Math.max(...rl) : null, enKotu: rl.length ? Math.min(...rl) : null, enDerin: dd,
      islem: isl.length, ucret: isl.some(x => sayiMi(x.u)) ? isl.reduce((a, x) => a + (sayiMi(x.u) ? x.u : 0), 0) : null,
      kz: isl.some(x => sayiMi(x.kz)) ? isl.reduce((a, x) => a + (sayiMi(x.kz) ? x.kz : 0), 0) : null,
      deger0: ilk.deger, degerSon: son.deger,
    };
  }

  /**
   * Saf: kim kazandırdı — { sermaye, toplam, btc, sepet, kollar: { Donchian, DCA } } ($). BTC ayağı = Σ kol.btc[t−1] × (btc[t]/btc[t−1] − 1).
   * `oz` grafik yanıtının ozsermaye'si (egri ile kol aynı sırada, aynı uzunlukta).
   */
  function katki(oz, islemler) {
    const e = (oz && oz.egri) || [], k = (oz && oz.kol) || [];
    if (e.length < 2 || k.length !== e.length) return null;
    const d0 = e[0].botDeger, dS = e[e.length - 1].botDeger;
    const sermaye = oz.taban && sayiMi(oz.taban.sermaye) ? oz.taban.sermaye : d0;
    if (!sayiMi(d0) || !sayiMi(dS) || !(sermaye > 0)) return null;
    let btc = 0, btcVar = false;
    for (let i = 1; i < e.length; i++) {
      const a = e[i - 1].btc, b = e[i].btc, n = +(k[i - 1] && k[i - 1].btc);
      if (sayiMi(a) && a > 0 && sayiMi(b) && sayiMi(n)) { btc += n * (b / a - 1); btcVar = true; }
    }
    const toplam = dS - d0;
    const kollar = { Donchian: null, DCA: null };
    const t0 = sayiMi(e[0].zaman) ? e[0].zaman : null;
    for (const x of islemler || []) {
      if (!sayiMi(x.kz) || (t0 != null && x.z < t0)) continue;
      const g = kolGrup(x.kol);
      if (g in kollar) kollar[g] = (kollar[g] || 0) + x.kz;
    }
    return { sermaye, toplam, btc: btcVar ? btc : null, sepet: btcVar ? toplam - btc : null, kollar };
  }

  /** Saf: 'YYYY-MM' ayının takvim hücreleri (Pazartesi başlar; boşluklar { bos: true }). */
  function takvim(ay, G, gunIslem, bugun) {
    const [y, a] = ay.split('-').map(Number);
    const ilkGun = new Date(Date.UTC(y, a - 1, 1)), gunSay = new Date(Date.UTC(y, a, 0)).getUTCDate();
    const bosluk = (ilkGun.getUTCDay() + 6) % 7;
    const harita = new Map((G || []).map(x => [x.gun, x]));
    const bas = G && G.length ? G[0].gun : null;
    const h = [];
    for (let i = 0; i < bosluk; i++) h.push({ bos: true });
    for (let g = 1; g <= gunSay; g++) {
      const tarih = `${ay}-${iki(g)}`, x = harita.get(tarih), isl = (gunIslem && gunIslem.get(tarih)) || [];
      const r = x && sayiMi(x.r) ? x.r : null;
      h.push({ tarih, no: g, r, islem: isl.length, baslangic: tarih === bas, bugun: tarih === bugun,
        guc: r == null ? 0 : Math.abs(r) >= 0.025 ? 3 : Math.abs(r) >= 0.01 ? 2 : 1 });
    }
    while (h.length % 7) h.push({ bos: true });
    return h;
  }

  /** Saf: kayıtta (ölçüm + işlem) geçen aylar, eskiden yeniye. */
  function aylar(G, gunIslem) {
    const s = new Set((G || []).map(x => x.gun.slice(0, 7)));
    if (gunIslem) for (const g of gunIslem.keys()) s.add(g.slice(0, 7));
    return [...s].sort();
  }

  /**
   * Saf: grafik serileri — birim 'yuzde' (% getiri, başlangıç 0) ya da 'dolar' (bot değeri $; BTC al-tut aynı başlangıç tutarıyla).
   * İşlem noktaları: işlem olan ölçüm günlerinde bot çizgisinin üstünde (değer), yoksa null.
   */
  function grafikSerileri(G, gunIslem, birim) {
    const dolar = birim === 'dolar' && G.length && sayiMi(G[0].deger);
    const bot = G.map(x => (dolar ? x.deger : (x.gercek / G[0].gercek - 1) * 100));
    const b0 = (G.find(x => sayiMi(x.btc)) || {}).btc;
    const btc = G.map(x => (!sayiMi(x.btc) || !b0 ? null : dolar ? x.btcDeger : (x.btc / b0 - 1) * 100));
    // Ölçüm günü X'in değeri (X−1 ölçümü, X ölçümü] aralığını kapsar: o aralıktaki işlemler X'in noktasına bağlanır.
    const nokta = [], noktaIslem = [];
    G.forEach((x, i) => {
      const l = [];
      if (gunIslem) {
        const onceki = i ? G[i - 1].gun : null;
        for (const [g, isl] of gunIslem) if ((onceki == null ? g <= x.gun : g > onceki && g <= x.gun)) l.push(...isl);
      }
      nokta.push(l.length ? bot[i] : null);
      noktaIslem.push(l);
    });
    return { etiketler: G.map(x => x.gun), bot, btc, nokta, noktaIslem, dolar: !!dolar };
  }

  /** Saf: bir günün işlemleri → kol bazında özet metni ("Donchian 3 · DCA 2"). */
  function kolOzeti(l) {
    const say = {};
    for (const x of l || []) { const g = kolGrup(x.kol); say[g] = (say[g] || 0) + 1; }
    return Object.entries(say).map(([k, n]) => `${k} ${n}`).join(' · ');
  }

  // ── Bot sayfası: özet + kim kazandırdı + takvim ──────────────────────────
  const durumlar = {};   // ad → { ay, secGun }

  const kutu = (ad, deger, sinif, title) => el('div', { class: 'bot-defter-kutu' }, [
    el('span', { class: 'bot-defter-kutu-ad', text: ad }), el('span', { class: `bot-defter-kutu-deger sayi ${sinif || ''}`, text: deger, title: title || null })]);

  function ozetCiz(ad, G, oz, islemler) {
    const k = bul(`botDefterOzet-${ad}`);
    if (!k) return;
    const o = ozet(G, islemler);
    if (!o) {
      doldur(k, [el('p', { class: 'hint mb-0', text: G.length ? 'İlk ölçüm alındı — ikinci günlük çalışmadan sonra getiri ve günlük sonuçlar burada görünür.' : 'Henüz ölçüm yok — bot her günlük çalışmada (~03:00) hesap değerini yazar.' })]);
      return;
    }
    const kt = katki(oz, islemler);
    const kollar = kt ? [
      kt.btc != null ? { ad: 'BTC ayağı', v: kt.btc / kt.sermaye, alt: `${para(kt.btc)} $` } : null,
      kt.sepet != null ? { ad: 'Coin sepeti', v: kt.sepet / kt.sermaye, alt: `${para(kt.sepet)} $ (Donchian + DCA, ücret ve fonlama dahil)` } : null,
      kt.btc == null ? { ad: 'Toplam', v: kt.toplam / kt.sermaye, alt: `${para(kt.toplam)} $` } : null,
    ].filter(Boolean) : [];
    const cubukKap = el('div', { id: `botKatki-${ad}`, class: 'bot-katki' }, katkiSatirlari(kollar));
    const gerceklesen = kt && (sayiMi(kt.kollar.Donchian) || sayiMi(kt.kollar.DCA))
      ? `Gerçekleşen kâr/zarar (kapanan işlemler, Binance "Realized Profit"): Donchian ${sayiMi(kt.kollar.Donchian) ? para(kt.kollar.Donchian) + ' $' : '—'} · DCA ${sayiMi(kt.kollar.DCA) ? para(kt.kollar.DCA) + ' $' : '—'}.`
      : 'Donchian / DCA ayrımı kapanan işlemlerin gerçekleşen kâr/zararından gelir — henüz kayıt yok.';
    doldur(k, [
      el('div', { class: 'bot-defter-bas' }, [
        el('span', { class: 'bot-defter-etiket', text: `Başlangıçtan bugüne · ${o.gunSay} gün · ${gunMetni(o.bas)}'den` }),
        el('span', { class: `bot-defter-getiri sayi ${ton(o.getiri)}`, id: `botDefterGetiri-${ad}`, text: yz(o.getiri) }),
        el('span', { class: 'bot-defter-kiyas' }, sayiMi(o.btc) ? [
          el('span', { text: `BTC al-tut ${yz(o.btc)} → ` }),
          el('strong', { class: ton(o.fark), text: `BTC'nin ${puan(o.fark)} puan ${o.fark >= 0 ? 'önünde' : 'gerisinde'}` })
        ] : [el('span', { text: 'BTC al-tut kıyası ikinci ölçümden sonra' })])
      ]),
      el('div', { class: 'bot-defter-kutular' }, [
        kutu('Kazanan gün', `${o.kazanan} / ${o.olculen}`),
        kutu('Ortalama gün', yz(o.ort), ton(o.ort)),
        kutu('En iyi gün', yz(o.enIyi), ton(o.enIyi)),
        kutu('En kötü gün', yz(o.enKotu), ton(o.enKotu)),
        kutu('En derin düşüş', yz(o.enDerin), o.enDerin < 0 ? 'tone-danger' : '', 'zirveden en büyük kayıp (günlük ölçümlerle)'),
        kutu('İşlem', String(o.islem)),
        kutu('Ödenen ücret', sayiMi(o.ucret) ? `${para(o.ucret)} $` : '—', '', 'Binance işlem ücretleri (borsa kaydı olan işlemler)'),
        kutu('Gerçekleşen K/Z', sayiMi(o.kz) ? `${para(o.kz)} $` : '—', ton(o.kz), 'kapanan işlemlerin kâr/zararı (açık pozisyonlar hariç)'),
      ]),
      el('div', { class: 'bot-defter-katki' }, [
        el('h4', { class: 'pf-bolum-baslik', text: 'Kim kazandırdı, kim kaybettirdi' }),
        cubukKap,
        el('p', { class: 'hint hint-sm mb-0 mt-2', text: `Puan = botun sermayesine (${kt ? para(kt.sermaye, 0) : '—'} $) oranla. BTC ayağı her gün tutulan BTC tutarı × BTC'nin değişimi; coin sepeti kalanı. Yaklaşık — günlük ölçümlerden. ${gerceklesen}` })
      ])
    ]);
  }

  /**
   * Kim kazandırdı satırları: ad · çubuk (sıfır ortada, en büyük mutlak değere ölçekli; artı sağa yeşil, eksi sola kırmızı) · puan + $.
   * Ortak AG.grafik.cubuk hepsi eksi olunca adı değerin altında bırakıyordu; burada ad, çubuk ve değer ayrı sütunlarda.
   */
  function katkiSatirlari(kollar) {
    if (!kollar.length) return [el('p', { class: 'hint hint-sm mb-0', text: 'Kol kaydı yok — ölçümler biriktikçe görünür.' })];
    const enB = Math.max(...kollar.map(x => Math.abs(x.v)), 1e-9);
    return kollar.map(x => {
      const w = Math.max(0.5, Math.abs(x.v) / enB * 50);
      return el('div', { class: 'bot-katki-satir', title: x.alt || null }, [
        el('span', { class: 'bot-katki-ad', text: x.ad }),
        AG.dom.svg('svg', { class: 'bot-katki-cubuk', viewBox: '0 0 100 10', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
          AG.dom.svg('line', { x1: 50, x2: 50, y1: 0, y2: 10, class: 'bot-katki-sifir' }),
          AG.dom.svg('rect', { x: x.v >= 0 ? 50 : 50 - w, y: 1.5, width: w, height: 7, rx: 1, class: x.v >= 0 ? 'bot-katki-arti' : 'bot-katki-eksi' })
        ]),
        el('span', { class: `bot-katki-deger sayi ${ton(x.v)}`, text: `${x.v >= 0 ? '+' : '−'}${puan(x.v)} puan` }),
        el('span', { class: 'bot-katki-alt hint-sm', text: x.alt || '' })
      ]);
    });
  }

  function gunAyrintiCiz(ad, G, gunIslem) {
    const k = bul(`botTakvimGun-${ad}`), s = durumlar[ad];
    if (!k) return;
    if (!s.secGun) { doldur(k, [el('p', { class: 'hint hint-sm mb-0', text: 'Bir güne dokunun: o günün sonucu ve işlemleri burada açılır.' })]); return; }
    const x = (G || []).find(y => y.gun === s.secGun), l = (gunIslem && gunIslem.get(s.secGun)) || [];
    const bas = el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [
      el('strong', { text: `${gunMetni(s.secGun, true)}${x && sayiMi(x.r) ? ` · günlük sonuç ${yz(x.r)}` : x ? ' · başlangıç' : ''}` }),
      el('span', { class: 'hint hint-sm mb-0', text: l.length ? `${l.length} işlem — ${kolOzeti(l)}` : 'bu gün işlem yok' })
    ]);
    if (!l.length) { doldur(k, [bas]); return; }
    doldur(k, [bas, AG.tablo.kutulu({ id: `tblBotGunIslem-${ad}`, sinif: 'table-dense pf-tablo', basliklar: ['Saat', 'Coin', 'İşlem', 'Kol', 'Miktar', 'Fiyat', 'Ücret', 'K/Z'],
      satirlar: l.map(i => el('tr', null, [
        el('td', { class: 'sayi', text: saat(i.z) }), el('td', { class: 'fw-semibold', text: String(i.s || '').split('/')[0] }),
        el('td', { class: i.y === 'buy' ? 'tone-success' : 'tone-danger', text: i.y === 'buy' ? 'AL' : 'SAT' }),
        el('td', { text: i.kol || '—', title: i.n || null }),
        el('td', { class: 'sayi', text: sayiMi(i.m) ? i.m.toLocaleString('tr-TR', { maximumFractionDigits: 6 }) : '—' }),
        el('td', { class: 'sayi', text: sayiMi(i.f) ? i.f.toLocaleString('tr-TR', { maximumFractionDigits: i.f < 10 ? 4 : 2 }) : '—' }),
        el('td', { class: 'sayi', text: sayiMi(i.u) ? para(i.u, 4) : '—' }),
        el('td', { class: `sayi ${ton(i.kz)}`, text: sayiMi(i.kz) ? para(i.kz) : '—' })
      ])) })]);
  }

  function takvimCiz(ad, G, gunIslem) {
    const k = bul(`botTakvim-${ad}`);
    if (!k) return;
    const s = durumlar[ad] = durumlar[ad] || {};
    const al = aylar(G, gunIslem);
    const bugun = yerelGun(Date.now());
    if (!s.ay || (al.length && !al.includes(s.ay) && s.ay > al[al.length - 1])) s.ay = al.length ? al[al.length - 1] : bugun.slice(0, 7);
    const [y, a] = s.ay.split('-').map(Number);
    const git = (n) => { const d = new Date(Date.UTC(y, a - 1 + n, 1)); s.ay = `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}`; takvimCiz(ad, G, gunIslem); };
    const onceVar = al.length && s.ay > al[0], sonraVar = al.length && s.ay < al[al.length - 1];
    const geri = el('button', { type: 'button', class: 'btn btn-xs btn-secondary bot-serbest', id: `btnTakvimOnce-${ad}`, 'aria-label': 'Önceki ay', text: '‹' });
    const ileri = el('button', { type: 'button', class: 'btn btn-xs btn-secondary bot-serbest', id: `btnTakvimSonra-${ad}`, 'aria-label': 'Sonraki ay', text: '›' });
    if (!onceVar) geri.disabled = true; else geri.addEventListener('click', () => git(-1));
    if (!sonraVar) ileri.disabled = true; else ileri.addEventListener('click', () => git(1));
    const hucreler = takvim(s.ay, G, gunIslem, bugun).map(h => {
      if (h.bos) return el('span', { class: 'bot-takvim-bos', 'aria-hidden': 'true' });
      const sinif = ['bot-takvim-gun', 'bot-serbest', h.r == null ? '' : `bot-takvim-${h.r >= 0 ? 'arti' : 'eksi'}-${h.guc}`, h.baslangic ? 'bot-takvim-bas' : '', h.bugun ? 'bot-takvim-bugun' : '', s.secGun === h.tarih ? 'is-secili' : ''].filter(Boolean).join(' ');
      const etiket = `${gunMetni(h.tarih)}${h.r != null ? ` ${yz(h.r)}` : h.baslangic ? ' başladı' : ''}${h.islem ? `, ${h.islem} işlem` : ''}`;
      const d = el('button', { type: 'button', class: sinif, 'aria-label': etiket, 'aria-pressed': s.secGun === h.tarih ? 'true' : 'false', 'data-gun': h.tarih }, [
        el('span', { class: 'bot-takvim-no', text: String(h.no) }),
        el('span', { class: 'bot-takvim-deger sayi', text: h.r != null ? yz(h.r) : h.baslangic ? 'başladı' : '' }),
        h.islem ? el('span', { class: 'bot-takvim-islem', text: `${h.islem} işlem` }) : null
      ]);
      d.addEventListener('click', () => gunSec(ad, h.tarih));
      return d;
    });
    doldur(k, [
      el('div', { class: 'row-between row-wrap gap-2 mb-2' }, [
        el('h4', { class: 'pf-bolum-baslik m-0', text: `${AYLAR[a - 1]} ${y} · günlük sonuç` }),
        el('div', { class: 'pf-dugmeler' }, [geri, ileri])
      ]),
      el('div', { class: 'bot-takvim-hafta', 'aria-hidden': 'true' }, ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(t => el('span', { text: t }))),
      el('div', { class: 'bot-takvim-izgara', role: 'group', 'aria-label': `${AYLAR[a - 1]} ${y} günlük sonuçlar` }, hucreler),
      el('p', { class: 'hint hint-sm mt-2 mb-2', text: 'Yeşil kazanan, kırmızı kaybeden gün; renk ne kadar koyuysa hareket o kadar büyük. Bot her gün ~03:00\'te ölçer: bir günün sonucu önceki ölçümden o güne kadarki değişimdir.' }),
      el('div', { id: `botTakvimGun-${ad}`, class: 'bot-takvim-ayrinti' })
    ]);
    gunAyrintiCiz(ad, G, gunIslem);
  }

  const sonVeri = {};   // ad → { G, gunIslem, oz, islemler }
  /** Takvimde ya da grafikte bir gün seçilir (aynı güne ikinci dokunuş seçimi kaldırır). */
  function gunSec(ad, gun) {
    const s = durumlar[ad] = durumlar[ad] || {}, v = sonVeri[ad];
    s.secGun = s.secGun === gun ? null : gun;
    if (gun) s.ay = gun.slice(0, 7);
    if (v) takvimCiz(ad, v.G, v.gunIslem);
  }

  /** botlar.js grafikYukle sonrası: özet + takvim (grafik botlar.js grafikCiz). */
  function defterCiz(ad, oz, islemler) {
    const G = gunler((oz && oz.egri) || []), gunIslem = islemGunleri(islemler);
    sonVeri[ad] = { G, gunIslem, oz, islemler };
    durumlar[ad] = durumlar[ad] || {};
    ozetCiz(ad, G, oz, islemler);
    takvimCiz(ad, G, gunIslem);
    return sonVeri[ad];
  }

  // ── Botlar › Özet: kartlar + karşılaştırma tablosu ───────────────────────
  const OZET_MS = 5 * 60e3;
  let ozetVeri = null, ozetZaman = 0;
  /** Saf: Hücum/Denge grafik yanıtı → özet satırı. */
  function botSatiri(ad, adG, r, durum) {
    const oz = r && r.ozsermaye, G = gunler((oz && oz.egri) || []), o = ozet(G, r && r.islemler);
    return { id: ad, ad: adG, tur: 'kripto', kiyasAd: 'BTC al-tut', getiri: o ? o.getiri : null, kiyas: o ? o.btc : null, fark: o ? o.fark : null, enDerin: o ? o.enDerin : null,
      gun: o ? o.gunSay : G.length ? 0 : null, islem: o ? o.islem : (r && r.islemler ? r.islemler.length : null), bas: o ? o.bas : null,
      seri: G.map(x => x.gercek), durum: durum || null, hata: r && r.success === false ? (r.error || 'yanıt yok') : null, href: `#/botlar/${ad}/genel` };
  }
  /** Saf: portföy botu yanıtı (GET /api/tasarimci/portfoy-bot/:id) → özet satırı. */
  function portfoySatiri(id, adG, r) {
    const P = AG.pages && AG.pages.portfoyBotlari;
    const s = r && P ? P.ozetSayilari(r) : {};
    const g = (r && r.kagit && r.kagit.gunler) || [];
    const gunSay = s.bas && s.son ? Math.round((Date.parse(s.son) - Date.parse(s.bas)) / 864e5) : null;
    return { id, ad: adG, tur: 'portföy', kiyasAd: (r && r.kiyas && r.kiyas.ad) || 'al-tut', getiri: sayiMi(s.getiri) ? s.getiri : null, kiyas: sayiMi(s.kiyas) ? s.kiyas : null,
      fark: sayiMi(s.fazla) ? s.fazla : null, enDerin: sayiMi(s.maxDD) ? -Math.abs(s.maxDD) : null, gun: gunSay, islem: sayiMi(s.islem) ? s.islem : null, bas: s.bas || null,
      seri: g.map(z => z.ozsermaye).filter(sayiMi), durum: 'ay sonu kararıyla çalışır', hata: r && r.success === false ? (r.error || 'yanıt yok') : null, href: `#/botlar/${id}` };
  }

  function kivrim(seri) {
    const l = (seri || []).filter(sayiMi);
    if (l.length < 2) return el('div', { class: 'bot-ozet-kivrim-bos hint hint-sm mb-0', text: 'eğri ikinci ölçümden sonra' });
    const mn = Math.min(...l), mx = Math.max(...l), W = 200, H = 44, p = 3;
    const y = (v) => (mx - mn > 1e-12 ? p + (mx - v) / (mx - mn) * (H - 2 * p) : H / 2);
    const pts = l.map((v, i) => `${(i / (l.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const art = l[l.length - 1] >= l[0];
    return AG.dom.svg('svg', { class: 'bot-ozet-kivrim', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      AG.dom.svg('line', { x1: 0, x2: W, y1: y(l[0]), y2: y(l[0]), class: 'bot-ozet-kivrim-taban' }),
      AG.dom.svg('polyline', { points: pts, class: art ? 'bot-ozet-kivrim-arti' : 'bot-ozet-kivrim-eksi' })
    ]);
  }

  function ozetSayfaCiz() {
    const k = bul('botOzetKap');
    if (!k) return;
    const bas = el('div', { class: 'mb-4' }, [
      el('h3', { class: 'card-title mb-1', text: 'Botlar — özet' }),
      el('p', { class: 'hint mb-0', text: 'Her botun başlangıçtan bu yana gerçek sonucu ve kendi kıyasına (kripto botları: BTC al-tut, portföy botları: kendi al-tut kıyası) göre farkı. Bir bota dokunun: kendi sayfası açılır.' })
    ]);
    if (!ozetVeri) { doldur(k, [bas, el('p', { class: 'hint mb-0', text: 'Yükleniyor…' })]); return; }
    const kartlar = el('div', { class: 'bot-ozet-kartlar mb-4' }, ozetVeri.map(x => el('a', { class: 'bot-ozet-kart no-underline', href: x.href, id: `botOzetKart-${x.id}` }, [
      el('div', { class: 'row-between gap-2' }, [el('strong', { class: 'bot-ozet-ad', text: x.ad }), el('span', { class: 'hint hint-sm mb-0', text: x.tur === 'kripto' ? (x.durum || 'kripto') : 'portföy · kâğıt' })]),
      x.hata ? el('span', { class: 'tone-danger hint-sm', text: `okunamadı: ${x.hata}` }) : el('span', { class: `bot-ozet-getiri sayi ${ton(x.getiri)}`, text: yz(x.getiri) }),
      el('span', { class: 'hint hint-sm mb-0' }, sayiMi(x.fark) ? [el('span', { text: `${x.kiyasAd} ${yz(x.kiyas)} · ` }), el('strong', { class: ton(x.fark), text: `${puan(x.fark)} puan ${x.fark >= 0 ? 'önde' : 'geride'}` })] : [el('span', { text: x.gun != null ? `${x.gun} gün` : 'kayıt yok' })]),
      kivrim(x.seri)
    ])));
    const tablo = AG.tablo.kutulu({ id: 'tblBotOzet', sinif: 'table-dense pf-tablo', basliklar: ['Bot', 'Tür', 'Başlangıç', 'Gün', 'Getiri', 'Kıyas', 'Kıyas getirisi', 'Fark (puan)', 'En derin düşüş', 'İşlem', ''],
      satirlar: ozetVeri.map(x => el('tr', null, [
        el('td', { class: 'fw-semibold', text: x.ad }), el('td', { text: x.tur }), el('td', { text: x.bas ? gunMetni(x.bas, true) : '—' }),
        el('td', { class: 'sayi', text: x.gun != null ? String(x.gun) : '—' }),
        el('td', { class: `sayi ${ton(x.getiri)}`, text: yz(x.getiri) }), el('td', { text: x.kiyasAd }),
        el('td', { class: `sayi ${ton(x.kiyas)}`, text: yz(x.kiyas) }),
        el('td', { class: `sayi ${ton(x.fark)}`, text: sayiMi(x.fark) ? `${x.fark >= 0 ? '+' : '−'}${puan(x.fark)}` : '—' }),
        el('td', { class: `sayi ${sayiMi(x.enDerin) && x.enDerin < 0 ? 'tone-danger' : ''}`, text: yz(x.enDerin) }),
        el('td', { class: 'sayi', text: x.islem != null ? String(x.islem) : '—' }),
        el('td', null, [el('a', { href: x.href, class: 'no-underline', text: 'Aç →' })])
      ])) });
    doldur(k, [bas, kartlar, el('h4', { class: 'pf-bolum-baslik', text: 'Karşılaştırma' }), tablo,
      el('p', { class: 'hint hint-sm mt-2 mb-0', text: 'Geçmiş sonuç geleceği göstermez. Kripto botları günlük ölçümle (~03:00), portföy botları kâğıt hesabın günlük değeriyle; en derin düşüş aynı ölçümlerden. Kısa kayıtta sayılar şansa çok bağlıdır.' })]);
  }

  async function ozetYukle(zorla) {
    if (!bul('botOzetKap')) return;
    if (!zorla && ozetVeri && Date.now() - ozetZaman < OZET_MS) { ozetSayfaCiz(); return; }
    ozetSayfaCiz();
    const B = AG.pages.botlar, P = AG.pages.portfoyBotlari;
    const kripto = (B ? B.ADLAR : ['hucum', 'denge']).map(async (ad) => {
      const [r, d] = await Promise.all([AG.api.bindirmeGrafik(ad).catch(e => ({ success: false, error: e.message })), AG.api.bindirmeDurum(ad).catch(() => null)]);
      const b = d && d.bot;
      return botSatiri(ad, (AG.botAd && AG.botAd.ad(ad)) || (ad === 'hucum' ? 'Kairos' : 'Tao'), r, b && AG.botDil ? AG.botDil.durum(b).metin : null);
    });
    // 74.6: model örnekleri (ikinci kâğıt hesaplar) portföy botlarından hemen sonra
    if (B && B.listeYukle) await B.listeYukle(false);
    const portfoy = (P ? [...P.SIRA, ...(P.ornekler ? P.ornekler() : [])] : []).map(async (id) => {
      const r = await AG.api.tasarimci.portfoyBot(id).catch(e => ({ success: false, error: e.message }));
      return portfoySatiri(id, P.AD[id] || id, r);
    });
    ozetVeri = await Promise.all([...kripto, ...portfoy]);
    ozetZaman = Date.now();
    ozetSayfaCiz();
  }

  /**
   * KILAVUZ ÖRNEĞİ (scripts/kilavuz-ekran.js, ekranlar.json botlar-1400): public/performans/bot-performans.json'daki bir botun
   * yüzde serisi (başlangıç 100) → grafik yanıtı biçimi; tutar 1.000 $ taban ÖRNEKTİR, işlemler örnek (gerçek emir değil).
   */
  function ornekVeri(pb) {
    const seri = (pb && pb.seri) || [], k = new Map(((pb && pb.kiyas && pb.kiyas.seri) || []).map(([g, v]) => [g, v]));
    const zaman = (g) => new Date(`${gunEkle(g, 1)}T03:05:00`).getTime();
    const egri = seri.map(([g, v]) => ({ gun: g, zaman: zaman(g), gercek: v / 100, btc: k.has(g) ? k.get(g) / 100 : null, botDeger: 10 * v }));
    const kol = seri.map(() => ({ btc: 600, donchian: 300, dca: 120 }));
    const islemler = [];
    const KOL = ['Donchian', 'DCA', 'Donchian', 'DCA', 'BTC ayağı'];
    seri.forEach(([g], i) => {
      if (i % 2) return;
      const t = zaman(g);
      islemler.push({ z: t - 60e3, s: ['SOL/USDT', 'XRP/USDT', 'HYPE/USDT', 'ZEC/USDT', 'BTC/USDT'][i % 5], y: i % 4 ? 'sell' : 'buy', m: 1, f: 100, u: 0.04, kz: i % 4 ? (i % 3 ? 3.2 : -1.4) : null, kol: KOL[i % 5], n: null });
      if (i % 3 === 0) islemler.push({ z: t + 6 * 3600e3, s: 'XRP/USDT', y: 'buy', m: 10, f: 1.3, u: 0.01, kz: null, kol: 'DCA', n: 'DCA SO1' });
    });
    return { success: true, ozsermaye: { egri, kol, taban: { tur: 'hesap', sermaye: 1000 } }, islemler };
  }

  AG.pages = AG.pages || {};
  AG.pages.botGetiri = { ornekVeri, gunler, islemGunleri, ozet, katki, takvim, aylar, grafikSerileri, kolOzeti, kolGrup, defterCiz, gunSec, botSatiri, portfoySatiri, ozetYukle, ozetSayfaCiz, durum: (ad) => durumlar[ad], veri: (ad) => sonVeri[ad] };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.botGetiri;
})(typeof window !== 'undefined' ? window : globalThis);
