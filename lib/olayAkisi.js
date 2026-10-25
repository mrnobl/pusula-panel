/**
 * B2 OLAY AKIŞI (TASARIM-MAKINE-HESAP-BOT §8.1, PLAN-MAKINE-HESAP-BOT §8 s1; 1 yıl saklama) — bütün olaylar TEK zaman çizelgesinde.
 * ═══════════════════════════════════════════════════════════════════════════
 * KAYNAKLARA DOKUNULMAZ (kullanıcı/ana oturum tercihi: "kaynakları değiştirmeden oku"): hiçbir modüle yazma kancası eklenmez. Bir
 * TOPLAYICI mevcut kayıtları okur, tek biçime çevirir ve <veri>/olaylar/<YYYY-AA>.jsonl ay dosyalarına YALNIZ EKLER. Neden kopya:
 * kaynakların kendi saklama süresi kısa (günlük 30 gün, bildirim geçmişi son 1000 satır, güncelleme geçmişi tavanlı) — akış 1 yıl ister.
 *
 *   Kaynak (okunan dosya)                                  → tür
 *   <bot dizini>/emirler.jsonl (yürütücü defteri)          → emir      (yalnız son durum: DOLDU · RED · BILINMIYOR; MİKTAR YAZILMAZ)
 *   <bot dizini>/alarmlar.jsonl (ENGEL / güvenli kip /      → uyari · durdur (acil durdurma)
 *     kullanıcı aracı / acil olayları; "bildirim" satırları ATLANIR — bildirim geçmişinde zaten var)
 *   günlük (gunluk/<gün>.jsonl) "X botu başlatıldı / durduruldu"  → baslat · durdur
 *   oz-denetim/olaylar.jsonl (sarı/kırmızı geçiş, düzeldi, onarım) → sorun (güvenli kip / tam kapanma bot tarafında zaten var — atlanır)
 *   bildirim-gecmis.jsonl (Telegram/ntfy'a giden her deneme)       → bildirim (makine türü → makine)
 *   ayar-gecmisi/kayit*.jsonl (74.2; sırlar ve tutarlar zaten "•••") → ayar
 *   guncelleme.json `gecmis`                                → guncelleme
 *   oz-denetim/acilislar.jsonl (planlı / beklenmedik açılış) → makine
 *   tasarimci/kararlar.jsonl (model portföy ay sonu kararı)  → karar
 *   tatbikat/sonuclar.jsonl (D3 tatbikat sihirbazı + aylık otomatik denetim) → tatbikat
 *   (tasima · devralma: türler AYRILDI; kaynakları 3c / 4. faz ile gelir)
 * Satır: { z (ms), makine, tur, bot|null, ozet, ayrinti|null, ciddiyet: bilgi|uyari|alarm, kaynak, kimlik (sha256 ilk 12) }.
 * TUTARLAR YAZILMAZ (miktar, bakiye, sermaye): satır eş makineye ve telefona da gider; fiyat ve yüzde yazılır.
 *
 * İMLEÇ (<veri>/olaylar/imlec.json): yalnız eklenen dosyalarda bayt konumu (dosya küçüldüyse baştan), yeniden yazılan kaynaklarda (bildirim
 * geçmişi, güncelleme, kararlar) son zaman. ÇİFT YOK: her satırın kimliği o ayın dosyasındaki kimliklerle karşılaştırılır (taşıma sonrası
 * imleç başka makineden gelse de aynı olay ikinci kez yazılmaz).
 * SAKLAMA: ay dosyaları; 13 aydan eskisi SİLİNİR (yalnız bu klasör, yalnız AAAA-AA.jsonl adlı dosyalar — kaynaklar silinmez).
 * Okuma: `oku({ bas, bit, tur, bot, makine, ara, n, once })` → en yeni önce. Toplayıcı okumadan önce (60 sn'den eskiyse) ve 10 dk'da bir.
 * Bot kodu (lib/live, lib/risk, engine, exchange) ÇAĞRILMAZ ve DEĞİŞMEZ; bu modül yalnız dosya okur ve kendi klasörüne yazar.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DK = 60e3, GUN = 864e5;
const SAKLA_AY = 13;
const TURLER = Object.freeze(['emir', 'karar', 'baslat', 'durdur', 'uyari', 'sorun', 'bildirim', 'ayar', 'guncelleme', 'makine', 'tasima', 'devralma', 'tatbikat']);
const TUR_AD = Object.freeze({ emir: 'Emir', karar: 'Karar', baslat: 'Başlat', durdur: 'Durdur', uyari: 'Uyarı', sorun: 'Sorun', bildirim: 'Bildirim', ayar: 'Ayar',
  guncelleme: 'Güncelleme', makine: 'Makine', tasima: 'Taşıma', devralma: 'Devralma', tatbikat: 'Tatbikat' });
const CIDDIYETLER = ['bilgi', 'uyari', 'alarm'];
const OKUMA_TAVAN_BAYT = 16 * 1024 * 1024;   // tek turda bir dosyadan en çok bu kadar yeni bayt (kalan sonraki tura)
const N_TAVAN = 1000;
const ARALIK_TAVAN_GUN = 400;

const kimlikUret = (...p) => crypto.createHash('sha256').update(p.map(x => String(x == null ? '' : x)).join('|')).digest('hex').slice(0, 12);
const kisalt = (s, n = 200) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const ayAdi = (z) => new Date(z).toISOString().slice(0, 7);
const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);

/** Saf: ham alanlar → olay satırı (kimlik verilmezse zaman + tür + özetten). Geçersizse null. */
function olay(o) {
  const z = Number(o && o.z);
  if (!Number.isFinite(z) || z <= 0 || !TURLER.includes(o.tur)) return null;
  const ozet = kisalt(o.ozet, 240);
  if (!ozet) return null;
  const s = { z, makine: kisalt(o.makine || '', 60) || null, tur: o.tur, bot: o.bot ? kisalt(o.bot, 40) : null, ozet,
    ayrinti: o.ayrinti ? kisalt(o.ayrinti, 400) : null, ciddiyet: CIDDIYETLER.includes(o.ciddiyet) ? o.ciddiyet : 'bilgi', kaynak: kisalt(o.kaynak || '', 40) || null };
  s.kimlik = o.kimlik ? String(o.kimlik).slice(0, 24) : kimlikUret(s.kaynak, z, s.tur, s.bot, ozet);
  return s;
}

// ── Kaynak çeviricileri (SAF; test edilir) ───────────────────────────────────
const EMIR_SON = { DOLDU: 'doldu', RED: 'borsa reddetti', BILINMIYOR: 'sonucu belirsiz (sorgulanıyor)' };
const TIP_AD = { market: 'piyasa', limit: 'limit', stop_market: 'stop', STOP_MARKET: 'stop', take_profit_market: 'kâr al' };
/** Saf: yürütücü emir defteri satırı → emir olayı | null (ara durumlar atlanır). Miktar yazılmaz. */
function emirOlayi(x, { bot, makine } = {}) {
  if (!x || !x.id || !EMIR_SON[x.durum]) return null;
  const sembol = String(x.symbol || '?').split(':')[0];
  const yon = x.side === 'sell' ? 'satış' : x.side === 'buy' ? 'alış' : String(x.side || '');
  const fiyat = sayiMi(x.ortFiyat) && x.ortFiyat > 0 ? x.ortFiyat : (sayiMi(x.price) && x.price > 0 ? x.price : null);
  return olay({ z: x.guncelleme || x.olusturma, makine, tur: 'emir', bot, kaynak: 'emir-defteri', kimlik: kimlikUret('emir', bot, x.id, x.durum),
    ozet: `${sembol} ${yon}${x.reduceOnly ? ' (kapatma)' : ''} · ${TIP_AD[x.type] || x.type || 'emir'} · ${EMIR_SON[x.durum]}`,
    ayrinti: [fiyat ? `fiyat ${fiyat}` : null, x.ortam ? `hesap ${x.ortam}` : null, x.hata ? `neden: ${x.hata}` : null, `emir ${x.id}`].filter(Boolean).join(' · '),
    ciddiyet: x.durum === 'DOLDU' ? 'bilgi' : 'uyari' });
}

const ALARM_OLAY = {
  'engel': ['uyari', 'alarm', 'Bot kendini durdurdu (ENGEL)'],
  'engel-kalkti': ['uyari', 'bilgi', 'ENGEL kendiliğinden kalktı'],
  'engel-kaldir': ['uyari', 'bilgi', 'ENGEL elle kaldırıldı (kullanıcı onayı)'],
  'guvenli-kip': ['uyari', 'uyari', 'Güvenli kip: günlük karar ertelendi'],
  'guvenli-kip-kalkti': ['uyari', 'bilgi', 'Güvenli kip bitti'],
  'kullanici-araci': ['uyari', 'bilgi', 'Sorun aracı uygulandı'],
  'acil-durdurma': ['durdur', 'alarm', 'ACİL DURDURMA'],
  'acil-deneme': ['uyari', 'bilgi', 'Acil durdurma denemesi'],
};
/** Saf: bot alarmlar.jsonl satırı → olay | null ("bildirim" satırları bildirim geçmişinde zaten var). */
function alarmOlayi(x, { bot, makine } = {}) {
  if (!x || !ALARM_OLAY[x.olay]) return null;
  const [tur, ciddiyet, baslik] = ALARM_OLAY[x.olay];
  let ayrinti = x.metin || null;
  if (x.olay === 'acil-durdurma') ayrinti = [x.sebep ? `sebep: ${x.sebep}` : null, Number.isFinite(+x.kapatilan) ? `${x.kapatilan} pozisyon kapatıldı` : null, Array.isArray(x.hatalar) && x.hatalar.length ? `${x.hatalar.length} hata` : null].filter(Boolean).join(' · ');
  if (x.olay === 'acil-deneme') ayrinti = `${x.basarili ? 'başarılı' : 'BAŞARISIZ'} · mutabakat ${x.mutabakat || '—'}`;
  return olay({ z: x.zaman, makine, tur, bot, kaynak: 'bot-alarm', ciddiyet: x.olay === 'acil-deneme' && !x.basarili ? 'uyari' : ciddiyet,
    kimlik: kimlikUret('alarm', bot, x.zaman, x.olay, x.kaynak, x.metin || x.sebep),
    ozet: `${baslik}${x.kaynak && x.olay !== 'acil-durdurma' ? ` (${x.kaynak})` : ''}`, ayrinti });
}

const BOT_YASAM = /^(.+?) botu (başlatıldı|durduruldu)(?=\s|$|[(.,:])/;   // \b ASCII dışı harften (ı) sonra çalışmaz
/** Saf: günlük satırı { t, s, k, b, m } → başlat/durdur olayı | null. `botBul(görünenAd)` → kimlik (yoksa görünen ad). */
function gunlukOlayi(x, { makine, botBul } = {}) {
  const m = x && typeof x.m === 'string' ? BOT_YASAM.exec(x.m) : null;
  if (!m) return null;
  const ad = m[1].trim();
  const bot = (typeof botBul === 'function' && botBul(ad)) || ad;
  const baslat = m[2] === 'başlatıldı';
  return olay({ z: Date.parse(x.t), makine, tur: baslat ? 'baslat' : 'durdur', bot, kaynak: 'gunluk', kimlik: kimlikUret('gunluk', x.t, x.m),
    ozet: `${ad} botu ${baslat ? 'başlatıldı' : 'durduruldu'}`, ayrinti: kisalt(x.m.slice(m[0].length).replace(/^[\s(]+|[)\s]+$/g, '').replace(/sermaye tavanı [^·)]+·?\s*/i, ''), 300) || null, ciddiyet: 'bilgi' });
}

const OZ_ALINAN = { uyari: ['uyari', 'sarıya döndü'], hata: ['alarm', 'kırmızıya döndü'], duzeldi: ['bilgi', 'düzeldi'], onarildi: ['bilgi', 'kendisi onardı'], onarilamadi: ['uyari', 'onaramadı'] };
/** Saf: öz denetim olaylar.jsonl satırı → sorun olayı | null (güvenli kip, tam kapanma, kara kutu, onay bot kayıtlarında zaten var). */
function ozDenetimOlayi(x, { makine } = {}) {
  if (!x || !OZ_ALINAN[x.tur]) return null;
  const [ciddiyet, fiil] = OZ_ALINAN[x.tur];
  return olay({ z: x.zaman, makine, tur: 'sorun', bot: x.bot || null, kaynak: 'oz-denetim', ciddiyet, kimlik: kimlikUret('oz', x.zaman, x.kimlik, x.tur),
    ozet: `Öz denetim · ${x.kimlik || 'denetim'}: ${fiil}`, ayrinti: x.metin || null });
}

const BILDIRIM_CIDDIYET = { acil: 'alarm', koruma: 'alarm', engel: 'alarm', guvenlik: 'alarm', hata: 'alarm', alarm: 'alarm', uyari: 'uyari', ileri: 'uyari', anahtar: 'uyari', makine: 'uyari', fiyat: 'uyari', yedek: 'uyari' };
const BILDIRIM_SONUC = { gonderildi: 'gönderildi', kapali: 'tür kapalı — gönderilmedi', hata: 'GÖNDERİLEMEDİ', bekletildi: 'sessiz saatte bekletildi', dusuruldu: 'sessiz saatte düşürüldü' };
/** Saf: bildirim geçmişi satırı → olay | null. `botBul(metin)` başlıktaki bot adını kimliğe çevirir. */
function bildirimOlayi(x, { makine, botBul } = {}) {
  if (!x || !x.zaman || !x.baslik) return null;
  const tur = x.tur === 'makine' ? 'makine' : 'bildirim';
  return olay({ z: Date.parse(x.zaman), makine, tur, bot: (typeof botBul === 'function' && botBul(String(x.baslik))) || null, kaynak: 'bildirim',
    ciddiyet: x.sonuc === 'hata' ? 'uyari' : (BILDIRIM_CIDDIYET[x.tur] || 'bilgi'), kimlik: kimlikUret('bildirim', x.zaman, x.tur, x.baslik),
    ozet: x.baslik, ayrinti: [`tür ${x.tur || '—'}`, BILDIRIM_SONUC[x.sonuc] || x.sonuc, x.kanal && x.kanal !== 'telegram' ? `kanal ${x.kanal}` : null, x.hata ? `hata: ${x.hata}` : null].filter(Boolean).join(' · ') });
}

const degerMetni = (v) => (v == null ? '(yok)' : typeof v === 'object' ? kisalt(JSON.stringify(v), 60) : kisalt(String(v), 60));
const KAYNAK_AD = { panel: 'panel', telefon: 'telefon', telegram: 'Telegram', arac: 'araç', sistem: 'sistem' };
/** Saf: ayar geçmişi satırı → ayar olayı (sırlar ve tutarlar kayıtta zaten "•••"). */
function ayarOlayi(x, { makine } = {}) {
  if (!x || !x.z || !Array.isArray(x.degisiklikler) || !x.degisiklikler.length) return null;
  const d = x.degisiklikler;
  const parca = (c) => (c.sir || c.gizli ? `${c.yol} değişti` : `${c.yol}: ${degerMetni(c.eskiYok ? null : c.eski)} → ${degerMetni(c.yeniYok ? null : c.yeni)}`);
  return olay({ z: Date.parse(x.z), makine: (x.makine && x.makine.ad) || makine, tur: 'ayar', bot: null, kaynak: 'ayar-gecmisi', kimlik: kimlikUret('ayar', x.id || x.z),
    ozet: `${x.geriAlinan ? 'Geri alındı · ' : ''}${parca(d[0])}${d.length > 1 ? ` (+${d.length - 1} değişiklik)` : ''}`,
    ayrinti: [`${x.tur || 'ayar'} · ${KAYNAK_AD[x.kaynak] || x.kaynak || '—'}${x.uc ? ` · ${x.uc}` : ''}`, ...d.slice(1, 4).map(parca)].join(' · '), ciddiyet: 'bilgi' });
}

const GUNCELLEME_AD = { kuruldu: 'kuruldu', 'onay-bekliyor': 'onay bekliyor', elle: 'elle bakılmalı', 'geri-alindi': 'GERİ ALINDI', hata: 'hata', 'ag-hatasi': 'GitHub\'a ulaşılamadı',
  kuruluyor: 'kuruluyor', 'kademe-bekliyor': 'kademeli güncelleme sırası bekleniyor', bekliyor: 'karar penceresi bekleniyor', gelistirme: 'geliştirme bilgisayarı (kurulmaz)' };
/** Saf: guncelleme.json `gecmis` satırı → güncelleme olayı. */
function guncellemeOlayi(x, { makine } = {}) {
  if (!x || !x.zaman || !x.durum) return null;
  return olay({ z: Date.parse(x.zaman), makine, tur: 'guncelleme', bot: null, kaynak: 'guncelleme', kimlik: kimlikUret('guncelleme', x.zaman, x.durum, x.hedef),
    ozet: `Güncelleme${x.surum ? ` ${x.surum}` : ''}: ${GUNCELLEME_AD[x.durum] || x.durum}`, ayrinti: [x.neden, x.hedef ? `commit ${String(x.hedef).slice(0, 10)}` : null].filter(Boolean).join(' · ') || null,
    ciddiyet: /geri-alindi|hata|elle/.test(x.durum) ? 'uyari' : 'bilgi' });
}

/** Saf: acilislar.jsonl satırı (sayı ya da { z, p }) → makine olayı. */
function acilisOlayi(satir, { makine } = {}) {
  let z = null, planli = false;
  if (typeof satir === 'number') z = satir;
  else if (satir && typeof satir === 'object') { z = Number(satir.z); planli = satir.p === 1; }
  if (!Number.isFinite(z)) return null;
  return olay({ z, makine, tur: 'makine', bot: null, kaynak: 'acilis', kimlik: kimlikUret('acilis', makine, z),
    ozet: planli ? 'Pusula yeniden açıldı (planlı: durdur / güncelleme)' : 'Pusula açıldı', ayrinti: planli ? null : 'Planlı kapanış işareti yoktu — elektrik, çökme ya da bilgisayar yeniden başlatılmış olabilir.', ciddiyet: planli ? 'bilgi' : 'uyari' });
}

/** Saf: model portföy karar satırı → karar olayı. */
function kararOlayi(x, { makine, adFn } = {}) {
  if (!x || x.tur !== 'karar' || !x.model || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.kararGunu || ''))) return null;
  const ad = (typeof adFn === 'function' && adFn(x.model)) || x.model;
  const n = Array.isArray(x.liste) ? x.liste.length : 0;
  return olay({ z: Date.parse(`${x.kararGunu}T21:00:00Z`), makine, tur: 'karar', bot: x.model, kaynak: 'model-karar', kimlik: kimlikUret('karar', x.model, x.kararGunu),
    ozet: `${ad}: ay sonu kararı${n ? ` — ${n} hisse` : ''}${x.uygulamaGunu ? ` (uygulama ${x.uygulamaGunu})` : ''}`,
    ayrinti: n ? x.liste.slice(0, 12).map(s => s && s.s).filter(Boolean).join(', ') : null, ciddiyet: 'bilgi' });
}

/** D3: tatbikat/sonuclar.jsonl satırı (elle prova sonucu / iptal / aylık otomatik denetim) → tatbikat olayı. */
function tatbikatOlayi(x, { makine, adFn } = {}) {
  if (!x || !Number.isFinite(Number(x.z))) return null;
  if (x.tur === 'otomatik') {
    const s = x.sayilar || {};
    return olay({ z: x.z, makine, tur: 'tatbikat', kaynak: 'tatbikat', kimlik: kimlikUret('tatbikat', 'oto', x.z),
      ozet: `Aylık otomatik tatbikat: ${s.gecti || 0} geçti · ${s.uyari || 0} uyarı · ${s.kaldi || 0} kaldı`, ayrinti: 'salt okuma — emir yok', ciddiyet: s.kaldi ? 'uyari' : 'bilgi' });
  }
  if (x.tur !== 'elle' || !x.ad) return null;
  const bot = x.bot || null;
  const ad = (bot && typeof adFn === 'function' && adFn(bot)) || bot;
  return olay({ z: x.z, makine, tur: 'tatbikat', bot, kaynak: 'tatbikat', kimlik: kimlikUret('tatbikat', x.kimlik, x.iptal ? 'iptal' : x.hukum),
    ozet: `${x.ad}${ad ? ` — ${ad}` : ''}: ${x.iptal ? 'iptal edildi' : x.hukum}`,
    ayrinti: x.iptal ? 'prova günlüğüne yazılmadı' : [x.sure ? `süre ${x.sure}` : null, x.provaGunlugu ? 'prova günlüğüne yazıldı' : null, x.onerilen && x.onerilen !== x.hukum ? `Pusula önerisi ${x.onerilen}` : null].filter(Boolean).join(' · ') || null,
    ciddiyet: x.hukum === 'geçmedi' ? 'uyari' : 'bilgi' });
}

// ── Dosya yardımcıları ───────────────────────────────────────────────────────
function jsonOku(f, yedek) { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return yedek; } }
function jsonYaz(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const g = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(g, JSON.stringify(v));
  fs.renameSync(g, f);
}
const satirlarAyristir = (metin) => metin.split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return undefined; } });

/** Yalnız eklenen dosya: `bas` bayttan sonraki TAM satırlar. Dosya küçüldüyse (döndürüldü/kırpıldı) baştan. */
function artik(dosya, bas) {
  let st;
  try { st = fs.statSync(dosya); } catch { return null; }
  let b = Number.isFinite(bas) && bas >= 0 ? bas : 0;
  if (st.size < b) b = 0;
  if (st.size === b) return { satirlar: [], son: b };
  const uz = Math.min(st.size - b, OKUMA_TAVAN_BAYT);
  const buf = Buffer.alloc(uz);
  const fd = fs.openSync(dosya, 'r');
  try { fs.readSync(fd, buf, 0, uz, b); } finally { fs.closeSync(fd); }
  const son = buf.lastIndexOf(0x0a);
  if (son < 0) return { satirlar: [], son: b };
  return { satirlar: satirlarAyristir(buf.subarray(0, son + 1).toString('utf8')), son: b + son + 1 };
}

/**
 * @param o {
 *   dizin: <veri>/olaylar, makine: () → ad (bu bilgisayar), simdi,
 *   kaynaklar: {
 *     botlar: () → [{ ad, dizin }]        bot başına emirler.jsonl + alarmlar.jsonl
 *     gunlukDizin, ozDenetimDizin, bildirimGecmis, ayarGecmisDizin, guncellemeGecmis: () → [satır], kararlar: () → [satır]
 *     botBul: (metin) → kimlik | null      (görünen ad / metindeki bot adı)
 *     adFn: (kimlik) → görünen ad
 *   }, log
 * }
 */
function olustur(o = {}) {
  const dizin = o.dizin;
  if (!dizin) throw new Error('olay akışı: dizin gerekli');
  const simdi = o.simdi || (() => Date.now());
  const log = o.log || (() => {});
  const k = o.kaynaklar || {};
  const makineAdi = () => { try { return (o.makine && o.makine()) || null; } catch { return null; } };
  const IMLEC = path.join(dizin, 'imlec.json');
  const aySetleri = new Map();   // 'AAAA-AA' → Set(kimlik)
  let sonToplama = 0, mesgul = false, sonHata = null, sonEklenen = 0;

  const ayDosya = (ay) => path.join(dizin, `${ay}.jsonl`);
  function aySeti(ay) {
    if (aySetleri.has(ay)) return aySetleri.get(ay);
    const s = new Set();
    try { for (const x of satirlarAyristir(fs.readFileSync(ayDosya(ay), 'utf8'))) if (x && x.kimlik) s.add(x.kimlik); } catch { /* yok */ }
    aySetleri.set(ay, s);
    return s;
  }

  /** Yeni satırları ay dosyalarına ekler (kimliği o ayda olan atlanır). @returns eklenen sayı */
  function ekle(satirlar) {
    const ayGrup = new Map();
    for (const s of satirlar) {
      if (!s) continue;
      const ay = ayAdi(s.z);
      const set = aySeti(ay);
      if (set.has(s.kimlik)) continue;
      set.add(s.kimlik);
      if (!ayGrup.has(ay)) ayGrup.set(ay, []);
      ayGrup.get(ay).push(s);
    }
    let n = 0;
    fs.mkdirSync(dizin, { recursive: true });
    for (const [ay, l] of ayGrup) {
      l.sort((a, b) => a.z - b.z);
      fs.appendFileSync(ayDosya(ay), l.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
      n += l.length;
    }
    return n;
  }

  /** 13 aydan eski ay dosyalarını siler (yalnız AAAA-AA.jsonl). */
  function temizle() {
    const d = new Date(simdi());
    const sinir = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - SAKLA_AY + 1, 1)).toISOString().slice(0, 7);
    const silinen = [];
    let l = [];
    try { l = fs.readdirSync(dizin); } catch { return silinen; }
    for (const f of l) {
      const m = /^(\d{4}-\d{2})\.jsonl$/.exec(f);
      if (m && m[1] < sinir) { try { fs.unlinkSync(path.join(dizin, f)); aySetleri.delete(m[1]); silinen.push(f); } catch { /* sonraki tur */ } }
    }
    return silinen;
  }

  /** Bütün kaynakları imleçten sonrasıyla okur, ekler. SENKRON (dosya okuma); hata yutar, kaynak başına ayrı. */
  function topla() {
    if (mesgul) return { atlandi: true };
    mesgul = true;
    const im = jsonOku(IMLEC, null) || {};
    im.dosya = im.dosya && typeof im.dosya === 'object' ? im.dosya : {};
    im.zaman = im.zaman && typeof im.zaman === 'object' ? im.zaman : {};
    const ilkTur = !im.surum;
    im.surum = 1;
    const mk = makineAdi();
    const yeni = [];
    const hatalar = [];
    const dene = (ad, fn) => { try { fn(); } catch (e) { hatalar.push(`${ad}: ${e.message}`); } };
    const ekleDosya = (anahtar, dosya, cevir) => {
      const r = artik(dosya, im.dosya[anahtar]);
      if (!r) return;
      for (const x of r.satirlar) { if (x !== undefined) { const s = cevir(x); if (s) yeni.push(s); } }
      im.dosya[anahtar] = r.son;
    };
    try {
      // Bot başına emir defteri + alarm kaydı
      dene('botlar', () => {
        for (const b of (k.botlar ? k.botlar() : []) || []) {
          if (!b || !b.ad || !b.dizin) continue;
          dene(`emir ${b.ad}`, () => ekleDosya(`emir:${b.ad}:${path.basename(b.dizin)}`, path.join(b.dizin, 'emirler.jsonl'), (x) => emirOlayi(x, { bot: b.ad, makine: mk })));
          dene(`alarm ${b.ad}`, () => ekleDosya(`alarm:${b.ad}:${path.basename(b.dizin)}`, path.join(b.dizin, 'alarmlar.jsonl'), (x) => alarmOlayi(x, { bot: b.ad, makine: mk })));
        }
      });
      // Günlük (gün dosyaları): ilk turda son 30 gün, sonra imleçteki günden itibaren
      if (k.gunlukDizin) dene('gunluk', () => {
        let l = [];
        try { l = fs.readdirSync(k.gunlukDizin).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch { l = []; }
        const enEski = im.zaman.gunlukGun || '';
        for (const f of l) {
          const gun = f.slice(0, 10);
          if (gun < enEski) continue;
          ekleDosya(`gunluk:${gun}`, path.join(k.gunlukDizin, f), (x) => gunlukOlayi(x, { makine: mk, botBul: k.botBul }));
          im.zaman.gunlukGun = gun;
        }
        // eski günlerin imleçleri atılır (dosyalar 30 günde silinir)
        for (const a of Object.keys(im.dosya)) if (a.startsWith('gunluk:') && a.slice(7) < (im.zaman.gunlukGun || '')) delete im.dosya[a];
      });
      if (k.ozDenetimDizin) {
        dene('oz-denetim', () => ekleDosya('oz:olaylar', path.join(k.ozDenetimDizin, 'olaylar.jsonl'), (x) => ozDenetimOlayi(x, { makine: mk })));
        dene('acilis', () => ekleDosya('oz:acilislar', path.join(k.ozDenetimDizin, 'acilislar.jsonl'), (x) => acilisOlayi(x, { makine: mk })));
      }
      // Ayar geçmişi: kayit.jsonl (yalnız eklenir; döndürülen parçalar kayit-<gün>_<gün>.jsonl bir kez okunur)
      if (k.ayarGecmisDizin) dene('ayar', () => {
        let l = [];
        try { l = fs.readdirSync(k.ayarGecmisDizin).filter(f => /^kayit(-[0-9_-]+)?\.jsonl$/.test(f)).sort(); } catch { l = []; }
        for (const f of l) ekleDosya(`ayar:${f}`, path.join(k.ayarGecmisDizin, f), (x) => ayarOlayi(x, { makine: mk }));
      });
      // D3: tatbikat sonuçları (yalnız eklenen dosya)
      if (k.tatbikatDosya) dene('tatbikat', () => ekleDosya('tatbikat:sonuclar', k.tatbikatDosya, (x) => tatbikatOlayi(x, { makine: mk, adFn: k.adFn })));
      // Yeniden yazılan kaynaklar: son zaman imleci (eşit zaman tekrar okunur, kimlik ayıklar)
      const zamanli = (ad, satirlar, zfn, cevir) => {
        const sinir = Number(im.zaman[ad]) || 0;
        let enYeni = sinir;
        for (const x of satirlar || []) {
          const z = zfn(x);
          if (!Number.isFinite(z) || z < sinir) continue;
          const s = cevir(x);
          if (s) yeni.push(s);
          if (z > enYeni) enYeni = z;
        }
        im.zaman[ad] = enYeni;
      };
      if (k.bildirimGecmis) dene('bildirim', () => {
        let l = [];
        try { l = satirlarAyristir(fs.readFileSync(k.bildirimGecmis, 'utf8')); } catch { l = []; }
        zamanli('bildirim', l, (x) => (x ? Date.parse(x.zaman) : NaN), (x) => bildirimOlayi(x, { makine: mk, botBul: k.botBul }));
      });
      if (k.guncellemeGecmis) dene('guncelleme', () => zamanli('guncelleme', k.guncellemeGecmis(), (x) => (x ? Date.parse(x.zaman) : NaN), (x) => guncellemeOlayi(x, { makine: mk })));
      if (k.kararlar) dene('karar', () => zamanli('karar', k.kararlar(), (x) => (x && x.kararGunu ? Date.parse(`${x.kararGunu}T21:00:00Z`) : NaN), (x) => kararOlayi(x, { makine: mk, adFn: k.adFn })));

      const n = ekle(yeni);
      jsonYaz(IMLEC, im);
      if (ilkTur || new Date(simdi()).getUTCDate() !== new Date(sonToplama || 0).getUTCDate()) temizle();
      sonToplama = simdi(); sonEklenen = n;
      sonHata = hatalar.length ? hatalar.slice(0, 5).join(' · ') : null;
      if (hatalar.length) log('WARN', `🗂 Olay akışı: ${hatalar.length} kaynak okunamadı — ${sonHata}`);
      return { eklenen: n, hatalar };
    } catch (e) {
      sonHata = e.message;
      log('WARN', `🗂 Olay akışı toplanamadı: ${e.message}`);
      return { eklenen: 0, hatalar: [e.message] };
    } finally { mesgul = false; }
  }

  /** Okumadan önce: son toplama 60 sn'den eskiyse topla. */
  function tazele() { if (simdi() - sonToplama > DK) topla(); }

  /**
   * Okuma (en yeni önce). bas/bit 'AAAA-AA-GG' (dahil, İstanbul günü), yoksa son 7 gün; aralık en çok 400 gün.
   * tur: virgüllü liste; bot, makine: tam eşleşme; ara: özet/ayrıntı içinde (büyük-küçük harf duyarsız); once: bu zamandan (ms) öncekiler (sayfalama).
   * @returns { olaylar, toplam, sayilar: { tur: adet } (tür süzgeci hariç diğer süzgeçlerle), botlar, makineler, kesildi, bas, bit }
   */
  function oku(q = {}) {
    const s = suzgecNormal(q, simdi());
    const aylar = [];
    for (let d = new Date(Date.UTC(+s.basGun.slice(0, 4), +s.basGun.slice(5, 7) - 1, 1)); d.toISOString().slice(0, 7) <= s.bitGun.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) aylar.push(d.toISOString().slice(0, 7));
    const tum = [];
    for (const ay of aylar) {
      let l = [];
      try { l = satirlarAyristir(fs.readFileSync(ayDosya(ay), 'utf8')); } catch { l = []; }
      for (const x of l) if (x && x.z >= s.basMs && x.z <= s.bitMs) tum.push(x);
    }
    return suz(tum, s);
  }

  let zamanlayici = null;
  function baslat() {
    if (zamanlayici) return;
    const t1 = setTimeout(() => topla(), 90 * 1000);
    zamanlayici = setInterval(() => topla(), 10 * DK);
    for (const t of [t1, zamanlayici]) if (t.unref) t.unref();
  }
  function durdur() { if (zamanlayici) clearInterval(zamanlayici); zamanlayici = null; }
  const durum = () => ({ sonToplama: sonToplama || null, sonEklenen, sonHata, dizin });

  return { topla, tazele, oku, ekle, temizle, baslat, durdur, durum };
}

// ── Süzgeç ve birleştirme (SAF) ──────────────────────────────────────────────
const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;
/** İstanbul günü 'AAAA-AA-GG' → o günün başı / sonu (ms; Türkiye UTC+3, yaz saati yok). */
const gunBas = (g) => Date.parse(`${g}T00:00:00+03:00`);
const gunSon = (g) => Date.parse(`${g}T23:59:59.999+03:00`);
const istGun = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
function suzgecNormal(q = {}, simdiMs = Date.now()) {
  const bugun = istGun(simdiMs);
  let bitGun = GUN_RE.test(String(q.bit || '')) ? String(q.bit) : bugun;
  let basGun = GUN_RE.test(String(q.bas || '')) ? String(q.bas) : istGun(gunBas(bitGun) - 6 * GUN);
  if (basGun > bitGun) [basGun, bitGun] = [bitGun, basGun];
  if ((gunBas(bitGun) - gunBas(basGun)) / GUN > ARALIK_TAVAN_GUN) basGun = istGun(gunBas(bitGun) - ARALIK_TAVAN_GUN * GUN);
  const turler = String(q.tur || '').split(',').map(x => x.trim()).filter(x => TURLER.includes(x));
  const n = Math.max(1, Math.min(N_TAVAN, Number(q.n) || 200));
  const once = Number(q.once);
  return { basGun, bitGun, basMs: gunBas(basGun), bitMs: gunSon(bitGun), turler, bot: String(q.bot || '').slice(0, 40), makine: String(q.makine || '').slice(0, 60),
    ara: String(q.ara || '').trim().toLocaleLowerCase('tr-TR').slice(0, 80), n, once: Number.isFinite(once) && once > 0 ? once : null, ciddiyet: CIDDIYETLER.includes(q.ciddiyet) ? q.ciddiyet : '' };
}
/** Saf: satırlar + normal süzgeç → yanıt. */
function suz(satirlar, s) {
  const ortak = satirlar.filter(x => x && (!s.bot || x.bot === s.bot) && (!s.makine || x.makine === s.makine)
    && (!s.ciddiyet || CIDDIYETLER.indexOf(x.ciddiyet) >= CIDDIYETLER.indexOf(s.ciddiyet))
    && (!s.ara || `${x.ozet} ${x.ayrinti || ''}`.toLocaleLowerCase('tr-TR').includes(s.ara)));
  const sayilar = {};
  for (const x of ortak) sayilar[x.tur] = (sayilar[x.tur] || 0) + 1;
  let l = s.turler.length ? ortak.filter(x => s.turler.includes(x.tur)) : ortak;
  const toplam = l.length;
  l = l.sort((a, b) => b.z - a.z || (a.kimlik < b.kimlik ? -1 : 1));
  if (s.once) l = l.filter(x => x.z < s.once);
  const kesildi = l.length > s.n;
  return { olaylar: l.slice(0, s.n), toplam, sayilar, kesildi, botlar: [...new Set(satirlar.map(x => x && x.bot).filter(Boolean))].sort(),
    makineler: [...new Set(satirlar.map(x => x && x.makine).filter(Boolean))].sort(), bas: s.basGun, bit: s.bitGun };
}
/** Saf: birden çok makinenin yanıtını tek çizelgede birleştirir (kimliğe göre tekil, en yeni önce). */
function birlestir(yanitlar, s) {
  const gor = new Set();
  const tum = [];
  for (const y of yanitlar) for (const x of (y && y.olaylar) || []) {
    const a = `${x.makine || ''}|${x.kimlik}`;
    if (gor.has(a)) continue;
    gor.add(a); tum.push(x);
  }
  const r = suz(tum, { ...s, n: Infinity });
  const sayilar = {};
  for (const y of yanitlar) for (const [t, n] of Object.entries((y && y.sayilar) || {})) sayilar[t] = (sayilar[t] || 0) + n;
  return { ...r, olaylar: r.olaylar.slice(0, s.n), sayilar, toplam: yanitlar.reduce((a, y) => a + ((y && y.toplam) || 0), 0),
    kesildi: r.olaylar.length > s.n || yanitlar.some(y => y && y.kesildi) };
}

module.exports = { olustur, olay, emirOlayi, alarmOlayi, gunlukOlayi, ozDenetimOlayi, bildirimOlayi, ayarOlayi, guncellemeOlayi, acilisOlayi, kararOlayi, tatbikatOlayi,
  suzgecNormal, suz, birlestir, artik, kimlikUret, istGun, TURLER, TUR_AD, CIDDIYETLER, SAKLA_AY, N_TAVAN };
