#!/usr/bin/env node
/**
 * ŞİFRELİ UZAK YEDEK komutu (69.4, lib/uzakYedek.js) — sunucuda.
 *
 *   npm run uzak-yedek -- --kur --depo rclone:gdrive:PusulaYedek     parolayı gizli sorar → sır kasasına yazar → restic depoyu açar
 *        [--restic C:\araclar\restic.exe] [--rclone C:\araclar\rclone.exe]   (yol verilmezse PATH'tekiler)
 *   npm run uzak-yedek -- --simdi                                    en son yerel yedeği şimdi buluta gönderir
 *   npm run uzak-yedek -- --durum                                    ayar, son gönderim ve buluttaki kopyalar
 *   npm run uzak-yedek -- --kaldir                                   uzak yedeği kapatır (buluttaki kopyalara dokunmaz)
 *
 * Önce (bir kez): `winget install restic.restic rclone.rclone` ve `rclone config` (ör. "gdrive" adıyla Google Drive bağla).
 * Günlük çalışma: scripts/yedek.js (görev PusulaYedek, 05:30) yerel yedekten sonra kendiliğinden gönderir.
 * Parola kaybolursa buluttaki yedek AÇILAMAZ: Pusula'dan bağımsız iki yerde (parola yöneticisi + kâğıt) saklayın.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const yollar = require('../lib/yollar');
const U = require('../lib/uzakYedek');
const K = require('../lib/sirKasasi');

const AYAR = yollar.veri('yedek-ayar.json');
const SIR = yollar.veri('secrets.json');
const arg = process.argv.slice(2);
const deger = (ad) => { const i = arg.indexOf(`--${ad}`); return i >= 0 ? arg[i + 1] : undefined; };
const ayarOku = () => { try { return JSON.parse(fs.readFileSync(AYAR, 'utf8')); } catch { return {}; } };
const ayarYaz = (a) => { fs.mkdirSync(path.dirname(AYAR), { recursive: true }); fs.writeFileSync(AYAR, JSON.stringify(a, null, 2), 'utf8'); };
const parolaOku = () => { const s = K.okuGuvenli(SIR, {}); return (s.uzakYedek && s.uzakYedek.parola) || null; };

function gizliSor(soru) {
  return new Promise((coz, red) => {
    const g = process.stdin;
    if (!g.isTTY || typeof g.setRawMode !== 'function') return red(new Error('parola için etkileşimli pencere gerekir (ya da PUSULA_UZAK_PAROLA ortam değişkeni)'));
    process.stdout.write(soru);
    let s = '';
    g.setRawMode(true); g.resume(); g.setEncoding('utf8');
    const bitir = (h) => { g.setRawMode(false); g.pause(); g.removeListener('data', al); process.stdout.write('\n'); h ? red(h) : coz(s); };
    const al = (p) => { for (const ch of p) { if (ch === '\r' || ch === '\n') return bitir(); if (ch === '\u0003') return bitir(new Error('iptal edildi')); if (ch === '\u0008' || ch === '\u007f') { s = s.slice(0, -1); continue; } if (ch >= ' ') s += ch; } };
    g.on('data', al);
  });
}

/** En son yerel yedek klasörü (<hedef>/AAAA-AA-GG). */
function sonYerel(a) {
  const hedef = a.hedef || path.join(require('os').homedir(), 'PusulaYedek');
  const l = fs.existsSync(hedef) ? fs.readdirSync(hedef).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort() : [];
  return l.length ? path.join(hedef, l[l.length - 1]) : null;
}

if (require.main === module) (async () => {
  const a = ayarOku();
  if (arg.includes('--kur')) {
    const depo = deger('depo');
    if (!depo) throw new Error('--depo gerekli (ör. rclone:gdrive:PusulaYedek)');
    let p = process.env.PUSULA_UZAK_PAROLA || null;
    if (!p) {
      p = await gizliSor('Uzak yedek parolası (en az 12 karakter; kaybolursa yedek açılamaz): ');
      const t = await gizliSor('Parola (tekrar): ');
      if (p !== t) throw new Error('parolalar aynı değil');
    }
    if (String(p).length < 12) throw new Error('parola en az 12 karakter olmalı');
    const uzak = { depo, ...(deger('restic') ? { restic: path.resolve(deger('restic')) } : {}), ...(deger('rclone') ? { rclone: path.resolve(deger('rclone')) } : {}) };
    const r = await U.depoAc({ ayar: uzak, parola: p });
    if (!r.ok) throw new Error(`restic depo açılamadı: ${r.hata}`);
    const s = K.okuGuvenli(SIR, {});
    s.uzakYedek = { ...(s.uzakYedek || {}), parola: p };
    K.yaz(SIR, s);
    ayarYaz({ ...a, uzak });
    console.log(`Uzak yedek kuruldu: ${depo} (${r.yeni ? 'yeni depo açıldı' : 'mevcut depo kullanılıyor'}). Parola sır kasasında (DPAPI).`);
    console.log('ÖNEMLİ: parolayı Pusula\'dan bağımsız iki yerde saklayın — kaybolursa buluttaki yedek açılamaz.');
    console.log('Şimdi ilk gönderim için: npm run uzak-yedek -- --simdi');
    return;
  }
  if (arg.includes('--kaldir')) { const y = { ...a }; delete y.uzak; ayarYaz(y); console.log('Uzak yedek kapatıldı (buluttaki kopyalara dokunulmadı).'); return; }
  if (arg.includes('--durum')) {
    if (!a.uzak || !a.uzak.depo) { console.log('Uzak yedek kurulmamış. Kurulum: Kılavuz › Yedek ve taşıma › Şifreli uzak yedek.'); return; }
    console.log(`Depo: ${a.uzak.depo}`);
    console.log(`Son gönderim: ${a.uzak.son ? `${a.uzak.son.zaman} · ${a.uzak.son.ok ? `tamam (${a.uzak.son.snapshot || '?'})` : `HATA: ${a.uzak.son.hata}`}` : 'yok'}`);
    console.log(`Son bakım (forget + check): ${a.uzak.sonBakim ? `${a.uzak.sonBakim.zaman} · ${a.uzak.sonBakim.ok ? 'tamam' : `HATA: ${a.uzak.sonBakim.hata}`}` : 'yok'}`);
    const k = await U.kopyalar({ ayar: a.uzak, parola: parolaOku() });
    console.log(k.ok ? `Buluttaki kopyalar (${k.kopyalar.length}): ${k.kopyalar.slice(-5).map(x => `${x.id} ${String(x.zaman).slice(0, 16)}`).join(', ') || 'yok'}` : `Kopyalar okunamadı: ${k.hata}`);
    return;
  }
  if (arg.includes('--simdi')) {
    const r = await gonder(a);
    console.log(r.ok ? `Gönderildi: ${r.snapshot || '?'} · ${r.dosya || '?'} dosya${r.bakim ? ` · bakım ${r.bakim.ok ? 'tamam' : `HATA: ${r.bakim.hata}`}` : ''}` : `UZAK YEDEK BAŞARISIZ: ${r.hata}`);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  console.log('Kullanım: npm run uzak-yedek -- --kur --depo <rclone:uzak:klasör> | --simdi | --durum | --kaldir');
})().catch((e) => { console.error(`HATA: ${e.message}`); process.exitCode = 1; });

/** Son yerel kopyayı gönderir ve sonucu yedek-ayar.json'a yazar (scripts/yedek.js de bunu çağırır). */
async function gonder(a = ayarOku()) {
  const r = await U.calistir({ klasor: sonYerel(a), ayar: a.uzak, parola: parolaOku() });
  const y = ayarOku();
  if (y.uzak) { y.uzak.son = { zaman: r.zaman, ok: r.ok, snapshot: r.snapshot || null, dosya: r.dosya || null, hata: r.hata || null }; if (r.bakim) y.uzak.sonBakim = r.bakim; ayarYaz(y); }
  return r;
}
module.exports = { gonder };
