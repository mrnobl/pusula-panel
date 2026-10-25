/**
 * AYARLAR › MAKİNELER (75.2, 3. faz parça 3a — B1 Makineler panosu) `AG.pages.makineler`
 * ═══════════════════════════════════════════════════════════════════════════
 * #/ayarlar/makineler — bu bilgisayarın makine kimliği ve eşlenmiş öteki Pusula makineleri (sunucu: lib/makine/api.js,
 * GET /api/makine/pano): son görülme, sürüm uyumu, botlar (mod · çalışıyor), güncelleme durumu, boş disk, Tailscale adresi.
 * PANO SALT OKUMA: buradan hiçbir bota, emre, ayara dokunulmaz. Yazan tek şey eşleme yönetimi — "Kod üret", "Eşle", "Kaldır" —
 * yalnız bilgisayardan ve yerel PIN'le (sunucu her şeyi yeniden doğrular). Telefonda yalnız görüntüleme.
 * 75.3 (3b): YÖNETİCİ MAKİNE — Telegram komutlarını dinleyen tek makine ("Yönetici yap", yalnız bilgisayardan + yerel PIN); seçilen
 * 30 dk ulaşılamazsa öbür sunucu geçici devralır (kart + bant gösterir).
 * 75.5 (3c): BOTU BAŞKA MAKİNEYE TAŞI kartı (GET /api/makine/tasima; POST /api/makine/tasi — yalnız bilgisayardan + yerel PIN + "TAŞI";
 * belirsiz taşımada "Yeniden denetle"). Canlı hesap ve Kairos demo kabulü (2026-12-09'a kadar) taşınmaz — satırda nedeni yazar.
 * 4. faz (4a, B4): EŞ KOPYALARI kartı (pano `kopya` + satırda `kopyaYasi` / `kopya`): eş başına son kopya yaşı, dosya, boyut, şifreli
 * anahtarın doğrulanması, eşin bu bilgisayardan son alışı; "Şimdi kopya al" (POST /api/makine/kopya/simdi — yalnız bilgisayardan).
 * DOM AG.dom ile (HTML dizgesi yok), stil p- / an- aileleri, istek AG.api.makine.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);

  const ISIK = { iyi: ['Bağlı', 'p-rozet-pos'], sessiz: ['Sessiz', 'p-rozet-warn'], hic: ['Henüz görülmedi', 'p-rozet-info'], red: ['Bu makineyi reddediyor', 'p-rozet-neg'], uyumsuz: ['Sürüm uyumsuz', 'p-rozet-neg'] };
  const ROL = { sunucu: 'Sunucu (botları çalıştırabilir)', gelistirme: 'Geliştirme / araştırma bilgisayarı' };
  const MOD = { kagit: 'kâğıt', demo: 'demo', canli: 'canlı' };
  const GUNC = { guncel: 'güncel', gelistirme: 'geliştirme kopyası (buraya kurulmaz)', 'onay-bekliyor': 'onay bekliyor', onay: 'onay bekliyor', kuruldu: 'kuruldu', bekliyor: 'bekliyor', hata: 'hata', kuruluyor: 'kuruluyor', 'kademe-bekliyor': 'sırada (kademeli güncelleme)' };
  /** 75.3: bu makinenin Telegram komut kararı (lib/makine/yonetici.js kip). */
  const KIP = { tek: 'Tek makine — komutları bu bilgisayar dinliyor', yonetici: 'Yönetici — komutları bu bilgisayar dinliyor', gecici: 'Geçici devralma — yönetici ulaşılamadığı için komutları bu bilgisayar dinliyor',
    bekle: 'Komutları yönetici makine dinliyor', cekisme: 'Bekliyor — Telegram\'ı başka bir makine dinliyor (409)', 'uygun-degil': 'Bu bilgisayar komut dinlemez (geliştirme / araştırma kopyası ya da Telegram kurulu değil)' };

  let veri = null, mesgul = false, sonKod = null, tasimaVeri = null, tasimaHata = null;
  const telefonMu = () => !!(AG.api && AG.api.kademe && AG.api.kademe() === 'telefon') || !!(veri && veri.yazilabilir === false);
  const zaman = (iso) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  /* ── Saf yardımcılar (öz test: scripts/panel-makineler-testi.js) ── */
  /** Saf: "x dk önce" biçimi (ms farkı). */
  function onceMetni(iso, simdi = Date.now()) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'hiç görülmedi';
    const dk = Math.max(0, Math.round((simdi - t) / 60000));
    if (dk < 1) return 'az önce';
    if (dk < 60) return `${dk} dk önce`;
    const sa = Math.round(dk / 60);
    if (sa < 48) return `${sa} sa önce`;
    return `${Math.round(sa / 24)} gün önce`;
  }
  /** Saf: bot listesinin tek satırlık özeti ("Kairos · demo · çalışıyor; Tao · kâğıt · durmuş"). */
  function botlarMetni(botlar) {
    if (!Array.isArray(botlar) || !botlar.length) return 'bot yok';
    return botlar.map(b => `${b.adGorunen || b.kimlik} · ${MOD[b.mod] || b.mod || '—'} · ${b.calisiyor ? 'çalışıyor' : 'durmuş'}`).join('; ');
  }
  /** Saf: sürüm + uyum metni. */
  function surumMetni(m, benSurum) {
    if (!m || !m.surum) return '—';
    const u = m.uyum === 'tam' ? '' : m.uyum === 'okuma' ? ' — yalnız okuma (taşıma için aynı sürüm gerekir)' : m.uyum === 'uyumsuz' ? ' — UYUMSUZ: iki makineyi aynı sürüme güncelleyin' : '';
    return `${m.surum}${benSurum && m.surum !== benSurum ? ` (bu bilgisayar ${benSurum})` : ''}${u}`;
  }
  /** Saf: güncelleme + disk metni. */
  function durumMetni(m) {
    const g = m && m.guncelleme && m.guncelleme.durum ? `güncelleme: ${GUNC[m.guncelleme.durum] || m.guncelleme.durum}` : 'güncelleme: —';
    const d = m && m.disk && Number.isFinite(m.disk.bosGB) ? `boş disk ${m.disk.bosGB.toLocaleString('tr-TR')} GB` : 'disk: —';
    return `${g} · ${d}`;
  }
  /** Saf (75.3): Telegram komut durumu → { metin, ton } (ton: '' | 'uyari'). */
  function telegramMetni(t) {
    if (!t) return { metin: 'Yönetici bilgisi yok (eski sunucu).', ton: '' };
    const m = KIP[t.kip] || t.sebep || '—';
    const uyari = t.kip === 'gecici' || t.kip === 'cekisme';
    return { metin: uyari ? `${m}. ${t.sebep || ''}` : m, ton: uyari ? 'uyari' : '' };
  }
  /** Saf (75.3): etkin yönetici metni. */
  function yoneticiMetni(v) {
    const y = v && v.etkinYonetici;
    if (!y || !y.kimlik) return 'yok';
    return `${y.ad || y.kimlik}${y.secildi ? '' : ' (varsayılan — seçim yapılmadı)'}`;
  }
  /** Saf (75.3): bu satır için "Yönetici yap" gösterilir mi — sunucu, Telegram dinleyebilir, şu an yönetici değil. */
  function yoneticiYapilabilir(m) { return !!m && m.rol === 'sunucu' && !(m.telegram && m.telegram.uygun === false) && !m.yonetici; }
  /**
   * Saf (75.5): taşıma satırının durum metni → { metin, ton ('' | 'uyari' | 'iyi'), eylem: 'tasi' | 'denetle' | null }.
   * Aşamalar (lib/makine/botTasima.js): tasiniyor (sürüyor / belirsiz) · tasindi (başka makinede) · basarisiz · yerlesiyor · geldi.
   */
  function tasimaDurumMetni(b) {
    const t = b && b.tasima;
    const hedef = (t && (t.hedefAd || t.hedef)) || (b && (b.makineAd || b.makine)) || 'öteki makine';
    if (t && t.asama === 'tasiniyor') return { metin: t.belirsiz ? `${hedef} makinesine taşınıyor — sonuç belli değil (hedefe ulaşılamadı). Bot iki makinede de başlamaz.` : `${hedef} makinesine taşınıyor…`, ton: 'uyari', eylem: 'denetle' };
    if (b && b.makine && b.makineAd) return { metin: `${b.makineAd} makinesinde çalışır (nöbet ${b.nobet}) — buradaki kopya salt okunur.`, ton: '', eylem: null };
    if (t && t.asama === 'geldi') {
      const m = t.mutabakat === 'temiz' ? 'borsayla karşılaştırma TEMİZ — Botlar sayfasında Başlat' : t.mutabakat === 'engel' ? 'borsayla karşılaştırma TEMİZ DEĞİL — Botlar sayfasındaki farklara bakın' : 'Botlar sayfasında önce Mutabakat, temizse Başlat';
      return { metin: `${(t.kaynakAd || t.kaynak || 'öteki makine')} makinesinden geldi (nöbet ${t.nobet}) — ${m}.`, ton: t.mutabakat === 'engel' ? 'uyari' : 'iyi', eylem: b.tasinabilir ? 'tasi' : null };
    }
    if (t && t.asama === 'basarisiz') return { metin: `Son taşıma yapılamadı: ${t.neden || '—'}. Bot burada (durmuş) — Botlar sayfasından Başlat ile açılır ya da yeniden taşınabilir.`, ton: 'uyari', eylem: b.tasinabilir ? 'tasi' : null };
    if (b && !b.tasinabilir) return { metin: `Taşınamaz: ${b.neden || '—'}`, ton: '', eylem: null };
    return { metin: b && b.calisiyor ? 'Taşınabilir — taşıma botu burada DURDURUR (pozisyon ve emirlere dokunmaz), hedefte siz başlatırsınız.' : 'Taşınabilir.', ton: '', eylem: 'tasi' };
  }
  /**
   * Saf (4. faz 4a, B4): bir eşin kopya satırı → { metin, alt, ton }. m = pano satırı (kopyaYasi dk, kopya { sonuc, metin, basari, dosya,
   * bayt, gizli, deneme, verilen }); eskiSaat = öz denetim eşiği (2 sa).
   */
  function kopyaSatirMetni(m, eskiSaat = 2, simdi = Date.now()) {
    const k = (m && m.kopya) || null;
    if (m && m.rol !== 'sunucu') return { metin: 'Kopya alınmaz (geliştirme / araştırma bilgisayarı — sır taşınmasın).', alt: '', ton: '' };
    const yas = m && Number.isFinite(m.kopyaYasi) ? m.kopyaYasi : null;
    const boyut = k && Number.isFinite(k.bayt) ? `${(k.bayt / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : null;
    const gizli = k && k.gizli === 'var' ? 'hesap anahtarı şifreli (yedek şifresiyle doğrulandı)' : k && k.gizli === 'cozulemedi' ? 'şifreli anahtar ÇÖZÜLEMEDİ — yedek şifreleri farklı olabilir' : k && k.gizli === 'yok' ? 'sır yok (kâğıt botlar)' : null;
    let metin, ton = '';
    if (yas === null) { metin = k && k.sonuc && k.sonuc !== 'tamam' ? `Kopya alınamadı — ${k.metin || k.sonuc}` : 'Henüz kopya alınmadı (ilk kopya bir sonraki saat başında).'; ton = k && k.sonuc && k.sonuc !== 'tamam' ? 'uyari' : ''; }
    else {
      metin = `Son kopya ${onceMetni(k && k.basari, simdi)}${k && k.dosya != null ? ` · ${k.dosya} dosya` : ''}${boyut ? ` · ${boyut}` : ''}`;
      if (yas > eskiSaat * 60) ton = 'uyari';
      if (k && k.sonuc && k.sonuc !== 'tamam') { metin += ` — son deneme başarısız: ${k.metin || k.sonuc}`; ton = 'uyari'; }
      else if (ton !== 'uyari') ton = 'iyi';
    }
    const alt = [gizli, k && k.verilen && (k.verilen.paket || k.verilen.manifest) ? `bu bilgisayarın kopyasını ${onceMetni(k.verilen.paket || k.verilen.manifest, simdi)} aldı` : null].filter(Boolean).join(' · ');
    return { metin, alt, ton };
  }
  /** Saf: sekme ışığı — reddeden / uyumsuz eş varsa tehlike, sessiz varsa uyarı, hepsi bağlıysa iyi, eş yoksa gizli. */
  function sekmeIsigi(v) {
    const l = (v && v.makineler) || [];
    if (!l.length) return null;
    if (l.some(m => m.isik === 'red' || m.isik === 'uyumsuz')) return 'tehlike';
    if (l.some(m => m.isik === 'sessiz' || m.isik === 'hic')) return 'uyari';
    return 'iyi';
  }

  /* ── Eylemler ── */
  async function yokla() {
    if (mesgul || telefonMu()) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.nabizSimdi();
      if (r && r.success) AG.bildir(r.esSayisi ? `Nabız ${r.esSayisi} makineye gönderildi.` : 'Eşlenmiş makine yok — hiçbir yere istek gönderilmedi.', 'ok');
      else AG.bildir(`Yoklanamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Yoklanamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function kopyaAl() {
    if (mesgul || telefonMu()) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.kopyaSimdi();
      if (r && r.success) {
        const l = r.sonuclar || [];
        const iyi = l.filter(x => x.sonuc === 'tamam').length;
        AG.bildir(r.atlandi === 'es-yok' ? 'Eşlenmiş sunucu yok — kopya alınacak makine yok.' : r.atlandi === 'gelistirme' ? 'Bu bilgisayar geliştirme kopyası — kopya çekmez.' : r.atlandi === 'suruyor' ? 'Kopya zaten alınıyor.' : `Kopya: ${iyi}/${l.length} eşten alındı.`, iyi === l.length ? 'ok' : 'uyari');
      } else AG.bildir(`Kopya alınamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Kopya alınamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function kodUret() {
    if (mesgul || telefonMu()) return;
    const kendi = (bul('mkKendiAdresKod') || {}).value || '';
    mesgul = true;
    try {
      const r = await AG.api.makine.kodUret(kendi.trim());
      if (r && r.success) { sonKod = { kod: r.kod, bitis: r.bitis }; AG.bildir('Eşleme kodu üretildi (10 dakika geçerli, tek kullanımlık).', 'ok'); }
      else AG.bildir(`Kod üretilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Kod üretilemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function esle() {
    if (mesgul || telefonMu()) return;
    const adres = ((bul('mkKarsiAdres') || {}).value || '').trim();
    const kod = ((bul('mkKod') || {}).value || '').trim();
    const kendi = ((bul('mkKendiAdres') || {}).value || '').trim();
    if (!adres || !kod || !kendi) { AG.bildir('Karşı makinenin adresi, eşleme kodu ve bu bilgisayarın adresi gerekli.', 'uyari'); return; }
    mesgul = true;
    try {
      const r = await AG.api.makine.esleBaslat(adres, kod, kendi);
      if (r && r.success) AG.bildir(`Eşlendi: ${r.es.ad}${r.yenilendi ? ' (jetonlar yenilendi)' : ''}.`, 'ok');
      else AG.bildir(`Eşlenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 12000 });
    } catch (e) { AG.bildir(`Eşlenemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function yoneticiYap(m) {
    if (mesgul || telefonMu()) return;
    const c = await AG.onayla({ baslik: `Yönetici makine "${m.ad}" olsun mu?`, metin: `Telegram komutlarını (/durum, /menu …) artık ${m.ad} dinler; öteki makineler dinlemeyi bırakır (iki makine aynı anda dinlerse Telegram çakışır). Bildirimleri her makine kendi botları için göndermeye devam eder. ${m.ad} 30 dakika ulaşılamazsa öbür sunucu komutları geçici olarak devralır ve Telegram'a haber verir. Acil PIN istenir.`, onay: 'Yönetici yap' });
    if (!c) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.yoneticiSec(m.kimlik);
      if (r && r.success) AG.bildir(`Yönetici makine: ${r.ad}.${r.yayilim && r.yayilim.esSayisi ? ` Seçim ${r.yayilim.tamam}/${r.yayilim.esSayisi} makineye iletildi.` : ''}`, 'ok');
      else AG.bildir(`Seçilemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 10000 });
    } catch (e) { AG.bildir(`Seçilemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function kaldir(m) {
    if (mesgul || telefonMu()) return;
    const c = await AG.onayla({ baslik: `"${m.ad}" eşlemesi kaldırılsın mı?`, metin: 'Bu bilgisayar o makinenin jetonunu siler; o makine artık buraya nabız gönderemez ve bot durumunu okuyamaz. Karşı makineye haber verilmez — orada da Ayarlar › Makineler\'den kaldırın. Yeniden eşlemek için yeni kod gerekir.', onay: 'Kaldır', tehlikeli: true });
    if (!c) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.kaldir(m.kimlik);
      if (r && r.success) AG.bildir(`Kaldırıldı: ${m.ad}.`, 'ok');
      else AG.bildir(`Kaldırılamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Kaldırılamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }

  /** 75.5: botu seçilen hedefe taşı — onay penceresinde "TAŞI" yazılır, sonra acil PIN (api.js pin-gerekli akışı). */
  async function tasi(b) {
    if (mesgul || telefonMu()) return;
    const sec = bul(`mkTasiHedef-${b.kimlik}`);
    const hedef = sec ? sec.value : '';
    const h = ((tasimaVeri && tasimaVeri.hedefler) || []).find(x => x.kimlik === hedef);
    if (!h) { AG.bildir('Önce hedef makineyi seçin.', 'uyari'); return; }
    const c = await AG.onayla({ baslik: `${b.adGorunen} → ${h.ad} taşınsın mı?`, tehlikeli: true, onay: 'Taşı',
      metin: `Bot bu bilgisayarda DURDURULUR (açık pozisyonlara, borsadaki emirlere ve felaket stoplarına dokunulmaz), verisi${b.mod === 'demo' ? ' ve demo hesabının anahtarı (yedek şifresiyle şifreli)' : ''} ${h.ad} makinesine gönderilir. Orada kendiliğinden başlamaz: ${h.ad}'de Botlar sayfasından önce Mutabakat, temizse Başlat. Bu bilgisayardaki kopya silinmez ama artık burada başlamaz; geri getirmek için ${h.ad}'den buraya taşıyın. Acil PIN istenir.`,
      alanlar: [{ ad: 'onay', etiket: 'Onaylamak için TAŞI yazın', ipucu: 'TAŞI', dogrula: (s) => s.trim().toLocaleUpperCase('tr-TR') === 'TAŞI' }] });
    if (!c) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.tasi(b.kimlik, h.kimlik);
      if (r && r.success) AG.bildir(`${b.adGorunen} artık ${r.hedefAd || h.ad} makinesinde (nöbet ${r.nobet}). Orada Botlar sayfasından Mutabakat, sonra Başlat.${(r.uyarilar || []).length ? ` Not: ${r.uyarilar.join(' · ')}` : ''}`, 'ok', { sure: 14000 });
      else if (r && r.belirsiz) AG.bildir(`Taşımanın sonucu belli değil: ${r.metin || r.error}`, 'uyari', { sure: 16000 });
      else AG.bildir(`Taşınamadı: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata', { sure: 14000 });
    } catch (e) { AG.bildir(`Taşınamadı: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }
  async function denetle(b) {
    if (mesgul || telefonMu()) return;
    mesgul = true;
    try {
      const r = await AG.api.makine.tasimaCozumle(b.kimlik);
      if (r && r.success) AG.bildir(r.metin || 'Denetlendi.', r.asama === 'tasindi' ? 'ok' : 'uyari', { sure: 12000 });
      else AG.bildir(`Denetlenemedi: ${(r && r.error) || 'bilinmeyen hata'}`, 'hata');
    } catch (e) { AG.bildir(`Denetlenemedi: ${e.message}`, 'hata'); } finally { mesgul = false; }
    await yukle();
  }

  /* ── Çizim ── */
  const bant = (metin, tur) => el('div', { class: `p-bant${tur ? ` p-bant-${tur}` : ''}` }, [el('p', { class: 'p-bant-metin', text: metin })]);
  const dugme = (id, metin, onclick, sinif = '') => el('button', { type: 'button', class: `p-dugme p-dugme-kucuk${sinif ? ` ${sinif}` : ''}`, id, onclick }, [el('span', { text: metin })]);
  function alan(id, etiket, deger, yer, ek = {}) {
    const g = el('input', { type: 'text', id, autocomplete: 'off', spellcheck: 'false', placeholder: yer || '', ...ek });
    g.value = deger || '';
    return el('div', { class: 'p-alan' }, [el('label', { for: id, text: etiket }), g]);
  }
  function benKarti() {
    const b = veri.ben || {};
    return el('section', { class: 'p-kart', id: 'mkBen' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Bu bilgisayar' })]),
      el('dl', { class: 'p-kv' }, [
        el('dt', { text: 'Ad' }), el('dd', { text: b.ad || '—' }),
        el('dt', { text: 'Makine kimliği' }), el('dd', { text: b.kimlik || '—' }),
        el('dt', { text: 'Rol' }), el('dd', { text: ROL[b.rol] || b.rol || '—' }),
        el('dt', { text: 'Sürüm' }), el('dd', { text: `${b.surum || '—'} · makine protokolü ${b.protokol || '—'}` }),
        el('dt', { text: 'Adres (Tailscale)' }), el('dd', { text: b.adres || 'kaydedilmedi — ilk eşlemede yazılır' }),
        el('dt', { text: 'Botlar' }), el('dd', { text: botlarMetni(b.botlar) }),
        el('dt', { text: 'Durum' }), el('dd', { text: durumMetni(b) }),
        el('dt', { text: 'Telegram komutları' }), el('dd', { id: 'mkBenTelegram', text: telegramMetni(veri.telegram).metin })
      ]),
      !telefonMu() && (veri.makineler || []).length && yoneticiYapilabilir({ rol: b.rol, telegram: { uygun: !(veri.telegram && veri.telegram.uygun === false) }, yonetici: b.yoneticiMi })
        ? el('div', { class: 'an-dugmeler' }, [dugme('mkYoneticiBen', 'Bu bilgisayarı yönetici yap', () => yoneticiYap({ kimlik: b.kimlik, ad: b.ad }))]) : null
    ]);
  }
  /** 75.3: Telegram komutları (yönetici makine) kartı — yalnız eş varken. */
  function yoneticiKarti() {
    if (!(veri.makineler || []).length) return null;
    const t = telegramMetni(veri.telegram);
    return el('section', { class: 'p-kart', id: 'mkYonetici' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Telegram komutları — yönetici makine' })]),
      el('p', { class: 'p-kart-alt', text: 'Telegram komutlarını (/durum, /menu …) tek bir makine dinler; iki makine aynı anda dinlerse Telegram çakışır (409). Yönetici seçilmezse dinleyebilen sunucular arasından biri kendiliğinden seçilir. Seçilen yönetici 30 dakika ulaşılamazsa öbür sunucu geçici olarak devralır, Telegram\'a haber verir ve yönetici geri gelince bırakır. Eşlenmiş bir sunucu 30 dakika sessiz kalırsa Telegram\'a tek uyarı, geri gelince tek bilgi gider.' }),
      el('dl', { class: 'p-kv' }, [
        el('dt', { text: 'Yönetici' }), el('dd', { id: 'mkYoneticiAd', text: yoneticiMetni(veri) }),
        el('dt', { text: 'Bu bilgisayar' }), el('dd', { class: t.ton === 'uyari' ? 'p-neg' : '', text: t.metin })
      ])
    ]);
  }
  function makineSatiri(m) {
    const [isikAd, isikSinif] = ISIK[m.isik] || ['—', 'p-rozet-info'];
    const notlar = [];
    if (m.giden && m.giden.sonuc && m.giden.sonuc !== 'tamam' && m.giden.hata) notlar.push(`son gönderim: ${m.giden.hata}`);
    return el('tr', { 'data-makine': m.kimlik }, [
      el('td', null, [el('strong', { text: m.ad }), m.yonetici ? el('span', { class: 'p-rozet p-rozet-info', text: 'Yönetici' }) : null,
        m.telegram && m.telegram.kip === 'gecici' ? el('span', { class: 'p-rozet p-rozet-warn', text: 'Komutları geçici dinliyor' }) : null,
        el('span', { class: 'an-alt', text: `${ROL[m.rol] || m.rol} · ${m.kimlik}` }), el('span', { class: 'an-alt', text: m.adres })]),
      el('td', null, [el('span', { class: `p-rozet ${isikSinif}`, text: isikAd }), el('span', { class: 'an-alt', text: `son görülme: ${onceMetni(m.sonGorulme)}${m.sonGorulme ? ` (${zaman(m.sonGorulme)})` : ''}` }),
        notlar.length ? el('span', { class: 'an-alt p-neg', text: notlar.join(' · ') }) : null]),
      el('td', null, [el('span', { text: surumMetni(m, veri.ben && veri.ben.surum) })]),
      el('td', null, [el('span', { text: botlarMetni(m.botlar) })]),
      el('td', null, [el('span', { text: durumMetni(m) })]),
      el('td', null, [el('div', { class: 'an-dugmeler' }, telefonMu() ? [] : [yoneticiYapilabilir(m) ? dugme(`mkYonetici-${m.kimlik}`, 'Yönetici yap', () => yoneticiYap(m)) : null, dugme(`mkKaldir-${m.kimlik}`, 'Kaldır', () => kaldir(m), 'p-dugme-sessiz')])])
    ]);
  }
  function eslemeKarti() {
    const b = veri.ben || {};
    const kodAlani = sonKod && Date.parse(sonKod.bitis) > Date.now() ? sonKod : null;
    const esleme = veri.esleme || {};
    return el('section', { class: 'p-kart', id: 'mkEsleme' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Makine eşle' })]),
      el('p', { class: 'p-kart-alt', text: 'İki bilgisayar bir kez eşlenir: birinde kod üretilir, ötekinde o kod ve birincinin adresi yazılır. Adres, Tailscale\'deki adıdır (https://<bilgisayar>.<ağ-adı>.ts.net). Her iki işlem de acil PIN ister; kod 10 dakika geçerli ve tek kullanımlıktır. Eşlenen makine buradan yalnız bot durumunu okuyabilir ve nabız gönderebilir — bot başlatamaz, emir veremez, ayar değiştiremez.' }),
      el('div', { class: 'an-form' }, [
        el('h4', { class: 'an-form-baslik', text: '1. Bu bilgisayarda kod üret' }),
        el('div', { class: 'an-form-izgara' }, [alan('mkKendiAdresKod', 'Bu bilgisayarın adresi (isteğe bağlı)', b.adres, 'https://sunucu.ag-adi.ts.net')]),
        el('div', { class: 'an-dugmeler' }, [dugme('mkKodUret', 'Kod üret', kodUret, 'p-dugme-ana')]),
        kodAlani ? el('p', { class: 'p-kart-alt', id: 'mkKodGoster' }, [el('span', { text: 'Eşleme kodu: ' }), el('strong', { class: 'p-sayi', text: kodAlani.kod }), el('span', { text: ` — ${zaman(kodAlani.bitis)}'e kadar geçerli; öteki bilgisayarın Makineler sekmesine yazın.` })])
          : esleme.var ? el('p', { class: 'an-alt', text: `Geçerli bir kod var (${zaman(esleme.bitis)}'e kadar). Kod yalnız üretildiği anda gösterilir; görmediyseniz yeni kod üretin.` }) : null
      ]),
      el('div', { class: 'an-form' }, [
        el('h4', { class: 'an-form-baslik', text: '2. Öteki bilgisayarın koduyla eşle' }),
        el('div', { class: 'an-form-izgara' }, [
          alan('mkKarsiAdres', 'Öteki bilgisayarın adresi', '', 'https://ev-pc.ag-adi.ts.net'),
          alan('mkKod', 'Eşleme kodu (32 rakam)', '', '1234-5678-…', { inputmode: 'numeric' }),
          alan('mkKendiAdres', 'Bu bilgisayarın adresi', b.adres, 'https://bu-pc.ag-adi.ts.net')
        ]),
        el('div', { class: 'an-dugmeler' }, [dugme('mkEsle', 'Eşle', esle, 'p-dugme-ana')])
      ])
    ]);
  }
  /** 75.5: Botu başka makineye taşı kartı — eş yokken çizilmez. */
  function tasimaKarti() {
    if (!(veri.makineler || []).length) return null;
    const tv = tasimaVeri;
    const ust = el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Botu başka makineye taşı' }), el('a', { href: '#/kilavuz/botlar/bot-tasima', text: 'Kılavuz: Bot taşıma →' })]);
    const alt = el('p', { class: 'p-kart-alt', text: 'Bir kâğıt ya da demo botu eşlenmiş başka bir SUNUCUYA taşır: bot burada durur, verisi (demo ise hesap anahtarı yedek şifresiyle şifreli) öteki makineye gider; orada kendiliğinden başlamaz — önce Mutabakat, temizse Başlat. Aynı bot iki makinede aynı anda çalışamaz (nöbet). Canlı hesap botu ve Kairos demo kabulü (2026-12-09\'a kadar) taşınmaz.' });
    if (!tv) return el('section', { class: 'p-kart', id: 'mkTasima' }, [ust, alt, el('p', { class: 'an-alt', text: tasimaHata ? `Taşıma bilgisi okunamadı: ${tasimaHata}` : 'yükleniyor…' })]);
    const hedefler = tv.hedefler || [];
    const notlar = [];
    if (tv.rol !== 'sunucu') notlar.push(el('p', { class: 'an-alt', text: 'Bu bilgisayar geliştirme / araştırma kopyası — buradan bot taşınmaz (botlar sunucuda çalışır).' }));
    else if (!hedefler.length) notlar.push(el('p', { class: 'an-alt', text: 'Eşlenmiş SUNUCU yok — bot yalnız sunucuya taşınır.' }));
    if (!tv.yedekSifre) notlar.push(el('p', { class: 'an-alt', text: 'Bu bilgisayarda yedek şifresi yok: demo botların hesap anahtarı yedek şifresiyle şifrelenip taşınır (Ayarlar › Yedek & taşıma; iki bilgisayarda AYNI şifre). Kâğıt botlar şifresiz taşınır.' }));
    const satirlar = (tv.botlar || []).map(b => {
      const d = tasimaDurumMetni(b);
      const dugmeler = [];
      if (!telefonMu() && tv.yazilabilir !== false) {
        if (d.eylem === 'tasi' && tv.rol === 'sunucu' && hedefler.length) {
          const sec = el('select', { id: `mkTasiHedef-${b.kimlik}`, class: 'form-control', 'aria-label': `${b.adGorunen} için hedef makine` }, hedefler.map(h => el('option', { value: h.kimlik, text: h.ad })));
          dugmeler.push(sec, dugme(`mkTasi-${b.kimlik}`, 'Taşı', () => tasi(b)));
        }
        if (d.eylem === 'denetle') dugmeler.push(dugme(`mkDenetle-${b.kimlik}`, 'Yeniden denetle', () => denetle(b)));
      }
      return el('tr', { 'data-tasima': b.kimlik }, [
        el('td', null, [el('strong', { text: b.adGorunen || b.kimlik }), el('span', { class: 'an-alt', text: `${b.kimlik} · ${MOD[b.mod] || b.mod || '—'} · ${b.calisiyor ? 'çalışıyor' : 'durmuş'} · nöbet ${b.nobet || 0}` })]),
        el('td', null, [el('span', { class: d.ton === 'uyari' ? 'p-neg' : d.ton === 'iyi' ? 'p-pos' : '', text: d.metin })]),
        el('td', null, [el('div', { class: 'an-dugmeler' }, dugmeler)])
      ]);
    });
    return el('section', { class: 'p-kart', id: 'mkTasima' }, [ust, alt, ...notlar,
      satirlar.length ? AG.tablo.kutulu({ id: 'mkTasimaTablo', sinif: 'an-tablo', basliklar: ['Bot', 'Durum', 'Taşı'], satirlar }) : el('p', { class: 'an-alt', text: 'Bu bilgisayarda bot yok.' })]);
  }
  /** 4. faz (4a, B4): eş kopyaları kartı — eş yokken çizilmez. */
  function kopyaKarti() {
    const l = veri.makineler || [];
    if (!l.length) return null;
    const k = veri.kopya || null;
    const ust = el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Eş kopyaları (saat başı)' }), el('a', { href: '#/kilavuz/ayarlar/makine-kopya', text: 'Kılavuz: Eş kopyaları →' })]);
    const alt = el('p', { class: 'p-kart-alt', text: `Eşlenmiş SUNUCULAR birbirinin bot verisini (bot durumları, emir defterleri, bot kayıtları, hesap işlemleri, ayarlar) her saatin ${k && k.dakika != null ? k.dakika : 20}. dakikasında kopyalar. Kopya yedek şifresiyle şifreli gider; demo hesap anahtarı ayrıca şifreli saklanır ve açılmaz. Canlı hesap ve Kairos demo kabulünün anahtarı kopyaya girmez. Kopya botlara dokunmaz; bir makine bozulursa öbüründeki son kopya kalır.` });
    const notlar = [];
    if (!k) notlar.push(el('p', { class: 'an-alt', text: 'Kopya bilgisi yok (sunucu bu sürümü bilmiyor olabilir).' }));
    else {
      if (k.rol !== 'sunucu') notlar.push(el('p', { class: 'an-alt', text: 'Bu bilgisayar geliştirme / araştırma kopyası — kopya çekmez ve ona kopya verilmez.' }));
      else if (!k.etkin) notlar.push(el('p', { class: 'an-alt p-neg', text: 'Saat başı kopya kapalı (MAKINE_KOPYA=0).' }));
      if (k.rol === 'sunucu' && !k.yedekSifre) notlar.push(el('p', { class: 'an-alt p-neg', text: 'Bu bilgisayarda yedek şifresi yok — kopya şifreli alındığı için ALINMIYOR. Ayarlar › Yedek & taşıma\'dan yedek şifresini girin (iki bilgisayarda AYNI).' }));
      if (k.sonraki) notlar.push(el('p', { class: 'an-alt', text: `Sonraki kopya: ${zaman(k.sonraki)}${k.suruyor ? ' · şu an kopya alınıyor' : ''}` }));
      if (k.denetim && k.denetim.durum === 'uyari') notlar.push(el('p', { class: 'an-alt p-neg', text: `Öz denetim: ${k.denetim.ayrinti}` }));
    }
    const satirlar = l.map(m => {
      const d = kopyaSatirMetni(m, k && k.eskiSaat);
      return el('tr', { 'data-kopya': m.kimlik }, [
        el('td', null, [el('strong', { text: m.ad }), el('span', { class: 'an-alt', text: ROL[m.rol] || m.rol || '—' })]),
        el('td', null, [el('span', { class: d.ton === 'uyari' ? 'p-neg' : d.ton === 'iyi' ? 'p-pos' : '', text: d.metin }), d.alt ? el('span', { class: 'an-alt', text: d.alt }) : null])
      ]);
    });
    return el('section', { class: 'p-kart', id: 'mkKopya' }, [ust, alt, ...notlar,
      AG.tablo.kutulu({ id: 'mkKopyaTablo', sinif: 'an-tablo', basliklar: ['Makine', 'Kopya'], satirlar }),
      !telefonMu() && k && k.rol === 'sunucu' ? el('div', { class: 'an-dugmeler' }, [dugme('mkKopyaAl', 'Şimdi kopya al', kopyaAl)]) : null]);
  }
  function bantlar() {
    const l = [];
    if (telefonMu()) l.push(bant('Telefondan makineler yalnız görüntülenir — eşleme ve kaldırma bilgisayardaki panelden.', ''));
    l.push(bant('Pano botlara dokunmaz: buradan eşleme, yönetici makine seçimi ve (aşağıdaki kartta, PIN ile) bot taşıma yapılır. Eşlenmiş makine yokken Pusula hiçbir makineye istek göndermez.', ''));
    const belirsiz = ((tasimaVeri && tasimaVeri.botlar) || []).filter(b => b.tasima && b.tasima.asama === 'tasiniyor');
    if (belirsiz.length) l.push(bant(`${belirsiz.map(b => b.adGorunen).join(', ')}: taşıma sürüyor ya da sonucu belli değil — bot iki makinede de başlamaz. Hedef makine açıkken "Yeniden denetle"ye basın.`, 'uyari'));
    const t = veri.telegram;
    if (t && t.kip === 'gecici') l.push(bant(`Geçici devralma: ${t.sebep}. Yönetici geri gelince bu bilgisayar dinlemeyi kendiliğinden bırakır.`, 'uyari'));
    if (t && t.kip === 'cekisme') l.push(bant(`${t.sebep}. İki makine çalışıyor ama birbirini görmüyor olabilir — Tailscale bağlantısına bakın ve "Şimdi yokla"ya basın.`, 'uyari'));
    const sorunlu = (veri.makineler || []).filter(m => m.isik === 'red' || m.isik === 'uyumsuz');
    if (sorunlu.length) l.push(bant(`${sorunlu.map(m => m.ad).join(', ')}: ${sorunlu.some(m => m.isik === 'red') ? 'bu bilgisayarı reddediyor — orada eşleme kaldırılmış ya da jeton eskimiş olabilir; iki makineyi yeniden eşleyin.' : 'sürüm uyumsuz — iki makineyi aynı sürüme güncelleyin.'}`, 'uyari'));
    return l;
  }
  function isikYaz() {
    const i = bul('ayarIsik-makineler');
    if (!i) return;
    const t = sekmeIsigi(veri);
    i.classList.toggle('is-hidden', !t);
    for (const x of ['iyi', 'uyari', 'tehlike', 'notr']) i.classList.toggle(`borsa-isik-${x}`, x === (t || 'notr'));
  }
  function ciz() {
    const kap = bul('makinelerKok');
    if (!kap || !veri) return;
    const l = veri.makineler || [];
    doldur(kap, [
      el('section', { class: 'p-kart an-bas' }, [
        el('div', { class: 'p-kart-bas' }, [el('h2', { class: 'p-kart-baslik', text: 'Makineler' }), el('a', { href: '#/kilavuz/ayarlar/makineler', text: 'Kılavuz: Makineler →' })]),
        el('p', { class: 'p-kart-alt', text: `Pusula'nın çalıştığı bilgisayarlar. Eşlenen makineler ${veri.nabizDk || 5} dakikada bir birbirine nabız gönderir (sürüm, botlar, güncelleme, boş disk); ${veri.sessizDk || 15} dakikadan uzun ses gelmezse "Sessiz" görünür. Bağlantı yalnız Tailscale üzerinden ve her makinenin kendi jetonuyla.` }),
        el('div', { class: 'an-dugmeler', id: 'mkDugmeler' }, [
          telefonMu() ? null : dugme('mkYokla', 'Şimdi yokla', yokla),
          dugme('mkYenile', 'Yenile', () => yukle(), 'p-dugme-sessiz')
        ])
      ]),
      ...bantlar(),
      benKarti(),
      yoneticiKarti(),
      el('section', { class: 'p-kart', id: 'mkEsler' }, [
        el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `Eşlenmiş makineler (${l.length})` })]),
        l.length ? AG.tablo.kutulu({ id: 'mkTablo', sinif: 'an-tablo', basliklar: ['Makine', 'Durum', 'Sürüm', 'Botlar', 'Güncelleme · disk', 'İşlem'], satirlar: l.map(makineSatiri) })
          : el('p', { class: 'p-kart-alt', id: 'mkBos', text: 'Henüz eşlenmiş makine yok. Bot çalıştıran sunucuyla bu bilgisayarı aşağıdan eşleyebilirsiniz; tek bilgisayar kullanıyorsanız bir şey yapmanız gerekmez.' })
      ]),
      kopyaKarti(),
      tasimaKarti(),
      telefonMu() ? null : eslemeKarti()
    ]);
    isikYaz();
  }
  async function yukle(yenile) {
    const kap = bul('makinelerKok');
    if (!kap) return;
    let r = null;
    try { r = await AG.api.makine.pano(!!yenile); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(kap, [AG.bildirim && AG.bildirim.hataKutusu ? AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Makineler okunamadı', yeniden: () => yukle() }) : bant((r && r.error) || 'Makineler okunamadı', 'tehlike')]); return; }
    veri = r;
    // 75.5: taşıma bilgisi (eş varken) — okunamazsa kart hatayı yazar, pano yine çizilir
    tasimaHata = null;
    if ((r.makineler || []).length && AG.api.makine.tasimaListe) {
      try { const t = await AG.api.makine.tasimaListe(); if (t && t.success) tasimaVeri = t; else { tasimaVeri = null; tasimaHata = (t && t.error) || 'yanıt yok'; } }
      catch (e) { tasimaVeri = null; tasimaHata = e.message; }
    } else tasimaVeri = null;
    ciz();
  }

  if (doc && doc.addEventListener) {
    doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-settings' && String(e.detail.alt || '').split('/')[0] === 'makineler') yukle(); });
  }

  AG.pages = AG.pages || {};
  AG.pages.makineler = { yukle, ciz, onceMetni, botlarMetni, surumMetni, durumMetni, sekmeIsigi, telegramMetni, yoneticiMetni, yoneticiYapilabilir, tasimaDurumMetni, kopyaSatirMetni,
    _veriAyarla: (v, kod, tasima) => { veri = v; sonKod = kod || null; tasimaVeri = tasima || null; tasimaHata = null; ciz(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.makineler;
})(typeof window !== 'undefined' ? window : globalThis);
