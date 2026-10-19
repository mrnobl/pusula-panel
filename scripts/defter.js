#!/usr/bin/env node
/**
 * ARAŞTIRMA DEFTERİ — komut satırı (sürüm 60.6, lib/defter.js)
 * ═══════════════════════════════════════════════════════════════════════════
 *   npm run defter                       listele (numara · durum · aile · başlık)
 *   npm run defter -- ara <metin>        başlık / hipotez / sonuç / neden / plan / aile içinde ara (Türkçe harf duyarsız)
 *   npm run defter -- aile <id>          bir ailenin kayıtları
 *   npm run defter -- ozet               durum ve aile sayaçları + hükmü yaklaşanlar
 *   npm run defter:denetle               biçim / çakışma / boşluk + CLAUDE.md "Güncel: **N**" = BOS olmayan en yüksek (hata → çıkış 1)
 *   npm run defter:sonraki               yeni deneme numarası (BOS dahil en yüksek + 1 = ayrılmış boş aralıkların SONRASI;
 *                                        ayrılmış aralıktan numara kullanılacaksa o BOS satırı elle bölünür)
 * Seçenek: --dosya <yol> (varsayılan kayitlar/denemeler.jsonl ya da DEFTER_DOSYA), --claude <yol> (denetimde CLAUDE.md yerine).
 * Yazmaz; yeni kayıt panelden (Araştırma › Defter, masaüstü) ya da dosyaya elle eklenir. git çalıştırmaz.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const D = require('../lib/defter');

const argv = process.argv.slice(2);
const secenek = (ad) => { const i = argv.indexOf(ad); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const DOSYA = secenek('--dosya');
const CLAUDE = secenek('--claude') || path.join(__dirname, '..', 'CLAUDE.md');
const [komut = 'liste', ...arg] = argv;

const kucuk = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
const no = (k) => (k.aralik[0] === k.aralik[1] ? `${k.aralik[0]}` : `${k.aralik[0]}–${k.aralik[1]}`);
const kisalt = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const ayrMetin = (oz) => (oz.ayrilmisBos.length ? ` · ayrılmış boş ${oz.ayrilmisBos.map(([a, b]) => (a === b ? `#${a}` : `#${a}–${b}`)).join(', ')}` : '');

function satirYaz(k) {
  console.log(`${no(k).padStart(9)}  ${String(k.durum || '?').padEnd(8)}  ${kisalt(k.aile, 22).padEnd(22)}  ${kisalt(k.baslik, 90)}${k.hukumTarihi ? `  (hüküm ${k.hukumTarihi})` : ''}`);
}

function main() {
  const d = D.oku(DOSYA);
  const gecerli = d.kayitlar.filter(k => !k._gecersiz && Array.isArray(k.aralik));
  const rel = path.relative(process.cwd(), d.dosya) || d.dosya;

  if (komut === 'sonraki') {
    if (!d.var) { console.error(`✗ ${rel} yok`); return 1; }
    console.log(String(D.sonrakiBos(d.kayitlar)));
    return 0;
  }

  if (komut === 'denetle') {
    if (!d.var) { console.error(`✗ ${rel} yok — defter henüz aktarılmadı`); return 1; }
    const hatalar = D.denetle(d.kayitlar);
    const oz = D.ozet(d.kayitlar);
    let claude = null;
    try { claude = D.claudeSayaci(fs.readFileSync(CLAUDE, 'utf8')); } catch (e) { /* yok */ }
    if (claude == null) hatalar.push({ satir: null, kod: 'claude', mesaj: `${path.basename(CLAUDE)} içinde "Güncel: **N**" bulunamadı` });
    else if (claude !== oz.toplam) hatalar.push({ satir: null, kod: 'claude', mesaj: `CLAUDE.md "Güncel: **${claude}**" ama defterin BOS olmayan en yüksek numarası ${oz.toplam} — biri güncellenmemiş` });
    console.log(`📒 ${rel}: ${oz.kayitSayisi} kayıt, en yüksek deneme ${oz.toplam}${ayrMetin(oz)}, sonraki boş ${oz.sonrakiBos}`);
    for (const u of D.uyarilar(d.kayitlar)) console.log(`⚠ ${u.satir ? `satır ${u.satir}: ` : ''}[${u.kod}] ${u.mesaj}`);
    if (!hatalar.length) { console.log('✓ denetim temiz (biçim, çakışma, boşluk, CLAUDE.md sayacı)'); return 0; }
    for (const h of hatalar) console.log(`✗ ${h.satir ? `satır ${h.satir}: ` : ''}[${h.kod}] ${h.mesaj}`);
    console.log(`\n${hatalar.length} hata`);
    return 1;
  }

  if (!d.var) { console.error(`✗ ${rel} yok`); return 1; }

  if (komut === 'ozet') {
    const oz = D.ozet(d.kayitlar);
    console.log(`Toplam deneme (BOS olmayan en yüksek numara): ${oz.toplam}${ayrMetin(oz)} · ${oz.kayitSayisi} kayıt · sonraki boş ${oz.sonrakiBos}`);
    console.log('Durum (numara sayısı): ' + D.DURUMLAR.map(x => `${x} ${oz.durumlar[x]}`).join(' · '));
    console.log('\nAileler:');
    for (const a of oz.aileler) console.log(`  ${String(a.adet).padStart(4)}  ${a.aile}${a.aileAd ? ` — ${a.aileAd}` : ''}`);
    if (oz.yaklasanlar.length) {
      console.log('\nHükmü yaklaşanlar:');
      for (const y of oz.yaklasanlar) console.log(`  ${y.hukumTarihi} (${y.kalanGun >= 0 ? `${y.kalanGun} gün` : `${-y.kalanGun} gün GEÇTİ`})  #${y.aralik[0] === y.aralik[1] ? y.aralik[0] : y.aralik.join('–')} ${y.baslik}`);
    }
    return 0;
  }

  let liste = gecerli;
  if (komut === 'ara') {
    const q = kucuk(arg.join(' ')).trim();
    if (!q) { console.error('kullanım: npm run defter -- ara <metin>'); return 2; }
    const sayi = /^\d+$/.test(q) ? Number(q) : null;
    liste = gecerli.filter(k => (sayi != null && k.aralik[0] <= sayi && sayi <= k.aralik[1])
      || ['baslik', 'hipotez', 'sonuc', 'neden', 'plan', 'aile', 'aileAd'].some(a => kucuk(k[a]).includes(q)));
  } else if (komut === 'aile') {
    const id = kucuk(arg[0]).trim();
    if (!id) { console.error('kullanım: npm run defter -- aile <id>'); return 2; }
    liste = gecerli.filter(k => kucuk(k.aile) === id);
  } else if (komut !== 'liste') {
    console.error(`bilinmeyen komut "${komut}" — liste · ara <metin> · aile <id> · ozet · denetle · sonraki`);
    return 2;
  }
  liste.slice().sort((a, b) => a.aralik[0] - b.aralik[0]).forEach(satirYaz);
  const n = liste.reduce((t, k) => t + (k.aralik[1] - k.aralik[0] + 1), 0);
  console.log(`\n${liste.length} kayıt · ${n} numara${komut === 'liste' ? ` · sonraki boş ${D.sonrakiBos(d.kayitlar)}` : ''}`);
  return 0;
}

process.exitCode = main();
