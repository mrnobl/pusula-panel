'use strict';
/**
 * EV BAĞLANTISI (61.7) — YALNIZ GELİŞTİRME BİLGİSAYARINDA: buradaki panel bot ve işlem ekranlarını sunucudaki panelden
 * salt okuma ile çeker (lib/evOkuma.js). Ayar `data/ev-baglanti.json` (git'e girmez).
 *
 *   npm run sunucu-baglanti -- --adres https://<sunucu>.<ağ>.ts.net --jeton <jeton>   → kaydet + dene
 *   npm run sunucu-baglanti                                                      → durumu göster + dene
 *   npm run sunucu-baglanti -- --sil                                             → kapat (yerel eski kopyaya döner)
 *   64.8 YAZMA (İşlem defterim + Portföyüm buradan girilir, sunucuya iletilir / sunucu kapalıysa kuyrukta bekler — lib/evYazma.js):
 *   npm run sunucu-baglanti -- --yazma-jeton <jeton>                             → yazma jetonunu kaydet + dene (jeton ekrana yazılmaz)
 *   npm run sunucu-baglanti -- --yazma-sil                                       → yazmayı kapat (okuma sürer)
 *
 * Jeton: sunucuda `npm run telefon-jeton` çıktısındaki panel jetonu. Yazma jetonu: sunucuda `npm run gelistirme-jeton`
 * (ayrı jeton; sunucuda yalnız özeti durur). Adres: sunucudaki `tailscale serve` adresi.
 * Panelin yeniden başlatılması gerekmez (ayar her istekte okunur).
 */
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const { ayarYolu } = require('../lib/evOkuma');
const GV = require('../lib/guvenlik');

const KOK = path.join(__dirname, '..');
const arg = (ad) => { const i = process.argv.indexOf(`--${ad}`); return i > 0 ? process.argv[i + 1] : undefined; };

function hamOku(yol) { return require('../lib/sirKasasi').okuGuvenli(yol, {}); }   // 69.6 sır kasası

async function dene(a) {
  try {
    const r = await fetch(`${a.adres}/api/health`, { headers: { 'x-panel-token': a.jeton }, signal: AbortSignal.timeout(10000), redirect: 'error' });   // F3: jeton yönlendirmeyle başka kökene gitmez
    const j = await r.json().catch(() => null);
    // /api/health kâğıt motoru durunca 503 döner ama gövdesi yine geçerli — sürüm alanı varsa erişim tamam.
    if (j && j.appVersion) {
      console.log(`✓ Sunucudaki panele ulaşıldı: sürüm ${j.appVersion} · kademe ${j.kademe || '?'}`);
      return true;
    }
    console.log(`✗ Sunucudaki panel yanıt verdi ama kabul etmedi (HTTP ${r.status}): ${j && j.error ? j.error : ''}`);
  } catch (e) {
    console.log(`✗ Sunucudaki panele ulaşılamadı: ${e.name === 'TimeoutError' ? '10 sn zaman aşımı' : e.message}`);
    console.log('  Kontrol: bu bilgisayarda Tailscale açık mı · sunucuda `tailscale serve --bg 3000` çalışıyor mu · sunucu bilgisayar açık mı');
  }
  return false;
}

/** Yazma jetonunu dener (yazmaz: GET /api/ev-yazma/dene). Jeton hiçbir çıktıya girmez. */
async function yazmaDene(a) {
  try {
    const r = await fetch(`${a.adres}/api/ev-yazma/dene`, { headers: { 'x-panel-token': a.jeton, [GV.GELISTIRME_BASLIK]: a.yazmaJetonu }, signal: AbortSignal.timeout(10000), redirect: 'error' });   // F3: jeton yönlendirmeyle başka kökene gitmez
    const j = await r.json().catch(() => null);
    if (j && j.gelistirme) { console.log(`✓ Yazma jetonu sunucuda kabul edildi (sürüm ${j.surum}) — İşlem defterim ve Portföyüm buradan yazılır.`); return true; }
    if (r.status === 404 || (j && j.success && !j.gelistirme)) console.log('✗ Sunucudaki panel yazma kademesini tanımıyor — sunucuda 64.8 ya da yenisi kurulu olmalı (git pull + panel yeniden başlatma).');
    else console.log(`✗ Yazma jetonu reddedildi (HTTP ${r.status}): ${j && j.error ? j.error : ''}`);
  } catch (e) {
    console.log(`✗ Yazma denenemedi: ${e.name === 'TimeoutError' ? '10 sn zaman aşımı' : e.message} — sunucu kapalıyken yazmalar kuyrukta bekler.`);
  }
  return false;
}

(async () => {
  const yol = ayarYolu(KOK);
  if (process.argv.includes('--sil')) {
    try { fs.unlinkSync(yol); console.log('Sunucu bağlantısı kapatıldı — panel yerel (eski) kopyayı gösterir.'); } catch { console.log('Zaten kapalı.'); }
    return;
  }
  if (fs.existsSync(yollar.veri('makine.json')) === false) {
    console.log('⚠ data/makine.json yok — bu sunucu olabilir. Sunucu bağlantısı yalnız geliştirme bilgisayarında (araştırma modu) çalışır.');
  }
  const adres = arg('adres'), jeton = arg('jeton'), yazma = arg('yazma-jeton');
  const yazmaSil = process.argv.includes('--yazma-sil');
  if (adres || jeton || yazma || yazmaSil) {
    const eski = hamOku(yol);
    const yeni = { adres: String(adres || eski.adres || '').trim().replace(/\/+$/, ''), jeton: String(jeton || eski.jeton || '').trim() };
    const yj = yazmaSil ? '' : String(yazma || eski.yazmaJetonu || '').trim();
    if (!/^https?:\/\/[^\s/]+$/.test(yeni.adres)) throw new Error('Adres https://<sunucu>.<ağ>.ts.net biçiminde olmalı (önce --adres ve --jeton ile okuma bağlantısını kurun).');
    if (yeni.jeton.length < 24) throw new Error('Jeton eksik/kısa — sunucuda `npm run telefon-jeton` çıktısındaki jeton.');
    if (yazma != null && yj.length < 32) throw new Error('Yazma jetonu eksik/kısa — sunucuda `npm run gelistirme-jeton` çıktısındaki jeton.');
    if (yj) yeni.yazmaJetonu = yj;
    fs.mkdirSync(path.dirname(yol), { recursive: true });
    require('../lib/sirKasasi').yaz(yol, { ...yeni, kayit: new Date().toISOString() });   // 69.6 sır kasası (DPAPI)
    console.log(`Kaydedildi: ${path.relative(KOK, yol)} · adres ${yeni.adres} · yazma ${yj ? 'açık (jeton kayıtlı)' : 'kapalı'}`);
  }
  const { ayarOku } = require('../lib/evOkuma');
  const a = ayarOku(KOK);
  if (!a) {
    console.log('Sunucu bağlantısı kurulu değil. Kullanım: npm run sunucu-baglanti -- --adres https://<sunucu>.<ağ>.ts.net --jeton <jeton>');
    return;
  }
  console.log(`Sunucu bağlantısı: ${a.adres} · yazma ${a.yazmaJetonu ? 'açık' : 'kapalı (açmak için: sunucuda npm run gelistirme-jeton, burada npm run sunucu-baglanti -- --yazma-jeton <jeton>)'}`);
  let tamam = await dene(a);
  if (tamam && a.yazmaJetonu) tamam = await yazmaDene(a);
  process.exitCode = tamam ? 0 : 1;
})().catch(e => { console.error(`Hata: ${e.message}`); process.exitCode = 1; });
