/**
 * RAPOR MOTORU — günlük, haftalık, aylık ve yıllık işlem raporu (PLAN-PANEL-2 §0.5, kullanıcı kararı 2026-10-19; aylık/yıllık 67.5)
 * ═══════════════════════════════════════════════════════════════════════════
 * İçerik (kullanıcı): botların işlemleri ve kâr/zararı · model emirleri · portföy botlarının (model portföylerin) tercihleri.
 * Kaynak: sunucunun KENDİ uçları (bot koduna dokunulmaz, hesap mantığı tekrarlanmaz):
 *   GET /api/bindirme/<bot>/durum · /api/bindirme/<bot>/grafik (özsermaye eğrisi) · /api/hesap-islemleri (bot dolumları)
 *   GET /api/tasarimci/emirler (bu ayın model emirleri) · /api/tasarimci/kagit (model kâğıt hesapları)
 * `raporKur(girdi)` SAF (test edilir); `topla()` girdiyi uçlardan okur; `olustur()` kurar, data/raporlar/<tur>-<bas>.json'a
 * yazar, isterse Telegram'a 📋 özetini yollar (bildirim merkezi türü "rapor"). Zamanlayıcı: her gün 09:00'dan sonra dünün
 * günlük raporu; son biten haftanın (pazartesi–pazar), ayın ve (ocakta) yılın raporu — yoksa üretilir (kaçırılan dönem tik
 * açılışta tamamlanır). Telegram'a yalnız TAZE dönem gider (bitişinden en çok TAZE_GUN gün sonra); eski dönem sessizce
 * arşive yazılır (güncellemede geçmiş ayların Telegram yağmuru olmasın). 76.0: HAFTALIK rapor Telegram'a GİTMEZ (varsayılan
 * TELEGRAM_TURLERI — pazartesi mesajı artık D2 haftalık karne; rapor yine hazırlanır ve arşivlenir; `o.telegramTurleri` ile açılabilir). Araştırma kopyasında zamanlayıcı çalışmaz —
 * geliştirme bilgisayarı raporları sunucudan okur (lib/evOkuma.js EV_YOLU).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('./yollar');

const BOTLAR = ['hucum', 'denge'];
const SAAT = 9;
const TURLER = Object.freeze(['gunluk', 'haftalik', 'aylik', 'yillik']);
const TUR_AD = Object.freeze({ gunluk: 'günlük', haftalik: 'haftalık', aylik: 'aylık', yillik: 'yıllık' });
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TAZE_GUN = 3;                 // dönem bitişinden en çok 3 gün sonra üretilen rapor Telegram'a gider
/** 76.0: zamanlayıcının Telegram'a gönderdiği türler — haftalık YOK (pazartesi tek mesaj = haftalık karne, lib/bildirimUreticileri.js). */
const TELEGRAM_TURLERI = Object.freeze(['gunluk', 'aylik', 'yillik']);
const SAYFA_BOYU = 500;             // /api/hesap-islemleri sayfa sınırı — uzun dönemde sayfalanarak okunur
const SAYFA_EN_COK = 200;           // güvenlik: en çok 200 sayfa (100.000 satır)
/** Bilinmeyen tür → günlük (eski davranış). */
const turNormal = (t) => (TURLER.includes(t) ? t : 'gunluk');
const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
const gunStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gunEkle = (g, n) => { const d = new Date(g + 'T12:00:00'); d.setDate(d.getDate() + n); return gunStr(d); };
const gunFarki = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const tr = (x, b = 2) => (sayiMi(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b }) : '—');
const para = (x, simge = '$', b = 2) => (sayiMi(x) ? `${x < 0 ? '−' : ''}${simge}${tr(Math.abs(x), b)}` : '—');
const isaretli = (x, simge = '$') => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${simge}${tr(Math.abs(x))}` : '—');
const yuzde = (x) => (sayiMi(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}%${tr(Math.abs(x * 100), 1)}` : '—');
const gunTr = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : '');
const PARA_SIMGE = { USD: '$', TRY: '₺', TL: '₺' };

/**
 * Aralık: günlük → [gün, gün]; haftalık → pazartesi–pazar; aylık → ayın 1'i – son günü; yıllık → 1 Ocak – 31 Aralık
 * (gün o dönemin içinden herhangi bir gün).
 */
function aralik(tur, gun) {
  if (tur === 'aylik') {
    const y = +gun.slice(0, 4), m = +gun.slice(5, 7);
    const son = new Date(y, m, 0).getDate();
    return { bas: `${gun.slice(0, 7)}-01`, bit: `${gun.slice(0, 7)}-${String(son).padStart(2, '0')}` };
  }
  if (tur === 'yillik') return { bas: `${gun.slice(0, 4)}-01-01`, bit: `${gun.slice(0, 4)}-12-31` };
  if (tur !== 'haftalik') return { bas: gun, bit: gun };
  const d = new Date(gun + 'T12:00:00');
  const pzt = gunEkle(gun, -((d.getDay() + 6) % 7));
  return { bas: pzt, bit: gunEkle(pzt, 6) };
}

/** Eğri: aralığın sonundaki değer ve aralıktan önceki son değer (yoksa aralığın ilk değeri). */
function egriDegisim(egri, bas, bit, alan) {
  const l = (egri || []).filter(x => x && typeof x.gun === 'string' && sayiMi(x[alan]));
  const son = [...l].reverse().find(x => x.gun <= bit);
  if (!son) return { son: null, once: null, degisim: null, oran: null };
  const once = [...l].reverse().find(x => x.gun < bas) || l.find(x => x.gun >= bas && x.gun <= bit);
  const degisim = once && once !== son ? son[alan] - once[alan] : (once === son ? 0 : null);
  return { son: son[alan], sonGun: son.gun, once: once ? once[alan] : null, degisim, oran: once && once[alan] > 0 && degisim != null ? degisim / once[alan] : null };
}

/**
 * SAF rapor kurucu.
 * @param g { tur, gun, bugun, botlar: [{ ad, durum, egri, islemler }], emirler, kagit }
 */
function raporKur(g) {
  const tur = turNormal(g.tur);
  const { bas, bit } = aralik(tur, g.gun);
  const icinde = (ms) => { const d = gunStr(new Date(ms)); return d >= bas && d <= bit; };
  const dikkat = [];

  // ── Botlar ─────────────────────────────────────────────────────────────
  const botlar = (g.botlar || []).map(b => {
    const bot = (b.durum && b.durum.bot) || {};
    const ad = require('./botAdlari').ad(b.ad) || require('./botAdlari').cevir(bot.adGorunen) || b.ad;   // 72.0: ad kimlikten
    const alan = (b.egri || []).some(x => sayiMi(x.botDeger)) ? 'botDeger' : 'ozsermaye';
    const e = egriDegisim(b.egri, bas, bit, alan);
    const ham = (b.islemler || []).filter(x => x && sayiMi(x.zaman) && icinde(x.zaman));
    const fonlama = ham.filter(x => x.tur === 'funding').reduce((a, x) => a + (sayiMi(x.tutar) ? x.tutar : 0), 0);
    const islemler = ham.filter(x => x.tur === 'islem' || x.tur === 'spot' || x.tur == null)
      .sort((x, y) => x.zaman - y.zaman)
      .map(x => ({ zaman: x.zaman, sembol: String(x.symbol || '').split(':')[0], yon: x.side === 'sell' ? 'satış' : 'alış', miktar: x.miktar, fiyat: x.fiyat, ucret: sayiMi(x.ucret) ? x.ucret : 0, kz: sayiMi(x.kz) ? x.kz : 0 }));
    const ucret = islemler.reduce((a, x) => a + x.ucret, 0);
    const kz = islemler.reduce((a, x) => a + x.kz, 0);
    const durum = bot.engel ? 'engel' : bot.calisiyor ? 'calisiyor' : 'durdu';
    if (bot.engel) dikkat.push(`${ad}: engel — ${bot.engel}`);
    const karar = bot.rejim ? (bot.rejim.icerde ? 'BTC trendi yukarı — BTC tutuluyor' : 'BTC trendi aşağı — USDT\'de bekleniyor') : null;
    return { ad: b.ad, adGorunen: ad, mod: bot.mod || null, durum, sonGun: bot.sonGun || null, karar,
      deger: e.son, degerGun: e.sonGun || null, degisim: e.degisim, oran: e.oran,
      islemSayisi: islemler.length, alis: islemler.filter(x => x.yon === 'alış').length, satis: islemler.filter(x => x.yon === 'satış').length,
      ucret, gerceklesenKz: kz, fonlama, islemler: islemler.slice(-100) };
  });
  const toplam = {
    degisim: botlar.some(b => sayiMi(b.degisim)) ? botlar.reduce((a, b) => a + (sayiMi(b.degisim) ? b.degisim : 0), 0) : null,
    islemSayisi: botlar.reduce((a, b) => a + b.islemSayisi, 0),
    ucret: botlar.reduce((a, b) => a + b.ucret, 0),
    gerceklesenKz: botlar.reduce((a, b) => a + b.gerceklesenKz, 0),
  };

  // ── Model emirleri (bu ayın listesi) ───────────────────────────────────
  const bugun = g.bugun || bit;
  const modelEmirleri = ((g.emirler && g.emirler.modeller) || []).map(m => {
    const ug = m.liste && m.liste.uygulamaGunu || (m.karar && m.karar.uygulamaGunu) || null;
    const bekliyor = (m.durum === 'bekliyor' || m.durum === 'kismi') && ug && ug <= bugun;
    const gec = bekliyor ? gunFarki(ug, bugun) : 0;
    if (bekliyor) dikkat.push(`${m.ad}: bu ayın emirleri ${gec ? `${gec} gündür` : 'bugün'} bekliyor`);
    return { id: m.id, ad: m.ad, durum: m.durum || null, uygulamaGunu: ug, bekliyor: !!bekliyor, gecikme: gec, kararGunu: (m.karar && m.karar.kararGunu) || null };
  });

  // ── Portföy botlarının (model portföylerin) tercihleri — kâğıt hesap ─────
  // 74.6: model örnekleri (/api/tasarimci/kagit `ornekler`, kimlik → kâğıt hesap) model botlarıyla aynı biçimde raporlanır
  const kagitModeller = { ...((g.kagit && g.kagit.modeller) || {}), ...((g.kagit && g.kagit.ornekler) || {}) };
  const portfoyBotlari = Object.values(kagitModeller).map(m => {
    const gunler = (m.gunler || []).filter(x => x && x.gun);
    const son = [...gunler].reverse().find(x => x.gun <= bit) || null;
    const oncesi = [...gunler].reverse().find(x => x.gun < bas) || null;
    // Değer değişimi için taban: aralıktan önceki son gün; yoksa (model bu aralıkta başladı) aralığın ilk günü.
    const once = oncesi || gunler.find(x => x.gun >= bas && x.gun <= bit && x !== son) || null;
    const poz = son && son.poz ? Object.entries(son.poz).map(([s, p]) => ({ sembol: s, adet: p.adet, deger: p.deger, pay: son.ozsermaye > 0 && sayiMi(p.deger) ? p.deger / son.ozsermaye : null }))
      .sort((a, b) => (b.deger || 0) - (a.deger || 0)) : [];
    const oncePoz = new Set(oncesi && oncesi.poz ? Object.keys(oncesi.poz) : []);
    const sonPoz = new Set(poz.map(p => p.sembol));
    const giren = oncesi ? [...sonPoz].filter(s => !oncePoz.has(s)) : [];
    const cikan = oncesi ? [...oncePoz].filter(s => !sonPoz.has(s)) : [];
    const islemler = (m.islemler || []).filter(x => x.gun >= bas && x.gun <= bit && x.tur !== 'yatir')
      .map(x => ({ gun: x.gun, tur: ({ sat: 'satış', al: 'alış', aktarim: 'aktarım', temettu: 'temettü' })[x.tur] || x.tur, sembol: x.s, adet: x.adet, tutar: x.tutar, neden: x.neden || null }));
    const degisim = son && once && sayiMi(son.ozsermaye) && sayiMi(once.ozsermaye) ? son.ozsermaye - once.ozsermaye : null;
    return { id: m.ornek ? m.ornek.kimlik : m.model, ad: m.ornek ? `${m.ornek.adGorunen} (${m.ad} örneği)` : m.ad, ...(m.ornek ? { model: m.model, ornek: true } : {}), para: m.para || 'USD', ozsermaye: son ? son.ozsermaye : null, nakit: son ? son.nakit : null, gun: son ? son.gun : null,
      degisim, oran: degisim != null && once.ozsermaye > 0 ? degisim / once.ozsermaye : null, pozisyonlar: poz, giren, cikan, islemler };
  });

  const r = { surum: 1, tur, bas, bit, olusturma: new Date().toISOString(), botlar, toplam, modelEmirleri, portfoyBotlari, dikkat };
  r.telegram = telegramMetni(r);
  return r;
}

/** Rapor başlığı: "Günlük rapor 15.10.2026" · "Haftalık rapor 12.10.2026 – 18.10.2026" · "Aylık rapor Ekim 2026" · "Yıllık rapor 2026". */
function baslikMetni(r) {
  if (r.tur === 'haftalik') return `Haftalık rapor ${gunTr(r.bas)} – ${gunTr(r.bit)}`;
  if (r.tur === 'aylik') return `Aylık rapor ${AY_AD[+r.bas.slice(5, 7) - 1]} ${r.bas.slice(0, 4)}`;
  if (r.tur === 'yillik') return `Yıllık rapor ${r.bas.slice(0, 4)}`;
  return `Günlük rapor ${gunTr(r.bas)}`;
}

/** Telegram özeti (HTML; 📋 → bildirim merkezi türü "rapor"). */
function telegramMetni(r) {
  const kac = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const baslik = baslikMetni(r);
  const s = [];
  if (r.botlar.length) {
    s.push(`Botlar: ${sayiMi(r.toplam.degisim) ? isaretli(r.toplam.degisim) : 'değer bilinmiyor'} · ${r.toplam.islemSayisi} işlem${r.toplam.ucret ? ` · ücret ${para(r.toplam.ucret)}` : ''}`);
    for (const b of r.botlar) s.push(`• ${b.adGorunen}: ${sayiMi(b.degisim) ? `${isaretli(b.degisim)} (${yuzde(b.oran)})` : '—'} · ${b.islemSayisi} işlem${b.durum !== 'calisiyor' ? ` · ${b.durum === 'engel' ? 'ENGEL' : 'durdu'}` : ''}`);
  }
  const bek = r.modelEmirleri.filter(m => m.bekliyor);
  s.push(bek.length ? `Model emirleri: ${bek.map(m => `${m.ad}${m.gecikme ? ` (${m.gecikme} gün)` : ''}`).join(', ')} bekliyor` : 'Model emirleri: bekleyen yok');
  const deg = r.portfoyBotlari.filter(m => m.giren.length || m.cikan.length || m.islemler.length);
  if (deg.length) s.push(`Portföy botları: ${deg.map(m => `${m.ad} ${m.islemler.length} işlem`).join(', ')}`);
  s.push(r.dikkat.length ? `Dikkat: ${r.dikkat.length} konu` : 'Sorun yok.');
  return `📋 <b>${kac(baslik)}</b>\n\n${s.map(kac).join('\n')}\n\nAyrıntı: Pusula › Raporlar`;
}

/** Sunucu: girdi toplayıcı + arşiv + zamanlayıcı. */
function olusturucu(o = {}) {
  const dizin = o.dizin || process.env.RAPOR_DIZIN || yollar.programVeri(o.kok || path.join(__dirname, '..'), 'raporlar');
  const taban = o.taban || `http://127.0.0.1:${o.port || process.env.PORT || 3000}`;
  const al = o.al || (async (yol) => { const r = await fetch(taban + yol, { signal: AbortSignal.timeout(30000) }); return r.json(); });
  const log = o.log || (() => {});
  const gonder = o.gonder || null;   // (metin) => Promise<{ok}>
  const simdi = o.simdi || (() => new Date());
  const telegramTurleri = new Set(Array.isArray(o.telegramTurleri) ? o.telegramTurleri : TELEGRAM_TURLERI);   // 76.0
  const botlarFn = typeof o.botlar === 'function' ? () => { try { return o.botlar() || BOTLAR; } catch { return BOTLAR; } } : () => BOTLAR;
  let mesgul = false;

  async function topla(tur, gun) {
    const guvenli = async (yol) => { try { const j = await al(yol); return j && j.success !== false ? j : null; } catch (e) { return null; } };
    const { bas, bit } = aralik(tur, gun);
    const botlar = [];
    // 67.5: uzun dönemde (ay/yıl) satır sayısı uç sınırını (500) aşabilir → sayfa sayfa okunur.
    const tumIslemler = async (ad) => {
      const satirlar = [];
      for (let sayfa = 1; sayfa <= SAYFA_EN_COK; sayfa++) {
        const isl = await guvenli(`/api/hesap-islemleri?kaynak=${ad}&bas=${bas}&bit=${bit}&boyut=${SAYFA_BOYU}&sayfa=${sayfa}`);
        if (!isl) break;
        satirlar.push(...(isl.satirlar || []));
        if (!(isl.toplamSayfa > sayfa)) break;
      }
      return satirlar;
    };
    for (const ad of botlarFn()) {   // 74.5: dinamik bot listesi (yeni botlar dahil; verilmezse Kairos/Tao)
      const [durum, grafik, islemler] = await Promise.all([guvenli(`/api/bindirme/${ad}/durum`), guvenli(`/api/bindirme/${ad}/grafik`), tumIslemler(ad)]);
      botlar.push({ ad, durum, egri: (grafik && grafik.ozsermaye && grafik.ozsermaye.egri) || [], islemler });
    }
    const [emirler, kagit] = await Promise.all([guvenli('/api/tasarimci/emirler'), guvenli('/api/tasarimci/kagit')]);
    return { tur, gun, bugun: gunStr(simdi()), botlar, emirler, kagit };
  }

  const dosya = (tur, bas) => path.join(dizin, `${tur}-${bas}.json`);

  async function olustur(tur, gun, ops = {}) {
    const r = raporKur(await topla(tur, gun));
    fs.mkdirSync(dizin, { recursive: true });
    const gecici = dosya(r.tur, r.bas) + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(r, null, 1));
    fs.renameSync(gecici, dosya(r.tur, r.bas));
    log('INFO', `📋 Rapor: ${TUR_AD[r.tur]} ${r.bas}${r.tur !== 'gunluk' ? ` – ${r.bit}` : ''} hazırlandı (${r.toplam.islemSayisi} bot işlemi)`);
    if (ops.telegram && gonder) {
      try { const s = await gonder(r.telegram); if (s && !s.ok && !s.atlandi) log('WARN', `📋 Rapor Telegram'a gönderilemedi: ${s.error || 'bilinmeyen'}`); }
      catch (e) { log('WARN', `📋 Rapor Telegram'a gönderilemedi: ${e.message}`); }
    }
    return r;
  }

  function liste() {
    let l = [];
    try { l = fs.readdirSync(dizin).map(f => /^(gunluk|haftalik|aylik|yillik)-(\d{4}-\d{2}-\d{2})\.json$/.exec(f)).filter(Boolean).map(m => ({ tur: m[1], bas: m[2] })); } catch (e) { l = []; }
    return l.sort((a, b) => (a.bas < b.bas ? 1 : a.bas > b.bas ? -1 : a.tur.localeCompare(b.tur)));
  }
  function oku(tur, bas) { try { return JSON.parse(fs.readFileSync(dosya(tur, bas), 'utf8')); } catch (e) { return null; } }

  /**
   * Zamanlayıcı adımı (09:00'dan sonra): dünün günlüğü; son biten haftanın, ayın ve — ocak ayında — geçen yılın raporu
   * (dosyası yoksa). Kaçırılan dönem (sunucu kapalıydı) bir sonraki tikte tamamlanır; Telegram yalnız taze dönem için.
   */
  async function tik() {
    if (mesgul) return null;
    const d = simdi();
    if (d.getHours() < SAAT) return null;
    mesgul = true;
    try {
      const bugun = gunStr(d);
      const yapilan = [];
      for (const { tur, gun } of bekleyenDonemler(bugun)) {
        const { bas, bit } = aralik(tur, gun);
        if (fs.existsSync(dosya(tur, bas))) continue;
        yapilan.push(await olustur(tur, gun, { telegram: telegramTurleri.has(tur) && gunFarki(bit, bugun) <= TAZE_GUN }));
      }
      return yapilan;
    } catch (e) { log('WARN', `📋 Rapor hazırlanamadı: ${e.message}`); return null; } finally { mesgul = false; }
  }

  let zamanlayici = null;
  function baslat() { if (!zamanlayici) { zamanlayici = setInterval(() => { tik(); }, 5 * 60 * 1000); setTimeout(() => tik(), 90 * 1000); } }
  function durdur() { if (zamanlayici) clearInterval(zamanlayici); zamanlayici = null; }

  return { topla, olustur, liste, oku, tik, baslat, durdur, dizin };
}

/**
 * SAF: bugün itibarıyla son BİTMİŞ dönemler (her türden en çok bir; yıllık yalnız ocakta — yıl başında bir kez).
 * @returns [{ tur, gun }] — gun dönemin içinden bir gün (aralik(tur, gun) dönemi verir)
 */
function bekleyenDonemler(bugun) {
  const dun = gunEkle(bugun, -1);
  const l = [{ tur: 'gunluk', gun: dun }];
  const buHafta = aralik('haftalik', bugun).bas;
  l.push({ tur: 'haftalik', gun: gunEkle(buHafta, -1) });          // geçen haftanın pazarı
  l.push({ tur: 'aylik', gun: gunEkle(`${bugun.slice(0, 7)}-01`, -1) });   // geçen ayın son günü
  if (bugun.slice(5, 7) === '01') l.push({ tur: 'yillik', gun: `${+bugun.slice(0, 4) - 1}-12-31` });
  return l;
}

/** Express: GET /api/rapor/liste · GET /api/rapor?tur=&bas= · POST /api/rapor/olustur { tur, gun } (masaüstü; telefonda 403). */
function router(m) {
  const express = require('express');
  const r = express.Router();
  r.get('/api/rapor/liste', (req, res) => res.json({ success: true, raporlar: m.liste() }));
  r.get('/api/rapor', (req, res) => {
    const q = req.query || {};
    const l = m.liste();
    const tur = turNormal(q.tur);
    const gecerli = /^\d{4}-\d{2}-\d{2}$/.test(String(q.bas || ''));
    // Haftalık/aylık/yıllık istekte dönemin herhangi bir günü dönem başına (pazartesi / ayın 1'i / 1 Ocak) çevrilir.
    const hedef = gecerli ? { tur, bas: aralik(tur, String(q.bas)).bas } : l.find(x => x.tur === tur);
    if (!hedef) return res.json({ success: true, rapor: null, raporlar: l });
    res.json({ success: true, rapor: m.oku(hedef.tur, hedef.bas), raporlar: l });
  });
  r.post('/api/rapor/olustur', express.json({ limit: '2kb' }), async (req, res) => {
    try {
      const b = req.body || {};
      const gun = /^\d{4}-\d{2}-\d{2}$/.test(String(b.gun || '')) ? String(b.gun) : gunEkle(gunStr(new Date()), -1);
      const rapor = await m.olustur(turNormal(b.tur), gun, { telegram: b.telegram === true });
      res.json({ success: true, rapor, raporlar: m.liste() });
    } catch (e) { res.status(500).json({ success: false, error: String(e.message).slice(0, 300) }); }
  });
  return r;
}

module.exports = { raporKur, telegramMetni, baslikMetni, aralik, egriDegisim, bekleyenDonemler, turNormal, olusturucu, router, SAAT, TURLER, TUR_AD, TAZE_GUN, TELEGRAM_TURLERI, SAYFA_BOYU };
