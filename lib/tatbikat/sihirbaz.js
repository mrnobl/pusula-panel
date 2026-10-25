'use strict';
/**
 * D3 TATBİKAT SİHİRBAZI (TASARIM-MAKINE-HESAP-BOT §8.4, rota Sistem › Tatbikatlar) — elle provaları Pusula adım adım yönetir.
 * ═══════════════════════════════════════════════════════════════════════════
 * KALICI DURUM MAKİNESİ: <veri>/tatbikat/sihirbaz.json. Pusula yeniden açılınca kaldığı adımdan sürer (prova 2 ve 4 bunu gerektirir:
 * kullanıcı Pusula'yı / bilgisayarı kapatır; yeni süreç açılışı `acilislar`a { acilis, oncekiNabiz } olarak yazılır).
 * Akış: baslat({prova, bot}) → önkoşullar (zorunlular geçmeli) → kullanıcı adımları ("Yaptım" = adim({id})) → gözlem (tik(): 30 sn'de bir
 * doğrulayıcılar kayıtları okur) → önerilen hüküm → kaydet({hukum, not}) ya da iptal().
 *
 * SİHİRBAZ HİÇBİR ŞEY YAPTIRMAZ: emir vermez, bot ayarı değiştirmez, botu başlatmaz/durdurmaz, süreç kapatmaz, PowerShell/cmd açmaz;
 * yalnız kendi klasörüne (sihirbaz.json, sonuclar.jsonl) ve sonuçta botun prova günlüğüne yazar.
 *
 * PROVA GÜNLÜĞÜ (Kairos demo kabulü — biçim DEĞİŞMEZ): demo modundaki botta ve demo kabul numarası olan provada sonuç
 * <bot dizini>/prova-gunlugu.json `provalar` dizisine MEVCUT biçimle EKLENİR: { no, bas, bit, adimlar, gozlenen, sure, hukum: 'geçti'|'geçmedi' }
 * (demoKabulRapor.provaYukle aynen okur; scripts/demo-kabul-rapor.js --prova-sablon ile aynı alanlar). `bas` = provanın başladığı an,
 * `bit` = doğrulamanın bittiği an (kayıt anı değil — prova aralığı ölçümden doğru hariç tutulsun). Var olan alanlar ve satırlar korunur;
 * dosya bozuksa ÜZERİNE YAZILMAZ (kayıt reddedilir, prova açık kalır). Kâğıt botta ve 7 (makine devri) yalnız sonuclar.jsonl.
 * Önerilen hükümden farklı hüküm ancak yazılı açıklamayla kaydedilir (iki hüküm de sonuçta saklanır).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./provalar');

const NABIZ_MS = 30e3;
const OKUMA_TAVAN = 2 * 1024 * 1024;   // kayıt dosyalarının yalnız son 2 MB'ı okunur
const GECMIS_N = 30;

/** Dosyanın son `tavan` baytındaki JSON satırları (bozuk satır atlanır). */
function jsonlSon(dosya, tavan = OKUMA_TAVAN) {
  let fd = null;
  try {
    const st = fs.statSync(dosya);
    const bas = Math.max(0, st.size - tavan);
    fd = fs.openSync(dosya, 'r');
    const buf = Buffer.alloc(st.size - bas);
    fs.readSync(fd, buf, 0, buf.length, bas);
    let metin = buf.toString('utf8');
    if (bas > 0) metin = metin.slice(metin.indexOf('\n') + 1);
    return metin.split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  } catch { return []; } finally { if (fd != null) try { fs.closeSync(fd); } catch { /* */ } }
}
const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
function jsonYaz(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.gecici`;
  fs.writeFileSync(g, JSON.stringify(o, null, 2), 'utf8');
  fs.renameSync(g, f);
}
const zSay = (x) => (typeof x === 'number' ? x : Date.parse(x));

/**
 * Prova günlüğüne bir satır EKLER (biçim: demoKabulRapor PROVA_SABLON). Bozuk dosyanın üzerine yazmaz (hata atar).
 * @returns eklenen satır
 */
function provaGunlugunaEkle(dosya, satir) {
  let p = {};
  if (fs.existsSync(dosya)) {
    const ham = fs.readFileSync(dosya, 'utf8').replace(/^﻿/, '');
    p = JSON.parse(ham);   // bozuksa atar — üzerine YAZILMAZ
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('prova günlüğü beklenen biçimde değil');
  }
  const s = { no: satir.no, bas: satir.bas, bit: satir.bit, adimlar: satir.adimlar, gozlenen: satir.gozlenen, sure: satir.sure, hukum: satir.hukum };
  p.provalar = [...(Array.isArray(p.provalar) ? p.provalar : []), s];
  jsonYaz(dosya, p);
  return s;
}

/**
 * @param o.dizin <veri>/tatbikat
 * @param o.kaynaklar {
 *   botlar(): [{ ad, adGorunen, mod, dizin, ozet() → obj|null, kayitEngel() → null|{kod,metin}, tasinabilir() → null|{kod,metin} }],
 *   ozDenetim(): null | { dizin, kesintiBas }, acilis(): bu sürecin açılış anı (ms), bildirimGecmis: dosya, supervisorDosya: dosya,
 *   demoGun(ad): number|null, makineVar(): bool }
 * @param o.bildir async (baslik, satirlar) — Telegram (tür tatbikat); o.log(lv, metin); o.simdi; o.arastirma (geliştirme kopyası: başlatılamaz)
 */
function olustur(o = {}) {
  const dizin = o.dizin;
  const DURUM = path.join(dizin, 'sihirbaz.json');
  const SONUC = path.join(dizin, 'sonuclar.jsonl');
  const kay = o.kaynaklar || {};
  const simdi = o.simdi || Date.now;
  const log = o.log || (() => {});
  const bildir = o.bildir || (async () => null);

  let st = jsonOku(DURUM) || {};
  if (!st || typeof st !== 'object') st = {};
  st = { surum: 1, etkin: st.etkin || null };
  const kaydetDurum = () => { try { jsonYaz(DURUM, st); } catch (e) { log('WARN', `🧯 Tatbikat durumu yazılamadı: ${e.message}`); } };

  const botlar = () => { try { return (kay.botlar && kay.botlar()) || []; } catch { return []; } };
  const botBul = (ad) => botlar().find(b => b.ad === ad) || null;
  const guvenli = (f, v = null) => { try { return f(); } catch { return v; } };

  /** Doğrulayıcının bağlamı: botun anlık özeti + kayıt okuyucuları (yalnız `since` sonrası). */
  function baglam(bot, ek = {}) {
    const z = simdi();
    const oz = bot ? guvenli(() => bot.ozet()) : null;
    const ozd = guvenli(() => (kay.ozDenetim ? kay.ozDenetim() : null));
    const bd = bot && bot.dizin;
    const sonra = (l, t, zf = (x) => x.zaman) => (l || []).filter(x => x && zSay(zf(x)) >= (t || 0) - 1000);
    return {
      simdi: z,
      bot: bot ? { ad: bot.ad, adGorunen: bot.adGorunen || bot.ad, mod: bot.mod, dizin: bd, ozet: oz,
        kayitEngel: guvenli(() => (bot.kayitEngel ? bot.kayitEngel() : null)), tasinabilir: guvenli(() => (bot.tasinabilir ? bot.tasinabilir() : null)) } : null,
      ozDenetim: ozd, demoGun: bot ? guvenli(() => kay.demoGun(bot.ad)) : null, makineVar: !!guvenli(() => kay.makineVar()),
      supervisorVar: !!(kay.supervisorDosya && fs.existsSync(kay.supervisorDosya)),
      oku: {
        koruma: (t) => (bd ? sonra(jsonlSon(path.join(bd, 'koruma.jsonl')), t) : []),
        mutabakat: (t) => (bd ? sonra(jsonlSon(path.join(bd, 'mutabakat.jsonl')), t) : []),
        alarmlar: (t) => (bd ? sonra(jsonlSon(path.join(bd, 'alarmlar.jsonl')), t) : []),
        emirler: (t) => (bd ? sonra(jsonlSon(path.join(bd, 'emirler.jsonl')), t, (x) => x.guncelleme || x.olusturma || 0) : []),
        bildirim: (t) => (kay.bildirimGecmis ? sonra(jsonlSon(kay.bildirimGecmis), t, (x) => x.zaman) : []),
        ozOlaylar: (t) => (ozd && ozd.dizin ? sonra(jsonlSon(path.join(ozd.dizin, 'olaylar.jsonl')), t) : []),
        acilislar: () => {
          if (!ozd || !ozd.dizin) return [];
          let l = [];
          try { l = fs.readFileSync(path.join(ozd.dizin, 'acilislar.jsonl'), 'utf8').split('\n').filter(Boolean); } catch { return []; }
          return l.map(s => { if (s[0] === '{') { try { const j = JSON.parse(s); return { z: +j.z, p: !!j.p }; } catch { return null; } } const n = Number(s); return Number.isFinite(n) ? { z: n, p: false } : null; }).filter(Boolean);
        },
        supervisor: (t) => {
          if (!kay.supervisorDosya) return [];
          try { return sonra(require('../ileri/demoKabulRapor').supervisorOku(kay.supervisorDosya), t); } catch { return []; }
        },
      },
      ...ek,
    };
  }

  /** Bir bot için bir provanın önkoşulları (mod kapsamı dahil). */
  function onkosul(prova, bot) {
    if (!prova || !bot) return [{ ad: 'Bot', tamam: false, metin: 'bot bulunamadı', zorunlu: true }];
    if (bot.mod === 'canli') return [{ ad: 'Kâğıt ya da demo hesap', tamam: false, metin: 'canlı hesap botlarında tatbikat bu sürümde kapalı', zorunlu: true }];
    if (!prova.modlar.includes(bot.mod)) return [{ ad: 'Hesap türü', tamam: false, metin: `bu prova ${prova.modlar.join(' / ')} hesaptaki botta yapılır`, zorunlu: true }];
    return prova.onkosul(baglam(bot));
  }
  const onkosulTamam = (l) => l.every(x => x.tamam || !x.zorunlu);

  function provaGunluguYazilirMi(prova, bot) { return !!(prova && prova.demoNo && bot && bot.mod === 'demo' && bot.dizin); }

  /** Etkin provanın tavanı (ms): tanımın tavanAdim'ından (yoksa başlangıçtan) + tavanMs; tavanFn varsa o. */
  function tavan(prova, e) {
    if (prova.tavanFn) { const t = prova.tavanFn(e); if (Number.isFinite(t)) return t; }
    const bas = (prova.tavanAdim && e.adimlar && e.adimlar[prova.tavanAdim]) || (prova.tavanAdim ? null : e.bas);
    return Number.isFinite(bas) ? bas + prova.tavanMs : null;
  }

  /** Etkin provanın görünümü (+ doğrulamaları hesaplar; `yaz` ise durumu günceller). */
  function etkinHesapla() {
    const e = st.etkin;
    if (!e) return null;
    const prova = P.BUL(e.prova);
    const bot = botBul(e.bot);
    if (!prova) return { ...e, hata: 'bilinmeyen prova' };
    const b = baglam(bot);
    const adimlar = (prova.adimlar(b) || []).map(a => ({ ...a, yapildi: (e.adimlar || {})[a.id] || null }));
    const sira = adimlar.findIndex(a => a.tur === 'kullanici' && !a.yapildi);
    const aktifAdim = sira >= 0 ? adimlar[sira].id : (adimlar.find(a => a.tur === 'gozlem') || {}).id || null;
    const gozlemde = sira < 0;
    let dogrulamalar = [], oneri = { hukum: null };
    if (bot && (gozlemde || prova.kimlik === 'makine-devri')) {
      if (prova.gozlemGuncelle) prova.gozlemGuncelle(b, e);
      dogrulamalar = prova.dogrula(b, e) || [];
      oneri = gozlemde ? P.hukumOner(dogrulamalar, { simdi: b.simdi, tavan: tavan(prova, e) }) : { hukum: null };
      dogrulamalar = oneri.dogrulamalar || dogrulamalar;
    }
    if (oneri.hukum && !e.tamamZaman) {
      const kanit = dogrulamalar.map(x => x.z).filter(Number.isFinite);
      e.tamamZaman = oneri.zamanAsimi ? (tavan(prova, e) || b.simdi) : Math.min(b.simdi, Math.max(e.bas, ...kanit));
    } else if (!oneri.hukum && e.tamamZaman) delete e.tamamZaman;   // kanıt geri alındı (ör. dosya değişti) — sürüyor
    const tv = tavan(prova, e);
    return { kimlik: e.kimlik, prova: prova.kimlik, no: prova.no, demoNo: prova.demoNo, ad: prova.ad, amac: prova.amac, bot: e.bot, botAd: bot ? bot.adGorunen : e.bot,
      botVar: !!bot, mod: bot ? bot.mod : null, bas: e.bas, sembol: e.sembol || null, adimlar, aktifAdim, gozlemde, dogrulamalar, onerilen: oneri.hukum, zamanAsimi: !!oneri.zamanAsimi,
      tavan: tv, kalanMs: Number.isFinite(tv) ? Math.max(0, tv - b.simdi) : null, tamamZaman: e.tamamZaman || null,
      provaGunlugu: provaGunluguYazilirMi(prova, bot), acilislar: e.acilislar || [], onkosul: e.onkosul || [],
      stopSembolleri: Object.keys((b.bot && b.bot.ozet && b.bot.ozet.koruma && b.bot.ozet.koruma.stoplar) || {}) };
  }

  /** 30 sn'de bir (ve açılışta): yeni süreç açılışını kaydeder, nabzı yazar, doğrulamaları yeniler. */
  function tik() {
    const e = st.etkin;
    if (!e) return null;
    const ac = guvenli(() => kay.acilis(), null);
    e.acilislar = Array.isArray(e.acilislar) ? e.acilislar : [];
    if (Number.isFinite(ac) && ac > e.bas && !e.acilislar.some(a => a.acilis === ac)) {
      e.acilislar.push({ acilis: ac, oncekiNabiz: e.sonNabiz || null });
      e.acilislar = e.acilislar.slice(-10);
      log('INFO', `🧯 Tatbikat sürüyor (${e.prova}, ${e.bot}): Pusula yeniden açıldı — kaldığı adımdan devam`);
    }
    e.sonNabiz = simdi();
    const v = etkinHesapla();
    kaydetDurum();
    return v;
  }

  function sonuclarOku(n = GECMIS_N) { return jsonlSon(SONUC, 1024 * 1024).slice(-n).reverse(); }

  function baslat({ prova: pk, bot: ad } = {}) {
    if (o.arastirma) return { ok: false, kod: 'arastirma', hata: 'Bu bilgisayar araştırma kopyası — tatbikatlar botların çalıştığı sunucuda yapılır (sunucunun panelinden).' };
    if (st.etkin) return { ok: false, kod: 'suruyor', hata: `Zaten süren bir tatbikat var (${(P.BUL(st.etkin.prova) || {}).ad || st.etkin.prova}). Önce sonucunu kaydedin ya da iptal edin.` };
    const prova = P.BUL(pk);
    if (!prova) return { ok: false, kod: 'prova', hata: 'bilinmeyen prova' };
    const bot = botBul(ad);
    if (!bot) return { ok: false, kod: 'bot', hata: 'bilinmeyen bot' };
    const ko = onkosul(prova, bot);
    if (!onkosulTamam(ko)) return { ok: false, kod: 'onkosul', hata: `Önkoşul sağlanmıyor: ${ko.filter(x => x.zorunlu && !x.tamam).map(x => `${x.ad} (${x.metin})`).join(' · ')}`, onkosul: ko };
    const z = simdi();
    st.etkin = { kimlik: crypto.randomBytes(6).toString('hex'), prova: prova.kimlik, bot: bot.ad, bas: z, adimlar: {}, gozlem: {}, sonNabiz: z, acilislar: [],
      onkosul: ko.map(x => ({ ad: x.ad, tamam: x.tamam, metin: x.metin, zorunlu: x.zorunlu })) };
    kaydetDurum();
    log('INFO', `🧯 Tatbikat başladı: ${prova.ad} — ${bot.adGorunen || bot.ad}`);
    return { ok: true, etkin: tik() };
  }

  function adim({ id, sembol } = {}) {
    const e = st.etkin;
    if (!e) return { ok: false, hata: 'süren tatbikat yok' };
    const v = etkinHesapla();
    const a = (v.adimlar || []).find(x => x.id === id);
    if (!a || a.tur !== 'kullanici') return { ok: false, hata: 'bu adım "yaptım" ile geçilmez' };
    if (a.id !== v.aktifAdim) return { ok: false, hata: 'adımları sırayla yapın' };
    const bot = botBul(e.bot);
    if (a.kosul === 'bot-durmus') { const oz = bot ? guvenli(() => bot.ozet()) : null; if (oz && oz.calisiyor) return { ok: false, hata: 'bot hâlâ çalışıyor — önce Botlar\'dan durdurun' }; }
    if (a.kosul === 'tasindi') { const ke = bot ? guvenli(() => (bot.kayitEngel ? bot.kayitEngel() : null)) : null; if (!ke) return { ok: false, hata: 'bot hâlâ bu makinede görünüyor — taşıma bitince basın' }; }
    if (a.sembolSor) {
      const l = (bot && guvenli(() => Object.keys((bot.ozet().koruma || {}).stoplar || {}), [])) || [];
      if (sembol && !l.some(s => s.split(':')[0] === String(sembol).split(':')[0])) return { ok: false, hata: 'seçilen sembolde Pusula\'nın stopu yok' };
      if (sembol) e.sembol = String(sembol).slice(0, 40);
    }
    e.adimlar = { ...(e.adimlar || {}), [id]: simdi() };
    kaydetDurum();
    return { ok: true, etkin: tik() };
  }

  /** Sonucu kaydeder: sonuclar.jsonl (+ demo kabul provasıysa prova günlüğü) + Telegram. */
  async function kaydet({ hukum, not } = {}) {
    const e = st.etkin;
    if (!e) return { ok: false, hata: 'süren tatbikat yok' };
    if (!['geçti', 'geçmedi'].includes(hukum)) return { ok: false, hata: 'hüküm "geçti" ya da "geçmedi" olmalı' };
    const v = etkinHesapla();
    if (!v.gozlemde) return { ok: false, hata: 'önce adımları tamamlayın (ya da tatbikatı iptal edin)' };
    const aciklama = String(not || '').trim().slice(0, 500);
    if (v.onerilen !== hukum && aciklama.length < 10) return { ok: false, kod: 'aciklama', hata: v.onerilen ? `Pusula'nın önerisi "${v.onerilen}". Farklı hüküm için kısa bir açıklama yazın (en az 10 harf).` : 'Doğrulama henüz bitmedi. Şimdi kaydetmek için kısa bir açıklama yazın (en az 10 harf).' };
    const prova = P.BUL(e.prova);
    const bot = botBul(e.bot);
    const z = simdi();
    const bit = v.tamamZaman || z;
    const adimMetni = `Pusula tatbikat sihirbazı · ${v.adimlar.filter(a => a.yapildi).map(a => `${a.baslik} (${P.saat(a.yapildi)})`).join(' → ') || v.adimlar.map(a => a.baslik).join(' → ')}${e.sembol ? ` · sembol ${e.sembol.split(':')[0]}` : ''}`;
    const gozlenen = [...v.dogrulamalar.map(x => `${x.durum === 'gecti' ? '✓' : x.durum === 'kaldi' ? '✗' : x.durum === 'bilgi' ? 'ℹ' : '…'} ${x.ad}: ${x.metin}`), aciklama ? `Not: ${aciklama}` : null, v.onerilen && v.onerilen !== hukum ? `Pusula önerisi: ${v.onerilen}` : null].filter(Boolean).join(' · ');
    const satir = { no: prova.demoNo || prova.no, bas: new Date(e.bas).toISOString(), bit: new Date(Math.max(bit, e.bas)).toISOString(), adimlar: adimMetni.slice(0, 1000), gozlenen: gozlenen.slice(0, 2000), sure: P.sure(Math.max(bit, e.bas) - e.bas), hukum };
    let gunluk = null;
    if (provaGunluguYazilirMi(prova, bot)) {
      const dosya = path.join(bot.dizin, 'prova-gunlugu.json');
      try { provaGunlugunaEkle(dosya, satir); gunluk = dosya; } catch (err) {
        return { ok: false, kod: 'prova-gunlugu', hata: `Prova günlüğüne yazılamadı (${err.message}) — dosya korunuyor, tatbikat açık kaldı. Dosyayı düzeltip yeniden deneyin.` };
      }
    }
    const kayit = { z, tur: 'elle', kimlik: e.kimlik, prova: prova.kimlik, no: prova.no, demoNo: prova.demoNo, ad: prova.ad, bot: e.bot, mod: bot ? bot.mod : null,
      bas: e.bas, bit: Math.max(bit, e.bas), sure: satir.sure, hukum, onerilen: v.onerilen, not: aciklama || null, sembol: e.sembol || null,
      dogrulamalar: v.dogrulamalar.map(x => ({ kimlik: x.kimlik, ad: x.ad, durum: x.durum, metin: String(x.metin).slice(0, 240), zorunlu: x.zorunlu })),
      adimlar: v.adimlar.map(a => ({ id: a.id, baslik: a.baslik, yapildi: a.yapildi })), provaGunlugu: gunluk ? path.basename(path.dirname(gunluk)) : null };
    try { fs.mkdirSync(dizin, { recursive: true }); fs.appendFileSync(SONUC, JSON.stringify(kayit) + '\n', 'utf8'); } catch (err) { log('WARN', `🧯 Tatbikat sonucu yazılamadı: ${err.message}`); }
    st.etkin = null;
    kaydetDurum();
    log(hukum === 'geçti' ? 'SUCCESS' : 'WARN', `🧯 Tatbikat bitti: ${prova.ad} — ${bot ? bot.adGorunen : e.bot}: ${hukum}${gunluk ? ' (prova günlüğüne yazıldı)' : ''}`);
    try {
      await bildir(`Tatbikat: ${prova.ad} — ${bot ? bot.adGorunen : e.bot}: ${hukum === 'geçti' ? 'GEÇTİ' : 'GEÇMEDİ'}`, [
        `Süre ${satir.sure} · ${kayit.dogrulamalar.filter(x => x.durum === 'gecti').length}/${kayit.dogrulamalar.length} doğrulama geçti`,
        ...kayit.dogrulamalar.filter(x => x.durum === 'kaldi').slice(0, 4).map(x => `✗ ${x.ad}: ${x.metin}`),
        gunluk ? 'Sonuç demo kabul prova günlüğüne eklendi.' : null, 'Ayrıntı: Pusula › Sistem › Tatbikatlar.'].filter(Boolean));
    } catch { /* bildirim tatbikatı bozmaz */ }
    return { ok: true, sonuc: kayit, provaGunlugu: !!gunluk };
  }

  function iptal({ neden } = {}) {
    const e = st.etkin;
    if (!e) return { ok: false, hata: 'süren tatbikat yok' };
    const prova = P.BUL(e.prova);
    const kayit = { z: simdi(), tur: 'elle', kimlik: e.kimlik, prova: e.prova, no: prova ? prova.no : null, demoNo: prova ? prova.demoNo : null, ad: prova ? prova.ad : e.prova, bot: e.bot,
      bas: e.bas, bit: simdi(), hukum: null, iptal: true, not: String(neden || '').slice(0, 300) || null, adimlar: Object.keys(e.adimlar || {}) };
    try { fs.mkdirSync(dizin, { recursive: true }); fs.appendFileSync(SONUC, JSON.stringify(kayit) + '\n', 'utf8'); } catch { /* */ }
    st.etkin = null;
    kaydetDurum();
    log('INFO', `🧯 Tatbikat iptal edildi: ${kayit.ad} — ${e.bot} (prova günlüğüne yazılmadı)`);
    return { ok: true, sonuc: kayit };
  }

  /** Kairos demo kabul prova günlüğünün durumu (salt okuma): her prova yapıldı mı, son hüküm. */
  function demoKabulDurumu() {
    const b = botlar().find(x => x.ad === 'hucum' && x.mod === 'demo');
    if (!b || !b.dizin) return null;
    let p = null;
    try { p = require('../ileri/demoKabulRapor').provaYukle(path.join(b.dizin, 'prova-gunlugu.json')); } catch { p = null; }
    const E = require('../ileri/demoKabulEsikleri');
    return { bot: b.ad, adGorunen: b.adGorunen || b.ad, dosyaVar: !!(p && p.var), gun: guvenli(() => kay.demoGun(b.ad)),
      provalar: E.PROVALAR.map(x => { const l = p ? p.provalar.filter(y => +y.no === x.no) : []; const son = l[l.length - 1]; return { no: x.no, ad: x.ad, zorunlu: x.zorunlu, sonra: x.sonra || null, yapildi: l.length > 0, hukum: son ? son.hukum || null : null, bit: son ? son.bit : null, ertelenen: P.ERTELENEN.includes(x.no) }; }) };
  }

  /** GET /api/tatbikat gövdesi. */
  function durum() {
    const bl = botlar();
    return {
      arastirma: !!o.arastirma,
      botlar: bl.map(b => ({ ad: b.ad, adGorunen: b.adGorunen || b.ad, mod: b.mod })),
      provalar: P.PROVALAR.map(p => ({ kimlik: p.kimlik, no: p.no, demoNo: p.demoNo, ad: p.ad, amac: p.amac, olcut: p.olcut, modlar: p.modlar, istegeBagli: !!p.istegeBagli,
        uygunluk: Object.fromEntries(bl.map(b => { const ko = onkosul(p, b); return [b.ad, { tamam: onkosulTamam(ko), onkosul: ko, provaGunlugu: provaGunluguYazilirMi(p, b) }]; })) })),
      etkin: st.etkin ? tik() : null,
      gecmis: sonuclarOku(),
      demoKabul: demoKabulDurumu(),
    };
  }

  return { durum, baslat, adim, kaydet, iptal, tik, onkosul, etkinHesapla, sonuclarOku, demoKabulDurumu, DURUM, SONUC, etkinVar: () => !!st.etkin, NABIZ_MS };
}

module.exports = { olustur, provaGunlugunaEkle, jsonlSon, NABIZ_MS };
