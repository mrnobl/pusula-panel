'use strict';
/**
 * D3a AYLIK OTOMATİK TATBİKAT (TASARIM-MAKINE-HESAP-BOT §8.4 "Otomatik aylık") — ayın ilk pazarı 11:30 (TR), yalnız sunucuda.
 * ═══════════════════════════════════════════════════════════════════════════
 * Kapsam: kâğıt ve demo bindirme botları; Kairos demo (hucum) 2026-12-10'a kadar HARİÇ (yalnız "kapsam dışı" satırı), başka makineye
 * taşınmış eski kopyalar hariç. Bu sürümde BÜTÜN kontroller SALT OKUMA (kayıt ve saf işlev) — borsaya istek, emir, acil durdurma YOK:
 *   1. mutabakat kaydı     — son mutabakat.jsonl satırı ≤ 48 sa ve temiz
 *   2. felaket stopu       — son koruma.jsonl "denetim" satırı ≤ 3 sa, kaybolan / hatalı stop yok (kâğıtta atlanır)
 *   3. acil durdurma       — son acil deneme kaydının yaşı (DENEME YAPILMAZ: bütün pozisyonları kapatır — kullanıcı kararı, açık soru)
 *   4. veri kapısı         — bozuk mum enjeksiyonu SAF kapıda (lib/live/donchianBot mumKapisi + lib/live/veriKalitesi denetle): sağlam seri
 *                            geçmeli, bozuk her seri (sıfır fiyat, boşluk, bayat, sıçrama, geçersiz mark) reddedilmeli. Bot kopyası çalıştırılmaz.
 *   5. D1 geri dönüş       — 4c (lib/tatbikat/geriDonus.js, ayın ilk pazarı 11:00) bu ayın sonucu okunur: geçti / uyarı / kaldı;
 *                            bu ay çalışmadıysa uyarı (bu denetim kendisi geri yükleme YAPMAZ — yalnız kaydı okur)
 * Sonuç: <veri>/tatbikat/sonuclar.jsonl (tur 'otomatik') + tek Telegram (tür tatbikat). Son çalışılan ay: <veri>/tatbikat/otomatik.json.
 */
const SAAT = 3600e3, GUN = 864e5, TR = 3 * SAAT;
const KORUMA_BITIS = Date.parse('2026-12-09T21:00:00Z');

/** Saf: otomatik tatbikatın zamanı geldi mi? Ayın ilk pazarı ≥ 11:30 TR ve bu ay daha çalışmadı. */
function zamaniGeldi(simdi, sonAy) {
  const d = new Date(simdi + TR);
  const ay = d.toISOString().slice(0, 7);
  if (sonAy === ay) return false;
  return d.getUTCDay() === 0 && d.getUTCDate() <= 7 && d.getUTCHours() * 60 + d.getUTCMinutes() >= 11 * 60 + 30;
}
const ayAdi = (simdi) => new Date(simdi + TR).toISOString().slice(0, 7);
const yas = (ms) => (ms < 2 * SAAT ? `${Math.round(ms / 60e3)} dk` : ms < 2 * GUN ? `${Math.round(ms / SAAT)} sa` : `${Math.round(ms / GUN)} gün`);

/** Saf: sentetik günlük mumlar (bugün dahil, n gün). */
function sentetikMumlar(simdi, n = 40) {
  const bugun = Math.floor(simdi / GUN) * GUN;
  const l = [];
  for (let i = n - 1; i >= 0; i--) { const c = 60000 + (n - i) * 50; l.push({ time: bugun - i * GUN, open: c - 20, high: c + 100, low: c - 100, close: c, volume: 1000 }); }
  return l;
}
/** Saf: veri kapısı enjeksiyonu — sağlam seri geçmeli, her bozuk seri reddedilmeli. */
function veriKapisiEnjeksiyon(simdi = Date.now()) {
  const { mumKapisi } = require('../live/donchianBot');
  const VK = require('../live/veriKalitesi');
  const s = sentetikMumlar(simdi);
  const kopya = () => s.map(m => ({ ...m }));
  const vakalar = [
    ['sağlam seri', kopya(), true],
    ['sıfır fiyat', (() => { const l = kopya(); l[l.length - 2].close = 0; return l; })(), false],
    ['iki günlük boşluk', (() => { const l = kopya(); l.splice(l.length - 5, 2); return l; })(), false],
    ['bayat seri (son mum 5 gün önce)', kopya().slice(0, -5), false],
    ['%500 sıçrama', (() => { const l = kopya(); const m = l[l.length - 1]; m.close *= 6; m.high = m.close; return l; })(), false],
  ];
  const sonuc = vakalar.map(([ad, mumlar, beklenen]) => { const r = mumKapisi(mumlar, simdi); return { ad, beklenen, gecerli: r.gecerli, sebep: r.sebep, dogru: r.gecerli === beklenen }; });
  const f = VK.denetle('fiyat', { fiyat: 0, sonKapanis: 60000 });
  sonuc.push({ ad: 'geçersiz mark fiyatı', beklenen: false, gecerli: f.agirlik !== 'agir', sebep: (f.bulgular[0] || {}).metin || null, dogru: f.agirlik === 'agir' });
  const yanlis = sonuc.filter(x => !x.dogru);
  return { kimlik: 'veri-kapisi', ad: 'Veri kapısı (bozuk mum enjeksiyonu)', durum: yanlis.length ? 'kaldi' : 'gecti',
    metin: yanlis.length ? `kapı yanlış karar verdi: ${yanlis.map(x => x.ad).join(', ')}` : `${sonuc.length} vaka: sağlam seri geçti, ${sonuc.length - 1} bozuk seri reddedildi`, vakalar: sonuc };
}

/** Saf: bir botun salt okuma kontrolleri. `b`: { ad, adGorunen, mod, ozet, mutabakat: satırlar, koruma: satırlar, acil: satırlar } */
function botKontrolleri(b, simdi) {
  const l = [];
  const mt = (b.mutabakat || []).slice(-1)[0];
  if (!mt) l.push({ kimlik: 'mutabakat', ad: 'Mutabakat kaydı', durum: 'uyari', metin: 'hiç mutabakat kaydı yok' });
  else if (mt.temiz === false) l.push({ kimlik: 'mutabakat', ad: 'Mutabakat kaydı', durum: 'kaldi', metin: `son mutabakat (${yas(simdi - mt.zaman)} önce) temiz değil: ${String(mt.engel || '').slice(0, 100)}` });
  else if (simdi - mt.zaman > 48 * SAAT) l.push({ kimlik: 'mutabakat', ad: 'Mutabakat kaydı', durum: 'uyari', metin: `son mutabakat ${yas(simdi - mt.zaman)} önce (48 sa'ten eski)` });
  else l.push({ kimlik: 'mutabakat', ad: 'Mutabakat kaydı', durum: 'gecti', metin: `son mutabakat ${yas(simdi - mt.zaman)} önce, temiz` });
  const o = b.ozet || {};
  if (b.mod === 'kagit') l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'atlandi', metin: 'kâğıt hesap — borsada stop yok' });
  else if (!(o.koruma && o.koruma.aktif)) l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'atlandi', metin: 'felaket stopu kapalı' });
  else {
    const den = (b.koruma || []).filter(r => r.tur === 'denetim').slice(-1)[0];
    if (!den) l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'uyari', metin: 'stop denetimi kaydı yok' });
    else if ((den.hatalar || []).length || (den.kaybolan || []).some(k => !k.tetiklendi)) l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'kaldi', metin: `son denetimde ${(den.kaybolan || []).length} kaybolan, ${(den.hatalar || []).length} hatalı stop` });
    else if (simdi - den.zaman > 3 * SAAT) l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'uyari', metin: `son stop denetimi ${yas(simdi - den.zaman)} önce (saatlik olmalı)` });
    else l.push({ kimlik: 'koruma', ad: 'Felaket stopu', durum: 'gecti', metin: `son denetim ${yas(simdi - den.zaman)} önce, ${Object.keys(o.koruma.stoplar || {}).length} stop yerinde` });
  }
  const ac = (b.acil || []).filter(x => x.olay === 'acil-deneme').slice(-1)[0] || (o.sonAcilDeneme ? { zaman: o.sonAcilDeneme.zaman, basarili: o.sonAcilDeneme.basarili } : null);
  l.push(ac ? { kimlik: 'acil', ad: 'Acil durdurma', durum: ac.basarili ? 'bilgi' : 'uyari', metin: `son deneme ${yas(simdi - ac.zaman)} önce, ${ac.basarili ? 'başarılı' : 'BAŞARISIZ'} (otomatik tatbikat denemez — Tatbikatlar › 5)` }
    : { kimlik: 'acil', ad: 'Acil durdurma', durum: 'bilgi', metin: 'hiç denenmedi (otomatik tatbikat denemez — Tatbikatlar › 5 ile elle)' });
  return l;
}

/**
 * Çalıştırır (salt okuma). @param botlar [{ ad, adGorunen, mod, ozet, mutabakat, koruma, acil, baskaMakinede }]
 * @param geriDonus D1 geri dönüş tatbikatının son özeti (<veri>/tatbikat/geri-donus.json) | null
 * @returns sonuç kaydı { z, tur: 'otomatik', ay, botlar: [{ ad, adGorunen, mod, kapsamDisi?, kontroller }], genel: [...], sayilar }
 */
function calistir({ botlar = [], simdi = Date.now(), geriDonus = null } = {}) {
  const sb = botlar.map(b => {
    if (b.mod === 'canli') return { ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, kapsamDisi: 'canlı hesap — otomatik tatbikat kapsamı dışında', kontroller: [] };
    if (b.baskaMakinede) return { ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, kapsamDisi: 'başka makineye taşındı — orada denetlenir', kontroller: [] };
    if (b.ad === 'hucum' && b.mod === 'demo' && simdi < KORUMA_BITIS) return { ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, kapsamDisi: 'Kairos demo kabulü 2026-12-09\'a kadar sürüyor — otomatik tatbikat dokunmaz', kontroller: [] };
    return { ad: b.ad, adGorunen: b.adGorunen, mod: b.mod, kontroller: botKontrolleri(b, simdi) };
  });
  const genel = [veriKapisiEnjeksiyon(simdi), require('./geriDonus').otomatikSatiri(geriDonus, simdi)];
  const hepsi = [...sb.flatMap(b => b.kontroller), ...genel];
  const sayilar = { gecti: 0, uyari: 0, kaldi: 0, atlandi: 0, bilgi: 0 };
  for (const x of hepsi) sayilar[x.durum] = (sayilar[x.durum] || 0) + 1;
  return { z: simdi, tur: 'otomatik', ay: ayAdi(simdi), botlar: sb, genel: genel.map(x => ({ kimlik: x.kimlik, ad: x.ad, durum: x.durum, metin: x.metin })), sayilar,
    hukum: sayilar.kaldi ? 'geçmedi' : 'geçti' };
}

/** Saf: Telegram satırları (tutar yok). */
function telegramMetni(r) {
  const s = r.sayilar;
  return {
    baslik: `Tatbikat: aylık otomatik denetim — ${s.kaldi ? `${s.kaldi} sorun` : s.uyari ? `${s.uyari} uyarı` : 'temiz'}`,
    satirlar: [
      `${s.gecti} geçti · ${s.uyari} uyarı · ${s.kaldi} kaldı · ${s.atlandi} atlandı (salt okuma; emir yok)`,
      ...r.botlar.map(b => (b.kapsamDisi ? `• ${b.adGorunen}: kapsam dışı (${b.kapsamDisi.split(' — ')[0]})` : `• ${b.adGorunen}: ${b.kontroller.filter(x => x.durum === 'kaldi' || x.durum === 'uyari').map(x => `${x.ad} — ${x.metin}`).join(' · ') || 'temiz'}`)),
      ...r.genel.filter(x => x.durum === 'kaldi' || (x.kimlik === 'geri-donus' && x.durum === 'uyari')).map(x => `${x.durum === 'kaldi' ? '✗' : '!'} ${x.ad}: ${x.metin}`),
      'Ayrıntı: Pusula › Sistem › Tatbikatlar.',
    ],
  };
}

module.exports = { zamaniGeldi, ayAdi, calistir, botKontrolleri, veriKapisiEnjeksiyon, sentetikMumlar, telegramMetni, KORUMA_BITIS };
