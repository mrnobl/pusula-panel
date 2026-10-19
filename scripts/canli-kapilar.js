'use strict';
/**
 * GERÇEK PARA ŞARTLARI — YAZILI ONAY (61.8, PLAN-GERCEK-PARA-2027.md §1 G1–G9). YALNIZ EVDEKİ BİLGİSAYARDA, kullanıcı çalıştırır.
 * Kayıt `data/live/canli-kapilar.json` (git'e girmez). lib/live/canliKapi.js bu dosyayı okur; G1–G9'un hepsi onaylı, sermaye
 * üst sınırı yazılı ve tarih ≥ 2027-01-05 olmadan gerçek para kipi panelde görünmez.
 *
 *   npm run canli-kapilar                                   → durum (hangi şart onaylı, kapı açık mı)
 *   npm run canli-kapilar -- --onayla G1,G2 --not "…"       → şartları bugünün tarihiyle onayla (not isteğe bağlı)
 *   npm run canli-kapilar -- --geri-al G4                   → onayı kaldır (ör. demo ölçümü bozuldu)
 *   npm run canli-kapilar -- --ust-sinir 1000               → G9 sermaye üst sınırı (USDT); ilk sınır en çok 1000 (Ö5)
 *   npm run canli-kapilar -- --ust-sinir 2000 --artirma-gerekcesi "90 gün Normal + Tutarlı"   → artırma (her adım en çok ×2)
 *
 * Şartların ANLAMI ve nasıl bakılacağı PLAN-GERCEK-PARA-2027.md §1 tablosunda; bu betik ölçmez, yalnız yazılı onayı kaydeder.
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const K = require('../lib/live/canliKapi');
const kalici = require('../lib/live/kaliciDosya');

const KOK = path.join(__dirname, '..');
const DOSYA = yollar.veri('live', 'canli-kapilar.json');
const arg = (ad) => { const i = process.argv.indexOf(`--${ad}`); return i > 0 ? process.argv[i + 1] : undefined; };
const bugun = () => new Date().toISOString().slice(0, 10);
const ACIKLAMA = {
  G1: 'BTC al-tut kuralı (kısıtlı modelle sağlandı)', G2: 'H1 zaman dışı BTC', G3: 'İleri test A: 90. gün "Tutarlı"',
  G4: 'Demo ≥ 30 gün B bandı Normal', G5: 'Demo 30 gün mutabakat temiz', G6: 'Acil durdurma tatbikatı (demo + telefon + kâğıt)',
  G7: 'Çoklu varlık: kâğıt 14 gün + demo yoklaması', G8: 'Mali müşavir yazılı görüşü', G9: 'Sermaye ve kesiciler yazılı',
};

function oku() { const { veri } = kalici.oku(DOSYA); return veri || { onaylar: {}, sermayeUstSinir: null, gecmis: [] }; }

(() => {
  if (fs.existsSync(yollar.veri('makine.json'))) {
    console.log('Bu geliştirme bilgisayarı (data/makine.json var) — gerçek para onayı yalnız sunucuda verilir.');
    process.exitCode = 1; return;
  }
  const k = oku();
  k.onaylar = k.onaylar || {}; k.gecmis = k.gecmis || [];
  let degisti = false;
  const onayla = arg('onayla'), geriAl = arg('geri-al'), ust = arg('ust-sinir'), not = arg('not') || null;
  if (onayla) {
    for (const g of onayla.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) {
      if (!K.SARTLAR.includes(g)) throw new Error(`bilinmeyen şart: ${g} (G1–G9)`);
      if (g === 'G3' && bugun() < K.CANLI_EN_ERKEN) throw new Error(`G3 ${K.CANLI_EN_ERKEN}'ten önce onaylanamaz (90. gün kontrol noktası)`);
      k.onaylar[g] = { onay: true, tarih: bugun(), not };
      k.gecmis.push({ zaman: new Date().toISOString(), islem: 'onay', sart: g, not });
      degisti = true;
    }
  }
  if (geriAl) {
    for (const g of geriAl.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) {
      delete k.onaylar[g];
      k.gecmis.push({ zaman: new Date().toISOString(), islem: 'geri-al', sart: g, not });
      degisti = true;
    }
  }
  if (ust != null) {
    const yeni = +ust;
    if (!(yeni > 0)) throw new Error('--ust-sinir pozitif sayı (USDT) olmalı');
    const eski = +k.sermayeUstSinir || 0;
    const gerekce = arg('artirma-gerekcesi');
    if (!(eski > 0) && yeni > K.MUTLAK_UST) throw new Error(`ilk sınır en çok ${K.MUTLAK_UST} (Ö5) — artırma 90 gün sonra, mevcut sınırdan en çok ×2`);
    if (yeni > eski && eski > 0 && !gerekce) throw new Error('artırma için --artirma-gerekcesi "…" gerekli (B bandı Normal, A Tutarlı, ≥ 90 gün)');
    if (eski > 0 && yeni > 2 * eski) throw new Error(`artırma her adımda en çok ×2 (şimdiki ${eski} → en çok ${2 * eski})`);
    k.sermayeUstSinir = yeni;
    if (gerekce) k.artirmaGerekcesi = gerekce;
    k.gecmis.push({ zaman: new Date().toISOString(), islem: 'ust-sinir', deger: yeni, gerekce: gerekce || null });
    degisti = true;
  }
  if (degisti) { kalici.yaz(DOSYA, k); console.log(`Kaydedildi: ${path.relative(KOK, DOSYA)}\n`); }

  console.log('Gerçek para şartları (PLAN-GERCEK-PARA-2027.md §1):');
  for (const g of K.SARTLAR) {
    const o = k.onaylar[g];
    console.log(`  ${o && o.onay ? '✓' : '·'} ${g} ${ACIKLAMA[g]}${o && o.onay ? ` — ${o.tarih}${o.not ? ` (${o.not})` : ''}` : ''}`);
  }
  console.log(`  Sermaye üst sınırı (G9): ${k.sermayeUstSinir ? `${k.sermayeUstSinir} USDT` : 'yok'}`);
  const tarihTamam = bugun() >= K.CANLI_EN_ERKEN;
  console.log(`\nTarih: ${bugun()} ${tarihTamam ? '✓' : `(gerçek para en erken ${K.CANLI_EN_ERKEN})`}`);
  console.log('Kapının kalan şartları (API anahtarı, healthchecks, canlı sermaye tavanı) panelde Botlar kartında listelenir.');
})();
