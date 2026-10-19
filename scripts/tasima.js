#!/usr/bin/env node
/**
 * TAŞIMA DOSYASI — komut satırı (68.1, PLAN-TASIMA F3; panel karşılığı Ayarlar › Yedek ve taşıma, kurulum sihirbazı ilk adım)
 * ═══════════════════════════════════════════════════════════════════════════
 *   npm run tasima-olustur -- --sifre-dosyasi C:\sifre.txt [--hedef D:\pusula.pusula] [--arastirma] [--sunucu-baglantisi]
 *   npm run tasima-ice-aktar -- --dosya D:\pusula.pusula --sifre-dosyasi C:\sifre.txt [--degistir]   (Pusula KAPALIYKEN)
 *   npm run eklenti-olustur -- [--sifre-dosyasi F] [--hedef X.pusula-arastirma]
 *   npm run eklenti-yukle -- --dosya X.pusula-arastirma [--sifre-dosyasi F]                           (Pusula KAPALIYKEN)
 *   npm run yedek-sifre -- --sifre-dosyasi F        → USB yedeğinin şifresini kaydet (GİZLİ: <veri>/gizli/yedek-sifre.json)
 *   node scripts/tasima.js goster --dosya X          → bildiri (şifresiz okunur: sürüm, zaman, makine, türler, dosya sayısı)
 *   node scripts/tasima.js usb-yedek --klasor F:\PusulaYedek [--sakla 8]   → yedek-usb.ps1 çağırır (kayıtlı yedek şifresiyle)
 *   node scripts/tasima.js usb-bicim                 → 'pusula' | 'eski' — yedek-usb.ps1 hangi biçimi yazacağını sorar
 *
 * Şifre: `--sifre-dosyasi` (ilk satır; dosyayı işiniz bitince silin) ya da yalnız testler için `--sifre`. Şifre verilmezse
 * taşıma dosyasına GİZLİ bilgiler (API anahtarları, jetonlar, PIN) GİRMEZ — çıktı bunu açıkça yazar.
 * `--program P`: başka bir program kopyası (testler). Çıkış kodu: 0 tamam · 1 hata · 2 red (dolu hedef, Pusula çalışıyor …).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const yollar = require('../lib/yollar');
const T = require('../lib/tasima');

const arg = (argv, ad) => { const i = argv.indexOf(`--${ad}`); return i >= 0 ? argv[i + 1] : undefined; };
const MB = 1024 * 1024;
const mb = (b) => `${(b / MB).toFixed(b < 10 * MB ? 2 : 0)} MB`;

function sifreAl(argv) {
  const d = arg(argv, 'sifre-dosyasi');
  if (d) return fs.readFileSync(d, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  return arg(argv, 'sifre') || null;
}
function cozum(program) { return program ? yollar.cozumle(program) : yollar.bilgi(); }
function varsayilanAd(tur, program) {
  return path.join(T.klasor(program), `pusula-${os.hostname().replace(/[^A-Za-z0-9-]/g, '')}-${T.damga()}${T.UZANTI[tur]}`);
}
async function calisiyor(program, argv) {
  const { calisiyorMu } = require('./veri-tasi');
  const c = cozum(program);
  const port = Number(arg(argv, 'port')) || 3000;
  return calisiyorMu({ program: c.program, kaynak: path.dirname(yollar.yolKur(c, ['pusula.pid'])), portlar: [port] });
}
function ilerlemeYaz() {
  let son = 0;
  return (x) => {
    const t = Date.now();
    if (x.asama !== 'paketleniyor' || t - son > 1500) { son = t; process.stdout.write(`  · ${x.asama}${x.toplam ? ` ${Math.round(100 * (x.yapilan || 0) / Math.max(1, x.toplam))}%` : ''}\n`); }
  };
}

async function main(argv) {
  const komut = argv[0];
  const program = arg(argv, 'program');
  if (komut === 'olustur' || komut === 'eklenti-olustur') {
    const tur = komut === 'olustur' ? 'tasima' : 'arastirma-eklentisi';
    const sifre = sifreAl(argv);
    const cikti = path.resolve(arg(argv, 'hedef') || varsayilanAd(tur, program));
    const r = await T.olustur({ program, tur, cikti, sifre, kaynak: 'komut', kutular: { arastirma: argv.includes('--arastirma'), sunucuBaglantisi: argv.includes('--sunucu-baglantisi') }, ilerleme: ilerlemeYaz() });
    console.log(`✓ ${tur === 'tasima' ? 'Taşıma dosyası' : 'Araştırma eklentisi'}: ${r.dosya} (${mb(r.boyut)}, ${r.bildiri.dosyaSayisi} dosya)`);
    for (const [t, s] of Object.entries(r.bildiri.sayilar)) console.log(`  ${t}: ${s.dosya} dosya, ${mb(s.bayt)}`);
    if (tur === 'tasima') console.log(r.bildiri.gizli.var ? `  GİZLİ (şifreli): ${r.bildiri.gizli.adlar.join(', ')}` : '  ⚠ GİZLİ bilgiler bu dosyada YOK (şifre verilmedi): API anahtarları, jetonlar ve PIN yeni bilgisayarda yeniden girilir.');
    return 0;
  }
  if (komut === 'goster') {
    const b = await T.bildiriOku(path.resolve(arg(argv, 'dosya')));
    console.log(JSON.stringify({ ...b, dosyalar: `${(b.dosyalar || []).length} dosya` }, null, 2));
    return 0;
  }
  if (komut === 'ice-aktar' || komut === 'eklenti-yukle') {
    const dosya = path.resolve(arg(argv, 'dosya') || '');
    if (!fs.existsSync(dosya)) throw new Error(`dosya yok: ${dosya}`);
    const red = await calisiyor(program, argv);
    if (red) { console.log(`✗ RED: ${red}`); return 2; }
    const tur = komut === 'ice-aktar' ? 'tasima' : 'arastirma-eklentisi';
    const hedef = path.join(T.klasor(program), `ice-${process.pid}-${Date.now()}`);
    const a = await T.ac({ dosya, sifre: sifreAl(argv), hedef, beklenenTur: tur });
    const on = T.onizleme(a.bildiri, a.dosyalar, { buSurum: T.uygulamaSurumu(program || undefined) });
    console.log(`Dosya: ${on.makine} · ${on.olusturma} · Pusula ${on.uygulamaSurum}${on.surumUyari ? ` — ${on.surumUyari}` : ''}`);
    for (const [t, s] of Object.entries(on.turler)) console.log(`  ${t}: ${s.dosya} dosya, ${mb(s.bayt)}`);
    try {
      if (tur === 'tasima') {
        const y = T.yerlestir({ hedef: a.hedef, program, mod: argv.includes('--degistir') ? 'degistir' : 'bos' });
        console.log(`✓ İçe aktarıldı: ${y.yerlesen.length} parça.${y.onceki ? ` Önceki veri: ${y.onceki}` : ''}`);
        console.log('  Botlar kendiliğinden BAŞLAMAZ: her bot için Botlar › <bot> › Yönetim › "Mutabakat", sonra "Başlat".');
      } else {
        const r = await T.eklentiYerlestir({ hedef: a.hedef, program });
        console.log(`✓ Eklenti yüklendi: ${r.konan} dosya kondu, ${r.ayni} zaten aynıydı${r.cakisma.length ? `, ${r.cakisma.length} çakışma (üzerine yazılmadı): ${r.cakisma.slice(0, 5).join(', ')}` : ''}.`);
      }
    } catch (e) {
      try { fs.rmSync(a.hedef, { recursive: true, force: true }); } catch { /* */ }
      if (e.kod === 'dolu') { console.log(`✗ RED: ${e.message}`); return 2; }
      throw e;
    }
    return 0;
  }
  if (komut === 'yedek-sifre') {
    const s = sifreAl(argv);
    if (!s) throw new Error('--sifre-dosyasi gerekli');
    T.yedekSifreKaydet(s, program);
    console.log('✓ Yedek şifresi kaydedildi (GİZLİ). USB yedeği artık gizli bilgileri de bu şifreyle şifreleyip alır.');
    return 0;
  }
  if (komut === 'usb-bicim') {
    // yedek-usb.ps1 sorar: 'pusula' (yeni biçim) yalnız yedek şifresi kaydedildiyse ya da YENİ veri düzenindeyse; aksi 'eski'
    // (bugünkü kurulumlar — sunucu dahil — kullanıcı şifre kaydedene kadar eski klasör kopyasıyla sürer: güncelleme davranışı değiştirmez).
    console.log(T.yedekSifre(program) || cozum(program).duzen === 'yeni' ? 'pusula' : 'eski');
    return 0;
  }
  if (komut === 'usb-yedek') {
    const klasor = path.resolve(arg(argv, 'klasor') || '');
    if (!arg(argv, 'klasor')) throw new Error('--klasor gerekli');
    const sakla = Math.max(1, Number(arg(argv, 'sakla')) || 8);
    const sifre = T.yedekSifre(program);
    const cikti = path.join(klasor, `pusula-yedek-${new Date().toISOString().slice(0, 10)}${T.UZANTI.tasima}`);
    const r = await T.olustur({ program, tur: 'tasima', cikti, sifre, kaynak: 'usb-yedek' });
    const eski = fs.readdirSync(klasor).filter(a => /^pusula-yedek-\d{4}-\d{2}-\d{2}\.pusula$/.test(a)).sort().reverse().slice(sakla);
    for (const a of eski) fs.rmSync(path.join(klasor, a), { force: true });
    // ASCII çıktı: yedek-usb.ps1 günlüğe ASCII yazar
    console.log(`usb yedek tamam (.pusula): ${r.bildiri.dosyaSayisi} dosya, ${mb(r.boyut)} -> ${r.dosya}${sifre ? ' (gizli bilgiler sifreli)' : ' (GIZLI BILGILER YOK: yedek sifresi kaydedilmemis - Ayarlar > Yedek ve tasima ya da npm run yedek-sifre)'}${eski.length ? ` - silinen eski: ${eski.join(', ')}` : ''}`);
    return 0;
  }
  console.log('Kullanım: node scripts/tasima.js olustur | eklenti-olustur | goster | ice-aktar | eklenti-yukle | yedek-sifre | usb-yedek (ayrıntı dosya başında)');
  return 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(k => { process.exitCode = k; }).catch(e => { console.error(`✗ HATA: ${e.message}`); process.exitCode = e.kod === 'dolu' ? 2 : 1; });
}
module.exports = { main };
