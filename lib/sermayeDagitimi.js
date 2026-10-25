'use strict';
/**
 * A4 — SERMAYE DAĞITIMI (saf) — TASARIM-MAKINE-HESAP-BOT §8.2 "hedef paylar + sapma önerisi"; PLAN-MAKINE-HESAP-BOT §8 s2.
 * ═══════════════════════════════════════════════════════════════════════════
 * Dosya / ağ okumaz. `config.sermayeDagitimi` ayarını doğrular, botların son ölçülen özsermayesinden hedef paya göre sapmayı ve
 * sapmayı kapatan EN AZ sayıda aktarım önerisini hesaplar. Öneri yalnız ÖNERİDİR: aktarım her zaman kullanıcının panelde tek tek
 * başlattığı, PIN + "AKTAR" onaylı işlemdir (lib/aktarim/hizmet.js). Otomatik aktarım YOK.
 *
 *   config.sermayeDagitimi = { hedefler: { <botKimlik>: pay (0–1) }, bant (0,01–0,5), tekTavan (USDT), gunlukTavan (USDT), anaHesap? }
 *   · Paylar toplamı ≤ 1; hedef tutar = toplam × pay / Σpay (payı olan botların toplamı üzerinden).
 *   · Sapma bant dışındaysa (|fark| > bant × toplam) öneri üretilir; öneri tutarı aşağı yuvarlanır (1 USDT), EN_AZ altı atılır.
 *   · Canlı hesap aktarım kapısı (gercekAcik) BU AYARDA DEĞİL: yalnız sunucuda `npm run aktarim-kapisi` dosyasıyla (lib/aktarim/kapi.js).
 */

const VARSAYILAN = Object.freeze({ bant: 0.05, tekTavan: 500, gunlukTavan: 1000 });
const SINIR = Object.freeze({ bantEnAz: 0.01, bantEnCok: 0.5, tekTavanEnCok: 100000, gunlukTavanEnCok: 1000000 });
const EN_AZ = 5;                 // USDT — bunun altındaki öneri / aktarım yapılmaz
const BOT_RE = /^[a-z0-9-]{1,32}$/;
const HESAP_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

const sayi = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const yuvarla = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/** Etkin ayar (eksik alan varsayılanla; bozuk değer varsayılana döner). */
function ayar(c) {
  const a = c && typeof c === 'object' ? c : {};
  const h = {};
  if (a.hedefler && typeof a.hedefler === 'object' && !Array.isArray(a.hedefler)) {
    for (const [k, v] of Object.entries(a.hedefler)) { const p = sayi(v); if (BOT_RE.test(k) && Number.isFinite(p) && p > 0 && p <= 1) h[k] = p; }
  }
  const bant = sayi(a.bant), tek = sayi(a.tekTavan), gun = sayi(a.gunlukTavan);
  const o = {
    hedefler: h,
    bant: Number.isFinite(bant) && bant >= SINIR.bantEnAz && bant <= SINIR.bantEnCok ? bant : VARSAYILAN.bant,
    tekTavan: Number.isFinite(tek) && tek >= EN_AZ && tek <= SINIR.tekTavanEnCok ? tek : VARSAYILAN.tekTavan,
    gunlukTavan: Number.isFinite(gun) && gun >= EN_AZ && gun <= SINIR.gunlukTavanEnCok ? gun : VARSAYILAN.gunlukTavan,
    anaHesap: typeof a.anaHesap === 'string' && HESAP_RE.test(a.anaHesap) ? a.anaHesap : null,
  };
  if (o.gunlukTavan < o.tekTavan) o.gunlukTavan = o.tekTavan;
  return o;
}

/**
 * Panelden gelen ayar gövdesinin doğrulaması. `botlar` = bilinen bot kimlikleri (hedef yalnız onlara verilir).
 * @returns {{ ok, hatalar: string[], ayar }}  ayar yalnız ok iken anlamlı (config'e yazılacak biçim)
 */
function ayarDogrula(g, botlar = [], hesaplar = []) {
  const hatalar = [];
  const x = g && typeof g === 'object' ? g : {};
  const bilinen = new Set(botlar);
  const hedefler = {};
  if (x.hedefler != null) {
    if (typeof x.hedefler !== 'object' || Array.isArray(x.hedefler)) hatalar.push('hedef paylar bir nesne olmalı ({ bot: pay })');
    else {
      let top = 0;
      for (const [k, v] of Object.entries(x.hedefler)) {
        if (!BOT_RE.test(k) || !bilinen.has(k)) { hatalar.push(`bilinmeyen bot: ${String(k).slice(0, 32)}`); continue; }
        const p = sayi(v);
        if (!Number.isFinite(p) || p < 0 || p > 1) { hatalar.push(`${k}: pay 0 ile 1 arasında olmalı (yüzde 0–100)`); continue; }
        if (p > 0) { hedefler[k] = yuvarla(p, 4); top += p; }
      }
      if (top > 1 + 1e-9) hatalar.push(`payların toplamı %${yuvarla(top * 100, 1)} — en çok %100`);
    }
  }
  const sinirli = (ad, v, enAz, enCok, metin) => {
    if (v == null || v === '') return undefined;
    const s = sayi(v);
    if (!Number.isFinite(s) || s < enAz || s > enCok) { hatalar.push(metin); return undefined; }
    return s;
  };
  const bant = sinirli('bant', x.bant, SINIR.bantEnAz, SINIR.bantEnCok, `sapma bandı %${SINIR.bantEnAz * 100}–%${SINIR.bantEnCok * 100} olmalı`);
  const tek = sinirli('tekTavan', x.tekTavan, EN_AZ, SINIR.tekTavanEnCok, `tek aktarım tavanı ${EN_AZ}–${SINIR.tekTavanEnCok} USDT olmalı`);
  const gun = sinirli('gunlukTavan', x.gunlukTavan, EN_AZ, SINIR.gunlukTavanEnCok, `günlük tavan ${EN_AZ}–${SINIR.gunlukTavanEnCok} USDT olmalı`);
  if (tek != null && gun != null && gun < tek) hatalar.push('günlük tavan tek aktarım tavanından küçük olamaz');
  let anaHesap;
  if (x.anaHesap !== undefined) {
    if (x.anaHesap === null || x.anaHesap === '') anaHesap = null;
    else if (!HESAP_RE.test(String(x.anaHesap)) || !hesaplar.includes(String(x.anaHesap))) hatalar.push('ana hesabın işlem hesabı Anahtarlar\'daki canlı hesaplardan biri olmalı');
    else anaHesap = String(x.anaHesap);
  }
  const out = { hedefler };
  if (bant != null) out.bant = bant;
  if (tek != null) out.tekTavan = tek;
  if (gun != null) out.gunlukTavan = gun;
  if (anaHesap !== undefined) out.anaHesap = anaHesap;
  return { ok: hatalar.length === 0, hatalar, ayar: out };
}

/**
 * Sapma + öneri. @param botlar [{ kimlik, ad, ozsermaye (USDT | null), aktarilabilir: bool, neden? }]
 * @returns { toplam, paySum, satirlar: [{ kimlik, ad, ozsermaye, pay, hedef, fark, sapma, bantDisi, aktarilabilir, neden }], oneriler: [{ kaynak, hedef, tutar }], not }
 */
function sapma(botlar, a0) {
  const a = ayar(a0);
  const l = (Array.isArray(botlar) ? botlar : []).filter(b => b && BOT_RE.test(String(b.kimlik)));
  const payli = l.filter(b => a.hedefler[b.kimlik] > 0);
  const olculen = payli.filter(b => Number.isFinite(b.ozsermaye) && b.ozsermaye >= 0);
  const toplam = olculen.reduce((s, b) => s + b.ozsermaye, 0);
  const paySum = olculen.reduce((s, b) => s + a.hedefler[b.kimlik], 0);
  const satirlar = l.map(b => {
    const pay = a.hedefler[b.kimlik] || 0;
    const olcu = Number.isFinite(b.ozsermaye) && b.ozsermaye >= 0;
    const hedef = pay > 0 && olcu && paySum > 0 ? toplam * pay / paySum : null;
    const fark = hedef != null ? hedef - b.ozsermaye : null;
    return { kimlik: b.kimlik, ad: b.ad || b.kimlik, ozsermaye: olcu ? yuvarla(b.ozsermaye) : null, pay, hedef: hedef != null ? yuvarla(hedef) : null,
      fark: fark != null ? yuvarla(fark) : null, sapma: fark != null && toplam > 0 ? yuvarla(fark / toplam, 4) : null,
      bantDisi: fark != null && toplam > 0 && Math.abs(fark) > a.bant * toplam, aktarilabilir: !!b.aktarilabilir, neden: b.neden || null };
  });
  const oneriler = [];
  let not = null;
  if (!payli.length) not = 'Hedef pay girilmedi — önce botlara hedef payları verin.';
  else if (olculen.length < payli.length) not = 'Payı olan botlardan bazılarının özsermayesi henüz ölçülmedi — öneri yalnız ölçülenler arasında.';
  if (satirlar.some(s => s.bantDisi)) {
    const fazla = satirlar.filter(s => s.fark != null && s.fark < 0 && s.aktarilabilir).map(s => ({ k: s.kimlik, m: -s.fark })).sort((x, y) => y.m - x.m);
    const eksik = satirlar.filter(s => s.fark != null && s.fark > 0 && s.aktarilabilir).map(s => ({ k: s.kimlik, m: s.fark })).sort((x, y) => y.m - x.m);
    let i = 0, j = 0;
    while (i < fazla.length && j < eksik.length) {
      const m = Math.min(fazla[i].m, eksik[j].m), t = Math.floor(m);
      if (t >= EN_AZ) oneriler.push({ kaynak: fazla[i].k, hedef: eksik[j].k, tutar: t });
      fazla[i].m -= m;
      eksik[j].m -= m;
      if (fazla[i].m < EN_AZ) i++;
      if (eksik[j].m < EN_AZ) j++;
    }
    if (!oneriler.length) not = not || 'Sapma bant dışında ama aktarılabilir bot çifti yok (kâğıt / demo botlar ya da hesabı aktarıma uygun olmayan botlar).';
    else if (oneriler.some(o => o.tutar > a.tekTavan)) not = `Önerilerden biri tek aktarım tavanını (${a.tekTavan} USDT) aşıyor — birkaç aktarımda yapılır.`;
  }
  return { toplam: yuvarla(toplam), paySum: yuvarla(paySum, 4), bant: a.bant, satirlar, oneriler, not };
}

module.exports = { VARSAYILAN, SINIR, EN_AZ, BOT_RE, HESAP_RE, ayar, ayarDogrula, sapma };
