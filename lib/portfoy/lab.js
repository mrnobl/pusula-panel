/**
 * PORTFÖY LABORATUVARI — KALICI KAYITLAR (L2): deneme sayacı (oturum başına), karar günlüğü, kayıtlı portföyler.
 * Dizin: data/portfoy-lab (git dışı). `dizin(yol)` ile değiştirilebilir (öz test geçici klasör kullanır).
 *
 *   denemeler(oturum, birim?)      → { oturum, baslangic, sayi (TÜM denemeler), sharpeler: [günlük Sharpe], son }
 *                                    birim verilirse sharpeler yalnız o birimin denemeleri (eski kayıtlarda birim yok → 'USD'). L4: Sharpe
 *                                    birimler arası kıyaslanamaz; TL'de mevduat ≈ sıfır oynaklık → tek deneme USD DSR'larını 0'a çekiyordu.
 *   denemeEkle(oturum, sharpeler, etiket, birim = 'USD') → güncel kayıt (her simülasyon/varyasyon adayı BİR deneme; DSR bunlarla düzeltilir)
 *   denemeSifirla(oturum)          → yeni boş oturum (eski kayıt 'arsiv' altında saklanır — sayaç gizlice silinmez)
 *   oturumlar()                    → [{ oturum, sayi, baslangic, son }]
 *   kararKaydet(tanim, plan, not)  → { id, zaman } — data/portfoy-lab/kararlar.jsonl'a YALNIZ EKLENİR (bir satır JSON)
 *   kararlar({ limit })            → [kayıt] en yeniden eskiye
 *   portfoyKaydet(ad, tanim, aciklama) · portfoyler() · portfoy(ad) · portfoySil(ad) → data/portfoy-lab/portfoyler/<ad>.json
 */
const fs = require('fs');
const path = require('path');
const O = require('./ortak');

let _dizin = null;
const dizin = (yeni) => { if (yeni !== undefined) _dizin = yeni; return _dizin || process.env.PORTFOY_LAB_DIZIN || O.yollar().veriYolu('portfoy-lab'); };
const yol = (...p) => path.join(dizin(), ...p);
const simdi = () => new Date(O.ortamAl().simdi()).toISOString();

// ── Deneme sayacı ────────────────────────────────────────────────────────────
const OTURUM_RE = /^[A-Za-z0-9_.\-]{1,64}$/;
function oturumDenetle(o) { const x = o == null || o === '' ? 'varsayilan' : String(o); if (!OTURUM_RE.test(x)) throw new Error('oturum: harf/rakam/_.- (≤ 64)'); return x; }
function sayacOku() { try { return O.jsonOku(yol('denemeler.json')); } catch (e) { return { oturumlar: {}, arsiv: [] }; } }
function sayacYaz(j) { O.jsonYaz(yol('denemeler.json'), j, 1); }
function denemeler(oturum, birim) {
  const o = oturumDenetle(oturum); const j = sayacOku();
  const k = j.oturumlar[o] || { baslangic: null, sharpeler: [], etiketler: [] };
  const sharpeler = birim == null ? k.sharpeler : k.sharpeler.filter((_, i) => ((k.birimler || [])[i] || 'USD') === birim);
  return { oturum: o, baslangic: k.baslangic, sayi: k.sharpeler.length, sharpeler, son: k.son || null };
}
function denemeEkle(oturum, sharpeler, etiket, birim = 'USD') {
  const o = oturumDenetle(oturum); const j = sayacOku();
  const k = j.oturumlar[o] || (j.oturumlar[o] = { baslangic: simdi(), sharpeler: [], etiketler: [] });
  if (!k.birimler) k.birimler = k.sharpeler.map(() => 'USD');
  for (const s of sharpeler) if (Number.isFinite(s)) { k.sharpeler.push(s); k.etiketler.push(etiket || null); k.birimler.push(String(birim || 'USD')); }
  k.son = simdi();
  sayacYaz(j);
  return denemeler(o);
}
function denemeSifirla(oturum) {
  const o = oturumDenetle(oturum); const j = sayacOku();
  if (j.oturumlar[o]) { j.arsiv = j.arsiv || []; j.arsiv.push({ oturum: o, kapanis: simdi(), ...j.oturumlar[o] }); delete j.oturumlar[o]; }
  sayacYaz(j);
  return denemeler(o);
}
function oturumlar() { const j = sayacOku(); return Object.entries(j.oturumlar).map(([o, k]) => ({ oturum: o, sayi: k.sharpeler.length, baslangic: k.baslangic, son: k.son || null })); }

// ── Karar günlüğü (yalnız ekle) ──────────────────────────────────────────────
function kararKaydet(tanim, plan, not) {
  if (!tanim || typeof tanim !== 'object') throw new Error('karar: tanım gerekli');
  const kayit = { id: `k-${O.ortamAl().simdi().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, zaman: simdi(), not: not == null ? '' : String(not), tanim, plan: plan || null };
  fs.mkdirSync(dizin(), { recursive: true });
  fs.appendFileSync(yol('kararlar.jsonl'), JSON.stringify(kayit) + '\n');
  return { id: kayit.id, zaman: kayit.zaman };
}
function kararlar({ limit = 200 } = {}) {
  let m; try { m = fs.readFileSync(yol('kararlar.jsonl'), 'utf8'); } catch (e) { return []; }
  const o = [];
  for (const s of m.split('\n')) { if (!s.trim()) continue; try { o.push(JSON.parse(s)); } catch (e) { /* bozuk satır atlanır */ } }
  return o.reverse().slice(0, limit);
}

// ── Kayıtlı portföyler ───────────────────────────────────────────────────────
const AD_RE = /^[\p{L}\p{N} _.\-()%/]{1,80}$/u;
function dosyaAdi(ad) {
  if (!AD_RE.test(ad)) throw new Error('portföy adı: harf/rakam/boşluk ve _.-()%/ (≤ 80)');
  const temiz = ad.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'portfoy';
  return temiz + '.json';
}
function portfoyKaydet(ad, tanim, aciklama) {
  if (!ad) throw new Error('portföy: ad gerekli');
  if (!tanim || !Array.isArray(tanim.varliklar)) throw new Error('portföy: tanim.varliklar gerekli');
  const p = yol('portfoyler', dosyaAdi(String(ad)));
  let eski = null; try { eski = O.jsonOku(p); } catch (e) { /* yeni */ }
  const k = { ad: String(ad), aciklama: aciklama || (eski && eski.aciklama) || '', tanim, olusturma: eski ? eski.olusturma : simdi(), guncelleme: simdi() };
  O.jsonYaz(p, k, 1);
  return k;
}
function portfoyler() {
  let l; try { l = fs.readdirSync(yol('portfoyler')).filter(f => f.endsWith('.json')); } catch (e) { return []; }
  return l.map(f => { try { return O.jsonOku(yol('portfoyler', f)); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => String(b.guncelleme).localeCompare(String(a.guncelleme)));
}
function portfoy(ad) { try { return O.jsonOku(yol('portfoyler', dosyaAdi(String(ad)))); } catch (e) { return null; } }
function portfoySil(ad) { try { fs.unlinkSync(yol('portfoyler', dosyaAdi(String(ad)))); return true; } catch (e) { return false; } }

module.exports = { dizin, denemeler, denemeEkle, denemeSifirla, oturumlar, kararKaydet, kararlar, portfoyKaydet, portfoyler, portfoy, portfoySil };
