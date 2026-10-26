'use strict';
/**
 * PUSULA DOKTORU — HAZIR OLMA (readiness, D10; F1 78.1) — SAF modül.
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/hazir bunu döndürür. CANLILIK (liveness) DEĞİLDİR: /api/health ve donma bekçisi aynen kalır (K6 — /api/hazir
 * healthchecks'e bağlanmaz). Hazır olmamak hiçbir zaman yeniden başlatma, durdurma ya da başka bir eylem doğurmaz.
 *
 * Bot başına durum (yalnız ÇALIŞAN botlar "hazır mı" sorusuna girer; durdurulmuş bot "durdu" — sizin kararınız):
 *   hazir        bağlı (yürütücü AKTIF), ENGEL yok, güvenli kip yok, son çalışma 26 saatten yeni
 *   engel        bot kendini durdurdu (ENGEL) — karar sizde
 *   guvenli-kip  yeni işlem yok (stoplar yerinde); sebep geçince kendiliğinden çıkar
 *   bagli-degil  yürütücü borsaya bağlı değil / durdurulmuş (geri çekilmede tahmini bitiş yazılır)
 *   gecikti      son günlük çalışma 26 saatten eski
 *   bilinmiyor   bot özeti okunamadı ("okunamadı" asla "hazır" sayılmaz)
 * Genel `hazir`: süreç ayakta + (sunucuda) öz denetim son yoklaması taze + çalışan her bot "hazir".
 */
const K = require('./kurallar');

const zamanMs = (z) => (typeof z === 'number' ? z : (z ? Date.parse(z) : NaN));

/** Saf: tek bot. b = { ad, adGorunen, mod, calisiyor, engel, guvenliKip, yurutucu: { durum, durmaTuru, geriCekilme }, sonKarar: { gun, zaman }, kalpDurumu, okunamadi } */
function botHazir(b, simdi = Date.now()) {
  const temel = { ad: b.ad, adGorunen: b.adGorunen || b.ad, mod: b.mod || null };
  const sk = b.sonKarar ? zamanMs(b.sonKarar.zaman) : NaN;
  const sonKarar = b.sonKarar ? { gun: b.sonKarar.gun || null, zaman: Number.isFinite(sk) ? sk : null, yasSaat: Number.isFinite(sk) ? Math.round((simdi - sk) / K.SAAT * 10) / 10 : null } : null;
  const y = b.yurutucu || {};
  const ortak = { ...temel, calisiyor: !!b.calisiyor, bagli: y.durum === 'AKTIF', yurutucu: y.durum || null, engel: !!b.engel, guvenliKip: !!b.guvenliKip, sonKarar,
    kalp: b.kalpDurumu ? { saat: Number.isFinite(b.kalpDurumu.saat) ? Math.round(b.kalpDurumu.saat * 10) / 10 : null, gecikti: !!b.kalpDurumu.gecikti } : null };
  if (b.okunamadi) return { ...ortak, durum: 'bilinmiyor', hazir: false, metin: 'bot durumu okunamadı', nedenler: ['bot durumu okunamadı'] };
  if (!b.calisiyor) return { ...ortak, durum: 'durdu', hazir: null, metin: 'durduruldu (sizin kararınız)', nedenler: [] };
  const nedenler = [];
  let durum = 'hazir';
  if (b.engel) { durum = 'engel'; nedenler.push(`ENGEL: ${String(typeof b.engel === 'string' ? b.engel : 'bot kendini durdurdu').slice(0, 140)}`); }
  if (b.guvenliKip) { if (durum === 'hazir') durum = 'guvenli-kip'; nedenler.push(`güvenli kip: ${String((b.guvenliKip && b.guvenliKip.metin) || 'yeni işlem yok').slice(0, 140)}`); }
  if (y.durum !== 'AKTIF') {
    if (durum === 'hazir') durum = y.durum ? 'bagli-degil' : 'bilinmiyor';
    const gc = y.geriCekilme && y.geriCekilme.aktif && Number.isFinite(y.geriCekilme.bitis) ? ` — borsa geri çekilmesi, tahmini bitiş ${K.trZaman(y.geriCekilme.bitis)}` : '';
    nedenler.push(y.durum ? `yürütücü ${y.durum}${y.durmaTuru ? ` [${y.durmaTuru}]` : ''}${gc}` : 'yürütücü durumu okunamadı');
  }
  if (b.kalpDurumu && b.kalpDurumu.gecikti) { if (durum === 'hazir') durum = 'gecikti'; nedenler.push(`son günlük çalışma 26 saatten eski (${b.kalpDurumu.metin || ''})`.trim()); }
  return { ...ortak, durum, hazir: durum === 'hazir', metin: durum === 'hazir' ? 'hazır' : nedenler.join(' · '), nedenler };
}

/**
 * Saf: genel hazır olma.
 * @param g { simdi, rol, surec: { surum, commit, uptimeSn, denetleyici }, oz: { calisiyor, sonYoklama } | null, botlar: [bot girdisi] }
 */
function hesapla(g = {}) {
  const simdi = Number.isFinite(g.simdi) ? g.simdi : Date.now();
  const arastirma = g.rol === 'arastirma';
  const s = g.surec || {};
  const surec = { durum: 'hazir', surum: s.surum || null, commit: s.commit || null, uptimeSn: Number.isFinite(s.uptimeSn) ? Math.round(s.uptimeSn) : null,
    baslangic: Number.isFinite(s.uptimeSn) ? simdi - Math.round(s.uptimeSn * 1000) : null, denetleyici: !!s.denetleyici,
    metin: `Pusula açık${Number.isFinite(s.uptimeSn) ? ` (${K.sureMetni(s.uptimeSn * 1000)})` : ''}${s.denetleyici ? ' · denetleyiciyle (kapanırsa kendiliğinden açılır)' : ' · denetleyicisiz (kapanırsa kendiliğinden açılmaz)'}` };
  let oz;
  if (arastirma) oz = { durum: 'yok', sonYoklama: null, yasSn: null, metin: 'araştırma kopyası — öz denetim sunucuda çalışır' };
  else if (!g.oz) oz = { durum: 'bilinmiyor', sonYoklama: null, yasSn: null, metin: 'öz denetim okunamadı' };
  else {
    const sy = Number.isFinite(g.oz.sonYoklama) ? g.oz.sonYoklama : null;
    const yas = sy != null ? simdi - sy : null;
    const ilk = Number.isFinite(s.uptimeSn) && s.uptimeSn * 1000 < K.ESIK.ozDenetimIlkMs;
    const d = sy == null ? (ilk ? 'bekleniyor' : 'bilinmiyor') : yas > K.ESIK.ozDenetimBayatMs ? 'bayat' : 'hazir';
    oz = { durum: d, sonYoklama: sy, yasSn: yas != null ? Math.round(yas / 1000) : null,
      metin: sy == null ? (ilk ? 'ilk yoklama bekleniyor (açılıştan ~90 sn sonra)' : 'öz denetim henüz yoklamadı') : `son yoklama ${K.sureMetni(yas)} önce${d === 'bayat' ? ' — 5 dakikada bir yoklaması gerekirdi' : ''}` };
  }
  const botlar = (Array.isArray(g.botlar) ? g.botlar : []).map(b => botHazir(b, simdi));
  const calisan = botlar.filter(b => b.durum !== 'durdu');
  const hazir = surec.durum === 'hazir' && (arastirma || oz.durum === 'hazir' || oz.durum === 'bekleniyor') && calisan.every(b => b.hazir === true);
  const sorunlu = calisan.filter(b => !b.hazir);
  const metin = arastirma ? 'Araştırma kopyası: botlar sunucuda çalışır (bu bilgisayarda hazır olma yalnız Pusula sürecidir).'
    : hazir ? (calisan.length ? `Hazır — ${calisan.length} çalışan bot karar verebilir durumda.` : 'Pusula hazır — çalışan bot yok.')
      : `Hazır değil: ${[oz.durum !== 'hazir' && oz.durum !== 'bekleniyor' ? `öz denetim ${oz.metin}` : null, ...sorunlu.map(b => `${b.adGorunen}: ${b.metin}`)].filter(Boolean).join(' · ')}`;
  return { zaman: simdi, rol: arastirma ? 'arastirma' : 'sunucu', hazir, metin, surec, ozDenetim: oz, botlar };
}

module.exports = { hesapla, botHazir };
