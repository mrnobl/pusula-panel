'use strict';
/**
 * PORTFÖYÜM — BİR KEZLİK TAŞIMA (64.8): geliştirme bilgisayarındaki yerel Portföyüm kayıtlarını (data/portfoyum/kayit.jsonl)
 * sunucudaki Portföyüm'e ekler. Kullanıcı kararı 2026-10-16: sunucu tek kaynak; önce kuru deneme (hangi kayıt eklenecek, hangisi sunucuda
 * zaten var), kullanıcı onaylar, gönderim aynı kuyruktan (lib/evYazma.js). Yerel dosya SİLİNMEZ; taşındı bayrağı konur.
 *
 * SAF: `plan(evKayitlar, yerelKayitlar, ops)` — sunucudaki ve yereldeki ham kayıtlardan:
 *   eklenecek   sunucuda olmayan yerel kayıtlar, EVİN kimlik uzayına çevrilmiş (kurum/hesap/varlık eşlemesi + yeni kimlik)
 *   zatenVar    içerik olarak sunucuda olanlar (kimlik ve yazılma zamanı yok sayılır: tür, tarih, hesap, varlık, adet, fiyat… aynı)
 *   eklenemez   sunucunun doğrulaması (depo.ekle yazma:false — ops.dene) reddettikleri + bağımlıları (ör. sunucuda farklı açılış zaten var)
 *   atlanan     yerelde iptal edilmiş kayıtlar ve düzeltme (iptal) kayıtları — taşınmaz (sunucudaki eşdeğerini iptal etmesin)
 * Eşleme: kurum = ad (büyük/küçük harf duyarsız, son adı ya da ilk adı); hesap = eşlenen kurum + ad + para; varlık = sembol + para
 * (sunucunun kuralı: aynı sembol+para ikinci kez açılamaz). Diğer kayıtlar başvuruları çevrildikten sonra içerik imzasıyla karşılaştırılır.
 */
const M = require('./model');

const YOK_SAY = new Set(['id', 'sira', 'zaman', 'kaynakKayit', 'istek']);
const norm = (s) => String(s == null ? '' : s).trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');

/** İçerik imzası: kimlik/sıra/zaman/kaynak dışındaki alanlar, anahtarlar sıralı. */
function imza(k) {
  const sirala = (v) => {
    if (Array.isArray(v)) return v.map(sirala);
    if (v && typeof v === 'object') { const o = {}; for (const a of Object.keys(v).sort()) o[a] = sirala(v[a]); return o; }
    return v;
  };
  const o = {};
  for (const a of Object.keys(k).sort()) if (!YOK_SAY.has(a) && !a.startsWith('_')) o[a] = sirala(k[a]);
  return JSON.stringify(o);
}

const ON_EK = { kurum: 'k', 'kurum-ad': 'k', hesap: 'h', 'hesap-ad': 'h', 'hesap-kapat': 'h', 'hesap-faiz': 'h', varlik: 'v', 'varlik-guncelle': 'v', islem: 'i', fiyat: 'f', hedef: 'd' };

/** Kısa ekran özeti (yerel adlarla). */
function ozetle(k, yD) {
  const hesap = (id) => { const h = yD.hesaplar.get(id); return h ? h.ad : id; };
  const varlik = (id) => { const v = yD.varliklar.get(id); return v ? v.sembol : id; };
  switch (k.tur) {
    case 'kurum': return `Kurum: ${k.ad}`;
    case 'kurum-ad': return `Kurum adı: ${k.ad}`;
    case 'hesap': return `Hesap: ${k.ad} (${k.para})`;
    case 'hesap-ad': return `Hesap adı: ${k.ad}`;
    case 'hesap-kapat': return `Hesap kapanışı: ${hesap(k.hesap)} ${k.tarih}`;
    case 'hesap-faiz': return `Mevduat faizi ayarı: ${hesap(k.hesap)} %${k.oran}`;
    case 'varlik': return `Varlık: ${k.sembol} (${k.para})`;
    case 'varlik-guncelle': return `Varlık düzeltmesi: ${varlik(k.varlik)}`;
    case 'fiyat': return `Elle fiyat: ${varlik(k.varlik)} ${k.tarih}`;
    case 'hedef': return `Hedef dağılım (${k.duzey === 'varlik' ? 'varlık' : 'sınıf'})`;
    case 'islem': {
      const ad = (M.ISLEM_TURLERI && M.ISLEM_TURLERI[k.islem] && (M.ISLEM_TURLERI[k.islem].ad || M.ISLEM_TURLERI[k.islem])) || k.islem;
      const ne = k.varlik ? varlik(k.varlik) : (k.para || '');
      const mik = k.adet != null ? `${k.adet} adet` : k.tutar != null ? `${k.tutar} ${k.para || ''}`.trim() : '';
      return `İşlem: ${typeof ad === 'string' ? ad : k.islem} · ${k.tarih} · ${hesap(k.hesap)} · ${ne}${mik ? ' · ' + mik : ''}`;
    }
    default: return k.tur;
  }
}

/**
 * @param {object[]} evKayitlar   sunucudaki ham kayıtlar (depo.oku().kayitlar)
 * @param {object[]} yerelKayitlar taşınacak ham kayıtlar
 * @param {{bugun:string, dene?:(kayitlar)=>{tamam:boolean, hatalar:{id:string,mesaj:string}[]}}} ops
 */
function plan(evKayitlar, yerelKayitlar, ops = {}) {
  const bugun = ops.bugun || M.yerelGun();
  const eD = M.durumKur(evKayitlar || [], { bugun });
  const yD = M.durumKur(yerelKayitlar || [], { bugun });
  const yerelHatali = new Set((yD.hatalar || []).map(h => h.id).filter(Boolean));
  const harita = new Map();                      // yerel kimlik → sunucu kimliği
  const kullanilan = new Set((evKayitlar || []).map(k => k.id));
  const evImza = new Map(), evIptalImza = new Map();   // imza → [sunucu kimliği] (çoklu küme)
  const ekleL = (m, a, v) => { if (!m.has(a)) m.set(a, []); m.get(a).push(v); };
  for (const k of evKayitlar || []) if (k.tur !== 'duzeltme') ekleL(eD.iptalEdilen.has(k.id) ? evIptalImza : evImza, imza(k), k.id);
  const evKurumAd = new Map([...eD.kurumlar.values()].map(x => [x.id, x.ad]));
  const evHesapAd = new Map([...eD.hesaplar.values()].map(x => [x.id, x.ad]));
  const eklenecek = [], zatenVar = [], eklenemez = [], atlanan = [];
  let n = 0;
  const yeniKimlik = (tur) => { let id; do { n += 1; id = `${ON_EK[tur] || 'r'}t${n}`; } while (kullanilan.has(id)); kullanilan.add(id); return id; };
  const cevir = (id) => (id == null || id === '' ? id : harita.get(id));
  const sirali = (yerelKayitlar || []).slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
  const yeniMi = new Set();

  for (const k of sirali) {
    const oz = ozetle(k, yD);
    if (k.tur === 'duzeltme') { atlanan.push({ id: k.id, ozet: `Düzeltme (iptal) kaydı`, neden: 'iptal kayıtları taşınmaz' }); continue; }
    if (yD.iptalEdilen.has(k.id)) { atlanan.push({ id: k.id, ozet: oz, neden: 'bu bilgisayarda iptal edilmiş' }); continue; }
    if (yerelHatali.has(k.id)) { atlanan.push({ id: k.id, ozet: oz, neden: 'bu bilgisayarda da hatalı kayıt' }); continue; }
    const x = { ...k };
    for (const a of YOK_SAY) delete x[a];
    for (const a of Object.keys(x)) if (a.startsWith('_')) delete x[a];
    let eksik = null;
    const bagla = (alan) => {
      if (x[alan] == null || x[alan] === '') return;
      const c = cevir(x[alan]);
      if (!c) { eksik = alan; return; }
      x[alan] = c;
    };
    if (k.tur === 'kurum') {
      const sonAd = (yD.kurumlar.get(k.id) || {}).ad || k.ad;
      const ev = [...eD.kurumlar.values()].find(e => norm(e.ad) === norm(sonAd) || norm(e.ad) === norm(k.ad));
      if (ev) { harita.set(k.id, ev.id); zatenVar.push({ id: k.id, ozet: oz, evId: ev.id }); continue; }
    } else if (k.tur === 'hesap') {
      bagla('kurum');
      if (!eksik) {
        const sonAd = (yD.hesaplar.get(k.id) || {}).ad || k.ad;
        const ev = [...eD.hesaplar.values()].find(e => e.kurum === x.kurum && e.para === k.para && (norm(e.ad) === norm(sonAd) || norm(e.ad) === norm(k.ad)));
        if (ev) { harita.set(k.id, ev.id); zatenVar.push({ id: k.id, ozet: oz, evId: ev.id }); continue; }
      }
    } else if (k.tur === 'varlik') {
      const ev = [...eD.varliklar.values()].find(e => e.sembol === k.sembol && e.para === k.para);
      if (ev) { harita.set(k.id, ev.id); zatenVar.push({ id: k.id, ozet: oz, evId: ev.id }); continue; }
    } else {
      if (k.tur === 'kurum-ad') bagla('kurum');
      for (const a of ['hesap', 'hedefHesap', 'varlik']) if (!eksik) bagla(a);
      if (!eksik && Array.isArray(x.dahilEdilen)) x.dahilEdilen = x.dahilEdilen.map(cevir).filter(Boolean);
      if (!eksik && k.tur === 'hedef' && k.duzey === 'varlik' && x.agirliklar && typeof x.agirliklar === 'object') {
        const ag = {};
        for (const [a, w] of Object.entries(x.agirliklar)) { if (/^nakit:/.test(a)) ag[a] = w; else { const c = cevir(a); if (!c) { eksik = 'agirliklar'; break; } ag[c] = w; } }
        x.agirliklar = ag;
      }
      if (!eksik) {
        // Ad değişikliği sunucuda zaten o adla duruyorsa yazılmaz
        if (k.tur === 'kurum-ad' && norm(evKurumAd.get(x.kurum)) === norm(x.ad) && !yeniMi.has(x.kurum)) { zatenVar.push({ id: k.id, ozet: oz }); continue; }
        if (k.tur === 'hesap-ad' && norm(evHesapAd.get(x.hesap)) === norm(x.ad) && !yeniMi.has(x.hesap)) { zatenVar.push({ id: k.id, ozet: oz }); continue; }
        // F8: çoklu küme — her sunucu kaydı en çok bir yerel kayıtla eşleşir (iki aynı yerel + bir ev = 1 zaten var + 1 eklenecek)
        const im = imza(x);
        const evL = evImza.get(im);
        if (evL && evL.length) { const evId = evL.shift(); harita.set(k.id, evId); zatenVar.push({ id: k.id, ozet: oz, evId }); continue; }
        // F8: sunucuda aynısı İPTAL edilmişse yeniden eklenmez (kullanıcı sunucuda bilerek iptal etti)
        const ipL = evIptalImza.get(im);
        if (ipL && ipL.length) { ipL.shift(); atlanan.push({ id: k.id, ozet: oz, neden: 'sunucuda iptal edilmiş' }); continue; }
      }
    }
    if (eksik) { eklenemez.push({ id: k.id, ozet: oz, neden: `bağlı olduğu kayıt (${eksik}) taşınamadı` }); continue; }
    x.id = yeniKimlik(k.tur);
    harita.set(k.id, x.id);
    yeniMi.add(x.id);
    eklenecek.push({ kayit: x, yerelId: k.id, ozet: oz });
  }

  // Sunucunun doğrulaması: reddedilen kayıtlar (ve onlara bağlananlar) çıkarılır, kalan yeniden denenir.
  if (typeof ops.dene === 'function') {
    for (let tur = 0; tur < 30 && eklenecek.length; tur++) {
      const r = ops.dene(eklenecek.map(e => e.kayit));
      if (r.tamam) break;
      const kotu = new Map();
      for (const h of r.hatalar || []) if (h.id) kotu.set(h.id, h.mesaj);
      if (!kotu.size) { for (const e of eklenecek.splice(0)) eklenemez.push({ id: e.yerelId, ozet: e.ozet, neden: (r.hatalar || []).map(h => h.mesaj).join(' · ') || 'sunucunun doğrulaması reddetti' }); break; }
      const dusen = new Set(kotu.keys());
      let degisti = true;
      while (degisti) {
        degisti = false;
        for (const e of eklenecek) {
          if (dusen.has(e.kayit.id)) continue;
          const b = e.kayit;
          const baglar = [b.kurum, b.hesap, b.hedefHesap, b.varlik, ...(Array.isArray(b.dahilEdilen) ? b.dahilEdilen : []), ...(b.tur === 'hedef' && b.agirliklar ? Object.keys(b.agirliklar) : [])];
          if (baglar.some(v => v && dusen.has(v))) { dusen.add(b.id); degisti = true; }
        }
      }
      for (let i = eklenecek.length - 1; i >= 0; i--) {
        const e = eklenecek[i];
        if (dusen.has(e.kayit.id)) { eklenemez.unshift({ id: e.yerelId, ozet: e.ozet, neden: kotu.get(e.kayit.id) || 'bağlı olduğu kayıt eklenemedi' }); eklenecek.splice(i, 1); }
      }
    }
  }
  return { eklenecek, zatenVar, eklenemez, atlanan };
}

/** Ekran / yanıt için gövdesiz özet. */
function disari(p) {
  const kisa = (l) => l.map(e => ({ id: e.yerelId || e.id, ozet: e.ozet, neden: e.neden || null }));
  return { eklenecek: kisa(p.eklenecek), zatenVar: kisa(p.zatenVar), eklenemez: kisa(p.eklenemez), atlanan: kisa(p.atlanan),
    sayilar: { eklenecek: p.eklenecek.length, zatenVar: p.zatenVar.length, eklenemez: p.eklenemez.length, atlanan: p.atlanan.length } };
}

module.exports = { plan, disari, imza, ozetle };
