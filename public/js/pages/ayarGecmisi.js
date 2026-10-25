/**
 * AYARLAR › AYAR GEÇMİŞİ (74.2, C2) `AG.pages.ayarGecmisi`
 * ═══════════════════════════════════════════════════════════════════════════
 * #/ayarlar/gecmis — panelin yazdığı her ayar değişikliği (sunucu: lib/ayarGecmisi.js, GET /api/ayar-gecmisi): ne zaman, hangi
 * makine, kaynak (panel / telefon / Telegram / araç / sistem), uç, eski → yeni. Sırlar "•••" (değer hiç gelmez).
 * Süzgeç: makine, tür, tarih aralığı. "Geri al" yalnız bilgisayardan ve uygun satırda: acil PIN; güvenlik kapısını gevşeten geri
 * almada ek olarak "GERİ AL" yazılır (sunucu her şeyi yeniden doğrular). Telefonda yalnız görüntüleme.
 * Araştırma kopyasında sunucunun kaydı da gelir (sunucu satırları buradan geri alınmaz).
 * DOM AG.dom ile (HTML dizgesi yok), stil p- ailesi + ag- düzen sınıfları, istek AG.api.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const TUR_AD = { config: 'Ayar', bildirim: 'Bildirim', sermaye: 'Model sermayesi', anahtar: 'Anahtar', bot: 'Bot kaydı' };
  /** 74.4: bot kaydı alanları (live/botlar/<kimlik>.json; yol "hucum.mod"). */
  const BOT_ALAN = { mod: 'mod', sermayeTavani: 'kâğıt sermaye üst sınırı', demoSermayeTavani: 'demo sermaye üst sınırı', canliSermayeTavani: 'canlı hesap sermaye üst sınırı',
    kagitBakiye: 'kâğıt başlangıç bakiyesi', k: 'coin sepeti (k)', kucukSermaye: 'küçük sermaye (Kairos-S)', btcAyak: 'BTC ayağı', tavanAkis: 'tavan para akışını izler' };
  const KAYNAK_AD = { panel: 'Panel', telefon: 'Telefon', telegram: 'Telegram', arac: 'Araç', sistem: 'Sistem' };
  /** Sık alanların okunur adları (bilinmeyen alan yolu olduğu gibi). */
  const ALAN_AD = {
    'risk.maxDrawdownPct': 'Kâğıt test: en büyük düşüş sınırı (%)', 'risk.dailyLossLimitPct': 'Kâğıt test: günlük zarar sınırı (%)',
    'risk.dailyLossLimitEnabled': 'Kâğıt test: günlük zarar sınırı açık', 'risk.maxPositionSizePct': 'Kâğıt test: en büyük pozisyon (%)',
    'risk.riskPerTradePct': 'Kâğıt test: işlem başına risk (%)', 'risk.stopLossPct': 'Kâğıt test: zarar durdur (%)',
    'telegram.enabled': 'Telegram bildirimleri', 'telegram.notifyTrades': 'Telegram: işlem bildirimi', 'telegram.notifyErrors': 'Telegram: hata bildirimi',
    'telegram.notifyLifecycle': 'Telegram: başlatma/durdurma', 'telegram.notifyCritical': 'Telegram: kritik', 'telegram.botToken': 'Telegram bot jetonu',
    'telegram.chatId': 'Telegram sohbet kimliği', 'telegram.panelAdresi': 'Telegram: panel adresi', 'watchlist': 'İzleme listesi',
    'genel.tutarGizle': 'Telegram\'da tutarları gizle', 'sessiz.acik': 'Sessiz saat', 'sessiz.bas': 'Sessiz saat başlangıcı', 'sessiz.bit': 'Sessiz saat bitişi',
    kesirli: 'ABD kesirli hisse', telefondaGizle: 'Telefonda tutarları gizle', minIslemUSD: 'En küçük işlem tutarı ($)', gecici: 'Geçici sessiz (Telegram "1 saat sessize al")', 'gecici.bitis': 'Geçici sessiz (bitiş)'
  };
  const ONAY = 'GERİ AL';

  let veri = null, mesgul = false;
  const suzgec = { makine: '', tur: '', bas: '', bit: '' };
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon') || !!(veri && veri.yazilabilir === false);
  const zaman = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  /* ── Saf yardımcılar (öz test: scripts/ayar-gecmisi-selftest.js) ── */
  /** Saf: alan yolunun okunur adı. */
  function alanAdi(tur, yol) {
    if (ALAN_AD[yol]) return ALAN_AD[yol];
    const m = /^turler\.([a-z]+)\.(acik|kanal|sessiz|metin)$/.exec(String(yol || ''));
    if (tur === 'bildirim' && m) return `Bildirim "${m[1]}": ${{ acik: 'açık', kanal: 'kanal', sessiz: 'sessiz saat davranışı', metin: 'metin şablonu' }[m[2]]}`;
    if (/^anahtar\./.test(yol)) return `Anahtar: ${String(yol).slice(8)}`;
    const mb = tur === 'bot' ? /^([a-z][a-z0-9]{1,15})\.(.+)$/.exec(String(yol || '')) : null;
    if (mb) return `${(AG.botAd && AG.botAd.ad(mb[1])) || mb[1]}: ${BOT_ALAN[mb[2]] || mb[2]}`;
    const mm = /^modeller\.([^.]+)\.(tutar|para|baslangicGunu)$/.exec(String(yol || ''));
    if (mm) return `Model sermayesi ${mm[1]}: ${{ tutar: 'tutar', para: 'para birimi', baslangicGunu: 'başlangıç günü' }[mm[2]]}`;
    return String(yol || '');
  }
  /** Saf: kayıttaki değeri kısa metne çevirir (sır "•••" olduğu gibi). */
  function degerMetni(d, taraf) {
    if (!d) return '—';
    if (d[`${taraf}Yok`]) return '(yok)';
    if (d.kisaltildi && d[taraf] == null) return '(büyük değer — özet)';
    const v = d[taraf];
    if (v === null || v === undefined || v === '') return '(boş)';
    if (v === true) return 'açık';
    if (v === false) return 'kapalı';
    if (typeof v === 'object' && Number.isFinite(v.bitis) && Object.keys(v).length === 1) return `bitiş ${zaman(new Date(v.bitis).toISOString())}`;
    if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 120 ? `${s.slice(0, 117)}…` : s; }
    const s = String(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  /** Saf: kaynak etiketi (geliştirme kademesi ayrı yazılır). */
  function kaynakMetni(k) {
    const ad = KAYNAK_AD[k && k.kaynak] || (k && k.kaynak) || '—';
    if (k && k.kademe === 'gelistirme') return `${ad} (geliştirme bilgisayarından)`;
    return ad;
  }
  /** Saf: geri alınmış kayıt kimlikleri → { id: geri alan kaydın zamanı }. */
  function geriAlinanlar(kayitlar) {
    const o = {};
    for (const k of kayitlar || []) if (k.geriAlinan) o[k.geriAlinan] = k.z;
    return o;
  }
  /** Saf: süzgeç → sorgu dizgesi. */
  function sorgu(s) {
    const p = [];
    for (const a of ['makine', 'tur', 'bas', 'bit']) if (s && s[a]) p.push(`${a}=${encodeURIComponent(s[a])}`);
    return p.length ? `?${p.join('&')}` : '';
  }
  const onayNormal = (s) => String(s == null ? '' : s).trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/\s+/g, ' ');

  /* ── Eylem ── */
  async function geriAl(k, d) {
    if (mesgul || telefonMu()) return;
    const ad = alanAdi(k.tur, d.yol);
    const alanlar = [{ ad: 'pin', etiket: 'Acil PIN', tip: 'password', inputmode: 'numeric', dogrula: (v) => /^\d{6,12}$/.test(v.trim()) }];
    if (d.geriAl && d.geriAl.gevsetme) alanlar.push({ ad: 'onay', etiket: `Onay için "${ONAY}" yazın`, tip: 'text', dogrula: (v) => onayNormal(v) === onayNormal(ONAY) });
    const c = await AG.onayla({
      baslik: `"${ad}" geri alınsın mı?`,
      metin: `${degerMetni(d, 'yeni')} → ${degerMetni(d, 'eski')}. ${d.geriAl && d.geriAl.gevsetme ? 'DİKKAT: bu geri alma bir güvenlik kapısını GEVŞETİYOR (sınır büyüyor ya da koruma/uyarı kapanıyor). ' : ''}Değer ayarın normal doğrulamasından yeniden geçer; geri alma da geçmişe yeni bir satır olarak yazılır.`,
      onay: 'Geri al', tehlikeli: !!(d.geriAl && d.geriAl.gevsetme) || undefined, alanlar
    });
    if (!c || typeof c !== 'object') return;
    mesgul = true;
    try {
      const r = await AG.api.ayarGecmisi.geriAl(k.id, d.yol, c.pin.trim(), c.onay || '');
      if (r && r.success) AG.bildir(`Geri alındı: ${ad}.`, 'ok');
      else AG.bildir(`Geri alınamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 });
    } catch (e) { AG.bildir(`Geri alınamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }

  /* ── Çizim ── */
  const bant = (metin, tur) => el('div', { class: `p-bant${tur ? ` p-bant-${tur}` : ''}` }, [el('p', { class: 'p-bant-metin', text: metin })]);
  function secici(id, etiket, secenekler, deger, degisti) {
    const s = el('select', { id }, secenekler.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = deger || '';
    s.addEventListener('change', () => degisti(s.value));
    return el('div', { class: 'p-alan' }, [el('label', { for: id, text: etiket }), s]);
  }
  function tarih(id, etiket, deger, degisti) {
    const g = el('input', { type: 'date', id });
    g.value = deger || '';
    g.addEventListener('change', () => degisti(g.value));
    return el('div', { class: 'p-alan' }, [el('label', { for: id, text: etiket }), g]);
  }
  function suzgecCiz() {
    const makineler = (veri && veri.makineler) || [];
    const yenile = (a) => (v) => { suzgec[a] = v; yukle(); };
    return el('div', { class: 'ag-suzgec', id: 'agSuzgec' }, [
      secici('agSzMakine', 'Makine', [['', 'Hepsi'], ...makineler.map(m => [m, m])], suzgec.makine, yenile('makine')),
      secici('agSzTur', 'Tür', [['', 'Hepsi'], ...Object.entries(TUR_AD)], suzgec.tur, yenile('tur')),
      tarih('agSzBas', 'Başlangıç', suzgec.bas, yenile('bas')),
      tarih('agSzBit', 'Bitiş', suzgec.bit, yenile('bit'))
    ]);
  }
  function satirlar() {
    const l = [];
    const geri = geriAlinanlar(veri.kayitlar);
    for (const k of veri.kayitlar || []) {
      (k.degisiklikler || []).forEach((d, i) => {
        const g = d.geriAl || {};
        const islem = [];
        if (g.uygun && !telefonMu()) islem.push(el('button', { type: 'button', class: `p-dugme p-dugme-kucuk${g.gevsetme ? ' p-dugme-tehlike' : ''}`, id: `agGeriAl-${k.id}-${i}`, onclick: () => geriAl(k, d) }, [el('span', { text: 'Geri al' })]));
        else if (g.neden) islem.push(el('span', { class: 'an-alt', text: g.neden }));
        if (g.gevsetme && g.uygun) islem.push(el('span', { class: 'an-alt p-neg', text: 'Gevşetir: "GERİ AL" onayı ister' }));
        const notlar = [];
        if (k.geriAlinan) notlar.push('geri alma');
        if (geri[k.id]) notlar.push(`geri alındı (${zaman(geri[k.id])})`);
        if (k.uzak) notlar.push('sunucu');
        l.push(el('tr', { 'data-kayit': k.id }, [
          el('td', { class: 'an-soluk', text: i === 0 ? zaman(k.z) : '' }),
          el('td', null, [el('strong', { text: alanAdi(k.tur, d.yol) }), el('span', { class: 'an-alt', text: `${TUR_AD[k.tur] || k.tur}${d.yol !== alanAdi(k.tur, d.yol) ? ` · ${d.yol}` : ''}` })]),
          el('td', { class: 'p-sayi' }, [el('span', { text: degerMetni(d, 'eski') }), el('span', { class: 'an-soluk', text: ' → ' }), el('strong', { text: degerMetni(d, 'yeni') })]),
          el('td', null, [el('span', { text: kaynakMetni(k) }), el('span', { class: 'an-alt', text: [k.makine && k.makine.ad, k.uc].filter(Boolean).join(' · ') }), notlar.length ? el('span', { class: 'an-alt', text: notlar.join(' · ') }) : null]),
          el('td', null, [el('div', { class: 'an-dugmeler' }, islem)])
        ]));
      });
    }
    return l;
  }
  function bantlar() {
    const l = [];
    if (telefonMu()) l.push(bant('Telefondan ayar geçmişi yalnız görüntülenir — geri alma bilgisayardaki panelden.', ''));
    const s = veri.sunucu;
    if (veri.arastirma) {
      if (s && s.durum === 'tamam') l.push(bant('Araştırma kopyası: sunucunun ayar geçmişi de gösteriliyor ("sunucu" notlu satırlar) — onlar sunucudaki panelden geri alınır.', ''));
      else if (s && s.durum === 'eski') l.push(bant(`Sunucuya şu an ulaşılamıyor — sunucu satırları son okunan kopyadan (${zaman(s.zaman)}).`, 'uyari'));
      else l.push(bant('Sunucunun ayar geçmişi okunamadı (bağlantı kurulu değil ya da sunucu kapalı) — yalnız bu bilgisayarın kaydı.', 'uyari'));
    }
    if (!telefonMu() && veri.pin && !veri.pin.tanimli) l.push(bant('Acil PIN tanımlı değil — geri alma yapılamaz. Önce bilgisayar başında `npm run acil-pin`.', 'uyari'));
    if (veri.bozuk) l.push(bant(`Kayıt dosyasında okunamayan ${veri.bozuk} satır var (atlandı; dosya değiştirilmedi).`, 'uyari'));
    if (veri.sonHata) l.push(bant(`Son değişiklik kayda yazılamadı: ${veri.sonHata}`, 'tehlike'));
    return l;
  }
  function ciz() {
    const kap = bul('ayarGecmisiKok');
    if (!kap || !veri) return;
    const sat = satirlar();
    doldur(kap, [
      el('section', { class: 'p-kart an-bas' }, [
        el('div', { class: 'p-kart-bas' }, [el('h2', { class: 'p-kart-baslik', text: 'Ayar geçmişi' }), el('a', { href: '#/kilavuz/ayarlar/ayar-gecmisi', text: 'Kılavuz: Ayar geçmişi →' })]),
        el('p', { class: 'p-kart-alt', text: 'Panelin yazdığı her ayar değişikliği: ne zaman, hangi makinede, nereden (panel, Telegram, araç, sistem), eski → yeni. Kayıt yalnız eklenir, silinmez. Anahtar, jeton ve PIN değerleri hiçbir zaman yazılmaz ("•••"). "Geri al" acil PIN ister; güvenlik sınırını gevşeten geri alma ayrıca "GERİ AL" yazdırır.' }),
        suzgecCiz()
      ]),
      ...bantlar(),
      el('section', { class: 'p-kart' }, [
        sat.length ? AG.tablo.kutulu({ id: 'agTablo', sinif: 'an-tablo', basliklar: ['Zaman', 'Ayar', 'Eski → yeni', 'Kaynak', 'İşlem'], satirlar: sat })
          : el('p', { class: 'p-kart-alt', id: 'agBos', text: 'Bu süzgeçte kayıt yok. Bir ayarı değiştirdiğinizde burada görünür.' })
      ])
    ]);
  }
  async function yukle() {
    const kap = bul('ayarGecmisiKok');
    if (!kap) return;
    let r = null;
    try { r = await AG.api.ayarGecmisi.liste(sorgu(suzgec)); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(kap, [AG.bildirim && AG.bildirim.hataKutusu ? AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Ayar geçmişi okunamadı', yeniden: yukle }) : bant((r && r.error) || 'Ayar geçmişi okunamadı', 'tehlike')]); return; }
    veri = r;
    ciz();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings' && String(e.detail.alt || '').split('/')[0] === 'gecmis') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.ayarGecmisi = { yukle, ciz, alanAdi, degerMetni, kaynakMetni, geriAlinanlar, sorgu, _veriAyarla: (v) => { veri = v; ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.ayarGecmisi;
})(typeof window !== 'undefined' ? window : globalThis);
