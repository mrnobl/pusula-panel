#!/usr/bin/env node
/**
 * DİKKAT LİSTESİ F0 — ücretsiz kaynak envanteri (PLAN-DIKKAT-LISTESI.md §3 F0; katalog: lib/tarama/kaynakSagligi.js).
 * ═══════════════════════════════════════════════════════════════════════════
 *   node scripts/dikkat-f0-envanter.js              her uca BİR istek → data/dikkat/envanter-YYYY-MM-DD.json (aynı gün tekrar
 *                                                   koşulursa üzerine; önceki koşuların özeti dosyada kalır)
 *   node scripts/dikkat-f0-envanter.js --md         + referans/DIKKAT-KAYNAK-ENVANTERI.md özet tablosunu yeniden üret
 *   node scripts/dikkat-f0-envanter.js --kaynak goplus,github   yalnız bu kaynaklar (dosyaya YAZMAZ — günlük kayıt tam olmalı)
 *   node scripts/dikkat-f0-envanter.js --oztest     ağsız öz test (sahte fetch)
 *   --zorla                                         günlük kota korumasını geç (aşağıya bak)
 *
 * Ücretli uç yok; anahtar gereken uç anahtarsız denenir (401/403 beklenir, "anahtar gerekli"). Tokenomist sayfaları
 * otomatik erişimi yasakladığı için çekilmez (yalnız API ucu). KOTA KORUMASI: günlük kotası dar kaynaklar (BGeometrics 15/gün) GÜNDE EN ÇOK 1 kez sınanır —
 * data/dikkat/kota-YYYY-MM-DD.json (her koşu, --kaynak dahil, harcadığı istekleri buraya yazar); o gün sınandıysa atlanır ve
 * günün dosyasındaki önceki sonucu taşınır (`--zorla` geçer). Tokenomist'e tarayıcı kimliğiyle (Mozilla UA) istek ATILMAZ:
 * katalogda yalnız API ucu var, sayfa ucu yok (2026-10-09 elle bir kez görüldü, tekrarlanmayacak).
 * Binance: data/veri-durum.json'da hız sınırı beklemesi sürüyorsa Binance uçları atlanır. Kayıt dizini: DIKKAT_DIZIN.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const K = require('../lib/tarama/kaynakSagligi');

const argv = process.argv.slice(2);
const bayrak = (a) => argv.includes(a);
const deger = (a) => { const i = argv.indexOf(a); return i >= 0 ? argv[i + 1] : null; };
const KOK = path.join(__dirname, '..');
const MD = path.join(KOK, 'referans', 'DIKKAT-KAYNAK-ENVANTERI.md');

const DURUM_AD = { ok: 'çalışıyor', kismi: 'kısmi', hata: 'ÇALIŞMIYOR', anahtar_gerekli: 'anahtar gerekli', atlandi: 'atlandı' };
const hucre = (x) => String(x == null || x === '' ? '—' : x).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function derinlikMetni(d) {
  if (!d) return '—';
  const p = [];
  if (d.ilk && d.son) p.push(`${d.ilk} → ${d.son}`); else if (d.ilk) p.push(`${d.ilk}'den`); else if (d.son) p.push(`son ${d.son}`);
  if (d.nokta) p.push(`${d.nokta} nokta`);
  if (d.not) p.push(d.not);
  return p.join('; ') || '—';
}
const ekMetni = (e) => (e ? Object.entries(e).map(([k, v]) => `${k} ${v}`).join(', ') : '—');
const basMetni = (b) => (b && Object.keys(b).length ? Object.entries(b).map(([k, v]) => `${k}: ${v}`).join('; ') : 'yok');

function markdown(sonuc) {
  const kat = Object.fromEntries(K.KATALOG.map(k => [k.ad, k]));
  const say = { ok: 0, kismi: 0, hata: 0, anahtar_gerekli: 0, atlandi: 0 };
  for (const v of Object.values(sonuc.kaynaklar)) say[v.durum] = (say[v.durum] || 0) + 1;
  const harita = K.bozulmaHaritasi();
  const L = [];
  L.push('# Dikkat listesi F0 — ücretsiz kaynak envanteri');
  L.push('');
  L.push(`**Üretim:** \`node scripts/dikkat-f0-envanter.js --md\` · son koşu **${sonuc.zaman}** · ham sonuç \`data/dikkat/envanter-${sonuc.tarih}.json\` (depoya girmez).`);
  L.push('Katalog, limit/ToS notları ve bozulma haritası: `lib/tarama/kaynakSagligi.js`. Panel: **Veri** ekranı › "Dikkat listesi kaynakları" (son 30 g başarı, kota, bozulma haritası).');
  L.push('Plan: `PLAN-DIKKAT-LISTESI.md` §3 F0 · ön kayıt: `PLAN-DIKKAT-V1-ONKAYIT.md` · araştırma: `referans/ARASTIRMA-ONCHAIN-OTOMASYON.md` §5.');
  L.push('');
  L.push(`**Özet:** ${Object.keys(sonuc.kaynaklar).length} kaynak — ${say.ok} çalışıyor · ${say.kismi} kısmi · ${say.hata} çalışmıyor · ${say.anahtar_gerekli} anahtar gerekli · ${say.atlandi} atlandı.`);
  L.push('');
  L.push('## 1. Kaynak tablosu (kaynak başına)');
  L.push('');
  L.push('| kaynak | grup | anahtar | durum | uç / HTTP / ms | belgelenmiş limit | ToS / lisans | rol |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const k of K.KATALOG) {
    const d = sonuc.kaynaklar[k.ad] || {};
    const uclar = sonuc.sonuclar.filter(s => s.kaynak === k.ad && s.kimlik !== '-').map(s => `${s.kimlik} ${s.http == null ? '—' : s.http}${s.ms != null ? ` ${s.ms} ms` : ''}`).join('<br>');
    L.push(`| **${hucre(k.kisaAd)}** | ${hucre(k.grup)} | ${hucre(k.anahtar)} | ${hucre(DURUM_AD[d.durum] || d.durum)} | ${uclar || 'sınanmadı'} | ${hucre(k.limit)} | ${hucre(k.tos)} | ${hucre(k.rol)} |`);
  }
  L.push('');
  L.push('## 2. Uç ayrıntısı (uç başına)');
  L.push('');
  L.push('| kaynak · uç | HTTP | ms | bayt | SHA-256 (ilk 16) | limit başlıkları | geçmiş derinliği | sayım | alanlar (ilk 12) |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of sonuc.sonuclar) {
    if (s.kimlik === '-') continue;
    L.push(`| ${hucre(kat[s.kaynak] ? kat[s.kaynak].kisaAd : s.kaynak)} · \`${hucre(s.kimlik)}\`${s.hata ? `<br>**${hucre(s.hata)}**` : ''} | ${hucre(s.http)} | ${hucre(s.ms)} | ${hucre(s.bayt)} | ${s.sha256 ? `\`${s.sha256.slice(0, 16)}\`` : '—'} | ${hucre(basMetni(s.limitBasliklari))} | ${hucre(derinlikMetni(s.derinlik))} | ${hucre(ekMetni(s.ek))} | ${hucre((s.alanlar || []).slice(0, 12).join(', '))} |`);
  }
  L.push('');
  L.push('Uç adresleri tam hâliyle ham JSON dosyasında (`uc` alanı). SHA-256 gövdenin tamamınındır; anlık listelerde her koşuda değişir — amaç "o gün ne alındı" kanıtı, sabitlik değil.');
  L.push('');
  L.push('## 3. Bozulma haritası — "bu kaynak bozulursa hangi bayrak üretilemez"');
  L.push('');
  L.push('`mevcut` = lib/tarama bayrağı (bugün üretiliyor); `planli` = kural-v1 kapısı / ailesi (F1–F4). Ağ: evm / sol / hepsi.');
  L.push('');
  L.push('| kaynak | üretilemez (tek kaynak) | yedekle sürer |');
  L.push('|---|---|---|');
  const ad = (x) => `${x.ad} (${x.ag}${x.durum === 'planli' ? ', planlı' : ''})`;
  for (const [k, v] of Object.entries(harita).sort()) L.push(`| ${hucre(kat[k] ? kat[k].kisaAd : k)} | ${hucre(v.uretilemez.map(ad).join(' · ') || '—')} | ${hucre(v.yedekleSurer.map(ad).join(' · ') || '—')} |`);
  L.push('');
  L.push('## 4. Notlar (2026-10-09 ilk koşu, elle doğrulananlar dahil)');
  L.push('');
  L.push('- **Tokenomist:** API anahtar ister (401 `x-api-key not found`); sayfalar tarayıcı kimliğiyle bile **403 `automated_access_not_allowed`** — "ücretsiz görünüm" yalnız insan gözüyle. Unlock kapısı F2\'de **elle girilen** olay kaydıyla çalışır; otomatik çekim yapılmaz (ToS).');
  L.push('- **BGeometrics:** `sth-sopr/last` yanıtı `delayed: true` — 7 günlük gecikme STH-SOPR\'u da kapsıyor (araştırma notu "kapsamıyor" diyordu → DÜZELTİLDİ). Bağlam şeridi için önemsiz (karar kuralı yok).');
  L.push('- **TCMB EVDS3:** resmî API anahtarsız 403 `Required request header \'key\' is not present` → **anahtar gerekli** (ücretsiz üyelik). Projede kullanılan ön yüz ucu (`igmevdsms-dis/fe`, POST) anahtarsız çalışıyor; F4 kaynak katmanı iki uçlu yazılır.');
  L.push('- **DefiLlama ölü protokolleri TUTUYOR:** `/protocols` içinde `deadFrom`, `rugged`, `deprecated` alanları var; Anchor (Terra) `deadFrom 2022-05-26` ile duruyor ve TVL geçmişi dönüyor → plan §6 risk 4\'teki "doğrulanmadı" kapandı. Ücret/gelir geçmişi ayrıca protokol başına (`summary/fees/<slug>`).');
  L.push('- **Coin Metrics MVRV kapsamı** yukarıdaki sayım satırında (`CapMVRVCur` topluluk kapsamı). Araştırmadaki "125 mi 37+ mı" sorusunun cevabı bu sayıdır.');
  L.push('- **Anahtar gerekenler sınanmadı:** Alchemy, QuickNode, Etherscan (ücretsiz hesap ister; Etherscan md. 8 AI/ML ve veri seti kullanımını yasaklar → kullanılmaz). GitHub anahtarsız 60/sa; F2\'de PAT (ücretsiz) önerilir.');
  L.push('- **Ücretli hiçbir şey yok** (K1). CoinGecko/GeckoTerminal ham verisi D4 kararıyla "yalnız deneme amaçlı" saklanmaya devam eder; Coin Metrics CC BY-NC (ticari değil, atıf).');
  L.push('');
  return L.join('\n') + '\n';
}

async function oztest() {
  const assert = require('assert');
  const os = require('os');
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'dikkat-envanter-'));
  const sahte = async (url) => {
    const hdr = new Map([['x-ratelimit-remaining', '59'], ['content-type', 'application/json']]);
    const yanit = (status, govde) => ({ status, ok: status >= 200 && status < 300, text: async () => govde, headers: { forEach: (cb) => hdr.forEach((v, k) => cb(v, k)) } });
    if (/tokenomist|series=TP/.test(url)) return yanit(401, '{"status":false}');
    if (/coinmetrics/.test(url)) return yanit(200, JSON.stringify({ data: [{ asset: 'btc', metrics: [{ metric: 'CapMVRVCur', frequencies: [{ frequency: '1d', min_time: '2010-07-18T00:00:00Z', community: true }] }] }, { asset: 'x', metrics: [{ metric: 'CapMVRVCur', frequencies: [{ frequency: '1d', min_time: '2020-01-01T00:00:00Z', community: false }] }] }] }));
    if (/github/.test(url)) return yanit(500, 'oops');
    if (/bitview/.test(url)) return yanit(200, '<html>');
    return yanit(200, '[]');
  };
  const s = await K.sina({ fetch: sahte, simdi: () => Date.parse('2026-10-09T12:00:00Z'), uyu: async () => {}, binanceBekleme: () => ({ bitis: '2026-10-09T13:00:00Z' }) });
  const by = (ad) => s.kaynaklar[ad];
  assert.strictEqual(by('tokenomist').durum, 'anahtar_gerekli', 'beklenen 401 → anahtar gerekli');
  assert.strictEqual(by('github').durum, 'hata', '500 → hata');
  assert.strictEqual(by('bitview').durum, 'hata', 'JSON olmayan gövde → hata');
  assert.strictEqual(by('binance-borsa').durum, 'atlandi', 'Binance beklemesi → atlandı');
  assert.strictEqual(by('evds').durum, 'ok', 'ön yüz ucu ok + resmî API beklenen 401 → kaynak çalışıyor');
  assert.strictEqual(by('alchemy').durum, 'anahtar_gerekli', 'ucu olmayan anahtarlı kaynak sınanmaz');
  const mv = s.sonuclar.find(x => x.kimlik === 'mvrv-katalog');
  assert.strictEqual(mv.ek.topluluk, 1, 'MVRV kapsamı yalnız community=true sayılır');
  assert.strictEqual(mv.ek.varlik, 2);
  assert.strictEqual(mv.derinlik.ilk, '2010-07-18');
  assert.ok(/^[0-9a-f]{64}$/.test(mv.sha256), 'SHA-256');
  assert.strictEqual(mv.limitBasliklari['x-ratelimit-remaining'], '59', 'limit başlığı yakalanır');
  assert.ok(!('content-type' in mv.limitBasliklari), 'limit dışı başlık alınmaz');
  // Yazım + aynı gün ikinci koşu
  const d1 = K.envanterYaz(s, dizin); const d2 = K.envanterYaz(s, dizin);
  assert.strictEqual(d1, d2);
  assert.strictEqual(JSON.parse(fs.readFileSync(d2, 'utf8')).oncekiKosular.length, 1, 'önceki koşu özeti korunur');
  // Sağlık: tarama özetleri + bozulma haritası
  const tdizin = path.join(dizin, 'tarama'); fs.mkdirSync(tdizin);
  fs.writeFileSync(path.join(tdizin, 'taramalar.jsonl'), JSON.stringify({ bas: '2026-10-08T00:00:00Z', kaynakOzet: { goplus: { ok: 8, bos: 1, hata: 1 }, rdap: { ok: 2, bos: 0, hata: 2 } } }) + '\n' + JSON.stringify({ bas: '2026-08-01T00:00:00Z', kaynakOzet: { goplus: { ok: 0, bos: 0, hata: 50 } } }) + '\n');
  const h = K.saglik({ envanterDizin: dizin, taramaDizin: tdizin, simdi: () => Date.parse('2026-10-09T12:00:00Z') });
  const gp = h.satirlar.find(x => x.ad === 'goplus');
  assert.strictEqual(gp.tarama.cagri, 10, '30 gün dışı tarama sayılmaz');
  assert.strictEqual(gp.tarama.oran, 0.9, 'boş yanıt başarı sayılır (kaynak cevap verdi)');
  assert.ok(gp.bozulma.uretilemez.some(b => b.kod === 'honeypot'), 'GoPlus bozulursa honeypot üretilemez');
  assert.ok(gp.bozulma.yedekleSurer.some(b => b.kod === 'holder_dusus'), 'holder düşüşü GeckoTerminal ile sürer');
  const dx = h.satirlar.find(x => x.ad === 'dexscreener-kesif');
  assert.ok(dx.bozulma.uretilemez.some(b => b.kod === 'parali_tanitim'), 'DexScreener → paralı tanıtım');
  assert.ok(dx.bozulma.uretilemez.some(b => b.kod === 'alan_adi_yeni'), 'alan adı bayrağı RDAP + DexScreener birlikte ister');
  const rd = h.satirlar.find(x => x.ad === 'rdap');
  assert.ok(rd && rd.tarama.oran === 0.5, 'RDAP satırı tarama özetinden');
  // Kota sayımı: günün önceki koşusundan TAŞINAN satır yeniden çağrı sayılmaz
  const td = path.join(dizin, 'tasima'); fs.mkdirSync(td);
  fs.writeFileSync(path.join(td, 'envanter-2026-10-09.json'), JSON.stringify({ zaman: '2026-10-09T11:00:00Z', tarih: '2026-10-09', kaynaklar: { bgeometrics: { durum: 'ok' } },
    sonuclar: [{ kaynak: 'bgeometrics', http: 200 }, { kaynak: 'bgeometrics', http: 200, tasindi: true }] }));
  const ht = K.saglik({ envanterDizin: td, taramaDizin: path.join(td, 'yok'), simdi: () => Date.parse('2026-10-09T12:00:00Z') });
  assert.strictEqual(ht.satirlar.find(x => x.ad === 'bgeometrics').kota.gunlukKullanim, 1, 'taşınan satır kota kullanımına sayılmaz');
  assert.strictEqual(h.satirlar.find(x => x.ad === 'tokenomist').envanter.oran, 1, 'anahtar gerekli = beklenen durum, başarısızlık sayılmaz');
  assert.ok(h.satirlar.find(x => x.ad === 'tokenomist').bozulma.uretilemez.some(b => b.kod === 'k_unlock_30g'));
  // Kota koruması
  const kd = path.join(dizin, 'kota'); const kk = kotaOku('2026-10-09', kd);
  assert.deepStrictEqual(kotaAtla(kk, false), [], 'boş kota → atlama yok');
  kotaYaz(kk, [{ kaynak: 'bgeometrics', http: 200 }, { kaynak: 'github', http: null }], kd);
  const kk2 = kotaOku('2026-10-09', kd);
  assert.strictEqual(kk2.istek.bgeometrics, 1); assert.ok(!kk2.istek.github, 'istek atılmayan uç sayılmaz');
  assert.deepStrictEqual(kotaAtla(kk2, false), ['bgeometrics'], 'BGeometrics bugün sınandı → atla');
  assert.deepStrictEqual(kotaAtla(kk2, true), [], '--zorla geçer');
  assert.ok(K.KATALOG.find(k => k.ad === 'tokenomist').uclar.every(u => String(u.uc).startsWith('https://api.tokenomist.ai/') && !(u.basliklar && u.basliklar['user-agent'])), 'Tokenomist: yalnız API ucu, tarayıcı kimliği yok');
  const md = markdown(s);
  assert.ok(md.includes('## 3. Bozulma haritası') && md.includes('anahtar gerekli'));
  fs.rmSync(dizin, { recursive: true, force: true });
  console.log('✓ dikkat-f0-envanter öz testi geçti (durum sınıfları, MVRV sayımı, SHA, limit başlığı, aynı gün yazımı, 30 g sağlık, bozulma haritası, kota koruması, md)');
}

const GUNLUK_SINIR = Object.freeze({ bgeometrics: 1 });
const kotaDosyasi = (gun, dizin = K.envanterDizini()) => path.join(dizin, `kota-${gun}.json`);
function kotaOku(gun, dizin) { try { return JSON.parse(fs.readFileSync(kotaDosyasi(gun, dizin), 'utf8')); } catch { return { gun, istek: {} }; } }
function kotaYaz(kota, sonuclar, dizin = K.envanterDizini()) {
  for (const x of sonuclar) if (x.http != null) kota.istek[x.kaynak] = (kota.istek[x.kaynak] || 0) + 1;
  fs.mkdirSync(dizin, { recursive: true });
  fs.writeFileSync(kotaDosyasi(kota.gun, dizin), JSON.stringify(kota, null, 1), 'utf8');
}
/** Bu koşuda atlanacak kaynaklar: günlük sınırı dolmuş olanlar (zorla değilse). */
function kotaAtla(kota, zorla) { return zorla ? [] : Object.entries(GUNLUK_SINIR).filter(([ad, n]) => (kota.istek[ad] || 0) >= n).map(([ad]) => ad); }

async function main() {
  if (bayrak('--oztest')) return oztest();
  const sadece = deger('--kaynak') ? deger('--kaynak').split(',').map(s => s.trim()).filter(Boolean) : null;
  const gun = new Date().toISOString().slice(0, 10);
  const kota = kotaOku(gun);
  const atla = kotaAtla(kota, bayrak('--zorla'));
  const hedef = (sadece || K.KATALOG.map(k => k.ad)).filter(a => !atla.includes(a));
  const s = await K.sina({ sadece: hedef });
  kotaYaz(kota, s.sonuclar);
  if (atla.length && !sadece) {
    // Atlanan kaynağın bugünkü önceki sonucu taşınır (yoksa "atlandı" satırı) — günün dosyası eksik kalmasın.
    let once = null; try { once = JSON.parse(fs.readFileSync(path.join(K.envanterDizini(), `envanter-${s.tarih}.json`), 'utf8')); } catch { once = null; }
    for (const ad of atla) {
      const eski = once ? (once.sonuclar || []).filter(x => x.kaynak === ad && x.durum !== 'atlandi') : [];
      if (eski.length) s.sonuclar.push(...eski.map(x => ({ ...x, tasindi: true })));
      else s.sonuclar.push({ kaynak: ad, kimlik: '-', uc: null, durum: 'atlandi', hata: 'günlük kota: bugün zaten sınandı (--zorla ile geç)' });
    }
    s.kaynaklar = K.kaynakDurumlari(s.sonuclar);
  }
  if (atla.length) console.log(`(kota koruması: ${atla.join(', ')} bugün zaten sınandı — atlandı; --zorla geçer)`);
  for (const x of s.sonuclar) {
    const d = { ok: '✓', anahtar_gerekli: '🔑', atlandi: '·', hata: '✗' }[x.durum] || '?';
    console.log(`${d} ${x.kaynak.padEnd(22)} ${String(x.kimlik).padEnd(24)} ${String(x.http == null ? '—' : x.http).padStart(4)} ${String(x.ms == null ? '' : `${x.ms} ms`).padStart(8)}  ${x.hata || (x.ek ? JSON.stringify(x.ek) : '')}`);
  }
  if (sadece) { console.log('\n(--kaynak: envanter dosyasına yazılmadı; kota kaydına yazıldı)'); return; }
  const dosya = K.envanterYaz(s);
  console.log(`\n→ ${path.relative(KOK, dosya)}`);
  if (bayrak('--md')) { fs.writeFileSync(MD, markdown(s), 'utf8'); console.log(`→ ${path.relative(KOK, MD)}`); }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
