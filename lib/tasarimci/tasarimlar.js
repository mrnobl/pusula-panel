/**
 * PORTFÖY TASARIMCISI — KENDİ TASARIMLARIM: kurucu kaydı = yeni sürüm (denetim B-02, DENETIM-PANEL-B.md "Tasarım kurucu
 * kaydet = yeni sürüm"; karar PLAN-IKI-AY.md Ö11 + Ö14). Öz test: node scripts/tasarimci-tasarim-selftest.js.
 * ═══════════════════════════════════════════════════════════════════════════
 * İLKE: izlenen üç model (kayitlar/tasarim/t1-sN.json) bu modülden ASLA etkilenmez. Kullanıcının kurucuda kurduğu birleşim
 * <TASARIMCI_DIZIN>/tasarimlar.jsonl dosyasına YALNIZ EKLENEREK yazılır; bir satır sonradan değişmez, silinmez.
 *
 * Ö14 kuralları (kod düzeyinde):
 *   · etiket 'olculmemis' (şablonla birebir olanlar 'kabul-sablon') — ekranda "ölçülmemiş — kabul değil".
 *   · deneme sayacına / deftere (kayitlar/denemeler.jsonl) HİÇBİR ŞEY yazılmaz — bu araştırma değil izlemedir.
 *   · emir listesi / "Uyguladım" YOK: emir uçları yalnız MD.MODELLER'i (üç model) kabul eder; m-u-* reddedilir.
 *   · aynı anda en çok ENCOK (3) tasarım 'izleniyor'.
 *
 * SATIR (her işlem bir satır; aynı id'nin her satırı bir sürümdür):
 *   { id: 'u-1', surum: 1.., islem: 'kaydet'|'izlemeye-al'|'yeni-surum'|'durdur', tarih: 'YYYY-AA-GG', ad,
 *     kollar: [{ strateji, agirlik (%; toplam 100'e oranlanmış) }], dengeleme: { kural, bantPuan?, denetim? },
 *     etiket: 'kabul-sablon'|'olculmemis', sablon: id|null, not, durum: 'taslak'|'izleniyor'|'durduruldu',
 *     yururluk: 'YYYY-AA-GG'|null (izleme/yeni sürüm: SONRAKİ KARAR GÜNÜ — takvim.js ay son işlem günü kapanışı),
 *     bitis: 'YYYY-AA-GG'|null (durdur), onceki: 'u-1@1'|null, oncekiImza: sha|null (zincir), makine: 'ev'|'deneme',
 *     imza: sha256(kanonik(satır − imza)) }
 *   Yeni sürüm yürürlüğe girene kadar seri ESKİ sürümle sürer (geçmiş günler değişmez).
 *
 * SERİ (izlenen tasarımın ileri değeri, 100 taban): yalnız OKUMADAN hesaplanır (GET dosya yazmaz). Kol seviyeleri:
 *   ileri model/kıyas serileri (gunluk.jsonl: k-qqq, m-qqq-m10, m-bist-m10, k-btc, k-xu030 — USD endeks), Hücum/Denge
 *   simülasyon zinciri (stratejiler/hucum.js, model 837 ile aynı kaynak), Kalkan simülasyon eğrisi, SHY (Yahoo, düzeltilmiş).
 *   Yürürlük günü kapanışında 100; sonraki her gün kol oranlarıyla (eksik gün = son değer); dengeleme kurala göre (aylık /
 *   çeyreklik / yıllık = ayın son günü kapanışı, bant = her gün |pay − hedef| > bant), maliyet devir × %0,05. Yeni sürüm
 *   yürürlük günü kapanışında yeni ağırlıklara geçer. 'durdur' → seri bitis gününde biter.
 *
 * API
 *   oku() → { satirlar, bozuk }      gruplu(satirlar) → Map(id → [satır, sürüm sırasıyla])
 *   hazirla(islem, girdi, { bugun, satirlar? }) → { satir, imza, uyarilar }   (hata: TasarimHatasi { kod, durum })
 *   ekle(satir) → satir   (kilitli; okunduğundan beri dosya değiştiyse ya da aynı id'nin son satırı değiştiyse hata)
 *   sonrakiKararGunu(bugun, borsa) · ozet(gecmis, { bugun, seviyeAl? }) · liste({ bugun, seviyeAl? })
 *   seriHesapla(gecmis, seviye, { bugun }) → { satirlar:[{ gun, endeks, surum }], eksik:[strateji], not } (SAF)
 *   kolSeviyeleri(stratejiler) → Map(strateji → Map(gun → seviye))   (dosya okur)
 *   ENCOK · KAYNAK_ESLE
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const T = require('./takvim');
const DF = require('./defter');
const KT = require('./katalog');

const ENCOK = 3;
const DOSYA = 'tasarimlar.jsonl';
const KILIT = 'tasarimlar.kilit';
const MALIYET = 0.0005;
const GUN = 864e5;
const R = x => (Number.isFinite(x) ? +x.toPrecision(12) : x);
const GUN_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISLEMLER = ['kaydet', 'izlemeye-al', 'yeni-surum', 'durdur'];
/** Kurucu kolu → ileri seri kaynağı. */
const KAYNAK_ESLE = Object.freeze({
  'qqq-altut': { gunluk: 'k-qqq' }, 'qqq-m10': { gunluk: 'm-qqq-m10' }, 'bist-m10': { gunluk: 'm-bist-m10' }, 'btc-altut': { gunluk: 'k-btc' },
  'xu030-altut': { gunluk: 'k-xu030' }, hucum: { zincir: 'hucum' }, denge: { zincir: 'denge' }, kalkan: { egri: 'kalkan' }, 'tahvil-kisa': { yahoo: 'SHY' },
});

class TasarimHatasi extends Error { constructor(mesaj, kod = 'gecersiz', durum = 400) { super(mesaj); this.kod = kod; this.durum = durum; } }

// ═══ DOSYA ═════════════════════════════════════════════════════════════════════
const yol = () => DF.yol(DOSYA);
function ham() { try { return fs.readFileSync(yol(), 'utf8'); } catch (e) { return ''; } }
function cozumle(metin) {
  const satirlar = [], bozuk = [];
  metin.split('\n').forEach((s, i) => { if (!s.trim()) return; try { satirlar.push(JSON.parse(s)); } catch (e) { bozuk.push({ satir: i + 1, mesaj: `satır ${i + 1}: geçersiz JSON` }); } });
  return { satirlar, bozuk };
}
const oku = () => cozumle(ham());
function gruplu(satirlar) {
  const m = new Map();
  for (const s of satirlar || []) { if (!s || !s.id) continue; if (!m.has(s.id)) m.set(s.id, []); m.get(s.id).push(s); }
  for (const l of m.values()) l.sort((a, b) => a.surum - b.surum);
  return m;
}
const imzala = (s) => { const { imza, ...g } = s; void imza; return DF.sha(g); };

/** Süreçler arası kilit (tik kilidinden AYRI: tasarım kaydı model tikini beklemez). Bayat = 30 sn'den eski. */
function kilitli(f) {
  fs.mkdirSync(DF.dizin(), { recursive: true });
  const k = DF.yol(KILIT), benim = JSON.stringify({ pid: process.pid, bas: Date.now(), r: crypto.randomBytes(4).toString('hex') });
  for (let i = 0; i < 3; i++) {
    try { const fd = fs.openSync(k, 'wx'); try { fs.writeSync(fd, benim); } finally { fs.closeSync(fd); } break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let yas = 0; try { yas = Date.now() - fs.statSync(k).mtimeMs; } catch (x) { continue; }
      if (yas < 30e3) throw new TasarimHatasi('tasarım kaydı şu an başka bir işlemde — birkaç saniye sonra yeniden deneyin', 'kilit', 409);
      try { fs.unlinkSync(k); } catch (x) { /* başkası sildi */ }
      if (i === 2) throw new TasarimHatasi('tasarım kilidi alınamadı', 'kilit', 409);
    }
  }
  try { return f(); } finally { try { if (fs.readFileSync(k, 'utf8') === benim) fs.unlinkSync(k); } catch (e) { /* yok */ } }
}

// ═══ DOĞRULAMA ══════════════════════════════════════════════════════════════
function kollarCoz(kollar) {
  if (!Array.isArray(kollar) || !kollar.length) throw new TasarimHatasi('en az bir kol (strateji + ağırlık) gerekli');
  if (kollar.length > 8) throw new TasarimHatasi('en çok 8 kol');
  const izinli = new Set(KT.KOLLAR.map(k => k.strateji)), l = [];
  for (const k of kollar) {
    const s = String(k && k.strateji || ''), a = Number(typeof (k && k.agirlik) === 'string' ? k.agirlik.replace(',', '.') : k && k.agirlik);
    if (!izinli.has(s)) throw new TasarimHatasi(`bilinmeyen kol: ${s || '(boş)'}`);
    if (!Number.isFinite(a) || a < 0 || a > 100) throw new TasarimHatasi(`${s}: ağırlık 0–100 arası olmalı`);
    if (!(a > 0)) continue;
    if (l.some(x => x.strateji === s)) throw new TasarimHatasi(`${s} iki kez seçilmiş`);
    l.push({ strateji: s, agirlik: a });
  }
  const top = l.reduce((x, k) => x + k.agirlik, 0);
  if (!(top > 0)) throw new TasarimHatasi('ağırlık toplamı 0');
  return l.map(k => ({ strateji: k.strateji, agirlik: R(k.agirlik * 100 / top) }));
}
function dengelemeCoz(d) {
  const kural = String(d && typeof d === 'object' ? d.kural : d || 'aylik');
  if (!KT.DENGELEME_TANIM[kural]) throw new TasarimHatasi(`dengeleme: ${Object.keys(KT.DENGELEME_TANIM).join(' | ')}`);
  const t = KT.DENGELEME_TANIM[kural];
  return { kural, ...(t.siklik === 'bant' ? { bantPuan: Math.round(t.bant * 100), denetim: t.denetim || 'gunluk' } : {}) };
}
const metinCoz = (x, en, ad) => { const s = String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim(); if (s.length > en) throw new TasarimHatasi(`${ad} en çok ${en} karakter`); return s; };

/** Sonraki karar günü: bugünden SONRAKİ ilk ay son işlem günü (NYSE; bütün kollar BIST ise BIST). */
function sonrakiKararGunu(bugun, borsa = 'NYSE') { return T.sonrakiKararlar(1, borsa, { simdi: T.ms(bugun) + GUN })[0].karar; }
const borsaSec = (kollar) => (kollar.every(k => { const t = KT.KOLLAR.find(x => x.strateji === k.strateji); return t && t.hesap === 'tr-banka'; }) ? 'BIST' : 'NYSE');
const makineEtiketi = () => (DF.makine() === 'ev' ? 'ev' : 'deneme');

// ═══ HAZIRLA (önizleme) ═════════════════════════════════════════════════════
function hazirla(islem, girdi = {}, { bugun, satirlar } = {}) {
  if (!ISLEMLER.includes(islem)) throw new TasarimHatasi(`işlem: ${ISLEMLER.join(' | ')}`);
  if (!GUN_RE.test(String(bugun || ''))) throw new TasarimHatasi('bugün tarihi yok', 'ic', 500);
  const tum = satirlar || (() => { const o = oku(); if (o.bozuk.length) throw new TasarimHatasi(`tasarimlar.jsonl bozuk (${o.bozuk[0].mesaj}) — elle onarın`, 'bozuk', 500); return o.satirlar; })();
  const G = gruplu(tum);
  const id = girdi.id ? String(girdi.id) : null;
  const gecmis = id ? G.get(id) : null;
  if (id && !gecmis) throw new TasarimHatasi(`tasarım bulunamadı: ${id}`, 'yok', 404);
  const son = gecmis ? gecmis[gecmis.length - 1] : null;
  const uyarilar = [];
  const izlenen = [...G.values()].filter(l => l[l.length - 1].durum === 'izleniyor' && l[0].id !== id).length;
  const icerik = () => {
    const kollar = kollarCoz(girdi.kollar), dengeleme = dengelemeCoz(girdi.dengeleme);
    const et = KT.etiketle(kollar, dengeleme.kural);
    const ad = metinCoz(girdi.ad, 60, 'ad') || (son ? son.ad : `Tasarım ${G.size + 1}`);
    return { ad, kollar, dengeleme, etiket: et.kabul ? 'kabul-sablon' : 'olculmemis', sablon: et.sablon || null, not: metinCoz(girdi.not == null && son ? son.not : girdi.not, 300, 'not') };
  };
  const eskiIcerik = () => ({ ad: son.ad, kollar: son.kollar, dengeleme: son.dengeleme, etiket: son.etiket, sablon: son.sablon, not: son.not });
  let govde;
  if (islem === 'kaydet') {
    if (son && son.durum === 'izleniyor') throw new TasarimHatasi('bu tasarım izleniyor — değişiklik için "Yeni sürüm" kullanın (sonraki karar gününde yürürlüğe girer)', 'izleniyor', 409);
    if (!son && G.size >= 20) throw new TasarimHatasi('en çok 20 kayıtlı tasarım');
    govde = { ...icerik(), durum: 'taslak', yururluk: null, bitis: null };
  } else if (islem === 'izlemeye-al') {
    if (!son) throw new TasarimHatasi('önce tasarımı kaydedin');
    if (son.durum === 'izleniyor') throw new TasarimHatasi('bu tasarım zaten izleniyor', 'izleniyor', 409);
    if (izlenen >= ENCOK) throw new TasarimHatasi(`aynı anda en çok ${ENCOK} kendi tasarım izlenir — önce birini durdurun`, 'encok', 409);
    const ic = eskiIcerik();
    govde = { ...ic, durum: 'izleniyor', yururluk: sonrakiKararGunu(bugun, borsaSec(ic.kollar)), bitis: null };
  } else if (islem === 'yeni-surum') {
    if (!son) throw new TasarimHatasi('önce tasarımı kaydedin');
    if (son.durum !== 'izleniyor') throw new TasarimHatasi('yeni sürüm yalnız izlenen tasarım için; taslağı "Kaydet" ile güncelleyin', 'durum', 409);
    const ic = icerik();
    if (DF.kanonik({ k: ic.kollar, d: ic.dengeleme }) === DF.kanonik({ k: son.kollar, d: son.dengeleme })) throw new TasarimHatasi('kollar ve dengeleme aynı — yeni sürüm gerekmiyor', 'ayni', 409);
    const ilk = gecmis.find(s => s.durum === 'izleniyor');
    if (ilk && ilk.yururluk && T.ms(bugun) - T.ms(ilk.yururluk) < 365 * GUN) uyarilar.push('İzleme başlayalı 12 ay olmadı: yeni sürüm ileri dönemi SIFIRLAR — yeni kuralın sonucu ancak yürürlükten sonraki günlerle okunabilir.');
    govde = { ...ic, durum: 'izleniyor', yururluk: sonrakiKararGunu(bugun, borsaSec(ic.kollar)), bitis: null };
  } else {
    if (!son) throw new TasarimHatasi('tasarım seçilmedi');
    if (son.durum === 'durduruldu') throw new TasarimHatasi('bu tasarım zaten durduruldu', 'durum', 409);
    govde = { ...eskiIcerik(), durum: 'durduruldu', yururluk: son.yururluk || null, bitis: bugun };
  }
  const yid = id || `u-${1 + Math.max(0, ...[...G.keys()].map(k => +(/^u-(\d+)$/.exec(k) || [0, 0])[1]))}`;
  if (govde.etiket === 'olculmemis') uyarilar.push('Ölçülmemiş birleşim — kabul değil: izlenir ama emir listesi açılmaz, deneme sayacına girmez.');
  const satir = { id: yid, surum: son ? son.surum + 1 : 1, islem, tarih: bugun, ...govde,
    onceki: son ? `${son.id}@${son.surum}` : null, oncekiImza: son ? son.imza : null, makine: makineEtiketi() };
  satir.imza = imzala(satir);
  return { satir, imza: satir.imza, uyarilar };
}

/** Yalnız ekle. Okunduğu andan beri dosya değiştiyse (ya da id'nin son sürümü artık farklıysa) yazmaz. */
function ekle(satir) {
  return kilitli(() => {
    const eski = ham(), { satirlar, bozuk } = cozumle(eski);
    if (bozuk.length) throw new TasarimHatasi(`tasarimlar.jsonl bozuk (${bozuk[0].mesaj})`, 'bozuk', 500);
    if (imzala(satir) !== satir.imza) throw new TasarimHatasi('satır imzası tutmuyor', 'imza', 409);
    const g = gruplu(satirlar).get(satir.id) || [];
    const son = g[g.length - 1] || null;
    if ((son ? son.imza : null) !== (satir.oncekiImza || null) || (son ? son.surum + 1 : 1) !== satir.surum) throw new TasarimHatasi('tasarım bu arada değişti — önizlemeyi yenileyin', 'onizleme', 409);
    if (ham() !== eski) throw new TasarimHatasi('tasarimlar.jsonl okunduktan sonra değişti — yeniden deneyin', 'onizleme', 409);
    DF.atomikYaz(yol(), (eski && !eski.endsWith('\n') ? eski + '\n' : eski) + JSON.stringify(satir) + '\n');
    return satir;
  });
}

/**
 * Satırların zinciri: her satır imzalı, onceki/oncekiImza aynı id'nin bir önceki satırını gösterir.
 * Baştan eksiklik (denetim 61.1 D2): bir id'nin ilk satırı sürüm 1 ve önceki'siz olmalı ("zincirin başı eksik"); kimlikler
 * u-1'den boşluksuz verilir (hazirla: 1 + en büyük) — aradaki ya da baştaki eksik kimlik "tasarım satırları eksik".
 */
function zincirDogrula(satirlar) {
  const hatalar = [];
  const G = gruplu(satirlar);
  for (const [id, l] of G) l.forEach((s, i) => {
    if (imzala(s) !== s.imza) hatalar.push(`${id}@${s.surum}: imza tutmuyor`);
    if (i === 0) {
      if (s.surum !== 1 || s.onceki != null || s.oncekiImza != null) hatalar.push(`${id}@${s.surum}: zincirin başı eksik (ilk satır sürüm 1 değil ya da önceki satıra bağlı — eski satırlar silinmiş olabilir)`);
      return;
    }
    const o = l[i - 1];
    if (s.surum !== i + 1 || (s.oncekiImza || null) !== o.imza) hatalar.push(`${id}@${s.surum}: zincir kopuk`);
  });
  const nolar = [...G.keys()].map(k => +(/^u-(\d+)$/.exec(k) || [0, 0])[1]).filter(n => n > 0);
  const enBuyuk = nolar.length ? Math.max(...nolar) : 0;
  for (let n = 1; n < enBuyuk; n++) if (!G.has(`u-${n}`)) hatalar.push(`u-${n}: tasarım satırları eksik (kimlik dizisinde boşluk — satırlar silinmiş olabilir)`);
  return { tamam: !hatalar.length, hatalar };
}

// ═══ SERİ (SAF) ═════════════════════════════════════════════════════════════
/** Son 'izleme koşusu': son izlemeye-al'dan itibaren 'izleniyor' sürümleri (+ durdurma). */
function kosu(gecmis) {
  let bas = -1;
  for (let i = gecmis.length - 1; i >= 0; i--) { if (gecmis[i].islem === 'izlemeye-al') { bas = i; break; } }
  if (bas < 0) return null;
  const l = gecmis.slice(bas);
  const surumler = l.filter(s => s.durum === 'izleniyor' && s.yururluk).map(s => ({ surum: s.surum, yururluk: s.yururluk, kollar: s.kollar, dengeleme: s.dengeleme }));
  const dur = l.find(s => s.durum === 'durduruldu');
  // Aynı yürürlük gününe düşen sonraki sürüm öncekinin yerini alır (yürürlükten önce değiştirildi).
  const tekil = [];
  for (const s of surumler) { while (tekil.length && tekil[tekil.length - 1].yururluk >= s.yururluk) tekil.pop(); tekil.push(s); }
  return { surumler: tekil, bitis: dur ? dur.bitis : null };
}
function dengeGunu(kural, gun, sonraki) {
  // Ayın son günü kapanışı: listede sonraki gün başka aydaysa ya da gün takvim ayının son günüyse.
  const ay = +gun.slice(5, 7);
  const sonMu = sonraki ? sonraki.slice(0, 7) !== gun.slice(0, 7) : T.iso(T.ms(gun) + GUN).slice(0, 7) !== gun.slice(0, 7);
  if (!sonMu) return false;
  if (kural === 'aylik') return true;
  if (kural === 'ceyrek') return ay % 3 === 0;
  if (kural === 'yillik') return ay === 12;
  return false;
}
/**
 * gecmis: aynı id'nin satırları · seviye: Map(strateji → Map(gun → seviye)) · bugun.
 * → { satirlar:[{ gun, endeks, surum, dengelendi? }], eksik, not, bekleyen: { surum, yururluk } | null }
 */
function seriHesapla(gecmis, seviye, { bugun }) {
  const k = kosu(gecmis || []);
  if (!k || !k.surumler.length) return { satirlar: [], eksik: [], not: 'izlenmiyor', bekleyen: null };
  const bitis = [bugun, k.bitis].filter(Boolean).sort()[0];
  const etkinler = k.surumler.filter(s => s.yururluk <= bitis);
  const bekleyen = k.surumler.find(s => s.yururluk > bitis) || null;
  if (!etkinler.length) return { satirlar: [], eksik: [], not: `yürürlük ${k.surumler[0].yururluk} kapanışında başlar`, bekleyen: bekleyen && { surum: bekleyen.surum, yururluk: bekleyen.yururluk } };
  const kollarTum = [...new Set(etkinler.flatMap(s => s.kollar.map(x => x.strateji)))];
  const eksik = kollarTum.filter(s => !(seviye.get(s) && seviye.get(s).size));
  const bas = etkinler[0].yururluk;
  const gunSet = new Set();
  for (const s of kollarTum) for (const g of (seviye.get(s) || new Map()).keys()) if (g >= bas && g <= bitis) gunSet.add(g);
  gunSet.add(bas);
  const gunler = [...gunSet].sort();
  // Kol seviyesi: o gün ya da öncesindeki son değer.
  const sirali = new Map(kollarTum.map(s => [s, [...(seviye.get(s) || new Map())].filter(([g, v]) => Number.isFinite(v) && v > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))]));
  const imlec = new Map(kollarTum.map(s => [s, -1]));
  const seviyeAl = (s, g) => { const l = sirali.get(s); let i = imlec.get(s); while (i + 1 < l.length && l[i + 1][0] <= g) i++; imlec.set(s, i); return i >= 0 ? l[i][1] : NaN; };
  const out = [];
  let aktif = etkinler[0], h = null, onceki = null, V = 1;
  const yerles = (w, Vs) => new Map(w.kollar.map(x => [x.strateji, Vs * x.agirlik / 100]));
  for (let i = 0; i < gunler.length; i++) {
    const g = gunler[i];
    const L = new Map(kollarTum.map(s => [s, seviyeAl(s, g)]));
    if (!h) {
      if (aktif.kollar.some(x => !Number.isFinite(L.get(x.strateji)))) continue;   // başlangıç gününde verisi olmayan kol: seri o kolun ilk değerini bekler
      h = yerles(aktif, 1); onceki = L; V = 1;
      out.push({ gun: g, endeks: 100, surum: aktif.surum });
      continue;
    }
    for (const [s, v] of h) { const a = onceki.get(s), b = L.get(s); if (Number.isFinite(a) && Number.isFinite(b) && a > 0) h.set(s, v * b / a); }
    V = [...h.values()].reduce((a, b) => a + b, 0);
    let dengelendi = false;
    const yeni = etkinler.filter(s => s.yururluk <= g && s.surum > aktif.surum).pop() || null;
    const hedefe = (w) => {
      const hed = yerles(w, V); let devir = 0;
      for (const s of new Set([...h.keys(), ...hed.keys()])) devir += Math.abs((hed.get(s) || 0) - (h.get(s) || 0));
      const c = MALIYET * devir; h = yerles(w, V - c); V -= c; dengelendi = true;
    };
    if (yeni && yeni.kollar.every(x => Number.isFinite(L.get(x.strateji)))) { aktif = yeni; hedefe(aktif); }
    else if (aktif.dengeleme.kural === 'bant-gunluk-10') {
      const bant = (aktif.dengeleme.bantPuan || 10) / 100;
      if (aktif.kollar.some(x => Math.abs((h.get(x.strateji) || 0) / V - x.agirlik / 100) > bant)) hedefe(aktif);
    } else if (aktif.dengeleme.kural !== 'yok' && dengeGunu(aktif.dengeleme.kural, g, gunler[i + 1])) hedefe(aktif);
    onceki = L;
    out.push({ gun: g, endeks: R(100 * V), surum: aktif.surum, ...(dengelendi ? { dengelendi: true } : {}) });
  }
  return { satirlar: out, eksik, not: out.length ? null : 'kol verisi yürürlük gününe ulaşmadı', bekleyen: bekleyen && { surum: bekleyen.surum, yururluk: bekleyen.yururluk } };
}

// ═══ KOL SEVİYELERİ (dosya okur) ═══════════════════════════════════════════════
function kolSeviyeleri(stratejiler) {
  const out = new Map();
  let gunluk = null;
  const gunlukAl = () => { if (!gunluk) { gunluk = new Map(); for (const s of DF.oku('gunluk').satirlar) { if (!gunluk.has(s.model)) gunluk.set(s.model, new Map()); if (Number.isFinite(s.endeks)) gunluk.get(s.model).set(s.gun, s.endeks); } } return gunluk; };
  const tarih = t => new Date(t).toISOString().slice(0, 10);
  for (const s of new Set(stratejiler)) {
    const k = KAYNAK_ESLE[s]; let m = new Map();
    try {
      if (!k) m = new Map();
      else if (k.gunluk) m = gunlukAl().get(k.gunluk) || new Map();
      else if (k.zincir) m = new Map(require('./stratejiler/hucum').zincir({ ad: k.zincir }).egri.map(x => [tarih(x.time), x.oz]));
      else if (k.egri) m = new Map(require('./stratejiler/hucum').simulasyonEgrisi(k.egri).map(x => [tarih(x.time), x.oz]));
      else if (k.yahoo) { const V = require('./veri'); m = V.seriVarMi(k.yahoo) ? new Map(V.duzeltilmis(k.yahoo).map(x => [tarih(x.t), x.c])) : new Map(); }
    } catch (e) { m = new Map(); }
    out.set(s, m);
  }
  return out;
}

const METRIK = (satirlar) => require('./model').metrik(satirlar);
/** Bir tasarımın ekran özeti (sürüm geçmişi + izleme serisi). */
function ozet(gecmis, { bugun, seviyeAl = kolSeviyeleri } = {}) {
  const son = gecmis[gecmis.length - 1];
  const k = kosu(gecmis);
  let seri = null;
  if (k && k.surumler.length && k.surumler[0].yururluk <= bugun) {
    try {
      const sv = seviyeAl(k.surumler.flatMap(s => s.kollar.map(x => x.strateji)));
      const r = seriHesapla(gecmis, sv, { bugun });
      seri = { ...r, metrik: METRIK(r.satirlar) };
    } catch (e) { seri = { satirlar: [], eksik: [], not: 'seri hesaplanamadı: ' + e.message, metrik: null }; }
  } else if (k && k.surumler.length) seri = { satirlar: [], eksik: [], not: `yürürlük ${k.surumler[0].yururluk} kapanışında başlar`, metrik: null, bekleyen: { surum: k.surumler[0].surum, yururluk: k.surumler[0].yururluk } };
  return { id: son.id, ad: son.ad, durum: son.durum, surum: son.surum, son, gecmis, seri };
}
function liste({ bugun, seviyeAl } = {}) {
  const o = oku();
  const G = gruplu(o.satirlar);
  const tasarimlar = [...G.values()].map(g => ozet(g, { bugun, seviyeAl })).sort((a, b) => (+a.id.slice(2) || 0) - (+b.id.slice(2) || 0));
  return { tasarimlar, izlenen: tasarimlar.filter(t => t.durum === 'izleniyor').length, enCok: ENCOK, bozuk: o.bozuk, zincir: zincirDogrula(o.satirlar) };
}

module.exports = { oku, gruplu, hazirla, ekle, zincirDogrula, seriHesapla, kolSeviyeleri, ozet, liste, sonrakiKararGunu, kosu, ENCOK, KAYNAK_ESLE, TasarimHatasi, DOSYA, MALIYET };
