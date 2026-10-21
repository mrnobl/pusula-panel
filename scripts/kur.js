#!/usr/bin/env node
/**
 * KURULUM ADIMI (68.3, PLAN-TASIMA F4) — `npm run kur -- [--kuru] [--rol kullanici|sunucu]`
 * ═══════════════════════════════════════════════════════════════════════════
 * Pusula'yı bu bilgisayara kurar; TEKRAR ÇALIŞTIRILABİLİR (idempotent): her adım önce "zaten tamam mı?" diye bakar
 * (lib/kurulumDenetimi.js — panelin Sistem › Kurulum denetimi sayfasıyla aynı yoklama), yalnız eksik olanı yapar.
 * Kurulum programı (kurulum/pusula.iss) kurulumun sonunda bunu çalıştırır; panel "Onar" düğmesi tek adımı çalıştırır.
 *
 * ADIMLAR (sıra bağlayıcı):
 *   node           Node.js (taşınabilir <program>\node\node.exe ya da bilgisayardaki) — yalnız bilgi
 *   yol            taşınabilir Node / Git klasörlerini KULLANICI PATH'ine ekler (yönetici gerekmez; varsa dokunmaz)
 *   paketler       node_modules eksikse `npm ci` (kurulum programı hazır node_modules getirir → çoğu zaman "zaten")
 *   isaret         program köküne PUSULA-KURULUM.json (sürüm, rol, veri yeri, kurulum zamanı, dağıtım deposu) — lib/yollar.js
 *                  bu işaret varsa veriyi C:\Pusula-Veri'ye koyar (--veri ile başka yer: veri-yeri.json). VAR OLAN kurulumda
 *                  (veri program içindeki data/ klasöründe) işaret YAZILMAZ: davranış değişmez.
 *   veri           veri klasörü + tür alt klasörleri (kisisel, gizli, arastirma, onbellek, makine)
 *   jeton          panel / telefon jetonu (telefon-jeton.json; yoksa üretilir). secrets.json OLUŞTURULMAZ: lib/kurulum.js
 *                  secrets.json'u "eski kurulum" sayar ve sihirbazı atlar.
 *   git            program klasörü git deposu + origin = dağıtım deposu (güncelleme K4). Başka bir uzak depo varsa DOKUNMAZ.
 *   gorev-*        zamanlanmış görevler — scripts/install-*.ps1 aynen çağrılır (görev adları aynı: PusulaBot, PusulaBekci,
 *                  PusulaDikkatArsiv, PusulaGuncelle, PusulaYedek, PusulaYedekUSB[yalnız sunucu]); parola SORULMAZ
 *                  ("oturum açıkken" kipi). Oturum açılmasa da çalışsın isteyen, betiği parolayla ayrıca çalıştırır.
 *   kisayol        masaüstü + Başlat menüsü kısayolu (scripts/kisayol-kur.ps1 -BaslatMenusu)
 *   uyku           prize bağlıyken uyku = hiçbir zaman (powercfg /change standby-timeout-ac 0; yönetici gerekmez)
 *   ac             (yalnız --ac) Pusula'yı başlatır ve tarayıcıda kurulum sihirbazını açar
 * Geliştirme bilgisayarında (makine.json arastirmaModu) görev / kısayol / uyku / PATH adımları ATLANIR (--zorla hariç).
 *
 * Seçenekler: --kuru (yalnız ne yapacağını yazar; HİÇBİR ŞEY değiştirmez) · --rol kullanici|sunucu (varsayılan: işaretteki,
 *   yoksa kullanici) · --adim a,b (yalnız bu adımlar) · --veri <klasör> · --depo <adres> · --ac · --json · --zorla
 * Yalnız DENEME (öz testler; gerçek kurulumu değiştirmemek için): --gorev-onek <önek> · --masaustu <klasör> ·
 *   --baslat-klasor <klasör> · --uyku-yok · --path-yok
 * Çıkış: 0 = hata yok · 1 = en az bir adım hata verdi · 2 = yanlış kullanım.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const yollar = require('../lib/yollar');
const kd = require('../lib/kurulumDenetimi');

const PROGRAM = path.resolve(__dirname, '..');
/** Dağıtım deposu adresi — scripts/dagitim.js dağıtım kopyasında bu yer tutucuyu --depo adresiyle değiştirir. */
const DEPO_VARSAYILAN = 'https://github.com/mrnobl/pusula-panel.git';
const ADIM_SIRASI = ['node', 'yol', 'paketler', 'isaret', 'veri', 'jeton', 'git', ...kd.GOREVLER.map(g => g.adim), 'kisayol', 'uyku', 'ac'];
/** Geliştirme bilgisayarında atlanan (sisteme dokunan) adımlar. */
const SISTEM = new Set(['yol', ...kd.GOREVLER.map(g => g.adim), 'kisayol', 'uyku']);

function argOku(argv) {
  const a = { kuru: false, json: false, ac: false, zorla: false, adim: null, rol: null, veri: null, depo: null, onek: '', masaustu: null, baslatKlasor: null, uykuYok: false, pathYok: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], d = () => { const v = argv[++i]; if (v == null) throw new Error(`${k} değer ister`); return v; };
    if (k === '--kuru') a.kuru = true;
    else if (k === '--json') a.json = true;
    else if (k === '--ac') a.ac = true;
    else if (k === '--zorla') a.zorla = true;
    else if (k === '--adim') a.adim = d().split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--rol') a.rol = d();
    else if (k === '--veri') a.veri = path.resolve(d());
    else if (k === '--depo') a.depo = d();
    else if (k === '--gorev-onek') a.onek = d();
    else if (k === '--masaustu') a.masaustu = path.resolve(d());
    else if (k === '--baslat-klasor') a.baslatKlasor = path.resolve(d());
    else if (k === '--uyku-yok') a.uykuYok = true;
    else if (k === '--path-yok') a.pathYok = true;
    else if (k === '--yardim' || k === '-h') a.yardim = true;
    else throw new Error(`Bilinmeyen seçenek: ${k}`);
  }
  if (a.rol && !kd.ROLLER.includes(a.rol)) throw new Error(`--rol ${kd.ROLLER.join(' | ')} olmalı`);
  if (a.adim) for (const x of a.adim) if (!ADIM_SIRASI.includes(x)) throw new Error(`Bilinmeyen adım: ${x} (adımlar: ${ADIM_SIRASI.join(', ')})`);
  if (a.onek && !/^[A-Za-z0-9_-]{3,30}$/.test(a.onek)) throw new Error('--gorev-onek 3-30 harf/rakam olmalı');
  return a;
}

/** Geçerli uzak depo: https:// (dağıtım deposu) ya da file:/// (yerel ayna; öz test). Yer tutucu geçersizdir. */
const depoGecerli = (d) => typeof d === 'string' && /^(https:\/\/|file:\/\/\/)[^\s<>]+$/.test(d);
const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; } };
const sonSatirlar = (s, n = 6) => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(-n).join(' | ');

/** Çocuk süreç ortamı: taşınabilir Node / Git PATH'in başında (görev betikleri `Get-Command node` ile arar). */
function ortam(program) {
  const t = kd.tasinabilir(program);
  const ek = [path.dirname(process.execPath), t.git ? t.gitDizin : null].filter(Boolean);
  const anahtar = Object.keys(process.env).find(k => k.toLowerCase() === 'path') || 'Path';
  return { ...process.env, [anahtar]: [...ek, process.env[anahtar] || ''].join(';') };
}

function powershellDosya(betik, argumanlar, ctx, zamanMs = 180000) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.program, 'scripts', betik), ...argumanlar],
    { cwd: ctx.program, env: ortam(ctx.program), encoding: 'latin1', windowsHide: true, timeout: zamanMs });
  if (r.error) throw new Error(`${betik}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${betik} çıkış ${r.status}: ${sonSatirlar(r.stdout + '\n' + r.stderr)}`);
  return sonSatirlar(r.stdout, 3);
}

/* ── Adımlar: yokla(ctx) → { tamam, ayrinti } · plan(ctx) → metin · yap(ctx) → ayrıntı ───────────────────────── */
function adimlar() {
  const A = {};
  A.node = {
    baslik: 'Node.js',
    yokla: (ctx) => ({ tamam: true, ayrinti: `${process.version} (${kd.tasinabilir(ctx.program).node ? 'taşınabilir, program klasöründe' : process.execPath})` }),
  };
  A.yol = {
    baslik: 'Kullanıcı PATH (taşınabilir Node / Git)',
    yokla: (ctx) => {
      const t = kd.tasinabilir(ctx.program);
      const dizinler = [t.node ? t.nodeDizin : null, t.git ? t.gitDizin : null].filter(Boolean);
      if (!dizinler.length) return { tamam: true, ayrinti: 'taşınabilir çalışma zamanı yok (bilgisayardaki Node / Git kullanılır)' };
      const p = String(ctx.win.kullaniciPath || '').toLowerCase().split(';').map(s => s.trim().replace(/\\+$/, ''));
      const eksik = dizinler.filter(d => !p.includes(d.toLowerCase()));
      ctx.pathEksik = eksik;
      return { tamam: !eksik.length, ayrinti: eksik.length ? `eksik: ${eksik.join(', ')}` : 'tamam' };
    },
    plan: (ctx) => (ctx.pathEksik && ctx.pathEksik.length ? `kullanıcı PATH'inin başına eklenecek: ${ctx.pathEksik.join(', ')}` : 'taşınabilir Node / Git klasörleri (varsa) kullanıcı PATH\'ine eklenir'),
    yap: (ctx) => {
      if (ctx.a.pathYok) return { atlandi: true, ayrinti: 'deneme: --path-yok' };
      const betik = `$e = @(${ctx.pathEksik.map(kd.psDize).join(',')})\n$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $p) { $p = '' }\n$l = @($p -split ';' | Where-Object { $_ })\nforeach ($d in $e) { if (-not ($l | Where-Object { $_.TrimEnd('\\') -ieq $d })) { $l = @($d) + $l } }\n[Environment]::SetEnvironmentVariable('Path', ($l -join ';'), 'User')\n'ok'`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { input: betik, encoding: 'utf8', windowsHide: true, timeout: 60000 });
      if (r.status !== 0 || !/ok/.test(r.stdout)) throw new Error(`PATH yazılamadı: ${sonSatirlar(r.stderr)}`);
      return `eklendi: ${ctx.pathEksik.join(', ')} (yeni açılan pencerelerde geçerli)`;
    },
  };
  A.paketler = {
    baslik: 'Paketler (node_modules)',
    yokla: (ctx) => { const p = kd.paketlerTamam(ctx.program); return { tamam: p.tamam, ayrinti: p.tamam ? `${p.sayi} paket hazır` : `eksik: ${p.eksik.join(', ')}` }; },
    plan: (ctx) => `npm ${fs.existsSync(path.join(ctx.program, 'package-lock.json')) ? 'ci' : 'install'} --omit=dev --ignore-scripts`,
    yap: (ctx) => {
      const komut = fs.existsSync(path.join(ctx.program, 'package-lock.json')) ? 'ci' : 'install';
      const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      const r = fs.existsSync(cli)
        ? spawnSync(process.execPath, [cli, komut, '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: ctx.program, env: ortam(ctx.program), encoding: 'utf8', windowsHide: true, timeout: 15 * 60000 })
        : spawnSync('npm.cmd', [komut, '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: ctx.program, env: ortam(ctx.program), encoding: 'utf8', windowsHide: true, shell: true, timeout: 15 * 60000 });
      if (r.status !== 0) throw new Error(`npm ${komut} başarısız: ${sonSatirlar(r.stdout + '\n' + r.stderr)}`);
      const p = kd.paketlerTamam(ctx.program);
      if (!p.tamam) throw new Error(`npm ${komut} sonrası eksik: ${p.eksik.join(', ')}`);
      return `npm ${komut} tamam (${p.sayi} paket)`;
    },
  };
  A.isaret = {
    baslik: `Kurulum işareti (${yollar.KURULUM_ISARETI})`,
    yokla: (ctx) => {
      const i = kd.isaretOku(ctx.program);
      if (!i && ctx.c.kaynak === 'eski-data') return { tamam: true, atlandi: true, ayrinti: `var olan kurulum (veri ${ctx.c.kok}) — işaret yazılmaz, davranış değişmez` };
      if (i && ctx.a.veri && !ayniYol(i.veriYeri, ctx.a.veri)) return { tamam: false, ayrinti: `veri yeri değişiyor: ${i.veriYeri} → ${ctx.a.veri}` };
      return { tamam: !!(i && i.surum === ctx.surum && i.rol === ctx.rol && (!depoGecerli(ctx.depo) || i.depo === ctx.depo)), ayrinti: i ? `var (${i.rol}, ${i.surum})` : 'yok' };
    },
    plan: (ctx) => {
      const kok = ctx.a.veri || (ctx.c.kaynak === 'veri-yeri.json' ? ctx.c.kok : yollar.VARSAYILAN_KOK);
      // Kuru çalışmada sonraki adımlar işaretten SONRAKİ çözümü görsün (yazmadan).
      ctx.c = { program: ctx.program, kok, duzen: yollar.duzenBul(kok), kaynak: ctx.a.veri ? 'veri-yeri.json' : 'varsayilan' };
      return `${yollar.KURULUM_ISARETI} yazılacak: sürüm ${ctx.surum}, rol ${ctx.rol}, veri ${kok}${ctx.a.veri ? ' (veri-yeri.json ile)' : ''}`;
    },
    yap: (ctx) => {
      if (ctx.a.veri) {
        if (ctx.c.kaynak === 'eski-data') throw new Error('Veri program klasöründe (data/) duruyor — veriyi taşımak için: npm run veri-tasi');
        const y = path.join(ctx.program, yollar.YER_DOSYASI);
        const once = jsonOku(y);
        if (!once || !ayniYol(once.kok, ctx.a.veri)) { fs.writeFileSync(y + '.tmp', JSON.stringify({ kok: ctx.a.veri, not: 'Pusula veri yeri (scripts/kur.js --veri)' }, null, 2)); fs.renameSync(y + '.tmp', y); }
      }
      const once = kd.isaretOku(ctx.program) || {};
      yollar._sifirla();
      const c = yollar.cozumle(ctx.program);
      // İşaret yazılmadan önce çözüm C:\Pusula-Veri'yi vermez (işaret onu açar) — işaret sonrası çözüm:
      const kok = ctx.a.veri || (c.kaynak === 'veri-yeri.json' ? c.kok : yollar.VARSAYILAN_KOK);
      const j = { pusulaKurulum: 1, surum: ctx.surum, rol: ctx.rol, veriYeri: kok, depo: depoGecerli(ctx.depo) ? ctx.depo : (once.depo || null),
        kurulum: once.kurulum || new Date().toISOString(), son: new Date().toISOString(), not: 'Pusula kurulum işareti (scripts/kur.js). Silinirse veri yeri program klasöründeki data/ olur.' };
      const f = path.join(ctx.program, yollar.KURULUM_ISARETI);
      fs.writeFileSync(f + '.tmp', JSON.stringify(j, null, 2));
      fs.renameSync(f + '.tmp', f);
      yollar._sifirla();
      ctx.c = yollar.cozumle(ctx.program);
      return `yazıldı: ${ctx.rol}, ${ctx.surum}, veri ${ctx.c.kok}`;
    },
  };
  A.veri = {
    baslik: 'Veri yeri ve tür klasörleri',
    yokla: (ctx) => { const v = kd.veriYokla(ctx.c); return { tamam: v.tamam, ayrinti: `${v.kok} (${v.duzen === 'yeni' ? 'yeni düzen' : 'eski düzen'})${v.tamam ? '' : ' — eksik'}` }; },
    plan: (ctx) => `${ctx.c.kok} oluşturulacak${ctx.c.duzen === 'yeni' ? ' + kisisel, gizli, arastirma, onbellek, makine' : ''}`,
    yap: (ctx) => {
      fs.mkdirSync(ctx.c.kok, { recursive: true });
      if (ctx.c.duzen === 'yeni') yollar.yolKur(ctx.c, ['makine.json']);   // işaret + 5 tür klasörü (lib/yollar.js isaretKoy)
      const v = kd.veriYokla(ctx.c);
      if (!v.tamam) throw new Error(`veri klasörü kurulamadı: ${v.kok}`);
      return `${v.kok} hazır`;
    },
  };
  A.jeton = {
    baslik: 'Panel / telefon jetonu',
    yokla: (ctx) => { const j = kd.jetonYokla(ctx.c); return { tamam: j.var, ayrinti: j.var ? `var (${j.kaynak})` : 'yok' }; },
    plan: () => 'telefon-jeton.json üretilecek (48 karakter, rastgele)',
    yap: (ctx) => {
      const f = yollar.yolKur(ctx.c, ['telefon-jeton.json']);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (fs.existsSync(f)) throw new Error('telefon-jeton.json zaten var — üzerine yazılmadı');
      require('../lib/sirKasasi').yaz(f, { jeton: crypto.randomBytes(24).toString('hex'), olusturma: new Date().toISOString(), kaynak: 'scripts/kur.js' });   // 69.6 sır kasası
      return 'üretildi (telefon bağlantısı: npm run telefon)';
    },
  };
  A.git = {
    baslik: 'Git ve dağıtım deposu (güncelleme)',
    yokla: (ctx) => {
      const g = kd.gitBilgi(ctx.program);
      ctx.git = g;
      if (!g.git) return { tamam: false, ayrinti: 'Git bulunamadı' };
      if (g.depo && g.uzak && depoGecerli(ctx.depo) && g.uzak !== ctx.depo && !ctx.a.zorla) return { tamam: true, atlandi: true, ayrinti: `başka bir uzak depo (${g.uzak}) — değiştirilmez` };
      if (g.depo && g.uzak && !depoGecerli(ctx.depo)) return { tamam: true, ayrinti: `uzak ${g.uzak} · HEAD ${g.bas || '?'}` };
      if (!depoGecerli(ctx.depo)) return { tamam: true, atlandi: true, ayrinti: 'dağıtım deposu adresi yok (geliştirme kopyası) — atlandı' };
      return { tamam: !!(g.depo && g.uzak === ctx.depo && g.bas), ayrinti: g.depo ? `uzak ${g.uzak || 'yok'} · HEAD ${g.bas || 'yok'}` : 'git deposu değil' };
    },
    plan: (ctx) => `${ctx.git && ctx.git.depo ? '' : 'git init + '}origin = ${ctx.depo} + fetch + HEAD = kurulan sürüm (dosyalar değişmez)`,
    yap: (ctx) => {
      const git = kd.gitBul(ctx.program);
      if (!git) throw new Error('Git bulunamadı (kurulum programı MinGit getirir; elle: https://git-scm.com)');
      const k = (args, zamanMs = 60000) => {
        const r = spawnSync(git, ['-C', ctx.program, ...args], { encoding: 'utf8', windowsHide: true, timeout: zamanMs, env: ortam(ctx.program) });
        if (r.status !== 0) throw new Error(`git ${args[0]}: ${sonSatirlar(r.stderr || r.stdout, 3)}`);
        return String(r.stdout || '').trim();
      };
      const yeni = !fs.existsSync(path.join(ctx.program, '.git'));
      if (yeni) k(['init', '-b', 'main']);
      const uzak = (() => { try { return k(['remote', 'get-url', 'origin']); } catch (e) { return null; } })();
      if (!uzak) k(['remote', 'add', 'origin', ctx.depo]);
      else if (uzak !== ctx.depo) k(['remote', 'set-url', 'origin', ctx.depo]);   // yalnız --zorla ile buraya gelinir
      try { k(['fetch', 'origin', 'main'], 5 * 60000); } catch (e) { throw new Error(`dağıtım deposuna ulaşılamadı (${e.message}) — internet bağlantısından sonra Sistem › Kurulum denetimi › Onar`); }
      let bas = null;
      try { bas = k(['rev-parse', '--verify', 'HEAD']); } catch (e) { /* henüz commit yok */ }
      if (!bas) {
        // Kurulan sürümün commit'i (kurulum programı kurulum/surum.json'a yazar); bulunamazsa origin/main. --mixed: dosyalar DEĞİŞMEZ.
        const s = jsonOku(path.join(ctx.program, 'kurulum', 'surum.json')) || {};
        let hedef = 'origin/main';
        if (s.commit && /^[0-9a-f]{7,40}$/.test(s.commit)) { try { k(['cat-file', '-e', `${s.commit}^{commit}`]); hedef = s.commit; } catch (e) { /* yok */ } }
        k(['reset', '--mixed', hedef]);
        try { k(['branch', '--set-upstream-to=origin/main', 'main']); } catch (e) { /* */ }
        // İlk kurulum: kurulan dosyalar depodakinden farklıysa (kurulum programı daha eski bir sürümden) program klasörü depoya
        // eşitlenir — henüz kullanıcı değişikliği yok, veri ayrı klasörde. Böylece güncelleyici "elle" demez.
        const fark = k(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean).length;
        if (fark) {
          k(['checkout', '--', '.']);
          if (!kd.paketlerTamam(ctx.program).tamam) A.paketler.yap(ctx);
        }
      }
      const kirli = k(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean).length;
      return `origin ${ctx.depo} · HEAD ${k(['rev-parse', '--short', 'HEAD'])}${kirli ? ` · ${kirli} dosya kurulan sürümden farklı` : ''}`;
    },
  };
  for (const g of kd.GOREVLER) {
    A[g.adim] = {
      baslik: `${g.ad} — ${g.baslik}`,
      roller: g.roller,
      yokla: (ctx) => {
        const kayit = (ctx.win.gorevler || []).find(x => x.ad === ctx.a.onek + g.ad);
        const d = kd.gorevDurumu(kayit, true, ctx.program);
        return { tamam: d.durum !== 'kotu', ayrinti: d.ayrinti };
      },
      plan: (ctx) => `powershell -File scripts\\${g.betik} ${g.arg.join(' ')}${ctx.a.onek ? ` -GorevAdi ${ctx.a.onek}${g.ad}` : ''}`,
      yap: (ctx) => powershellDosya(g.betik, [...g.arg, ...(ctx.a.onek ? ['-GorevAdi', ctx.a.onek + g.ad] : [])], ctx),
    };
  }
  A.kisayol = {
    baslik: 'Kısayollar (masaüstü + Başlat menüsü)',
    yokla: (ctx) => {
      const k = ctx.win.kisayollar || [];
      const iyi = (x) => x && x.var && kd.programiGosterir(x.hedef, ctx.program);
      return { tamam: iyi(k[0]) && iyi(k[1]), ayrinti: `masaüstü ${iyi(k[0]) ? 'var' : 'yok'} · Başlat menüsü ${iyi(k[1]) ? 'var' : 'yok'}` };
    },
    plan: (ctx) => `powershell -File scripts\\kisayol-kur.ps1 -BaslatMenusu${ctx.a.masaustu ? ` -Klasor ${ctx.a.masaustu}` : ''}${ctx.a.baslatKlasor ? ` -BaslatKlasor ${ctx.a.baslatKlasor}` : ''}`,
    yap: (ctx) => powershellDosya('kisayol-kur.ps1', ['-BaslatMenusu', ...(ctx.a.masaustu ? ['-Klasor', ctx.a.masaustu] : []), ...(ctx.a.baslatKlasor ? ['-BaslatKlasor', ctx.a.baslatKlasor] : [])], ctx),
  };
  A.uyku = {
    baslik: 'Uyku ayarı (prize bağlıyken hiçbir zaman)',
    yokla: (ctx) => { const u = kd.uykuOku(); ctx.uyku = u; return { tamam: u.ac === 0, ayrinti: u.ac == null ? 'okunamadı' : u.ac === 0 ? 'uyumaz' : `${Math.round(u.ac / 60)} dk sonra uyur` }; },
    plan: () => 'powercfg /change standby-timeout-ac 0',
    yap: (ctx) => {
      if (ctx.a.uykuYok) return { atlandi: true, ayrinti: 'deneme: --uyku-yok' };
      try { execFileSync('powercfg', ['/change', 'standby-timeout-ac', '0'], { windowsHide: true, timeout: 30000, stdio: 'ignore' }); } catch (e) { /* aşağıda yeniden okunur */ }
      const u = kd.uykuOku();
      if (u.ac !== 0) throw new Error('uyku ayarı değiştirilemedi (bu bilgisayarda yönetici izni gerekiyor olabilir): Ayarlar › Sistem › Güç › "Prize bağlıyken uyku" = Hiçbir zaman');
      return 'prize bağlıyken uyku: hiçbir zaman';
    },
  };
  A.ac = {
    baslik: 'Pusula başlat + kurulum sihirbazı',
    yokla: () => ({ tamam: false, ayrinti: '' }),
    plan: (ctx) => `Pusula başlatılır, tarayıcıda http://127.0.0.1:${process.env.PORT || 3000}/#/kurulum açılır`,
    yap: (ctx) => {
      powershellDosya('pusula-sunucu.ps1', ['-Islem', 'Baslat', '-PanelAcma'], ctx, 240000);
      spawnSync('cmd.exe', ['/d', '/c', 'start', '""', `http://127.0.0.1:${process.env.PORT || 3000}/#/kurulum`], { windowsHide: true, timeout: 30000 });
      return 'panel açıldı (Kurulum sihirbazı: "Yeni kurulum" ya da "Başka bilgisayardan taşı")';
    },
  };
  return A;
}
const ayniYol = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/**
 * Kurulumu çalıştırır. Döndürür: { success, kuru, rol, program, adimlar: [{ id, baslik, durum: zaten|plan|yapildi|atlandi|hata, ayrinti }] }
 * o.program: program kökü (yalnız bu kopyanın kendisi; test kopyası kendi kur.js'ini çalıştırır).
 */
async function kur(a, o = {}) {
  const program = o.program || PROGRAM;
  const c = yollar.cozumle(program);
  const isaret = kd.isaretOku(program) || {};
  const gelistirme = kd.gelistirmeMi(c);
  const rol = a.rol || (kd.ROLLER.includes(isaret.rol) ? isaret.rol : 'kullanici');
  const ctx = { a, program, c, rol, surum: kd.surumOku(program), depo: a.depo || isaret.depo || DEPO_VARSAYILAN, gelistirme };
  ctx.win = o.win || await kd.windowsYokla({ onek: a.onek, masaustu: a.masaustu, baslatKlasor: a.baslatKlasor });
  const A = adimlar();
  const secili = ADIM_SIRASI.filter(id => (a.adim ? a.adim.includes(id) : (id !== 'ac' || a.ac)));
  const sonuc = [];
  const gunluk = [];
  for (const id of secili) {
    const s = A[id];
    const kayit = { id, baslik: s.baslik };
    sonuc.push(kayit);
    try {
      if (s.roller && !s.roller.includes(rol) && !(a.adim && a.adim.includes(id))) { Object.assign(kayit, { durum: 'atlandi', ayrinti: `${rol} kurulumunda yok` }); continue; }
      if (gelistirme && SISTEM.has(id) && !a.zorla) { Object.assign(kayit, { durum: 'atlandi', ayrinti: `geliştirme bilgisayarı (makine.json arastirmaModu) — kurulmaz${s.plan ? `; --zorla ile: ${s.plan(ctx)}` : ''}` }); continue; }
      const y = s.yokla(ctx);
      if (y.atlandi) { Object.assign(kayit, { durum: 'atlandi', ayrinti: y.ayrinti }); continue; }
      if (y.tamam) { Object.assign(kayit, { durum: 'zaten', ayrinti: y.ayrinti }); continue; }
      if (a.kuru) { Object.assign(kayit, { durum: 'plan', ayrinti: `${y.ayrinti ? y.ayrinti + ' → ' : ''}${s.plan(ctx)}` }); continue; }
      const r = s.yap(ctx);
      if (r && typeof r === 'object' && r.atlandi) Object.assign(kayit, { durum: 'atlandi', ayrinti: r.ayrinti });
      else Object.assign(kayit, { durum: 'yapildi', ayrinti: String(r || '') });
    } catch (e) {
      Object.assign(kayit, { durum: 'hata', ayrinti: String(e.message || e).slice(0, 600) });
    }
    gunluk.push(kayit);
  }
  const ozet = { success: !sonuc.some(x => x.durum === 'hata'), kuru: a.kuru, rol, gelistirme, surum: ctx.surum, program, veri: ctx.c.kok, adimlar: sonuc };
  if (!a.kuru) {
    try {
      const f = yollar.yolKur(ctx.c, ['kur.log']);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.appendFileSync(f, JSON.stringify({ zaman: new Date().toISOString(), rol, surum: ctx.surum, adimlar: sonuc.map(x => ({ id: x.id, durum: x.durum, ayrinti: x.ayrinti })) }) + '\n');
    } catch (e) { /* günlük yazılamadı — sonuç yine döner */ }
  }
  return ozet;
}

function yazdir(r) {
  const isaret = { zaten: '✓', yapildi: '✓', plan: '→', atlandi: '·', hata: '✗' };
  console.log(`Pusula kurulum adımı${r.kuru ? ' (KURU ÇALIŞMA — hiçbir şey değişmez)' : ''} · ${r.rol}${r.gelistirme ? ' · geliştirme bilgisayarı' : ''} · sürüm ${r.surum} · veri ${r.veri}`);
  for (const x of r.adimlar) console.log(`  ${isaret[x.durum] || '?'} ${x.id.padEnd(17)} ${x.durum.padEnd(8)} ${x.ayrinti || ''}`);
  const n = (d) => r.adimlar.filter(x => x.durum === d).length;
  console.log(`\n${r.success ? '✓' : '✗'} ${n('yapildi')} yapıldı, ${n('zaten')} zaten tamam, ${n('plan')} yapılacak, ${n('atlandi')} atlandı, ${n('hata')} hata`);
}

if (require.main === module) {
  let a;
  try { a = argOku(process.argv.slice(2)); } catch (e) { console.error('✗ ' + e.message); process.exit(2); }
  if (a.yardim) { console.log('Kullanım: npm run kur -- [--kuru] [--rol kullanici|sunucu] [--adim a,b] [--veri <klasör>] [--depo <adres>] [--ac] [--json]\nAdımlar: ' + ADIM_SIRASI.join(', ')); process.exit(0); }
  kur(a).then((r) => {
    if (a.json) console.log(JSON.stringify(r)); else yazdir(r);
    process.exit(r.success ? 0 : 1);
  }).catch((e) => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
}

module.exports = { kur, argOku, ADIM_SIRASI, SISTEM, DEPO_VARSAYILAN, depoGecerli };
