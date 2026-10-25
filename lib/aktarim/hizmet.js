'use strict';
/**
 * A4 — ONAYLI ALT HESAPLAR ARASI AKTARIM: hizmet (TASARIM-MAKINE-HESAP-BOT §8.2 + §8.5 + §11 #12; PLAN-MAKINE-HESAP-BOT §8 s2).
 * ═══════════════════════════════════════════════════════════════════════════
 * Kullanıcı kararı: "onaylı alt hesap aktarımı, çekim izni kapalı". KESİN KURALLAR:
 *   · Pusula ASLA dış adrese para çekmez: borsa bağdaştırıcısı (lib/aktarim/borsa.js) yalnız iç aktarım uçlarını çağırır, çekme
 *     izni açık anahtarla aktarım yapılmaz (her aktarımdan önce izinler borsadan yeniden okunur).
 *   · OTOMATİK AKTARIM YOK: her aktarım kullanıcının panelde tek tek başlattığı iki aşamalı işlemdir — önizleme → acil PIN + "AKTAR"
 *     (uç: lib/sunucu/sermayeUclari.js). Öneriler (lib/sermayeDagitimi.js) yalnız öneridir.
 *   · Taraflar: "ana hesap" + botlar (her bot kendi alt hesabında). Hedef yalnız Anahtarlar'da kayıtlı hesaplardan çözülür (alt hesap
 *     e-postası / adı) — liste dışı adres koddan reddedilir.
 *   · Kipler: PROVA (her zaman; sahte borsa — para hareketi YOK, botlara dokunulmaz) ve CANLI HESAP (lib/aktarim/kapi.js: ayrı yazılı
 *     karar + canlı hesap kapısı G1–G9 + 2027-01-05; varsayılan KAPALI). Demo hesapta alt hesap aktarımı yok (Binance demo'da sapi yok).
 *   · Kairos demo kabulü (2026-12-09'a kadar) aktarım kapsamı DIŞINDA; çoklu varlık botu da dışında (borsa geçmişinde alt hesap aktarımı
 *     görünmez → bot hareketi algılayamaz).
 *   · Tavanlar: tek aktarım ≤ tekTavan, günlük (TR günü, kip başına) ≤ gunlukTavan, kaynak botun özsermayesinin en çok %50'si; kaynak bot
 *     o an günlük çalışmada olmamalı; açık (BEKLİYOR / BELİRSİZ) aktarım varken yenisi yok.
 *   · DEFTER ÖNCE: <veri>/live/aktarimlar.jsonl (yalnız eklenir) — BEKLIYOR satırı borsaya gitmeden yazılır; sonuç TAMAM / RED /
 *     BELIRSIZ. Belirsizde aynı istemci kimliğiyle SORGULANIR (körlemesine tekrar yok); kullanıcı "Borsadan sorgula" ile yineler.
 *   · 76.2 PARA AKIŞI ONAYIYLA UYUM: canlı aktarım TAMAM olunca iki bottaki para akışı kuralı etkinse "onaylı akış" ÖN KAYDI yazılır
 *     (BindirmeBot.sermayeDegisikligi — "Para yatırdım / çektim" ile aynı yol, onay KAYIT): bot borsadaki hareketi görünce eşleşir,
 *     DURMAZ, hesaplar yeni bakiyeyle. Kural kapalıysa bot hareketi 69.3 yoluyla kendisi uygular (ön kayıt gerekmez — çift sayım olmasın).
 *     Ön kayıt yazılamazsa bot hareketi onay bekleyen olarak görür (çıkışta durur — güvenli yön) ve kullanıcı Sorunlar'dan onaylar.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SD = require('../sermayeDagitimi');
const BR = require('./borsa');
const KAPI = require('./kapi');
const { SahteAktarimBorsa } = require('./sahte');

const DEFTER = 'aktarimlar.jsonl';
const KAPI_DOSYA = 'aktarim-kapisi.json';
const ONAY = 'AKTAR';
const KAIROS_RED = 'Kairos demo kabulü (2026-12-09\'a kadar) aktarım kapsamı dışında';
const COKLU_RED = 'çoklu varlık botunda alt hesap aktarımı borsa geçmişinde görünmez — bot hareketi algılayamaz, kapsam dışı';
const KAYNAK_ORAN = 0.5;
const ACIK = new Set(['BEKLIYOR', 'BELIRSIZ']);
const TR = 3 * 3600e3;
const trGun = (t) => new Date(+t + TR).toISOString().slice(0, 10);
const onayNormal = (s) => String(s == null ? '' : s).trim().toLocaleUpperCase('tr-TR');
const yuvarla = (x) => Math.round(x * 100) / 100;

function olustur(o = {}) {
  if (!o.dizin) throw new Error('aktarım hizmeti: dizin gerekli');
  const dizin = o.dizin;
  const simdi = o.simdi || (() => Date.now());
  const log = o.log || (() => {});
  const dosya = path.join(dizin, DEFTER);
  const bildir = o.bildir || (() => null);
  const provaBorsalari = new Map();   // id → sahte borsa (prova kipinde belirsiz kalan aktarımın sorgusu için; yeniden başlatmada silinir)

  const ayar = () => SD.ayar(o.ayar ? o.ayar() : null);
  const botlar = () => { try { return (o.botlar ? o.botlar() : []) || []; } catch { return []; } };
  const jsonOku = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

  /* ── Defter ── */
  function satirlar() {
    let m = '';
    try { m = fs.readFileSync(dosya, 'utf8'); } catch { return []; }
    return m.split('\n').filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(x => x && x.id);
  }
  /** id → birleşik kayıt (sırayla Object.assign). */
  function kayitlar() {
    const h = new Map();
    for (const x of satirlar()) h.set(x.id, { ...(h.get(x.id) || {}), ...x });
    return [...h.values()].sort((a, b) => (a.z0 || a.z) - (b.z0 || b.z));
  }
  function ekle(x) {
    fs.mkdirSync(dizin, { recursive: true });
    const fd = fs.openSync(dosya, 'a');
    try { fs.writeSync(fd, JSON.stringify(x) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  function kullanilan(kip, gun) {
    return yuvarla(kayitlar().filter(k => k.kip === kip && k.gun === gun && k.durum !== 'RED').reduce((s, k) => s + (+k.tutar || 0), 0));
  }
  const acikAktarimlar = (kip) => kayitlar().filter(k => ACIK.has(k.durum) && (!kip || k.kip === kip));

  /* ── Kapı ── */
  function kapi() {
    const k = KAPI.denetle({ simdi: simdi(), dosya: o.kapiDosyasi ? o.kapiDosyasi() : jsonOku(path.join(dizin, KAPI_DOSYA)), kapilar: o.canliKapilar ? o.canliKapilar() : jsonOku(path.join(dizin, 'canli-kapilar.json')), arastirma: !!o.arastirma });
    const ah = aktarimHesabi();
    if (!ah) k.eksikler.push({ kod: 'A-ANAHTAR', metin: 'aktarım anahtarı yok (Ayarlar › Anahtarlar › hesap türü "aktarım" — para çekme izni KAPALI)' });
    else if (o.borsaHazir && !o.borsaHazir(ah.borsa)) k.eksikler.push({ kod: 'A-BORSA', metin: `${ah.borsa === 'okx' ? 'OKX' : ah.borsa} bağdaştırıcısı henüz hazır değil (hata matrisi tam geçmedi)` });
    k.izin = k.eksikler.length === 0;
    return k;
  }
  function aktarimHesabi() { try { return o.aktarimHesabi ? o.aktarimHesabi() : null; } catch { return null; } }

  /* ── Taraflar ── */
  /** Bot tarafının uygunluğu → neden | null. */
  function botEngeli(b, kip, ah, a) {
    if (b.dokunulmaz) return KAIROS_RED;
    if (b.btcAyak === 'coklu') return COKLU_RED;
    if (kip !== 'canli') return null;
    if (b.mod !== 'canli') return `bot ${b.mod === 'demo' ? 'demo' : 'kâğıt'} hesapta — canlı aktarım yalnız canlı hesaptaki botlar arasında (demo hesapta alt hesap aktarımı yok)`;
    if (!ah) return 'aktarım anahtarı yok';
    if (!b.hesapId) return 'botun canlı hesabı yok';
    if ((b.borsa || 'binance') !== ah.borsa) return 'bot başka borsada (aktarım anahtarının borsası değil)';
    if (b.hesapId !== a.anaHesap) {
      const h = o.hesap ? o.hesap(b.hesapId) : null;
      if (!h || !h.altHesap) return 'botun hesabının alt hesap adresi (e-posta / alt hesap adı) Anahtarlar\'da yok';
      if (h.borsa && h.borsa !== ah.borsa) return 'botun hesabı başka borsada';
    }
    try { const k = b.kapi ? b.kapi() : null; if (k && k.izin === false) return `botun canlı hesap kapısı kapalı (${(k.eksikler || []).map(e => e.metin).join(' · ').slice(0, 160)})`; } catch { return 'botun canlı hesap kapısı okunamadı'; }
    return null;
  }
  /** Bütün taraflar (iç biçim: adres dahil — DIŞARI VERİLMEZ; disari() kullan). */
  function taraflar(kip) {
    const a = ayar(), ah = aktarimHesabi();
    const l = [{ kimlik: 'ana', ad: kip === 'prova' ? 'Ana hesap (prova)' : 'Ana hesap', tur: 'ana', uc: { tur: 'ana', adres: null, cuzdan: 'spot' },
      uygun: kip === 'prova' || !!ah, neden: kip === 'prova' || ah ? null : 'aktarım anahtarı yok', bot: null }];
    for (const b of botlar()) {
      const neden = botEngeli(b, kip, ah, a);
      let uc;
      if (kip === 'prova') uc = { tur: 'alt', adres: `prova-${b.kimlik}`, cuzdan: 'vadeli' };
      else if (b.hesapId && b.hesapId === a.anaHesap) uc = { tur: 'ana', adres: null, cuzdan: 'vadeli' };
      else { const h = b.hesapId && o.hesap ? o.hesap(b.hesapId) : null; uc = { tur: 'alt', adres: h && h.altHesap ? String(h.altHesap) : null, cuzdan: 'vadeli' }; }
      l.push({ kimlik: b.kimlik, ad: b.ad || b.kimlik, tur: 'bot', uc, uygun: !neden, neden, bot: b });
    }
    return l;
  }
  const disari = (t) => ({ kimlik: t.kimlik, ad: t.ad, tur: t.tur, cuzdan: t.uc.cuzdan, uygun: t.uygun, neden: t.neden,
    mod: t.bot ? t.bot.mod : null, ozsermaye: t.bot && Number.isFinite(t.bot.ozsermaye) ? yuvarla(t.bot.ozsermaye) : null });

  /* ── Önizleme ── */
  function parmakUret(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16); }

  function onizle(g = {}) {
    const z = simdi(), gun = trGun(z), a = ayar();
    const kip = g.kip === 'canli' ? 'canli' : g.kip === 'prova' || g.kip == null ? 'prova' : null;
    const sonuc = { uygulanabilir: false, neden: null, kip, baslik: kip === 'canli' ? 'Canlı hesap aktarımı' : 'Aktarım provası', satirlar: [], uyarilar: [], onayMetni: ONAY, parmak: null, plan: null };
    const red = (m) => { sonuc.neden = m; return sonuc; };
    if (!kip) return red('kip "prova" ya da "canli" olmalı');
    if (o.arastirma) return red('Bu bilgisayar araştırma kopyası — aktarım sunucudaki panelden yapılır.');
    if (kip === 'canli') { const k = kapi(); if (!k.izin) return red(`Canlı hesap aktarımı kapalı: ${k.eksikler.map(e => e.metin).join(' · ')}`); }
    const l = taraflar(kip);
    const ks = l.find(t => t.kimlik === String(g.kaynak || '')), hd = l.find(t => t.kimlik === String(g.hedef || ''));
    if (!ks || !hd) return red('kaynak ya da hedef bilinmiyor (yalnız ana hesap ve kayıtlı botlar)');
    if (ks.kimlik === hd.kimlik) return red('kaynak ve hedef aynı');
    if (!ks.uygun) return red(`kaynak: ${ks.neden}`);
    if (!hd.uygun) return red(`hedef: ${hd.neden}`);
    const t = typeof g.tutar === 'number' ? g.tutar : Number(String(g.tutar == null ? '' : g.tutar).replace(',', '.'));
    if (!Number.isFinite(t) || t <= 0) return red('tutar pozitif bir sayı olmalı (USDT)');
    const tutar = Math.floor(t * 100) / 100;
    if (tutar < SD.EN_AZ) return red(`tutar en az ${SD.EN_AZ} USDT`);
    if (tutar > a.tekTavan) return red(`tek aktarım tavanı ${a.tekTavan} USDT — tutarı düşürün ya da birkaç aktarımda yapın`);
    const kul = kullanilan(kip, gun);
    if (kul + tutar > a.gunlukTavan + 1e-9) return red(`günlük tavan ${a.gunlukTavan} USDT — bugün ${kul} USDT kullanıldı, en çok ${yuvarla(Math.max(0, a.gunlukTavan - kul))} USDT daha`);
    const acik = acikAktarimlar(kip);
    if (acik.length) return red(`sonucu belirsiz aktarım var (#${acik[0].id}) — önce "Borsadan sorgula" ile sonucunu öğrenin`);
    for (const [ad, x] of [['kaynak', ks], ['hedef', hd]]) {
      if (!x.bot) continue;
      if (x.bot.calisma) return red(`${ad} bot (${x.ad}) şu an günlük çalışmada — bitince yeniden deneyin`);
      if (!Number.isFinite(x.bot.ozsermaye) || x.bot.ozsermaye <= 0) return red(`${ad} botun (${x.ad}) özsermayesi henüz ölçülmedi — önce bir günlük çalışma gerekir`);
    }
    if (ks.bot && tutar > KAYNAK_ORAN * ks.bot.ozsermaye + 1e-9) return red(`kaynak botun (${ks.ad}) özsermayesinin en çok %${KAYNAK_ORAN * 100}'si aktarılır (${yuvarla(KAYNAK_ORAN * ks.bot.ozsermaye)} USDT)`);
    if (hd.bot && tutar > 3 * hd.bot.ozsermaye + 1e-9) return red(`hedef bota (${hd.ad}) özsermayesinin 3 katından fazlası bir kerede aktarılmaz`);
    const borsa = kip === 'canli' ? aktarimHesabi().borsa : 'binance';
    let plan;
    try { plan = BR.planla(borsa, ks.uc, hd.uc, tutar, 'onizleme', z); } catch (e) { return red(e.message); }
    sonuc.plan = { kaynak: ks.kimlik, hedef: hd.kimlik, tutar, borsa, yontem: plan.yontem };
    sonuc.parmak = parmakUret({ kip, k: ks.kimlik, h: hd.kimlik, tutar, gun, kul, ka: ks.bot ? yuvarla(ks.bot.ozsermaye) : null, ha: hd.bot ? yuvarla(hd.bot.ozsermaye) : null,
      a: [a.tekTavan, a.gunlukTavan, a.anaHesap], kapi: kip === 'canli' });
    const cz = (x) => (x.uc.cuzdan === 'spot' ? 'spot cüzdan' : 'vadeli cüzdan');
    sonuc.satirlar.push(`Kaynak: ${ks.ad} (${cz(ks)}) → Hedef: ${hd.ad} (${cz(hd)})`, `Tutar: ${tutar.toFixed(2)} USDT`,
      `Bugün (${kip === 'canli' ? 'canlı hesap' : 'prova'}): ${kul} / ${a.gunlukTavan} USDT kullanıldı · tek aktarım tavanı ${a.tekTavan} USDT`, `Yol: ${plan.aciklama}`);
    if (kip === 'prova') {
      sonuc.satirlar.push('PROVA: aktarım sahte borsada denenir — para hareketi YOK, botlara ve borsaya dokunulmaz. Kayda "prova" diye yazılır.');
    } else {
      for (const x of [ks, hd]) {
        if (!x.bot) continue;
        const pa = x.bot.paraAkisi;
        sonuc.satirlar.push(pa && pa.etkin
          ? `${x.ad}: aktarım tamamlanınca "onaylı para ${x === ks ? 'çıkışı' : 'girişi'}" ön kaydı yazılır — bot hareketi görünce durmaz, hesaplar yeni bakiyeyle.`
          : `${x.ad}: para akışı onayı bu botta etkin değil — bot hareketi borsada kendisi algılar ve uygular.`);
      }
      sonuc.uyarilar.push('Bu bir CANLI HESAP işlemidir: para gerçekten taşınır. Yalnız aynı borsa hesabının kendi ana / alt hesapları arasında — Pusula dışarıya para çekmez.');
      sonuc.uyarilar.push('Aktarımdan hemen önce anahtarın izinleri borsadan yeniden okunur: para çekme izni açıksa aktarım YAPILMAZ.');
    }
    if (ks.bot && ks.bot.calisiyor) sonuc.uyarilar.push(`${ks.ad} çalışıyor: aktarılan para botun bakiyesinden düşer; açık pozisyonun marjı azalır — tutarı küçük tutun.`);
    sonuc.uygulanabilir = true;
    sonuc.sonraki = kip === 'prova' ? 'Prova sonucu aşağıdaki kayıtta görünür.' : 'Botlar sonraki günlük çalışmada hareketi görür ve ön kayıtla eşleştirir.';
    return sonuc;
  }

  /* ── Uygulama ── */
  function yeniId(z) { return `a${new Date(z + TR).toISOString().replace(/[-:T]/g, '').slice(0, 14)}${crypto.randomBytes(2).toString('hex')}`; }

  function provaBorsasi(l) {
    const bak = { 'ana:spot': 100000 };
    const altlar = [];
    for (const t of l) if (t.bot) { altlar.push(t.uc.adres); bak[`${t.uc.adres}:vadeli`] = Number.isFinite(t.bot.ozsermaye) ? t.bot.ozsermaye : 0; }
    return new SahteAktarimBorsa({ borsa: 'binance', altlar, bakiyeler: bak, zaman: simdi });
  }

  /** Canlı aktarım TAMAM → botlarda onaylı akış ön kaydı. @returns { kaynak, hedef } metinleri */
  async function onKayitlar(k, l) {
    const out = {};
    for (const [rol, kim, isaret] of [['kaynak', k.kaynak, -1], ['hedef', k.hedef, +1]]) {
      const t = l.find(x => x.kimlik === kim);
      if (!t || !t.bot) { out[rol] = 'gerekmez (ana hesap)'; continue; }
      const pa = t.bot.paraAkisi;
      if (!(pa && pa.etkin)) { out[rol] = 'gerekmez — bot hareketi kendisi algılar (para akışı onayı etkin değil)'; continue; }
      try {
        const r = await t.bot.sermayeKaydi(isaret * k.tutar, `Pusula aktarımı #${k.id} (${rol === 'kaynak' ? `→ ${k.hedefAd}` : `← ${k.kaynakAd}`})`, simdi());
        out[rol] = r && r.onaylandi ? 'bekleyen hareket onaylandı' : r && r.onKayit ? 'ön kayıt yazıldı (72 sa)' : 'kaydedildi';
      } catch (e) { out[rol] = `YAZILAMADI: ${String(e.message).slice(0, 140)} — bot hareketi onay bekleyen olarak görecek (Sorunlar › "Para hareketini onayla")`; }
    }
    return out;
  }

  async function sonuclandir(k, r, l, b) {
    const z = simdi();
    const son = { id: k.id, z, durum: r.durum, kip: k.kip, gun: k.gun, kaynak: k.kaynak, kaynakAd: k.kaynakAd, hedef: k.hedef, hedefAd: k.hedefAd, tutar: k.tutar, borsaKimlik: r.borsaKimlik || null, hata: r.hata || null };
    if (r.durum === 'TAMAM' && k.kip === 'canli') son.onKayit = await onKayitlar(k, l || taraflar('canli'));
    if (r.durum === 'TAMAM' && k.kip === 'prova' && b) son.provaBakiye = { kaynak: b.bakiye[`${k.kaynakAdres || 'ana'}:${k.kaynakCuzdan}`], hedef: b.bakiye[`${k.hedefAdres || 'ana'}:${k.hedefCuzdan}`] };
    ekle(son);
    const birlesik = { ...k, ...son };
    const ozet = `${k.kaynakAd} → ${k.hedefAd}: ${k.tutar.toFixed(2)} USDT`;
    if (k.kip === 'canli') {
      if (r.durum === 'TAMAM') bildir('uyari', 'Sermaye aktarımı yapıldı', [`${ozet} (#${k.id}).`, 'Yalnız kendi alt hesaplarınız arasında; dışarıya para çekilmedi.',
        ...Object.entries(son.onKayit || {}).map(([rol, m]) => `${rol === 'kaynak' ? k.kaynakAd : k.hedefAd}: ${m}`), 'Siz başlatmadıysanız: borsa hesabınızı ve API anahtarlarınızı hemen kontrol edin.'], { anahtar: `aktarim:${k.id}` });
      else if (r.durum === 'BELIRSIZ') bildir('alarm', 'Sermaye aktarımının sonucu belirsiz', [`${ozet} (#${k.id}) — borsa cevap vermedi: ${r.hata || ''}`.slice(0, 300), 'Aktarım TEKRARLANMADI. Panel › Botlar › Sermaye dağıtımı › "Borsadan sorgula".'], { anahtar: `aktarim:${k.id}:b` });
      else bildir('uyari', 'Sermaye aktarımı yapılmadı', [`${ozet} (#${k.id}) — ${r.hata || 'borsa reddetti'}`.slice(0, 300), 'Para hareketi olmadı.'], { anahtar: `aktarim:${k.id}:r` });
    }
    try { if (o.ayarGecmisi) o.ayarGecmisi({ yol: `sermayeDagitimi.aktarim.${k.id}`, eski: null, yeni: `${k.kip === 'canli' ? 'canlı hesap' : 'prova'}: ${k.kaynakAd} → ${k.hedefAd} — ${r.durum}` }); } catch { /* kayıt hatası aktarımı bozmaz */ }
    log(r.durum === 'TAMAM' ? 'INFO' : 'WARN', `[AKTARIM] #${k.id} ${k.kip === 'canli' ? 'CANLI' : 'prova'} ${ozet} → ${r.durum}${r.hata ? ` (${r.hata})` : ''}`);
    return birlesik;
  }

  /**
   * İkinci aşama (uç PIN'i doğruladıktan sonra çağırır). @returns { durum: 200|400|409, govde }
   */
  async function uygula(g = {}) {
    if (onayNormal(g.onay) !== ONAY) return { durum: 400, govde: { success: false, error: `onay için ${ONAY} yazın` } };
    const onz = onizle(g);
    if (!onz.uygulanabilir) return { durum: 409, govde: { success: false, error: onz.neden, onizleme: onz } };
    if (!g.parmak || g.parmak !== onz.parmak) return { durum: 409, govde: { success: false, degisti: true, error: 'durum önizlemeden sonra değişti — yeni önizlemeyi okuyup yeniden onaylayın', onizleme: onz } };
    // Aynı önizleme ikinci kez kullanılamaz — yalnız kesin reddedilen (para hareketi olmayan) denemeden sonra yeniden denenebilir.
    if (kayitlar().some(k => k.parmak === onz.parmak && k.durum !== 'RED')) return { durum: 409, govde: { success: false, error: 'bu önizleme zaten kullanıldı — çift aktarım yapılmaz; yeni önizleme alın' } };
    const z = simdi();
    const l = taraflar(onz.kip);
    const ks = l.find(t => t.kimlik === onz.plan.kaynak), hd = l.find(t => t.kimlik === onz.plan.hedef);
    const id = yeniId(z);
    let b, ah = null;
    if (onz.kip === 'canli') {
      ah = aktarimHesabi();
      try { b = o.istemci ? o.istemci(ah.borsa, ah.anahtar) : BR.istemciKur(ah.borsa, ah.anahtar); } catch (e) { return { durum: 409, govde: { success: false, error: `borsa istemcisi kurulamadı: ${e.message}` } }; }
    } else b = provaBorsasi(l);
    const plan = BR.planla(onz.plan.borsa, ks.uc, hd.uc, onz.plan.tutar, id, z);
    const k = { id, z0: z, z, gun: trGun(z), kip: onz.kip, borsa: onz.plan.borsa, kaynak: ks.kimlik, kaynakAd: ks.ad, hedef: hd.kimlik, hedefAd: hd.ad, tutar: onz.plan.tutar,
      varlik: 'USDT', yontem: plan.yontem, istemciKimlik: BR.istemciKimligi(id), parmak: onz.parmak,
      kaynakAdres: ks.uc.adres, kaynakCuzdan: ks.uc.cuzdan, hedefAdres: hd.uc.adres, hedefCuzdan: hd.uc.cuzdan, sorgu: plan.sorgu, durum: 'BEKLIYOR' };
    // İzinler aktarımdan HEMEN ÖNCE (canlı ve prova aynı yoldan; çekme izni açıksa aktarım yok)
    let iz;
    try { iz = await BR.izinOku(onz.plan.borsa, b); } catch (e) { iz = null; k.izinHata = String(e.message).slice(0, 160); }
    const izEngel = BR.izinEngeli(iz, plan.gerek);
    if (izEngel) {
      ekle({ ...k, durum: 'RED', hata: izEngel });
      if (onz.kip === 'canli' && iz && iz.cekme !== false) bildir('alarm', 'Aktarım anahtarında PARA ÇEKME izni açık', ['Aktarım yapılmadı. Borsada bu API anahtarının para çekme iznini hemen kapatın (ya da anahtarı silip yenisini oluşturun).'], { anahtar: `aktarim-cekme:${trGun(z)}` });
      log('WARN', `[AKTARIM] #${id} yapılmadı: ${izEngel}`);
      return { durum: 409, govde: { success: false, id, durum: 'RED', error: izEngel } };
    }
    ekle(k);   // DEFTER ÖNCE
    if (onz.kip === 'prova') provaBorsalari.set(id, b);
    let r = await BR.aktar(onz.plan.borsa, b, plan);
    if (r.durum === 'BELIRSIZ') {
      const s = await BR.sorgula(onz.plan.borsa, b, plan, kayitlar().map(x => x.borsaKimlik).filter(Boolean));
      if (s.durum !== 'BELIRSIZ') r = { ...s, hata: s.durum === 'TAMAM' ? `cevap gelmedi; borsadan sorgulandı — tamamlanmış (${r.hata || ''})`.slice(0, 200) : `cevap gelmedi; borsadan sorgulandı — aktarım YOK (${s.hata || ''})`.slice(0, 200) };
      else r = { ...r, hata: `${r.hata || ''} · ${s.hata || ''}`.slice(0, 200) };
    }
    const sonuc = await sonuclandir(k, r, l, b);
    return { durum: 200, govde: { success: r.durum !== 'RED', id, durum: r.durum, aktarim: disariKayit(sonuc), error: r.durum === 'RED' ? (r.hata || 'borsa reddetti') : undefined,
      ozet: r.durum === 'TAMAM' ? `${k.kaynakAd} → ${k.hedefAd} ${k.tutar.toFixed(2)} USDT${k.kip === 'prova' ? ' (prova — para hareketi yok)' : ''}` : null,
      sonraki: r.durum === 'BELIRSIZ' ? 'Sonuç belirsiz — aktarım tekrarlanmadı. Biraz sonra "Borsadan sorgula".' : r.durum === 'TAMAM' ? onz.sonraki : null } };
  }

  /** Belirsiz / yarıda kalmış aktarımın sorgusu (salt okuma). */
  async function sorgula(id) {
    const k = kayitlar().find(x => x.id === String(id || ''));
    if (!k) return { durum: 404, govde: { success: false, error: 'aktarım bulunamadı' } };
    if (!ACIK.has(k.durum)) return { durum: 409, govde: { success: false, error: `aktarımın sonucu zaten belli: ${k.durum}`, aktarim: disariKayit(k) } };
    let b;
    if (k.kip === 'prova') {
      b = provaBorsalari.get(k.id);
      if (!b) { const s = await sonuclandir(k, { durum: 'RED', hata: 'prova kaydı: sahte borsa Pusula yeniden açılınca silindi (para hareketi zaten yoktu)' }); return { durum: 200, govde: { success: true, id: k.id, durum: 'RED', aktarim: disariKayit(s) } }; }
    } else {
      const ah = aktarimHesabi();
      if (!ah) return { durum: 409, govde: { success: false, error: 'aktarım anahtarı yok — sorgulanamadı (borsada Transfer History\'ye elle bakın)' } };
      try { b = o.istemci ? o.istemci(ah.borsa, ah.anahtar) : BR.istemciKur(ah.borsa, ah.anahtar); } catch (e) { return { durum: 409, govde: { success: false, error: `borsa istemcisi kurulamadı: ${e.message}` } }; }
    }
    const s = await BR.sorgula(k.borsa, b, { sorgu: k.sorgu }, kayitlar().filter(x => x.id !== k.id).map(x => x.borsaKimlik).filter(Boolean));
    if (s.durum === 'BELIRSIZ') { ekle({ id: k.id, z: simdi(), sonSorgu: s.hata || null }); return { durum: 200, govde: { success: true, id: k.id, durum: 'BELIRSIZ', error: s.hata, aktarim: disariKayit({ ...k, sonSorgu: s.hata }) } }; }
    const son = await sonuclandir(k, { ...s, hata: s.durum === 'TAMAM' ? 'borsadan sorgulandı — tamamlanmış' : `borsadan sorgulandı — aktarım YOK (${s.hata || ''})` }, null, b);
    return { durum: 200, govde: { success: true, id: k.id, durum: s.durum, aktarim: disariKayit(son) } };
  }

  /** Kayıt → panel (adres YOK). */
  function disariKayit(k) {
    return { id: k.id, z: k.z0 || k.z, sonZ: k.z, kip: k.kip, borsa: k.borsa, kaynak: k.kaynak, kaynakAd: k.kaynakAd, hedef: k.hedef, hedefAd: k.hedefAd, tutar: k.tutar,
      durum: k.durum, hata: k.hata || null, borsaKimlik: k.borsaKimlik || null, onKayit: k.onKayit || null, provaBakiye: k.provaBakiye || null, sonSorgu: k.sonSorgu || null, gun: k.gun };
  }

  /** Panel durumu. */
  function durum() {
    const z = simdi(), gun = trGun(z), a = ayar(), k = kapi(), kip = k.izin ? 'canli' : 'prova';
    const ah = aktarimHesabi();
    const l = taraflar(kip);
    const sp = SD.sapma(l.filter(t => t.bot).map(t => ({ kimlik: t.kimlik, ad: t.ad, ozsermaye: t.bot.ozsermaye, aktarilabilir: t.uygun, neden: t.neden })), a);
    const kayit = kayitlar();
    return { kip, kapi: k, ayar: a, onayMetni: ONAY, enAz: SD.EN_AZ, kaynakOran: KAYNAK_ORAN,
      aktarimHesabi: ah ? { var: true, ad: ah.ad, borsa: ah.borsa, sonSinama: ah.sonSinama || null } : { var: false },
      taraflar: { prova: taraflar('prova').map(disari), canli: kip === 'canli' ? l.map(disari) : taraflar('canli').map(disari) },
      sapma: sp, bugun: { gun, prova: kullanilan('prova', gun), canli: kullanilan('canli', gun), tavan: a.gunlukTavan },
      acik: kayit.filter(x => ACIK.has(x.durum)).map(disariKayit), aktarimlar: kayit.slice(-30).reverse().map(disariKayit) };
  }

  return { durum, onizle, uygula, sorgula, kapi, taraflar, kayitlar, disariKayit, dosya, KAPI_DOSYA };
}

module.exports = { olustur, ONAY, DEFTER, KAPI_DOSYA, KAIROS_RED, COKLU_RED, KAYNAK_ORAN, trGun };
