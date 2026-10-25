/**
 * D2 HAFTALIK KARNE (TASARIM-MAKINE-HESAP-BOT §8.3, PLAN-MAKINE-HESAP-BOT §8 s3) — geçen haftanın (pazartesi–pazar, İstanbul) tek sayfalık özeti.
 * ═══════════════════════════════════════════════════════════════════════════
 * İçerik: her bot için haftalık getiri, aynı haftada BTC, BTC'ye fark (puan), hafta içi en büyük düşüş, tepeden düşüş, işlem sayısı,
 * durum (çalışıyor / durdu / ENGEL); portföy (Portföyüm USD endeksi + model portföyler); sorunlar (şu an etkin kartlar + haftanın uyarı
 * olayları, B2 olay akışından); ileri test (Kairos demo kabulü günü + gölge satırları — lib/golgeOzet.js AYNEN, hüküm yok).
 * KAYNAK = panelin kullandığı aynı hesaplar (ayrı hesap yok): bot eğrisi lib/live/islemGecmisi.ozsermayeKarsilastir (Botlar grafiği,
 * Telegram menüsü), model endeksi tasarimci günlüğü `endeks` (Lydia TL `endeksTl`), Portföyüm `gunlukSeri` endeksUSD.
 * `karneKur(girdi)` SAF (test edilir); toplayıcı lib/sunucu/olayUclari.js'te (sunucunun bellekteki botlarından, ağ yok).
 * TELEGRAM (`telegramParcalari`): YALNIZ YÜZDE — tutar, bakiye, adet yazılmaz (kullanıcı kararı 2026-10-24 "tutarlar gizli"; bildirim merkezi
 * tutar süzgeci ayrıca uygulanır). Haftada TEK mesaj: bildirim türü "karne" (eski "golge" haftalık özeti bu mesajın içinde).
 */
'use strict';

const GUN = 864e5;
const sayiMi = (x) => typeof x === 'number' && Number.isFinite(x);
const trSayi = (x, b = 1) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
/** 0,0213 → "+%2,1" · −0,004 → "−%0,4" · çok küçük → "%0,0" · yok → "—". */
function yuzde(x, b = 1) {
  if (!sayiMi(x)) return '—';
  const r = Math.abs(x) * 100;
  if (Number(r.toFixed(b)) === 0) return `%${trSayi(0, b)}`;
  return `${x < 0 ? '−' : '+'}%${trSayi(r, b)}`;
}
/** 0,013 → "+1,3 puan". */
function puan(x) {
  if (!sayiMi(x)) return '—';
  const r = Math.abs(x) * 100;
  if (Number(r.toFixed(1)) === 0) return '0,0 puan';
  return `${x < 0 ? '−' : '+'}${trSayi(r, 1)} puan`;
}
const gunTr = (g) => (g ? `${g.slice(8, 10)}.${g.slice(5, 7)}` : '—');
const istGun = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const gunEkle = (g, n) => new Date(Date.parse(`${g}T12:00:00Z`) + n * GUN).toISOString().slice(0, 10);

/** ISO hafta etiketi "2026-H43" (gün 'AAAA-AA-GG'). */
function haftaEtiketi(gun) {
  const d = new Date(`${gun}T00:00:00Z`);
  const hg = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - hg + 3);
  const yil = d.getUTCFullYear();
  const ilk = new Date(Date.UTC(yil, 0, 4));
  const no = 1 + Math.round(((d - ilk) / GUN - 3 + ((ilk.getUTCDay() + 6) % 7)) / 7);
  return `${yil}-H${String(no).padStart(2, '0')}`;
}
/** Saf: herhangi bir gün → o haftanın { bas: pazartesi, bit: pazar, etiket }. */
function hafta(gun) {
  const d = new Date(`${gun}T12:00:00Z`);
  const bas = gunEkle(gun, -((d.getUTCDay() + 6) % 7));
  return { bas, bit: gunEkle(bas, 6), etiket: haftaEtiketi(bas) };
}
/** Saf: şimdi → son BİTEN hafta (İstanbul günü; pazartesi sabahı geçen hafta). */
function sonBitenHafta(simdiMs = Date.now()) { return hafta(gunEkle(hafta(istGun(simdiMs)).bas, -1)); }

/**
 * Saf: gün dizisinde [bas, bit] haftasının değişimi. Taban = haftadan önceki son nokta (yoksa haftanın ilk noktası).
 * @param seri [{ gun, v }]  @returns { getiri, dusus (hafta içi en büyük düşüş, tabandan itibaren tepe→dip), son, gun (haftadaki nokta sayısı) } | null
 */
function haftaDegisimi(seri, bas, bit) {
  const l = (seri || []).filter(x => x && typeof x.gun === 'string' && sayiMi(x.v) && x.v > 0).sort((a, b) => (a.gun < b.gun ? -1 : a.gun > b.gun ? 1 : 0));
  const ici = l.filter(x => x.gun >= bas && x.gun <= bit);
  if (!ici.length) return null;
  const once = [...l].reverse().find(x => x.gun < bas);
  const taban = once || ici[0];
  const son = ici[ici.length - 1];
  let tepe = taban.v, dusus = 0;
  for (const x of ici) { tepe = Math.max(tepe, x.v); dusus = Math.max(dusus, 1 - x.v / tepe); }
  return { getiri: taban === son ? 0 : son.v / taban.v - 1, dusus, son: son.v, sonGun: son.gun, gun: ici.length, tabanGun: taban.gun };
}
/** Saf: seride en yüksek noktadan bugünkü düşüş (≤ bit). */
function tepedenDusus(seri, bit) {
  const l = (seri || []).filter(x => x && sayiMi(x.v) && x.v > 0 && (!bit || x.gun <= bit));
  if (!l.length) return null;
  const tepe = Math.max(...l.map(x => x.v));
  return 1 - l[l.length - 1].v / tepe;
}

/**
 * SAF karne kurucu.
 * @param g {
 *   hafta: { bas, bit, etiket }, olusturma (ms),
 *   botlar: [{ ad, adGorunen, mod, durum: 'calisiyor'|'durdu'|'engel', egri: [{ gun, gercek, btc }], islemler: [{ zaman }] }],
 *   portfoyum: [{ tarih, endeksUSD }] | null, modeller: [{ id, ad, para, seri: [{ gun, endeks }] }],
 *   sorunlar: { sayac: { mudahale, dikkat, gecici, bilgi, toplam }, basliklar: [metin] } | null,
 *   olaylar: { sayilar: { tur: adet }, uyari: adet, alarm: adet } | null,
 *   ileri: { demo: { gecenGun, hukumTarihi, sonBant, calisiyor } | null, golge: [satır] , hukumTarihleri: [] }
 * }
 */
function karneKur(g) {
  const { bas, bit } = g.hafta;
  const basMs = Date.parse(`${bas}T00:00:00+03:00`), bitMs = Date.parse(`${bit}T23:59:59.999+03:00`);
  let btc = null;
  const botlar = (g.botlar || []).map(b => {
    const egri = b.egri || [];
    const h = haftaDegisimi(egri.map(x => ({ gun: x.gun, v: x.gercek })), bas, bit);
    const hb = haftaDegisimi(egri.map(x => ({ gun: x.gun, v: x.btc })), bas, bit);
    if (hb && btc == null) btc = hb.getiri;
    const islem = (b.islemler || []).filter(x => x && sayiMi(+x.zaman) && +x.zaman >= basMs && +x.zaman <= bitMs).length;
    return { ad: b.ad, adGorunen: b.adGorunen || b.ad, mod: b.mod || null, durum: b.durum || null,
      getiri: h ? h.getiri : null, btc: hb ? hb.getiri : null, fark: h && hb ? h.getiri - hb.getiri : null,
      dusus: h ? h.dusus : null, tepedenDusus: tepedenDusus(egri.map(x => ({ gun: x.gun, v: x.gercek })), bit), islem, veriGun: h ? h.gun : 0, sonGun: h ? h.sonGun : null };
  });
  const pf = g.portfoyum ? haftaDegisimi(g.portfoyum.map(x => ({ gun: x.tarih, v: x.endeksUSD })), bas, bit) : null;
  const modeller = (g.modeller || []).map(m => {
    const h = haftaDegisimi((m.seri || []).map(x => ({ gun: x.gun, v: x.endeks })), bas, bit);
    return { id: m.id, ad: m.ad, para: m.para || 'USD', getiri: h ? h.getiri : null, dusus: h ? h.dusus : null };
  }).filter(m => m.getiri != null);
  const sorunlar = g.sorunlar ? { sayac: g.sorunlar.sayac || { toplam: 0 }, basliklar: (g.sorunlar.basliklar || []).slice(0, 5) } : null;
  const olaylar = g.olaylar ? { sayilar: g.olaylar.sayilar || {}, uyari: g.olaylar.uyari || 0, alarm: g.olaylar.alarm || 0 } : null;
  const ileri = { demo: (g.ileri && g.ileri.demo) || null, golge: ((g.ileri && g.ileri.golge) || []).map(String), hukumTarihleri: (g.ileri && g.ileri.hukumTarihleri) || [] };
  const r = { surum: 1, hafta: { ...g.hafta }, olusturma: new Date(g.olusturma || Date.now()).toISOString(), btc, botlar,
    portfoy: { portfoyum: pf ? pf.getiri : null, portfoyumDusus: pf ? pf.dusus : null, modeller }, sorunlar, olaylar, ileri };
  r.telegram = telegramParcalari(r);
  return r;
}

const MOD_AD = { demo: 'demo', kagit: 'kâğıt', canli: 'CANLI' };
/** Saf: karne → bildirim parçaları { simge, baslik, govde: [satır], ne } — YALNIZ YÜZDE. */
function telegramParcalari(r) {
  const h = r.hafta;
  const s = [`Hafta ${gunTr(h.bas)} – ${gunTr(h.bit)} (${h.etiket}) · yalnız yüzdeler`];
  s.push(`₿ BTC bu hafta: ${yuzde(r.btc)}`);
  if (r.botlar.length) {
    s.push('🤖 Botlar');
    for (const b of r.botlar) {
      const durum = b.durum === 'engel' ? ' · ⚠️ ENGEL (onay bekliyor)' : b.durum === 'durdu' ? ' · durdu' : '';
      s.push(b.getiri == null ? `• ${b.adGorunen} (${MOD_AD[b.mod] || b.mod || '—'}): bu hafta veri yok${durum}`
        : `• ${b.adGorunen} (${MOD_AD[b.mod] || b.mod || '—'}): ${yuzde(b.getiri)} · BTC'ye fark ${puan(b.fark)} · en büyük düşüş ${yuzde(-(b.dusus || 0))} · ${b.islem} işlem${durum}`);
    }
  } else s.push('🤖 Bot yok.');
  const pf = [];
  if (r.portfoy.portfoyum != null) pf.push(`Portföyüm ${yuzde(r.portfoy.portfoyum)}`);
  for (const m of r.portfoy.modeller) pf.push(`${m.ad} ${yuzde(m.getiri)}${m.para === 'TRY' ? ' (TL)' : ''}`);
  if (pf.length) s.push(`💼 Portföy: ${pf.join(' · ')}`);
  const so = r.sorunlar;
  if (so) {
    const c = so.sayac || {};
    const parca = [c.mudahale ? `${c.mudahale} müdahale` : null, c.dikkat ? `${c.dikkat} dikkat` : null, c.gecici ? `${c.gecici} kendiliğinden geçecek` : null].filter(Boolean);
    const ol = r.olaylar ? ` · bu hafta ${r.olaylar.alarm} alarm, ${r.olaylar.uyari} uyarı olayı` : '';
    s.push(parca.length ? `⚠️ Sorunlar şu an: ${parca.join(', ')}${ol}` : `✅ Şu an etkin sorun yok${ol}`);
    for (const b of so.basliklar.slice(0, 3)) s.push(`  – ${b}`);
  }
  const d = r.ileri.demo;
  if (d) s.push(`🧪 Kairos demo kabulü: ${d.gecenGun} gün${d.hukumTarihi ? ` · hüküm ${d.hukumTarihi}` : ''}${d.sonBant ? ` · son bant ${d.sonBant}` : ''} (ara durum, hüküm değil)`);
  // Telegram sınırı (4096): sığmayan gölge satırları sondan düşer, sayısı yazılır (hepsi panelde)
  const son = 'Ayrıntı: Pusula › Raporlar › Haftalık karne.';
  if (r.ileri.golge.length) {
    s.push('🧪 GÖLGE TESTİ — gerçek para değil, emir yok; ara sonuçtur, hüküm değildir.');
    const g = r.ileri.golge.slice();
    let dusen = 0;
    while (g.length && [...s, ...g, son].join('\n').length > 3500) { g.pop(); dusen++; }
    s.push(...g);
    if (dusen) s.push(`… ${dusen} gölge satırı daha — panelde`);
  }
  s.push(son);
  return { simge: '📒', baslik: `Haftalık karne · ${gunTr(h.bas)} – ${gunTr(h.bit)}`, govde: s, ne: '' };
}

module.exports = { karneKur, telegramParcalari, haftaDegisimi, tepedenDusus, hafta, haftaEtiketi, sonBitenHafta, istGun, yuzde, puan };
