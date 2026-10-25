'use strict';
/**
 * D3 TATBİKAT SİHİRBAZI — PROVA TANIMLARI (TASARIM-MAKINE-HESAP-BOT §8.4; PLAN-DEMO-KABUL §5; PLAN-MAKINE-HESAP-BOT D3 "Claude ihtiyacı kalmasın")
 * ═══════════════════════════════════════════════════════════════════════════
 * Her prova = amaç + ÖNKOŞULLAR (Pusula kendisi denetler) + kullanıcının ADIMLARI (net metin) + OTOMATİK DOĞRULAYICILAR (Pusula'nın gözlediği).
 * Numaralar demo kabulündeki provalarla AYNI (lib/ileri/demoKabulEsikleri.js PROVALAR: 1 felaket stopu, 2 çökme, 3 internet, 4 kapalı
 * bilgisayar, 5 acil durdurma, 6 mutabakat). 7 = makine devri (75.5 bot taşıma) — demo kabulünün parçası DEĞİL (prova günlüğüne yazılmaz).
 *
 * SAF: doğrulayıcılar yalnız verilen bağlamı (`b`) ve sihirbaz durumunu (`s`) okur; dosya okumayı sihirbaz yapar (b.oku.*).
 * HİÇBİR doğrulayıcı emir vermez, bot ayarı değiştirmez, süreç kapatmaz — kullanıcının yaptığını KAYITLARDAN görür:
 *   koruma.jsonl (felaket stopu denetimi) · mutabakat.jsonl · alarmlar.jsonl (acil-deneme) · bildirim-gecmis.jsonl (Telegram) ·
 *   oz-denetim/olaylar.jsonl (internet geri geldi) + öz denetimin kesinti başlangıcı · oz-denetim/acilislar.jsonl · supervisor.log ·
 *   botun özeti (çalışıyor mu, ENGEL, telafi geçmişi) · bot kaydı (taşındı mı).
 * Doğrulama: { kimlik, ad, zorunlu, durum: 'gecti'|'kaldi'|'bekliyor'|'bilgi', metin, z? }.
 */
const E = require('../ileri/demoKabulEsikleri');

const DK = 60e3, SAAT = 3600e3, GUN = 864e5, TR = 3 * SAAT;

/** 90 sn → "90 sn", 42 dk → "42 dk", 27,5 sa → "27,5 sa". */
function sure(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 90e3) return `${Math.round(ms / 1000)} sn`;
  if (ms < 2 * SAAT) return `${Math.round(ms / DK)} dk`;
  return `${(ms / SAAT).toFixed(1).replace('.', ',')} sa`;
}
/** ms → "25.10 14:03" (Türkiye saati). */
function saat(z) {
  const d = new Date(z + TR);
  if (!Number.isFinite(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
/** Botun günlük karar penceresi (03:02 TR) çevresi: 02:30–04:00 TR. */
function kararPenceresinde(z) { const d = new Date(z + TR); const m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m >= 150 && m <= 240; }
/** [a, b] aralığı en az bir günlük karar anını (00:02 UTC = 03:02 TR) kapsıyor mu? */
function kararAniKapsar(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return false;
  let t = Math.floor(a / GUN) * GUN + 2 * DK;
  if (t < a) t += GUN;
  return t <= b;
}

const d = (kimlik, ad, durum, metin, ek = {}) => ({ kimlik, ad, zorunlu: ek.zorunlu !== false, durum, metin, z: ek.z || null });
const k = (ad, tamam, metin, zorunlu = true) => ({ ad, tamam: !!tamam, metin, zorunlu });
const botAd = (b) => (b.bot && (b.bot.adGorunen || b.bot.ad)) || 'bot';
const oz = (b) => (b.bot && b.bot.ozet) || null;
const calisiyor = (b) => { const o = oz(b); return !!(o && o.calisiyor); };
const aktif = (b) => { const o = oz(b); return !!(o && o.yurutucu === 'AKTIF'); };
const stopSembolleri = (b) => { const o = oz(b); const s = o && o.koruma && o.koruma.stoplar; return s && typeof s === 'object' ? Object.keys(s) : []; };
const kisaSembol = (s) => String(s || '').split(':')[0];
const gonderildi = (x) => x && (x.sonuc === 'gonderildi' || x.sonuc == null && x.ok === true);
const BILDIRIM_SONUC = { kapali: 'bu bildirim türü kapalı', hata: 'gönderilemedi', bekletildi: 'sessiz saatte bekletildi', dusuruldu: 'sessiz saatte düşürüldü' };
/** Bildirim geçmişinde başlığı desene uyan ilk satır → doğrulama. */
function telegramDogrula(kimlik, ad, satirlar, desen, bekleMetni, zorunlu = true) {
  const x = (satirlar || []).find(r => desen.test(String(r.baslik || '')));
  if (!x) return d(kimlik, ad, 'bekliyor', bekleMetni, { zorunlu });
  const z = Date.parse(x.zaman);
  if (gonderildi(x)) return d(kimlik, ad, 'gecti', `Telegram'a gitti (${saat(z)}): "${String(x.baslik).slice(0, 90)}"`, { zorunlu, z });
  return d(kimlik, ad, 'kaldi', `bildirim üretildi ama Telegram'a gitmedi — ${BILDIRIM_SONUC[x.sonuc] || x.sonuc || 'bilinmiyor'}${x.hata ? ` (${String(x.hata).slice(0, 80)})` : ''}`, { zorunlu, z });
}
const ortakOnkosul = (b) => [
  k('Bot bu makinede', !(b.bot && b.bot.kayitEngel), b.bot && b.bot.kayitEngel ? b.bot.kayitEngel.metin : 'bot bu bilgisayarda çalışıyor'),
];
const pencereUyarisi = (b) => k('Günlük karar saatinin (03:02) dışında', !kararPenceresinde(b.simdi), kararPenceresinde(b.simdi) ? 'şu an 02:30–04:00 arası — botun günlük çalışmasına denk gelmesin diye başka bir saatte yapın' : 'karar saatinden uzak', false);

const PROVALAR = [
  {
    kimlik: 'felaket-stopu', no: 1, demoNo: 1, ad: 'Felaket stopu kaybolması', olcut: 'I4', modlar: ['demo'],
    amac: 'Borsadaki felaket stoplarından biri (elle ya da borsa tarafında) silinirse botun bunu saatlik denetimde fark edip stopu yeniden koyduğunu ve Telegram\'a haber verdiğini görmek.',
    tavanMs: 90 * DK, tavanAdim: 'iptal',
    onkosul(b) {
      const stoplar = stopSembolleri(b);
      const o = oz(b) || {};
      return [...ortakOnkosul(b),
        k('Demo hesapta çalışan bot', b.bot.mod === 'demo', b.bot.mod === 'demo' ? 'demo hesap' : 'kâğıt hesapta felaket stopu borsada durmaz — bu prova demo hesaptaki botta yapılır'),
        k('Bot çalışıyor ve borsaya bağlı', calisiyor(b) && aktif(b), calisiyor(b) ? (aktif(b) ? 'çalışıyor' : `yürütücü durumu ${o.yurutucu || '—'}`) : 'bot durmuş — önce Botlar\'dan başlatın'),
        k('Felaket stopu açık ve en az bir stop var', !!(o.koruma && o.koruma.aktif) && stoplar.length > 0, stoplar.length ? `${stoplar.length} stop: ${stoplar.map(kisaSembol).join(', ')}` : 'borsada Pusula\'nın koyduğu stop yok (açık pozisyon yok ya da koruma kapalı)'),
        k('ENGEL yok', !o.engel, o.engel ? `ENGEL: ${String(o.engel).slice(0, 120)}` : 'yok'),
        pencereUyarisi(b)];
    },
    adimlar: (b) => [
      { id: 'bak', tur: 'kullanici', baslik: 'Stopları borsada görün', dugme: 'Gördüm, Pusula ile aynı',
        metin: ['Binance demo → Vadeli → Açık emirler → "Koşullu" (algo) emirler sekmesini açın.', `Her sembolde STOP_MARKET, "closePosition" ve "Mark fiyatı" olmalı. Pusula'nın bildiği stoplar: ${stopSembolleri(b).map(kisaSembol).join(', ') || '—'}.`] },
      { id: 'iptal', tur: 'kullanici', baslik: 'En küçük pozisyonun stopunu iptal edin', dugme: 'İptal ettim', sembolSor: true,
        metin: ['Binance demo\'da EN KÜÇÜK pozisyonun felaket stopunu elle iptal edin. Pozisyonu KAPATMAYIN, yalnız stop emrini iptal edin.', 'İptal ettikten hemen sonra hangi sembol olduğunu seçip düğmeye basın — süre bu andan ölçülür.'] },
      { id: 'gozlem', tur: 'gozlem', baslik: 'Pusula izliyor (en çok 70 dk)',
        metin: ['Bot saatte bir stopları denetler: kaybolan stopu fark edip yeniden koymalı ve Telegram\'a "felaket stopu kayboldu" göndermeli.', 'Bu sayfayı kapatabilirsiniz; Pusula kendisi izler. Sonuç gelince burada "Sonucu kaydet" çıkar.'] },
    ],
    dogrula(b, s) {
      const t = s.adimlar && s.adimlar.iptal;
      if (!t) return [];
      const sembol = s.sembol || null;
      const uy = (x) => !sembol || kisaSembol(x.symbol) === kisaSembol(sembol);
      const rows = (b.oku.koruma(t) || []).filter(r => r && r.zaman >= t);
      const r1 = rows.find(r => (r.kaybolan || []).some(x => uy(x) && !x.tetiklendi));
      const kayipSem = r1 ? (r1.kaybolan.find(x => uy(x) && !x.tetiklendi) || {}).symbol : sembol;
      const r2 = rows.find(r => r.zaman >= (r1 ? r1.zaman : t) && (r.konan || []).some(x => !kayipSem || kisaSembol(x) === kisaSembol(kayipSem)));
      const hata = rows.find(r => (r.hatalar || []).some(h => !kayipSem || kisaSembol(h.symbol) === kisaSembol(kayipSem)));
      const l = [];
      l.push(r1 ? d('fark', 'Kaybolan stop fark edildi', 'gecti', `${sure(r1.zaman - t)} sonra saatlik denetimde fark edildi (${kisaSembol(kayipSem)})`, { z: r1.zaman })
        : d('fark', 'Kaybolan stop fark edildi', 'bekliyor', 'saatlik felaket stopu denetimi bekleniyor'));
      if (r2) l.push(d('yeniden', 'Stop yeniden kondu', 'gecti', `${kisaSembol(kayipSem)} stopu ${saat(r2.zaman)}'de yeniden kondu`, { z: r2.zaman }));
      else if (hata) l.push(d('yeniden', 'Stop yeniden kondu', 'kaldi', `stop konamadı: ${String(((hata.hatalar || [])[0] || {}).hata || '').slice(0, 120)}`, { z: hata.zaman }));
      else l.push(d('yeniden', 'Stop yeniden kondu', 'bekliyor', 'yeniden konması bekleniyor'));
      l.push(telegramDogrula('telegram', 'Telegram "felaket stopu kayboldu"', b.oku.bildirim(t), /felaket stopu kayboldu/i, 'Telegram bildirimi bekleniyor'));
      if (r2) { const ms = r2.zaman - t; l.push(d('sure', 'Süre ≤ 70 dk', ms <= 70 * DK ? 'gecti' : 'kaldi', `iptal → yeniden konma ${sure(ms)}`)); }
      else l.push(d('sure', 'Süre ≤ 70 dk', 'bekliyor', `${sure(b.simdi - t)} geçti`));
      return l;
    },
  },
  {
    kimlik: 'cokme', no: 2, demoNo: 2, ad: 'Pusula çökmesi ve yeniden açılış', olcut: 'I8', modlar: ['demo', 'kagit'],
    amac: 'Pusula beklenmedik biçimde kapanırsa (çökme) denetleyicinin onu yeniden açtığını, botun kendiliğinden bağlanıp çalışmaya devam ettiğini, mutabakatın temiz olduğunu ve ENGEL / çift emir olmadığını görmek.',
    tavanMs: 60 * DK, tavanAdim: 'hazir',
    onkosul(b) {
      const o = oz(b) || {};
      return [...ortakOnkosul(b),
        k('Bot çalışıyor', calisiyor(b), calisiyor(b) ? 'çalışıyor' : 'bot durmuş — önce Botlar\'dan başlatın'),
        k('ENGEL yok', !o.engel, o.engel ? `ENGEL: ${String(o.engel).slice(0, 120)}` : 'yok'),
        k('Denetleyici (Pusula-Baslat) kaydı var', !!b.supervisorVar, b.supervisorVar ? 'Pusula denetleyiciyle çalışıyor — kapanınca kendiliğinden yeniden açılır' : 'denetleyici kaydı (supervisor.log) yok: Pusula kapanınca kendiliğinden açılmayabilir — o zaman masaüstündeki Pusula-Baslat ile kendiniz açın', false),
        pencereUyarisi(b)];
    },
    adimlar: () => [
      { id: 'hazir', tur: 'kullanici', baslik: 'Hazırlık', dugme: 'Hazırım — şimdi kapatacağım',
        metin: ['Düğmeye basınca Pusula provayı diske yazar (yeniden açılınca kaldığı yerden sürer).', 'Pusula hiçbir süreci kendisi kapatmaz — bir sonraki adımı siz yaparsınız.'] },
      { id: 'gozlem', tur: 'gozlem', baslik: 'Pusula\'yı sonlandırın, yeniden açılmasını bekleyin',
        metin: ['Görev Yöneticisi (Ctrl+Shift+Esc) → Ayrıntılar → node.exe (Pusula) → "Görevi sonlandır".', 'Panel bağlantıyı kaybeder. Denetleyici Pusula\'yı yaklaşık 1 dakikada yeniden açar; açmazsa masaüstündeki Pusula-Baslat ile kendiniz açın.', 'Açılınca bu sayfaya dönün. Bot kendiliğinden bağlanmalı; mutabakat açılışta yapılmadıysa Botlar › bot › "Mutabakat" düğmesine basın.'] },
    ],
    dogrula(b, s) {
      const t = s.adimlar && s.adimlar.hazir;
      if (!t) return [];
      const ac = (s.acilislar || []).find(a => a.acilis > t);
      const l = [];
      if (!ac) { l.push(d('acilis', 'Pusula yeniden açıldı', 'bekliyor', 'Pusula\'nın kapatılıp yeniden açılması bekleniyor')); return l; }
      l.push(d('acilis', 'Pusula yeniden açıldı', 'gecti', `${sure(ac.acilis - (ac.oncekiNabiz || t))} kapalı kaldı, ${saat(ac.acilis)}'de açıldı`, { z: ac.acilis }));
      const ak = (b.oku.acilislar() || []).find(x => Math.abs(x.z - ac.acilis) < 5 * DK);
      l.push(d('plansiz', 'Çökme olarak görüldü', ak && ak.p ? 'bilgi' : 'gecti', ak && ak.p ? 'açılış PLANLI kapanış sonrası kaydedildi (Pusula-Durdur kullanılmış olabilir) — çökme provası için Görev Yöneticisi\'nden sonlandırın' : 'beklenmedik kapanış olarak kaydedildi (öz denetim sayacı)', { zorunlu: false }));
      const sup = (b.oku.supervisor(t) || []).find(x => /baslatiliyor/i.test(x.metin || ''));
      l.push(d('denetleyici', 'Denetleyici yeniden başlattı', sup ? 'gecti' : 'bilgi', sup ? `supervisor.log ${saat(sup.zaman)}` : 'denetleyici kaydı yok — Pusula elle açılmış', { zorunlu: false }));
      const o = oz(b) || {};
      l.push(calisiyor(b) && aktif(b) ? d('bot', 'Bot yeniden bağlandı', 'gecti', `${botAd(b)} çalışıyor, borsaya bağlı`) : d('bot', 'Bot yeniden bağlandı', 'bekliyor', `bot ${calisiyor(b) ? `çalışıyor ama yürütücü ${o.yurutucu || '—'}` : 'henüz çalışmıyor'}`));
      const mt = (b.oku.mutabakat(ac.acilis) || []).filter(r => r.zaman >= ac.acilis);
      const kirli = mt.find(r => r.temiz === false);
      l.push(kirli ? d('mutabakat', 'Mutabakat temiz', 'kaldi', `mutabakat temiz değil: ${String(kirli.engel || '').slice(0, 120)}`, { z: kirli.zaman })
        : mt.length ? d('mutabakat', 'Mutabakat temiz', 'gecti', `açılıştan sonra ${mt.length} mutabakat, hepsi temiz`, { z: mt[0].zaman })
          : d('mutabakat', 'Mutabakat temiz', 'bekliyor', 'açılıştan sonra mutabakat bekleniyor (yapılmadıysa Botlar › bot › "Mutabakat")'));
      l.push(o.engel ? d('engel', 'ENGEL yok', 'kaldi', `ENGEL: ${String(o.engel).slice(0, 120)}`) : d('engel', 'ENGEL yok', 'gecti', 'yok'));
      const dolum = (b.oku.emirler(t) || []).filter(x => x.durum === 'DOLDU' && (x.guncelleme || x.olusturma || 0) >= t);
      const say = new Map();
      for (const x of dolum) { const a = `${x.id}`; if (!say.has(a)) say.set(a, x); }
      const sembol = new Map();
      for (const x of say.values()) sembol.set(`${x.symbol}|${x.side}`, (sembol.get(`${x.symbol}|${x.side}`) || 0) + 1);
      const cift = [...sembol.entries()].filter(([, n]) => n > 1);
      l.push(cift.length ? d('cift', 'Çift emir yok', 'kaldi', `aynı sembolde birden çok dolum: ${cift.map(([a, n]) => `${kisaSembol(a.split('|')[0])} ×${n}`).join(', ')} — emirler.jsonl'i inceleyin`)
        : d('cift', 'Çift emir yok', 'gecti', `prova süresince ${say.size} dolum, çift yok`));
      return l;
    },
  },
  {
    kimlik: 'internet', no: 3, demoNo: 3, ad: 'İnternet kesintisi (30 dk)', olcut: 'I6', modlar: ['demo', 'kagit'],
    amac: 'İnternet 30 dakika kesilince Pusula\'nın kesintiyi fark ettiğini, botun DURMADIĞINI, bağlantı dönünce mutabakatın temiz olduğunu ve felaket stoplarının borsada durduğunu görmek.',
    tavanMs: 4 * SAAT, tavanAdim: 'kes',
    onkosul(b) {
      const o = oz(b) || {};
      const ozd = b.ozDenetim;
      return [...ortakOnkosul(b),
        k('Bot çalışıyor', calisiyor(b), calisiyor(b) ? 'çalışıyor' : 'bot durmuş — önce Botlar\'dan başlatın'),
        k('Öz denetim çalışıyor', !!ozd, ozd ? 'internet kesintisini öz denetim ölçer' : 'öz denetim kapalı — kesinti ölçülemez'),
        k('İnternet şu an bağlı', !!ozd && !ozd.kesintiBas, ozd && ozd.kesintiBas ? `zaten ${sure(b.simdi - ozd.kesintiBas)} süredir kesik` : 'bağlı'),
        k('ENGEL yok', !o.engel, o.engel ? `ENGEL: ${String(o.engel).slice(0, 120)}` : 'yok'),
        pencereUyarisi(b)];
    },
    adimlar: () => [
      { id: 'kes', tur: 'kullanici', baslik: 'İnterneti kesin', dugme: 'Şimdi kesiyorum',
        metin: ['Düğmeye basın, sonra bu bilgisayarın Wi-Fi\'ını kapatın ya da ağ kablosunu çıkarın.', 'Pusula\'yı ve bilgisayarı KAPATMAYIN. Panel açık kalabilir (bu bilgisayarın içinden çalışır).'] },
      { id: 'gozlem', tur: 'gozlem', baslik: '30 dk sonra bağlantıyı geri açın',
        metin: ['30 dakika dolunca Wi-Fi\'ı açın / kabloyu takın.', 'Bağlantı dönünce Botlar › bot › "Mutabakat" düğmesine basın.', 'Pusula kesintinin süresini, botun durmadığını ve sonraki saatlik denetimde stopların borsada olduğunu kendisi denetler.'] },
    ],
    gozlemGuncelle(b, s) {
      const t = s.adimlar && s.adimlar.kes;
      if (!t) return;
      s.gozlem = s.gozlem || {};
      const ozd = b.ozDenetim;
      if (ozd && ozd.kesintiBas && ozd.kesintiBas >= t - 10 * DK && !s.gozlem.kesintiBit) s.gozlem.kesintiBas = Math.min(s.gozlem.kesintiBas || Infinity, ozd.kesintiBas);
      const o = oz(b);
      if (!s.gozlem.kesintiBit && !s.gozlem.botDurdu && o && (!o.calisiyor || o.engel)) s.gozlem.botDurdu = { z: b.simdi, neden: o.engel ? `ENGEL: ${String(o.engel).slice(0, 100)}` : 'bot durdu' };
    },
    dogrula(b, s) {
      const t = s.adimlar && s.adimlar.kes;
      if (!t) return [];
      const g = s.gozlem || {};
      const l = [];
      const geri = (b.oku.ozOlaylar(t) || []).find(x => x.kimlik === 'internet' && x.tur === 'duzeldi' && x.zaman >= t);
      if (geri && !g.kesintiBit) g.kesintiBit = geri.zaman;
      l.push(g.kesintiBas ? d('kesinti', 'Kesinti fark edildi', 'gecti', `öz denetim ${saat(g.kesintiBas)}'de kesintiyi gördü`, { z: g.kesintiBas })
        : geri ? d('kesinti', 'Kesinti fark edildi', 'gecti', String(geri.metin || 'internet kesintisi kaydedildi'), { z: geri.zaman })
          : d('kesinti', 'Kesinti fark edildi', 'bekliyor', 'öz denetimin kesintiyi görmesi bekleniyor (birkaç dakika sürebilir)'));
      l.push(g.kesintiBit ? d('geri', 'Bağlantı geri geldi', 'gecti', `${saat(g.kesintiBit)}'de geri geldi`, { z: g.kesintiBit }) : d('geri', 'Bağlantı geri geldi', 'bekliyor', 'bağlantının dönmesi bekleniyor'));
      if (g.kesintiBit) {
        const bas = g.kesintiBas || (geri ? geri.zaman - (Number(/(\d+)\s*dk/.exec(String(geri.metin || '')) ? /(\d+)\s*dk/.exec(String(geri.metin))[1] : 0) * DK) : t);
        const ms = g.kesintiBit - bas;
        l.push(d('sure', 'Kesinti en az 25 dk', ms >= 25 * DK ? 'gecti' : 'kaldi', ms >= 25 * DK ? `kesinti ${sure(ms)}` : `kesinti ${sure(ms)} — en az 30 dk olmalı (provayı yeniden yapın)`));
      } else l.push(d('sure', 'Kesinti en az 25 dk', 'bekliyor', g.kesintiBas ? `${sure(b.simdi - g.kesintiBas)} süredir kesik` : '—'));
      l.push(g.botDurdu ? d('bot', 'Bot durmadı', 'kaldi', `${saat(g.botDurdu.z)}: ${g.botDurdu.neden}`, { z: g.botDurdu.z })
        : g.kesintiBit ? d('bot', 'Bot durmadı', 'gecti', 'kesinti boyunca bot çalışmaya devam etti') : d('bot', 'Bot durmadı', 'bekliyor', 'kesinti sürüyor — bot izleniyor'));
      if (g.kesintiBit) {
        const mt = (b.oku.mutabakat(g.kesintiBit) || []).filter(r => r.zaman >= g.kesintiBit);
        const kirli = mt.find(r => r.temiz === false);
        l.push(kirli ? d('mutabakat', 'Mutabakat temiz', 'kaldi', `mutabakat temiz değil: ${String(kirli.engel || '').slice(0, 120)}`, { z: kirli.zaman })
          : mt.length ? d('mutabakat', 'Mutabakat temiz', 'gecti', `bağlantı dönünce mutabakat temiz (${saat(mt[0].zaman)})`, { z: mt[0].zaman })
            : d('mutabakat', 'Mutabakat temiz', 'bekliyor', 'Botlar › bot › "Mutabakat" düğmesine basın'));
        const o = oz(b) || {};
        const korumali = b.bot.mod !== 'kagit' && !!(o.koruma && o.koruma.aktif);
        if (korumali) {
          const den = (b.oku.koruma(g.kesintiBit) || []).find(r => r.zaman >= g.kesintiBit && r.tur === 'denetim');
          l.push(!den ? d('stop', 'Stoplar borsada', 'bekliyor', 'bağlantı döndükten sonraki saatlik stop denetimi bekleniyor')
            : (den.kaybolan || []).length || (den.hatalar || []).length ? d('stop', 'Stoplar borsada', 'kaldi', `denetimde ${(den.kaybolan || []).length} kaybolan, ${(den.hatalar || []).length} hatalı stop`, { z: den.zaman })
              : d('stop', 'Stoplar borsada', 'gecti', `${saat(den.zaman)} denetimi: bütün stoplar yerinde`, { z: den.zaman }));
        }
      }
      return l;
    },
  },
  {
    kimlik: 'kapali', no: 4, demoNo: 4, ad: 'Uzun kapanış (26 saat, kaçırılan gün)', olcut: 'I6', modlar: ['demo', 'kagit'],
    amac: 'Bilgisayar günlük karar saatini (03:02) kaçıracak kadar kapalı kalınca, açılışta botun "26 saattir çalışmadı" uyarısı verdiğini, kaçırılan günü kaydettiğini ve YALNIZ bugünkü hedefe gittiğini görmek.',
    tavanMs: 8 * GUN, tavanAdim: 'kapat',
    onkosul(b) {
      const o = oz(b) || {};
      return [...ortakOnkosul(b),
        k('Bot çalışıyor', calisiyor(b), calisiyor(b) ? 'çalışıyor' : 'bot durmuş — önce Botlar\'dan başlatın'),
        k('ENGEL yok', !o.engel, o.engel ? `ENGEL: ${String(o.engel).slice(0, 120)}` : 'yok'),
        k('Telegram bağlı', !!(o.telegram && o.telegram.bagli), o.telegram && o.telegram.bagli ? 'bağlı' : 'Telegram bağlı değil — uyarı yalnız panele düşer', false)];
    },
    adimlar: () => [
      { id: 'kapat', tur: 'kullanici', baslik: 'Bilgisayarı kapatın', dugme: 'Şimdi kapatıyorum',
        metin: ['Düğmeye basın, sonra Windows\'u kapatın (Başlat › Güç › Bilgisayarı kapat).', 'En az 26 saat kapalı tutun. Bu süre gece 03:02\'yi (botun günlük karar saati) kapsamalı.', 'Açınca Pusula\'yı her zamanki gibi başlatın ve bu sayfaya dönün.'] },
      { id: 'gozlem', tur: 'gozlem', baslik: 'Açılıştan sonra Pusula denetliyor',
        metin: ['Beklenen: "… saattir çalışmadı" uyarısı, kaçırılan gün kaydı (bot yalnız bugünkü hedefe gider, geçmiş günlerin emirleri verilmez).', 'Gölge yazılınca "kaçırılan … gün — gerçekleşen vs gölge" uyarısı da gelir (bilgi).'] },
    ],
    tavanFn(s) { const ac = (s.acilislar || []).find(a => a.acilis > ((s.adimlar && s.adimlar.kapat) || Infinity)); return ac ? ac.acilis + 24 * SAAT : null; },
    dogrula(b, s) {
      const t = s.adimlar && s.adimlar.kapat;
      if (!t) return [];
      const ac = (s.acilislar || []).find(a => a.acilis > t);
      if (!ac) return [d('acilis', 'Bilgisayar kapatılıp açıldı', 'bekliyor', 'bilgisayarın kapatılıp yeniden açılması bekleniyor')];
      const kapali = ac.acilis - (ac.oncekiNabiz || t);
      const l = [d('acilis', 'Bilgisayar kapatılıp açıldı', 'gecti', `${saat(ac.oncekiNabiz || t)} → ${saat(ac.acilis)}`, { z: ac.acilis }),
        d('sure', 'En az 26 saat kapalı', kapali >= 26 * SAAT ? 'gecti' : 'kaldi', kapali >= 26 * SAAT ? `${sure(kapali)} kapalı` : `${sure(kapali)} kapalı — 26 saatten kısa`),
        d('0302', 'Karar saatini (03:02) kapsadı', kararAniKapsar(ac.oncekiNabiz || t, ac.acilis) ? 'gecti' : 'kaldi', kararAniKapsar(ac.oncekiNabiz || t, ac.acilis) ? 'kapalı kaldığı sürede en az bir 03:02 vardı' : 'kapalı sürede 03:02 yoktu')];
      l.push(telegramDogrula('uyari', '"… saattir çalışmadı" uyarısı', (b.oku.bildirim(ac.acilis - 5 * DK) || []), /saattir çalışmadı/i, 'açılış uyarısı bekleniyor'));
      const o = oz(b) || {};
      const tf = (o.telafiGecmisi || []).find(x => x && x.zaman >= ac.acilis - 5 * DK && x.kacirilanGun >= 1);
      l.push(tf ? d('telafi', 'Kaçırılan gün kaydı', 'gecti', `kaçırılan ${tf.kacirilanGun} gün; bot yalnız bugünkü (${tf.kararGun || '—'}) hedefe gitti`, { z: tf.zaman })
        : d('telafi', 'Kaçırılan gün kaydı', 'bekliyor', 'botun açılıştan sonraki ilk günlük çalışması bekleniyor'));
      l.push(telegramDogrula('golge', '"kaçırılan gün — gerçekleşen vs gölge" uyarısı', (b.oku.bildirim(ac.acilis - 5 * DK) || []), /kaçırılan .*gün — gerçekleşen vs gölge/i, 'gölge yazılınca gelir (bilgi — hükme girmez)', false));
      return l;
    },
  },
  {
    kimlik: 'acil', no: 5, demoNo: 5, ad: 'Acil durdurma denemesi', olcut: 'I1', modlar: ['demo', 'kagit'],
    amac: 'Acil durdurmanın gerçekten bütün emirleri iptal edip pozisyonları kapattığını, mutabakatın temiz kaldığını ve Telegram\'a "ACİL" bildirimi gittiğini görmek. DİKKAT: bütün pozisyonları piyasadan kapatır.',
    tavanMs: 2 * SAAT, tavanAdim: 'durdur',
    onkosul(b) {
      const o = oz(b) || {};
      const l = [...ortakOnkosul(b),
        k('Bot borsaya bağlı', o.yurutucu && o.yurutucu !== 'BAGLI_DEGIL', o.yurutucu && o.yurutucu !== 'BAGLI_DEGIL' ? 'bağlı' : 'bot borsaya bağlı değil — önce Botlar › bot › "Mutabakat" ile bağlanın')];
      if (b.bot.ad === 'hucum' && b.bot.mod === 'demo') {
        const sonra = (E.PROVALAR.find(p => p.no === 5) || {}).sonra || 63;
        l.push(k(`Demo kabulünün ${sonra}. gününden sonra`, Number.isFinite(b.demoGun) && b.demoGun >= sonra, Number.isFinite(b.demoGun) ? `bugün ${b.demoGun}. gün — acil deneme ölçümü bozmasın diye ${sonra}. günden sonra yapılır` : 'demo kabul günü okunamadı'));
      }
      l.push(pencereUyarisi(b));
      return l;
    },
    adimlar: (b) => [
      { id: 'durdur', tur: 'kullanici', baslik: 'Botu durdurun', dugme: 'Durdurdum', kosul: 'bot-durmus',
        metin: [`Botlar › ${botAd(b)} › "Durdur". Acil deneme yalnız durmuş botta yapılır.`] },
      { id: 'gozlem', tur: 'gozlem', baslik: 'Acil durdurmayı deneyin',
        metin: [`Botlar › ${botAd(b)} › "Acil durdurmayı dene" (PIN ister). Bütün emirler iptal edilir, pozisyonlar piyasadan kapanır.`, 'Pusula sonucu kayıtlardan kendisi okur. Bitince botu yeniden başlatabilirsiniz; ertesi günlük çalışma "ilk çalışma" ile hedefe gider.'] },
    ],
    dogrula(b, s) {
      const t = s.adimlar && s.adimlar.durdur;
      if (!t) return [];
      const r = (b.oku.alarmlar(t) || []).find(x => x.olay === 'acil-deneme' && x.zaman >= t);
      if (!r) return [d('deneme', 'Acil deneme yapıldı', 'bekliyor', 'Botlar\'daki "Acil durdurmayı dene" bekleniyor')];
      const sayi = (x) => (x && typeof x === 'object' ? `${x.bizimEmir ?? '—'} emir / ${x.pozisyon ?? '—'} pozisyon` : '—');
      return [
        d('deneme', 'Acil deneme başarılı', r.basarili ? 'gecti' : 'kaldi', `önce ${sayi(r.once)} → sonra ${sayi(r.sonra)}${r.denemeSebep ? ` · ${String(r.denemeSebep).slice(0, 80)}` : ''}`, { z: r.zaman }),
        d('mutabakat', 'Mutabakat temiz', r.mutabakat === 'temiz' ? 'gecti' : 'kaldi', r.mutabakat === 'temiz' ? 'temiz' : `temiz değil: ${String(r.mutabakat).slice(0, 120)}`, { z: r.zaman }),
        telegramDogrula('telegram', 'Telegram "ACİL DURDURMA"', b.oku.bildirim(t), /ACİL|acil durdurma/i, 'Telegram bildirimi bekleniyor'),
      ];
    },
  },
  {
    kimlik: 'mutabakat', no: 6, demoNo: 6, ad: 'Mutabakat provası', olcut: 'I1', modlar: ['demo', 'kagit'], istegeBagli: true,
    amac: 'Botun kendi kayıtlarıyla borsadaki emir ve pozisyonların birebir uyduğunu (mutabakat temiz) elle bir kez denemek.',
    tavanMs: 60 * DK, tavanAdim: null,
    onkosul(b) {
      const o = oz(b) || {};
      return [...ortakOnkosul(b), k('Bot borsaya bağlı', o.yurutucu && o.yurutucu !== 'BAGLI_DEGIL', o.yurutucu && o.yurutucu !== 'BAGLI_DEGIL' ? 'bağlı' : 'bağlı değil — "Mutabakat" düğmesi bağlanmayı da dener', false)];
    },
    adimlar: (b) => [
      { id: 'gozlem', tur: 'gozlem', baslik: 'Mutabakat düğmesine basın', metin: [`Botlar › ${botAd(b)} › "Mutabakat" (borsayla karşılaştır) düğmesine basın. Pusula sonucu kayıttan okur.`] },
    ],
    dogrula(b, s) {
      const t = s.bas;
      const r = (b.oku.mutabakat(t) || []).find(x => x.zaman >= t && x.kaynak === 'elle');
      if (!r) return [d('mutabakat', 'Elle mutabakat temiz', 'bekliyor', 'Botlar\'daki "Mutabakat" düğmesi bekleniyor')];
      return [d('mutabakat', 'Elle mutabakat temiz', r.temiz ? 'gecti' : 'kaldi', r.temiz ? `temiz (${saat(r.zaman)})` : `temiz değil: ${String(r.engel || '').slice(0, 120)}`, { z: r.zaman })];
    },
  },
  {
    kimlik: 'makine-devri', no: 7, demoNo: null, ad: 'Makine devri (botu başka makineye taşıma)', olcut: null, modlar: ['demo', 'kagit'],
    amac: 'Bir botu (75.5 bot taşıma) eşlenmiş başka bir sunucuya taşıyıp orada mutabakat + başlatma ile kaldığı yerden sürdüğünü görmek. Demo kabulünün parçası değildir; Kairos 2026-12-09\'a kadar taşınmaz.',
    tavanMs: 3 * SAAT, tavanAdim: null,
    onkosul(b) {
      return [...ortakOnkosul(b),
        k('Bot taşınabilir', !b.bot.tasinabilir, b.bot.tasinabilir ? b.bot.tasinabilir.metin : 'kâğıt / demo bindirme botu'),
        k('Eşlenmiş başka makine var', !!b.makineVar, b.makineVar ? 'Ayarlar › Makineler\'de eş var' : 'önce Ayarlar › Makineler\'de hedef sunucuyu eşleyin'),
        pencereUyarisi(b)];
    },
    adimlar: (b) => [
      { id: 'tasidim', tur: 'kullanici', baslik: 'Botu taşıyın', dugme: 'Taşıdım', kosul: 'tasindi',
        metin: [`Ayarlar › Makineler › "Botu başka makineye taşı" → ${botAd(b)} → hedef sunucu → PIN + TAŞI.`, 'Pusula botu bu makinede durdurur, paketi hedefe gönderir. Pozisyonlara ve borsadaki stoplara dokunulmaz.'] },
      { id: 'hedef', tur: 'kullanici', baslik: 'Hedef makinede açın', dugme: 'Hedefte çalışıyor',
        metin: [`Hedef makinenin panelinde: Botlar › ${botAd(b)} › "Mutabakat", sonra "Başlat".`, 'Hedefte bot çalışmaya başlayınca bu düğmeye basın (Pusula hedef makineyi buradan yönetmez).'] },
      { id: 'gozlem', tur: 'gozlem', baslik: 'Sonuç', metin: ['Pusula bu makinedeki kaydı denetler: bot artık hedef makinede, buradaki kopya durmuş ve salt okunur olmalı.'] },
    ],
    dogrula(b, s) {
      const l = [];
      const e = b.bot.kayitEngel;
      l.push(e && e.kod === 'baska-makinede' ? d('kayit', 'Bot kaydı hedef makinede', 'gecti', e.metin.slice(0, 160)) : d('kayit', 'Bot kaydı hedef makinede', 'bekliyor', e ? e.metin.slice(0, 160) : 'bot hâlâ bu makinede'));
      l.push(!calisiyor(b) ? d('kaynak', 'Buradaki kopya durdu', 'gecti', 'bu makinede bot çalışmıyor') : d('kaynak', 'Buradaki kopya durdu', 'kaldi', 'bot bu makinede hâlâ çalışıyor'));
      l.push(s.adimlar && s.adimlar.hedef ? d('hedef', 'Hedefte çalışıyor', 'gecti', `kullanıcı beyanı (${saat(s.adimlar.hedef)})`, { z: s.adimlar.hedef }) : d('hedef', 'Hedefte çalışıyor', 'bekliyor', 'hedef makinede başlatma bekleniyor'));
      return l;
    },
  },
];

const BUL = (kimlik) => PROVALAR.find(p => p.kimlik === kimlik || String(p.no) === String(kimlik)) || null;

/** Saf: doğrulamalar + süre → önerilen hüküm. 'geçti' | 'geçmedi' | null (sürüyor). Süre dolunca bekleyen zorunlular "kaldı" olur. */
function hukumOner(dogrulamalar, { simdi, tavan } = {}) {
  const z = (dogrulamalar || []).filter(x => x.zorunlu);
  if (!z.length) return { hukum: null, dogrulamalar };
  if (z.some(x => x.durum === 'kaldi')) return { hukum: 'geçmedi', dogrulamalar };
  if (z.every(x => x.durum === 'gecti')) return { hukum: 'geçti', dogrulamalar };
  if (Number.isFinite(tavan) && simdi > tavan) {
    return { hukum: 'geçmedi', zamanAsimi: true, dogrulamalar: dogrulamalar.map(x => (x.zorunlu && x.durum === 'bekliyor' ? { ...x, durum: 'kaldi', metin: `süre doldu — ${x.metin}` } : x)) };
  }
  return { hukum: null, dogrulamalar };
}

/** Kairos demo kabulünde ertelenmiş zorunlu provalar (sihirbazda hazır): 1, 2, 3, 4 (5 = 63. günden sonra). */
const ERTELENEN = Object.freeze([1, 2, 3, 4]);

module.exports = { PROVALAR, BUL, hukumOner, sure, saat, kararPenceresinde, kararAniKapsar, ERTELENEN, DK, SAAT, GUN };
