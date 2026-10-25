/**
 * TELEGRAM MENÜSÜ (74.0, kullanıcı kararı 2026-10-24 — onaylı taslak 94BwMG25MxhaWuYa2jFfJe)
 * ═══════════════════════════════════════════════════════════════════════════
 * `/menu` TEK mesaj açar; düğmelere (inline keyboard, callback_query) bastıkça AYNI mesaj `editMessageText` ile güncellenir —
 * sohbet dolmaz. Her ekranda "◀ Menü". Ekranlar: Botlar (bot başına kart + Pozisyonlar), Sorunlar (lib/sorunlar.js kartları:
 * adımlar + "Neyi saydı?"), Portföy, İleri test + gölge getirileri (lib/golgeOzet.js) + hüküm takvimi, Piyasa (lib/piyasaBaglami:
 * bu hafta + makro), Bilanço (son özet), Güncelleme, Makineler, Bildirim ayarları, Komutlar.
 *
 * KURALLAR
 *   · TELEGRAM'DAN YAZMA YOK. Yazma gerektiren iş (güncellemeyi kur, botu yeniden aç, kaydı eşitle, ayar değiştir) için düğme
 *     PANELİ AÇAR (URL düğmesi: `config.telegram.panelAdresi` + doğru rota). Adres yoksa düğme yok, metinde "Panel › …".
 *     İşlem orada acil PIN ile yapılır.
 *   · TEK İSTİSNA (açıkça kodlanmış, öz testte): "🔕 1 saat sessize al" — yalnız KRİTİK OLMAYAN bildirimleri 60 dk bekletir
 *     (lib/bildirimMerkezi.js geciciSessiz; kritik türler acil · koruma · engel · güvenlik asla susmaz; süre bitince bekleyenler
 *     tek özet). `ctx.sessizAl` dışında hiçbir yazma işlevi bu dosyadan çağrılmaz.
 *   · TUTARLAR (USD/TL) GİZLİ: yalnız yüzdeler. Son geçişte `tutarGizle` her metni süzer (sayı + para birimi → "•••").
 *   · callback_data kısa ve İMZALI: `<k><ek>.<arg>.<zaman36>.<imza10>` — k: m (menü mesajı) | n (bildirim mesajı), ek beyaz
 *     listede, imza HMAC-SHA256(bot jetonundan türetilen anahtar). Bilinmeyen / bozuk / imzası tutmayan veri YOK SAYILIR.
 *     Menü düğmeleri yalnız EN SON menü mesajında geçerlidir (eski mesajda "süresi doldu, /menu"); 24 saatten eski menü,
 *     7 günden eski bildirim düğmesi de süresi dolmuş sayılır.
 *   · Düz metin (parse_mode yok): kaçış hatası olmaz. Düzenlenen mesaj 4096 sınırına kırpılır.
 *
 * Saf olmayan kısım yalnız `ctx` sağlayıcıları (server.js verir); bu dosya ağa çıkmaz, dosya yazmaz.
 */
'use strict';
const crypto = require('crypto');
const { temizle } = require('./saglikSinyali');

const DK = 60000, SAAT = 60 * DK, GUN = 24 * SAAT;
const MENU_OMUR = GUN;
const BILDIRIM_OMUR = 7 * GUN;
const SINIR = 4000;

/** Ekran kodları (beyaz liste). `yazma: true` yalnız "ss" — tek istisna. */
const EKRAN = Object.freeze({
  m: 'menu', b: 'botlar', bd: 'bot', p: 'pozisyonlar', s: 'sorunlar', sd: 'sorun', sn: 'neyi', st: 'sorunTur',
  pf: 'portfoy', i: 'ileri', it: 'takvim', pi: 'piyasa', bi: 'bilanco', g: 'guncelleme', mk: 'makineler', ba: 'bildirim', y: 'yardim',
  ss: 'sessiz',
});
const YAZMA_EKRANLARI = Object.freeze(['ss']);
const VERI_RE = /^([mn])([a-z]{1,2})\.([a-z0-9-]{0,16})\.([0-9a-z]{1,8})\.([A-Za-z0-9_-]{10})$/;

/** Telegram'ın "/" listesi (setMyCommands). Hepsi YALNIZ OKUMA. */
const KOMUT_LISTESI = Object.freeze([
  ['menu', 'Ana menü (düğmeli, tek mesaj)'],
  ['durum', 'Botların durumu'],
  ['botlar', 'Botlar ekranı'],
  ['sorunlar', 'Etkin sorunlar ve ne yapmalı'],
  ['portfoy', 'Portföy getirileri (yalnız yüzde)'],
  ['ileri', 'İleri test ve gölge getirileri'],
  ['piyasa', 'Bu hafta + makro (yalnız bilgi)'],
  ['bilanco', 'Son bilanço özeti'],
  ['guncelleme', 'Güncelleme durumu'],
  ['makineler', 'Makineler, yönetici, son nabız'],
  ['pozisyonlar', 'Borsadaki pozisyonlar (yüzde)'],
  ['ozet', 'Son günlük özet'],
  ['saglik', 'Sunucu sağlığı'],
  ['yapilacaklar', 'Bot tarafında yapılacaklar'],
  ['teshis', 'Teşhis (Sorunlar ile aynı)'],
  ['yardim', 'Komut listesi'],
].map(([command, description]) => Object.freeze({ command, description })));

// ── metin yardımcıları (saf) ──────────────────────────────────────────────────
const trSayi = (x, b = 1) => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: b, maximumFractionDigits: b });
/** 0,0693 → "+%6,9" / "−%6,9" (sıfıra yuvarlanan "%0,0"). */
function yuzde(x, b = 1) {
  if (x == null || !Number.isFinite(+x)) return '—';
  const r = Math.abs(+x) * 100;
  if (Number(r.toFixed(b)) === 0) return `%${trSayi(0, b)}`;
  return `${x < 0 ? '−' : '+'}%${trSayi(r, b)}`;
}
const p2 = (n) => String(n).padStart(2, '0');
/** ms → "03:02" (bugün) | "25 Eki 03:02" (İstanbul saati). */
function trSaat(ms, simdi = Date.now()) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + 3 * SAAT), s = new Date(simdi + 3 * SAAT);
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  if (d.toISOString().slice(0, 10) === s.toISOString().slice(0, 10)) return hm;
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${hm}`;
}
function onceMetni(ms, simdi = Date.now()) {
  if (!Number.isFinite(ms)) return 'hiç';
  const f = Math.max(0, simdi - ms);
  if (f < SAAT) return `${Math.max(1, Math.round(f / DK))} dk önce`;
  if (f < 2 * GUN) return `${Math.round(f / SAAT)} saat önce`;
  return `${Math.round(f / GUN)} gün önce`;
}
const kirp = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * Saf: metindeki PARA TUTARLARINI gizler (kullanıcı kararı 2026-10-24: Telegram'da yalnız yüzde). Sayı + para birimi
 * ("4999.29 USDT", "1.250 TL", "31,2 milyar TL", "$120", "0,78 $", "0.060000 BTC") → "•••". Yüzde, saat, tarih, kur (USD/TRY 44,6),
 * fiyat endeksi ve adet olmayan sayılar dokunulmaz.
 */
function tutarGizle(metin) {
  return String(metin == null ? '' : metin)
    .replace(/[$€₺]\s?-?\d[\d.,]*(\s?(bin|milyon|milyar)\b)?/gi, '•••')
    // Yüzde (%5,1) ve sayının sonundaki virgül ("−%5,1, BTC al-tut") tutar sayılmaz.
    .replace(/[−-]?(?<![%\d.,])\d(?:[\d.,]*\d)?(\s?(bin|milyon|milyar))?\s?(USDT|USDC|USD|TRY|TL|EUR|BTC|ETH|\$|€|₺)(?![A-Za-zÇĞİÖŞÜçğıöşü/])/g, '•••');
}

/**
 * 74.1 Saf: BİLDİRİM mesajları için aynı kural + bildirim biçimlerine özgü üç ek (kullanıcı kararı 2026-10-24 "tutarlar Telegram'da
 * gizli" — lib/bildirimMerkezi.js, Ayarlar › Bildirimler "Telegram'da tutarları gizle"):
 *   · "4999.29 / taban ••• USDT" gibi bölü ile yazılmış tutar çiftinin ilk sayısı ("Özsermaye 4999.29 / taban 5000.00 USDT");
 *   · tutar anlatan sözcükten hemen sonra gelen yalın sayı (özsermaye, bakiye, hesap değeri, nominal, teminat, marj, tepe, taban,
 *     PnL / equity / balance) — "teminat oranı %12" gibi yüzde DOKUNULMAZ;
 *   · işlem miktarı: "buy 0.012", "al 25 adet", "3 lot" → "•••" (fiyat "@ 67250.5" ve kur korunur — pozisyon büyüklüğü tutar sayılır).
 * Yüzde, saat, tarih, fiyat, kur, sembol, oran korunur.
 */
function tutarGizleBildirim(metin) {
  return tutarGizle(metin)
    .replace(/[−-]?(?<![%\d.,])\d(?:[\d.,]*\d)?\s?\/\s?(taban\s)?•••/gi, (m, t) => (t ? `••• / taban •••` : '••• / •••'))
    .replace(/((?:öz\s?sermaye|bakiye|hesap değeri|nominal|teminat|marj|tepe|taban|pnl|equity|balance)\s*[:=]?\s*)[−+-]?(?<![%\d.,])\d(?:[\d.,]*\d)?(?![\d.,]*\s?%)(?![\d]*\s?(sa|dk|gün|g)\b)/giu, '$1•••')
    .replace(/(\b(?:buy|sell|al|sat|alış|satış|miktar|qty)\s+)[−-]?\d(?:[\d.,]*\d)?(?![\d.,]*\s?%)/giu, '$1•••')
    .replace(/(?<![%\d.,•])\d(?:[\d.,]*\d)?(\s?(?:adet|lot|kontrat))(?![A-Za-zÇĞİÖŞÜçğıöşü])/giu, '•••$1');
}

// ── imza (callback_data) ──────────────────────────────────────────────────────
function anahtarTuret(jeton) {
  const j = String(jeton || '');
  return j ? crypto.createHash('sha256').update(`pusula-telegram-menu|${j}`).digest() : null;
}
function imza(anahtar, govde) {
  return crypto.createHmac('sha256', anahtar).update(govde).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 10);
}
/** Saf: kısa karma (sorun kimliği / türü → 8 hex). */
const kisaKarma = (x) => crypto.createHash('sha1').update(String(x)).digest('hex').slice(0, 8);

/**
 * @param ctx {
 *   anahtarFn: () → bot jetonu (imza anahtarı türetilir; değer hiçbir metne girmez),
 *   panelAdresi: () → 'https://…' | null, surum, baslangic, simdiFn,
 *   botlar: () → [{ ad, mod, bot, y }], komutMetni: async (komut) → string (pozisyonlar için),
 *   sorunlar: () → { sorunlar: [kart], sonDenetim }, bilinenler: () → [sır değerleri],
 *   portfoy: () → { portfoyum: { gun, ay, yil, tum } | null, modeller: [{ ad, toplam, toplamTl?, para }] },
 *   golge: async () → string[] (+ .hukumTarihleri), ileri: () → { demo, kontrol, bollingerHukum },
 *   piyasa: () → { hafta, kartlar }, bilanco: () → sonOzet | null, guncelleme: () → durum, makineler: () → { sunucu, makineler },
 *   makineDurumu: () → lib/makine/yonetici.js menuOzeti (75.9 — yönetici, şu an dinleyen, eşlerin son nabzı; eş yoksa esVar false),
 *   bildirim: () → { sessiz, gecici, turler }, sessizAl: (dk) → { bitis } (TEK YAZMA), sorunKatalog: KATALOG
 * }
 */
function olustur(ctx = {}) {
  const simdiFn = ctx.simdiFn || Date.now;
  const g = (fn, vars = null) => { try { const x = typeof fn === 'function' ? fn() : null; return x === undefined ? vars : x; } catch (e) { return vars; } };
  let menuMesajId = null;
  let golgeOnbellek = null;

  const adres = () => {
    const a = g(ctx.panelAdresi, null);
    return a && /^https?:\/\/[^\s<>"']{3,200}$/.test(String(a)) ? String(a).replace(/\/+$/, '') : null;
  };
  const anahtar = () => anahtarTuret(g(ctx.anahtarFn, ''));

  /** Düğme verisi üretir (imzalı). Anahtar yoksa (jeton yok) düğme üretilmez. */
  function veri(k, ek, arg = '') {
    const a = anahtar();
    if (!a || !EKRAN[ek] || !/^[a-z0-9-]{0,16}$/.test(arg)) return null;
    const govde = `${k}${ek}.${arg}.${Math.floor(simdiFn() / 1000).toString(36)}`;
    return `${govde}.${imza(a, govde)}`;
  }
  const dugme = (metin, ek, arg = '', k = 'm') => { const d = veri(k, ek, arg); return d ? { text: metin, callback_data: d } : null; };
  /** Paneli açan düğme (yazma işleri orada, acil PIN ile). Adres yoksa null (metne "Panel › …" yazılır). */
  const bag = (metin, rota) => { const a = adres(); return a ? { text: `${metin} ↗`, url: `${a}/${rota}` } : null; };
  /** Düğme dizisini satırlara dizer (2'şer; uzun metinli tek). */
  function satirla(l, iki = true) {
    const d = l.filter(Boolean), s = [];
    for (let i = 0; i < d.length; i++) {
      if (iki && d[i + 1] && d[i].text.length <= 22 && d[i + 1].text.length <= 22) { s.push([d[i], d[i + 1]]); i++; } else s.push([d[i]]);
    }
    return s;
  }
  const geri = (metin = '◀ Menü', ek = 'm', arg = '') => dugme(metin, ek, arg);
  const panelYolu = (ad) => (adres() ? '' : `\n(Panel › ${ad})`);
  const ekranSonu = (metin, dugmeler, iki = true) => ({ metin: kirp(tutarGizle(metin), SINIR), klavye: satirla(dugmeler, iki) });

  // ── ekranlar ───────────────────────────────────────────────────────────────
  function botOzetleri(simdi) {
    return (g(ctx.botlar, []) || []).map((b) => {
      let o = null;
      try { o = b.bot.ozet(simdi); } catch (e) { o = null; }
      return { b, o };
    });
  }
  function sorunListesi() {
    const r = g(ctx.sorunlar, null) || {};
    return { r, l: (r.sorunlar || []).filter(k => k.ciddiyet !== 'bilgi'), bilgi: (r.sorunlar || []).filter(k => k.ciddiyet === 'bilgi').length };
  }

  function menu() {
    const simdi = simdiFn();
    const { l } = sorunListesi();
    const bo = botOzetleri(simdi);
    const calisan = bo.filter(x => x.o && x.o.calisiyor).length;
    const mud = l.filter(k => k.ciddiyet === 'mudahale').length;
    const durum = !l.length ? 'her şey yolunda' : `${l.length} sorun${mud ? ` (${mud} müdahale)` : ''}`;
    const metin = `🧭 Pusula · Ana menü\nSunucu ${ctx.surum || '--'} · ${durum} · ${calisan} bot çalışıyor\nNe görmek istersiniz?`;
    return ekranSonu(metin, [dugme('🤖 Botlar', 'b'), dugme(`⚠️ Sorunlar (${l.length})`, 's'), dugme('💼 Portföy', 'pf'), dugme('🧪 İleri test', 'i'),
      dugme('🌍 Piyasa', 'pi'), dugme('🏛️ Bilanço', 'bi'), dugme('🔄 Güncelleme', 'g'), dugme('🖥️ Makineler', 'mk'),
      dugme('⚙️ Bildirim ayarları', 'ba'), dugme('❓ Komutlar', 'y')]);
  }

  /** Bir botun özsermaye eğrisinden yüzdeler (lib/live/islemGecmisi.ozsermayeKarsilastir — panelin Botlar grafiğiyle aynı hesap). */
  function botGetiri(b) {
    try {
      const IG = require('./live/islemGecmisi');
      const golge = ctx.golgeHarita ? ctx.golgeHarita() : null;
      const k = IG.ozsermayeKarsilastir(b.bot.ozsermayeOku(), golge, b.ad, (b.bot.durum && b.bot.durum.sermayeAkislari) || []);
      const e = k.egri || [];
      if (!e.length) return null;
      const son = e[e.length - 1], once = e.length > 1 ? e[e.length - 2] : null;
      return { bas: e[0].gun, tum: son.gercek - 1, btc: son.btc != null ? son.btc - 1 : null, golge: Number.isFinite(son.golge) && e.length > 1 ? son.golge - 1 : null,
        sonGun: once && once.gercek > 0 ? son.gercek / once.gercek - 1 : null };
    } catch (e) { return null; }
  }
  const modAd = (m) => (m === 'demo' ? 'demo' : m === 'canli' ? 'CANLI' : 'kâğıt');
  const btcDurum = (o) => (o.rejim ? (o.rejim.icerde ? 'BTC LONG' : 'nakitte (USDT)') : 'karar yok');

  function botlar() {
    const simdi = simdiFn();
    const bo = botOzetleri(simdi);
    if (!bo.length) return ekranSonu('🤖 Botlar\nPortföy botu tanımlı değil.', [geri()]);
    const satir = bo.map(({ b, o }) => {
      if (!o) return `• ${b.ad}: durum okunamadı`;
      const gt = botGetiri(b);
      const kd = o.kalpDurumu || {};
      const saat = o.kalp && (o.kalp.sonBasari || o.kalp.zaman) ? trSaat(o.kalp.sonBasari || o.kalp.zaman, simdi) : null;
      return `• ${o.adGorunen || b.ad} · ${modAd(o.mod)} · ${o.calisiyor ? btcDurum(o) : 'DURDU'}${gt && gt.sonGun != null ? ` · son gün ${yuzde(gt.sonGun)}` : ''}` +
        ` · son çalışma ${saat || '—'} ${kd.gecikti ? '⚠️' : '✓'}${o.engel ? ' · kendini durdurdu (onay bekliyor)' : ''}`;
    });
    return ekranSonu(`🤖 Botlar\n${satir.join('\n')}`, [...bo.map(({ b, o }) => dugme(`${(o && o.adGorunen) || b.ad} ayrıntı`, 'bd', b.ad)), dugme('Pozisyonlar', 'p'), geri()]);
  }

  function bot(ad) {
    const simdi = simdiFn();
    const x = botOzetleri(simdi).find(y => y.b.ad === ad);
    if (!x || !x.o) return ekranSonu('Bu bot bulunamadı.', [geri('◀ Botlar', 'b')]);
    const { b, o } = x;
    const gt = botGetiri(b);
    const kd = o.kalpDurumu || {};
    const l = [`${o.adGorunen || b.ad} · ${o.mod === 'demo' ? 'demo hesap' : o.mod === 'canli' ? 'CANLI hesap' : 'kâğıt hesap'}`];
    l.push(`Çalışıyor: ${o.calisiyor ? 'evet ✓' : 'HAYIR (durduruldu)'} · ${kd.metin || 'son çalışma —'}${kd.gecikti && o.calisiyor ? ' ⚠️ 26 saattir başarılı çalışma yok' : ''}`);
    if (o.rejim) l.push(`Pozisyon kararı: ${o.rejim.icerde ? (o.calisiyor ? 'trend açık — BTC tutuluyor' : 'trend açık (bot durduğu için alım yok)') : 'trend kapalı — USDT\'de bekliyor'}${o.rejim.kararGun ? ` (${o.rejim.kararGun})` : ''}`);
    if (Number.isFinite(o.btcPay)) l.push(`BTC payı %${Math.round(o.btcPay * 100)}${Number.isFinite(o.kolCarpani) ? ` · coin kolu ×${o.kolCarpani}` : ''}`);
    if (gt) {
      l.push(`Başlangıçtan (${gt.bas}) ${yuzde(gt.tum)}${gt.btc != null ? ` · aynı dönemde BTC ${yuzde(gt.btc)}` : ''}${gt.golge != null ? ` · gölge ${yuzde(gt.golge)}` : ''}`);
      if (gt.sonGun != null) l.push(`Son gün ${yuzde(gt.sonGun)}`);
    } else l.push('Getiri: henüz kayıt yok');
    const kr = o.koruma || {};
    const stop = kr.stoplar ? Object.keys(kr.stoplar).length : 0;
    const hata = kr.sonGuncelleme && kr.sonGuncelleme.hatalar ? kr.sonGuncelleme.hatalar.length : 0;
    if (kr.aktif !== undefined) l.push(`Koruma stopu: ${stop} pozisyonda borsada${hata ? ` · ⚠️ ${hata} pozisyonda konamadı` : ' ✓'}`);
    const mj = o.marj;
    if (mj) l.push(`Teminat: ${mj.seviye === 'alarm' ? 'TEHLİKE' : mj.seviye === 'uyari' ? 'dikkat' : 'güvenli'}${mj.oran != null ? ` (marj oranı %${trSayi(mj.oran * 100)})` : ''}`);
    l.push(`Bot kendini durdurdu mu: ${o.engel ? `EVET — onay bekliyor (${kirp(o.engel, 160)})` : 'hayır'}`);
    const uy = o.uygulama;
    l.push(`Gölgeye göre 30 g fark: ${uy && uy.kayit ? `${uy.birikim >= 0 ? '+' : '−'}${trSayi(Math.abs(uy.birikim * 100), 2)} puan (${uy.bant})` : 'kayıt bekleniyor'}`);
    if (o.calisiyor) {
      const S = require('./sorunlar');
      const t = S.sonrakiTr(simdi, 3, 2);
      l.push(`Sonraki çalışma: ${new Date(t + 3 * SAAT).toISOString().slice(0, 10) === new Date(simdi + 3 * SAAT).toISOString().slice(0, 10) ? 'bugün' : 'yarın'} 03:02`);
    }
    if (o.engel) l.push(`Yeniden açmak panelde (acil PIN ile).${panelYolu(`Botlar › ${o.adGorunen || b.ad}`)}`);
    return ekranSonu(l.join('\n'), [bag('Panelde aç', `#/botlar/${b.ad}`), dugme('Pozisyonlar', 'p'), geri('◀ Botlar', 'b')]);
  }

  async function pozisyonlar() {
    let m;
    try { m = ctx.komutMetni ? await ctx.komutMetni('pozisyonlar') : 'Pozisyon bilgisi bu sunucuda yok.'; } catch (e) { m = `Pozisyonlar okunamadı: ${temizle(e.message)}`; }
    return ekranSonu(m, [geri('◀ Botlar', 'b'), geri()]);
  }

  const CIDDI_SIMGE = { mudahale: '🔴', dikkat: '🟡', gecici: '🔵', bilgi: '⚪' };
  const sirsiz = (s) => { try { return require('./sorunlar').sirTemizle(s, g(ctx.bilinenler, []) || []); } catch (e) { return s; } };

  function sorunlar() {
    const simdi = simdiFn();
    const { r, l, bilgi } = sorunListesi();
    const son = r.sonDenetim ? `Son denetim ${onceMetni(r.sonDenetim, simdi)}.` : '';
    if (!l.length) {
      return ekranSonu(sirsiz(`⚠️ Sorunlar\nŞu an etkin sorun yok ✓${bilgi ? ` (${bilgi} bilgi notu panelde)` : ''}\n${son}`), [bag('Panelde aç', '#/sorunlar'), geri()]);
    }
    const say = (c) => l.filter(k => k.ciddiyet === c).length;
    const satir = l.slice(0, 8).map((k, i) => `${i + 1}. ${CIDDI_SIMGE[k.ciddiyet] || '•'} ${kirp(k.baslik, 150)}`);
    if (l.length > 8) satir.push(`… +${l.length - 8} sorun daha (panelde)`);
    const metin = `⚠️ Sorunlar\n${l.length} etkin sorun: ${say('mudahale')} müdahale · ${say('dikkat')} dikkat · ${say('gecici')} kendiliğinden geçecek\n\n${satir.join('\n')}${bilgi ? `\n(+${bilgi} bilgi notu panelde)` : ''}\n${son}${panelYolu('Sorunlar')}`;
    return ekranSonu(sirsiz(metin), [...l.slice(0, 8).map((k, i) => dugme(`${i + 1}. ${kirp(k.baslik, 28)}`, 'sd', kisaKarma(k.kimlik))), bag('Panelde aç', '#/sorunlar'), geri()], false);
  }

  function kartMetni(k, simdi) {
    const l = [`${CIDDI_SIMGE[k.ciddiyet] || '•'} ${k.baslik}`];
    if (k.ne) l.push(`Ne oldu: ${k.ne}`);
    if (k.ciddi) l.push(`Ciddi mi: ${k.ciddi.tonAd || ''}${k.ciddi.neden ? ` — ${k.ciddi.neden}` : ''}`);
    if (k.gecer) l.push(`Kendiliğinden geçer mi: ${k.gecer.metin || '—'}${k.gecer.kalkisMetin ? ` · ${k.gecer.kalkisMetin}` : ''}`);
    const ad = (k.adimlar && k.adimlar.length ? k.adimlar : k.kisa) || [];
    if (ad.length) { l.push('Ne yapmalı:'); ad.forEach((a, i) => l.push(`${i + 1}. ${a}`)); }
    if (k.dokunma) l.push(`Dokunmayın: ${k.dokunma}`);
    l.push(`İşlem panelde, acil PIN ile.${panelYolu('Sorunlar')}`);
    void simdi;
    return l.join('\n');
  }
  function sorunBul(h) { const { l, r } = sorunListesi(); return (r.sorunlar || []).find(k => kisaKarma(k.kimlik) === h) || l.find(k => kisaKarma(k.kimlik) === h) || null; }

  function sorun(h) {
    const k = sorunBul(h);
    if (!k) return ekranSonu('Bu sorun artık etkin değil (kendiliğinden geçmiş ya da çözülmüş olabilir).', [dugme('◀ Sorunlar', 's'), geri()]);
    return ekranSonu(sirsiz(kartMetni(k, simdiFn())), [bag('Panelde çöz', '#/sorunlar'), k.neyiSaydi ? dugme('Neyi saydı?', 'sn', h) : null, dugme('◀ Sorunlar', 's')]);
  }

  function neyi(h) {
    const k = sorunBul(h);
    if (!k || !k.neyiSaydi) return ekranSonu('Bu sorunun sayım dökümü yok.', [dugme('◀ Sorunlar', 's')]);
    const n = k.neyiSaydi;
    const l = [`Neyi saydı? — ${n.baslik || k.baslik}`, ...(n.satirlar || []).slice(0, 20)];
    if (n.tablo) { l.push(n.tablo.basliklar.join(' | ')); for (const r of n.tablo.satirlar.slice(0, 15)) l.push(r.join(' | ')); }
    return ekranSonu(sirsiz(l.join('\n')), [dugme('◀ Sorun', 'sd', h), dugme('◀ Sorunlar', 's')]);
  }

  /** Bildirimdeki "Ayrıntı": sorun TÜRÜ (katalog anahtarı) → etkin kart varsa o, yoksa katalogdaki kısa adımlar. */
  function sorunTur(h) {
    const { r } = sorunListesi();
    const k = (r.sorunlar || []).find(x => kisaKarma(x.tur) === h);
    if (k) return ekranSonu(sirsiz(kartMetni(k, simdiFn())), [bag('Panelde çöz', '#/sorunlar'), k.neyiSaydi ? dugme('Neyi saydı?', 'sn', kisaKarma(k.kimlik)) : null, dugme('◀ Sorunlar', 's'), geri()]);
    const KAT = ctx.sorunKatalog || (() => { try { return require('./sorunlar').KATALOG; } catch (e) { return {}; } })();
    const id = Object.keys(KAT).find(x => kisaKarma(x) === h);
    const t = id ? KAT[id] : null;
    if (!t) return ekranSonu('Bu uyarının ayrıntısı bulunamadı.', [dugme('⚠️ Sorunlar', 's'), geri()]);
    const l = [`${String(t.baslik || id).replace(/\{bot\}/g, 'Bot')}`, 'Şu an etkin bir kartı yok (kendiliğinden geçmiş ya da çözülmüş olabilir).', 'Ne yapmalı:', ...(t.kisa || []).map((a, i) => `${i + 1}. ${a}`)];
    if (t.dokunma) l.push(`Dokunmayın: ${t.dokunma}`);
    return ekranSonu(l.join('\n'), [bag('Panelde aç', '#/sorunlar'), dugme('⚠️ Sorunlar', 's'), geri()]);
  }

  function portfoy() {
    const p = g(ctx.portfoy, null) || {};
    const l = ['💼 Portföy', 'Tutarlar Telegram\'da gösterilmez — yalnız yüzde.', ''];
    const pm = p.portfoyum;
    l.push(pm ? `Portföyüm (USD): bugün ${yuzde(pm.gun)} · bu ay ${yuzde(pm.ay)} · yıl başından ${yuzde(pm.yil)}` : 'Portföyüm: kayıt yok.');
    if (p.modeller && p.modeller.length) {
      l.push('', 'Model portföyler (kâğıt endeks, başlangıçtan):');
      for (const m of p.modeller) l.push(`• ${m.ad} ${yuzde(m.toplam)} (${m.para || 'USD'})${m.toplamTl != null ? ` · TL bazında ${yuzde(m.toplamTl)}` : ''}${m.bas ? ` · ${m.bas}'den beri` : ''}`);
    }
    return ekranSonu(l.join('\n') + panelYolu('Portföy'), [bag('Panelde aç', '#/portfoy'), geri()]);
  }

  async function golgeSatirlari() {
    const simdi = simdiFn();
    if (golgeOnbellek && simdi - golgeOnbellek.zaman < 5 * DK) return golgeOnbellek.v;
    let v = [];
    try { v = (ctx.golge ? await ctx.golge() : []) || []; } catch (e) { v = Object.assign([`🧪 GÖLGE · okunamadı: ${temizle(e.message)}`], { hukumTarihleri: [] }); }
    golgeOnbellek = { zaman: simdi, v };
    return v;
  }

  async function ileri() {
    const s = await golgeSatirlari();
    const l = ['🧪 GÖLGE TESTİ — emir yok; ara sonuç, hüküm değil'];
    if (s.length) l.push(...s.map(x => `• ${String(x).replace(/^🧪 GÖLGE ·\s*/, '')}`));
    else l.push('Gölge test kaydı yok.');
    const v = g(ctx.ileri, null);
    const d = v && v.demo;
    if (d) l.push('', d.veriVar ? `Demo kabul (Kairos demo hesabı — gölge değil): ${d.gecenGun}. gün / 63 · hüküm ${d.hukumTarihi || '--'}` : 'Demo kabul: başlamadı');
    return ekranSonu(l.join('\n'), [dugme('Hüküm takvimi', 'it'), bag('Panelde aç', '#/ileri'), geri()]);
  }

  async function takvim() {
    const s = await golgeSatirlari();
    const v = g(ctx.ileri, null) || {};
    const bugun = new Date(simdiFn()).toISOString().slice(0, 10);
    const l = ['🗓️ Hüküm takvimi (ara raporda hüküm yok — yalnız bu tarihlerde)'];
    const tar = [...new Set((s.hukumTarihleri || []).filter(t => t >= bugun))].sort();
    if (Array.isArray(v.kontrol) && v.kontrol.length) l.push(`Kairos / Tao kontrol noktaları: ${v.kontrol.map(k => `${k.gun} g (${k.tarih})`).join(' · ')}`);
    if (v.bollingerHukum) l.push(`Bollinger düşüş azaltıcı: ${v.bollingerHukum}`);
    if (v.demo && v.demo.hukumTarihi) l.push(`Demo kabul: ${v.demo.hukumTarihi}`);
    if (tar.length) l.push(`Gölge satırlarındaki hüküm / kontrol tarihleri: ${tar.join(' · ')}`);
    if (l.length === 1) l.push('Tarih bilgisi yok.');
    return ekranSonu(l.join('\n'), [dugme('◀ İleri test', 'i'), geri()]);
  }

  function piyasa() {
    const p = g(ctx.piyasa, null) || {};
    const h = p.hafta || {};
    const l = ['🌍 Bu hafta (yalnız bilgi — botların kararına girmez)'];
    const ol = [...(h.olaylar || []), ...(h.sonraki || []).map(o => ({ ...o, sonraki: true }))];
    if (ol.length) for (const o of ol.slice(0, 12)) l.push(`• ${o.metin}${o.sonraki ? ' (gelecek hafta)' : ''}${o.sonuc ? ` → ${o.sonuc}` : o.gecti ? ' (geçti)' : ''}`);
    else l.push(h.neden ? `Takvim yok: ${h.neden}` : 'Bu hafta kayıtlı olay yok.');
    const k = new Map(((p.kartlar || [])).map(x => [x.kimlik, x]));
    const ek = (x) => (x && x.durum === 'bayat' ? ' (bayat)' : '');
    const m = [];
    const fz = k.get('faiz');
    if (fz && fz.deger && fz.deger.irx) m.push(`^IRX %${trSayi(fz.deger.irx.v, 2)}${fz.deger.politika ? ` · Fed %${trSayi(fz.deger.politika.alt, 2)}–${trSayi(fz.deger.politika.ust, 2)}` : ''}${ek(fz)}`);
    const tr = k.get('usdtry');
    if (tr && tr.deger) m.push(`USD/TRY ${trSayi(tr.deger.v, 2)}${tr.deger.d30 != null ? ` (30 g ${yuzde(tr.deger.d30)})` : ''}${ek(tr)}`);
    const tf = k.get('tufe');
    if (tf && tf.deger) { const a = tf.deger.abd, t = tf.deger.tr; const p2_ = [a && a.yillik != null ? `ABD ${yuzde(a.yillik)}` : null, t && t.yillik != null ? `TR ${yuzde(t.yillik)}` : null].filter(Boolean); if (p2_.length) m.push(`TÜFE yıllık: ${p2_.join(' · ')}${ek(tf)}`); }
    const ko = k.get('korku');
    if (ko && ko.deger) m.push(`Korku-açgözlülük ${ko.deger.v}${ko.deger.bolge ? ` (${ko.deger.bolge})` : ''}${ek(ko)}`);
    if (m.length) l.push('', 'Makro:', ...m.map(x => `• ${x}`));
    return ekranSonu(l.join('\n'), [bag('Panelde aç', '#/piyasa'), geri()]);
  }

  function bilanco() {
    const s = g(ctx.bilanco, null);
    if (!s || !s.zaman) return ekranSonu('🏛️ Bilanço\nHenüz bilanço özeti gönderilmedi (günde en çok 2 özet; bilanço yoksa mesaj yok).', [geri()]);
    const l = [`🏛️ Son bilanço özeti (${trSaat(s.zaman, simdiFn())}) — ${s.sayi || 0} şirket`];
    if (s.kisa && s.kisa.length) l.push(...s.kisa.slice(0, 12));
    else l.push('Ayrıntı satırları bu özette kayıtlı değil (bildirim mesajına bakın).');
    if (s.daha) l.push(`${s.daha} şirket daha`);
    l.push('Yalnız yüzde değişim (çeyrek net kâr, geçen yılın aynı dönemine göre); yorum ve öneri yok.');
    return ekranSonu(l.join('\n'), [geri()]);
  }

  const GUNCELLEME_AD = { guncel: 'güncel', onay: 'onay bekliyor', elle: 'elle bakılmalı', 'ag-hatasi': 'GitHub\'a ulaşılamıyor', kuruluyor: 'kuruluyor',
    'yeniden-baslat': 'yeniden başlatma gerekli', kuruldu: 'kuruldu', 'geri-alindi': 'kurulamadı — geri alındı', gelistirme: 'geliştirme kopyası' };
  function guncelleme() {
    const d = g(ctx.guncelleme, null) || {};
    const l = ['🔄 Güncelleme', `Çalışan: ${ctx.surum || '--'}`];
    l.push(`Durum: ${GUNCELLEME_AD[d.durum] || d.durum || 'bilinmiyor'}${d.hedefSurum ? ` · GitHub'da ${d.hedefSurum} hazır` : ''}`);
    if (d.neden) l.push(kirp(d.neden, 400));
    if (d.kuruDeneme && d.kuruDeneme.ozet) l.push(`Kuru deneme: ${kirp(d.kuruDeneme.ozet, 200)}`);
    if (d.durum === 'onay' || d.durum === 'elle' || d.durum === 'yeniden-baslat') l.push(`Kurmak / yeniden başlatmak panelde (telefondan da olur).${panelYolu('Ayarlar › Güncelleme')}`);
    return ekranSonu(sirsiz(l.join('\n')), [d.durum === 'onay' ? bag('Panelde kur', '#/ayarlar/guncelleme') : bag('Panelde aç', '#/ayarlar/guncelleme'), geri()]);
  }

  function makineler() {
    const simdi = simdiFn();
    const m = g(ctx.makineler, null) || {};
    const bo = botOzetleri(simdi).map(({ b, o }) => `${(o && o.adGorunen) || b.ad}${o && o.calisiyor ? '' : ' (durdu)'}`);
    const l = ['🖥️ Makineler', `• Sunucu · ${ctx.surum || '--'} · çevrimiçi · çalışma süresi ${onceMetni(ctx.baslangic || simdi, simdi).replace(' önce', '')}${bo.length ? ` · ${bo.join(', ')}` : ''}`];
    const ar = (m.makineler || []);
    if (ar.length) for (const x of ar) l.push(`• ${kirp(x.ad, 40)} · ${x.tur === 'arastirma' ? 'araştırma kopyası' : x.tur || 'makine'}${x.surum ? ` · ${x.surum}` : ''} · son görülme ${onceMetni(x.son, simdi)}${x.uyarildi ? ' ⚠️ sessiz' : ''}`);
    else l.push('• Araştırma kopyası: hiç görülmedi (sunucu bağlantısı kurulu değil ya da kapalı)');
    l.push(...yoneticiSatirlari(g(ctx.makineDurumu, null), simdi));
    return ekranSonu(l.join('\n'), [bag('Panelde aç', '#/ayarlar/makineler'), geri()]);
  }
  /**
   * 75.9 (3c-2): eşlenmiş makineler + YÖNETİCİ bilgisi (lib/makine/yonetici.js menuOzeti — salt okuma): hangi makine yönetici, komutları şu an
   * kim dinliyor (geçici devralma varsa başlangıcı), her eşin son nabzı ve bot sayısı. Eş yoksa satır yok (tek makine — bugünkü ekran).
   */
  function yoneticiSatirlari(md, simdi) {
    if (!md || !md.esVar) return [];
    const KIP = { tek: 'tek makine', yonetici: 'yönetici', gecici: 'geçici devralma', bekle: 'bekliyor', cekisme: 'bekliyor (409)', 'uygun-degil': 'dinlemez' };
    const s = ['', '🧭 Yönetici makine (Telegram komutlarını dinleyen)'];
    const Y = md.yonetici;
    s.push(Y ? `• Yönetici: ${kirp(Y.ad || Y.kimlik, 40)}${Y.ben ? ' (bu makine)' : ''} · ${Y.secildi ? 'seçildi' : 'varsayılan (seçim yapılmadı)'}` : '• Yönetici: yok (Telegram\'ı dinleyebilen sunucu yok)');
    const d = md.dinleyen;
    if (d) {
      const gecici = d.kip === 'gecici';
      const bas = gecici && md.devir && md.devir.bas ? ` — ${trSaat(Date.parse(md.devir.bas), simdi)}'den beri` : '';
      s.push(`• Şu an dinleyen: ${kirp(d.ad || d.kimlik, 40)}${d.ben ? ' (bu makine)' : ''} · ${KIP[d.kip] || d.kip || '—'}${bas}`);
      if (gecici) s.push('  ⚠️ Yönetici ulaşılamıyor; geri gelince komutları yine o dinler.');
    } else s.push(`• Şu an dinleyen: bilinmiyor${md.sebep ? ` (${kirp(md.sebep, 120)})` : ''}`);
    const ISIK = { iyi: '', sessiz: ' ⚠️ sessiz', hic: ' (hiç görülmedi)', red: ' ⚠️ bu makineyi reddediyor', uyumsuz: ' ⚠️ sürüm uyumsuz' };
    for (const e of (md.esler || []).slice(0, 8)) {
      const rol = e.rol === 'gelistirme' ? 'geliştirme' : e.rol === 'sunucu' ? 'sunucu' : 'makine';
      const bot = e.rol === 'sunucu' ? ` · ${e.bot} bot${e.bot ? ` (${e.calisan} çalışıyor)` : ''}` : '';
      s.push(`• ${kirp(e.ad || e.kimlik, 40)} · ${rol}${e.surum ? ` · ${kirp(e.surum, 24)}` : ''} · son nabız ${onceMetni(Date.parse(e.sonGorulme || ''), simdi)}${ISIK[e.isik] || ''}${Y && Y.kimlik === e.kimlik ? ' · yönetici' : ''}${bot}`);
    }
    return s;
  }

  function bildirim() {
    const simdi = simdiFn();
    const b = g(ctx.bildirim, null) || {};
    const s = b.sessiz || {};
    const l = ['⚙️ Bildirim ayarları'];
    l.push(`Sessiz saat: ${s.acik ? `${s.bas}–${s.bit}${s.simdi ? ' (şu an sessiz)' : ''}` : 'kapalı'} · kritikler her zaman gelir`);
    const gc = b.gecici;
    l.push(`Geçici sessiz: ${gc && gc.bitis > simdi ? `${trSaat(gc.bitis, simdi)}'e kadar` : 'yok'}${s.bekleyen ? ` · bekleyen ${s.bekleyen} bildirim` : ''}`);
    const t = b.turler || [];
    if (t.length) {
      const kapali = t.filter(x => !x.acik);
      l.push(`Açık türler: ${t.length - kapali.length} · kapalı: ${kapali.length}${kapali.length ? ` (${kapali.slice(0, 6).map(x => x.ad).join(', ')})` : ''}`);
    }
    l.push(`Değiştirmek panelde.${panelYolu('Sistem › Bildirimler')}`);
    return ekranSonu(l.join('\n'), [dugme('🔕 1 saat sessize al', 'ss'), bag('Panelde düzenle', '#/bildirimler'), geri()]);
  }

  function yardim() {
    return ekranSonu(['❓ Komutlar (hepsi yalnız okur)', ...KOMUT_LISTESI.map(k => `/${k.command} — ${k.description}`), '',
      'Telegram\'dan emir, başlatma / durdurma ya da ayar değişikliği yapılmaz; yazma gerektiren düğmeler paneli açar (acil PIN orada). Tek istisna: "1 saat sessize al" (kritik uyarılar yine gelir).'].join('\n'), [geri()]);
  }

  /** TEK YAZMA İSTİSNASI: kritik olmayan bildirimleri 60 dk beklet (lib/bildirimMerkezi.js geciciSessiz). */
  function sessizUygula() {
    let r = null;
    try { r = ctx.sessizAl ? ctx.sessizAl(60) : null; } catch (e) { r = null; }
    if (!r || !Number.isFinite(r.bitis)) return { ok: false, metin: 'Sessize alınamadı — panelden deneyin (Sistem › Bildirimler).' };
    return { ok: true, bitis: r.bitis, metin: `🔕 1 saat sessiz (${trSaat(r.bitis, simdiFn())}'e kadar). Kritik uyarılar (acil, koruma stopu, ENGEL, güvenlik) yine gelir; süre bitince bekleyenler tek özet olarak gelir.` };
  }

  const EKRAN_IS = { menu, botlar, bot, pozisyonlar, sorunlar, sorun, neyi, sorunTur, portfoy, ileri, takvim, piyasa, bilanco, guncelleme, makineler, bildirim, yardim };

  /** Komutla açılan ekran (/menu, /botlar …) — yeni mesaj olarak gider. */
  async function ekran(ad, arg = '') {
    const f = EKRAN_IS[ad];
    if (!f) return menu();
    try { return await f(arg); } catch (e) { return ekranSonu(`Ekran hazırlanamadı: ${temizle(e.message)}`, [geri()]); }
  }

  /**
   * callback_data → karar (SENKRON; ekranın kendisi `calistir` ile sonra hazırlanır). Yoklayıcı önce `uyari`/`alarm` ile
   * answerCallbackQuery yapar, sonra `calistir()` sonucunu `yeni` ise yeni mesaj, değilse aynı mesajı düzenleyerek yazar.
   * @returns { gecerli, neden?, uyari?, alarm?, yeni?, calistir?: async () → { metin, klavye } }
   */
  function cozumle(ham, { mesajId = null } = {}) {
    const s = String(ham || '');
    const m = VERI_RE.exec(s);
    const a = anahtar();
    if (!m || !a) return { gecerli: false, neden: 'tanınmayan', uyari: 'Bu düğme tanınmadı — /menu yazın.' };
    const [, k, ek, arg, t36, imz] = m;
    if (!EKRAN[ek]) return { gecerli: false, neden: 'tanınmayan', uyari: 'Bu düğme tanınmadı — /menu yazın.' };
    const beklenen = imza(a, `${k}${ek}.${arg}.${t36}`);
    if (beklenen.length !== imz.length || !crypto.timingSafeEqual(Buffer.from(beklenen), Buffer.from(imz))) return { gecerli: false, neden: 'imza', uyari: 'Bu düğme tanınmadı — /menu yazın.' };
    const yas = simdiFn() - parseInt(t36, 36) * 1000;
    const eski = k === 'm' ? (yas > MENU_OMUR || (menuMesajId != null && mesajId != null && mesajId !== menuMesajId)) : yas > BILDIRIM_OMUR;
    if (eski || yas < -5 * DK) return { gecerli: false, neden: 'suresi-doldu', uyari: 'Bu menünün süresi doldu — /menu yazın.' };
    if (ek === 'ss') {
      // TEK YAZMA İSTİSNASI (kullanıcı kararı 2026-10-24) — yalnız kritik olmayan bildirimler 60 dk bekler.
      const r = sessizUygula();
      return { gecerli: true, yazma: true, alarm: r.metin, calistir: k === 'm' ? async () => ekranSonu(r.metin, [dugme('⚙️ Bildirim ayarları', 'ba'), geri()]) : null };
    }
    const ad = EKRAN[ek];
    // Bildirim mesajındaki düğme (Ayrıntı) bildirimi silmez: yeni menü mesajı açar.
    return { gecerli: true, yeni: k === 'n', uyari: ad === 'pozisyonlar' ? 'Borsadan okunuyor…' : null, calistir: () => ekran(ad, arg) };
  }

  /** Bildirim mesajının düğmeleri (Ayrıntı · Panelde çöz ↗ · 1 saat sessize al). @param b { sorunTur, kritik } → reply_markup | null */
  function bildirimKlavyesi(b = {}) {
    const l = [];
    if (b.sorunTur) { const d = dugme('Ayrıntı', 'st', kisaKarma(b.sorunTur), 'n'); if (d) l.push([d]); }
    const p = bag('Panelde çöz', '#/sorunlar');
    if (p) l.push([p]);
    if (!b.kritik) { const d = dugme('🔕 1 saat sessize al', 'ss', '', 'n'); if (d) l.push([d]); }
    return l.length ? { inline_keyboard: l } : null;
  }

  return {
    ekran, cozumle, bildirimKlavyesi, tutarGizle, tutarGizleBildirim,
    menuGonderildi: (id) => { if (Number.isInteger(id)) menuMesajId = id; },
    menuMesaji: () => menuMesajId,
    komutlar: () => KOMUT_LISTESI.map(x => ({ ...x })),
    _veri: veri,
  };
}

module.exports = { olustur, tutarGizle, tutarGizleBildirim, yuzde, trSaat, kisaKarma, anahtarTuret, imza, EKRAN, YAZMA_EKRANLARI, KOMUT_LISTESI, VERI_RE, MENU_OMUR, BILDIRIM_OMUR };
