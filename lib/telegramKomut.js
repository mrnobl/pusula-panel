/**
 * TELEGRAM KOMUTLARI — YALNIZ OKUMA.
 *
 *   /durum        her portföy botu: mod, çalışıyor mu, son çalışma, BTC LONG / pozisyon yok,
 *                 ENGEL, sermaye, gölgeye göre 30 g fark, DUR göstergesi
 *   /pozisyonlar  borsadaki gerçek pozisyonlar (demo hesap / kâğıt borsa)
 *   /ozet         son günlük özet(ler)i yeniden gönderir
 *   /saglik       sunucu çalışma süresi, sürüm, borsa bağlantısı, Telegram ve healthchecks durumu
 *   /yapilacaklar bot tarafındaki yapılacaklar (durdurulmuş / gecikmiş bot, marj, felaket stopu) — kişisel tutar YOK
 *   /ileri        ileri test durumu + hüküm tarihleri (ara rapor — hüküm değil)
 *   /teshis       73.7: etkin sorunlar (Sorun merkezi, lib/sorunlar.js) ve her biri için ilk 2 adım — sır içermez
 *   /yardim       komut listesi
 *   74.0 MENÜ (lib/telegramMenu.js): /menu /botlar /sorunlar /portfoy /piyasa /bilanco /guncelleme /makineler — düğmeli ekran
 *                 (tek mesaj, düğmeye basınca aynı mesaj güncellenir). Hepsi YALNIZ OKUR; yazma gerektiren düğme paneli açar.
 *   74.0 TUTAR GİZLİ (kullanıcı kararı 2026-10-24): Telegram'a hiçbir cevapta USD/TL tutarı gitmez — yalnız yüzde
 *                 (sermaye satırı, pozisyon nominali / K/Z tutarı, bakiye çıkarıldı; /ozet satırlarındaki tutar "•••").
 *
 * Panel denetimi A-20 (2026-10-11): /yapilacaklar ve /ileri eklendi (ikisi de yalnız okur); cevaplardaki iç terimler
 * (ENGEL, DUR göstergesi, "bildirici yok", BTC LONG) panelin sade diliyle (js/pages/botDil.js) aynı.
 *
 * BİLİNÇLİ KARAR: emir veren, botu başlatan/durduran, acil durduran, ayar değiştiren HİÇBİR komut
 * yoktur. Telefon kaybolur ya da bot token'ı sızarsa saldırgan en çok durumu OKUYABİLİR; hesaba
 * dokunamaz. Bu dosyaya yazma komutu eklenmez — öz test (`telegram-komut-selftest`) bunu denetler.
 *
 * Cevaplar düz metin (parse_mode yok): HTML kaçış hatası ya da 4096 bölmesinde yarım etiket olmaz.
 */
const I = require('./live/isletim');
const { temizle } = require('./saglikSinyali');
const { tutarGizle, yuzde } = require('./telegramMenu');

const KOMUTLAR = ['durum', 'pozisyonlar', 'ozet', 'saglik', 'teshis', 'yapilacaklar', 'ileri', 'yardim',
  // 74.0 menü ekranları (yalnız okuma; düğmeli)
  'menu', 'botlar', 'sorunlar', 'portfoy', 'piyasa', 'bilanco', 'guncelleme', 'makineler'];
/** 74.0: düğmeli ekran açan komutlar → lib/telegramMenu.js ekran adı. */
const MENU_KOMUT = { menu: 'menu', botlar: 'botlar', sorunlar: 'sorunlar', portfoy: 'portfoy', piyasa: 'piyasa', bilanco: 'bilanco', guncelleme: 'guncelleme', makineler: 'makineler' };
/** Takma adlar — hepsi yukarıdaki OKUMA komutlarından birine gider. */
const TAKMA = { start: 'menu', 'menü': 'menu', help: 'yardim', 'yardım': 'yardim', 'özet': 'ozet', 'sağlık': 'saglik', 'pozisyon': 'pozisyonlar', 'yapılacaklar': 'yapilacaklar', 'ileritest': 'ileri', 'teşhis': 'teshis', 'sorun': 'sorunlar',
  'portföy': 'portfoy', 'bilanço': 'bilanco', 'güncelleme': 'guncelleme', 'makine': 'makineler', 'bot': 'botlar' };

const isaretli = (x, b = 2) => (Number.isFinite(+x) && x !== null ? `${x >= 0 ? '+' : ''}${(+x).toFixed(b)}` : '--');
const modAdi = (mod) => (mod === 'demo' ? 'demo hesap' : 'kâğıt');

function sureMetni(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const dk = Math.floor(ms / 60000), sa = Math.floor(dk / 60), g = Math.floor(sa / 24);
  if (g) return `${g} g ${sa % 24} sa ${dk % 60} dk`;
  if (sa) return `${sa} sa ${dk % 60} dk`;
  return `${dk} dk`;
}
const onceMetni = (t, simdi) => (t ? `${sureMetni(simdi - t)} önce` : 'hiç');

function zamanAsimli(soz, ms, ne) {
  let t;
  return Promise.race([soz, new Promise((_, red) => { t = setTimeout(() => red(new Error(`${ne} ${Math.round(ms / 1000)} sn'de yanıt vermedi`)), ms); })])
    .finally(() => clearTimeout(t));
}

/**
 * @param ctx { surum, baslangic (ms), portfoyBotlari: () → [{ ad, mod, bot, y }],
 *              bildirici (isletim.Bildirici), yoklayici (TelegramYoklayici | null),
 *              saglik: { bot: SaglikSinyali | null, sunucu: SaglikSinyali | null },
 *              borsaZamanAsimiMs (15000), simdiFn }
 * @returns async (komut) → string (cevap metni)
 */
function komutIsleyici(ctx = {}) {
  const simdiFn = ctx.simdiFn || Date.now;
  const botlar = () => { try { return ctx.portfoyBotlari ? ctx.portfoyBotlari() : []; } catch { return []; } };
  const zm = ctx.borsaZamanAsimiMs ?? 15000;

  function durum() {
    const simdi = simdiFn();
    const liste = botlar();
    if (!liste.length) return 'Portföy botu tanımlı değil.';
    const bloklar = liste.map((b) => {
      let o;
      try { o = b.bot.ozet(simdi); } catch (e) { return `${b.ad}: durum okunamadı (${temizle(e.message)})`; }
      const kd = o.kalpDurumu || I.kalpDurumu(o.kalp, simdi);
      const rj = o.rejim;
      const btc = rj ? (rj.icerde ? (o.calisiyor ? 'trend açık — BTC tutuluyor' : 'trend açık (bot durduğu için alım yok)') : 'trend kapalı — USDT\'de bekliyor') : 'henüz karar yok';
      const oz = o.sonKarar && o.sonKarar.ozsermaye ? o.sonKarar.ozsermaye.sonra : null;
      const uy = o.uygulama;
      const md = o.model;
      return [
        `■ ${o.adGorunen} — ${modAdi(o.mod)}`,
        `Çalışıyor: ${o.calisiyor ? 'EVET' : 'HAYIR (durduruldu)'}${kd && kd.gecikti && o.calisiyor ? ' — UYARI: 26 saattir başarılı çalışma yok' : ''}`,
        `Son çalışma: ${kd ? String(kd.metin).replace(/^son çalışma /, '') : '--'}${o.sonGun ? ` · karar günü ${o.sonGun}` : ''}`,
        `Pozisyon kararı: ${btc}${rj && rj.kararGun ? ` (${rj.kararGun})` : ''}`,
        `Bot kendini durdurdu mu: ${o.engel ? `EVET — onay bekliyor (${o.engel})` : 'hayır'}`,
        `Sermaye: ${oz != null ? 'kayıtlı' : '--'} (tutar Telegram\'da gösterilmez — panelde Botlar)`,
        `Gölgeye göre 30 g fark: ${uy && uy.kayit ? `${isaretli(uy.birikim * 100)} puan (${uy.bant})${'birikimHam' in uy ? ` · BTC funding düzeltmeli; ham ${isaretli(uy.birikimHam * 100)} puan${uy.fundingOkunamadi ? ` (${uy.fundingOkunamadi} aralıkta funding okunamadı)` : ''}` : ''}` : 'kayıt bekleniyor'}`,
        `Model alarmı (gölge düşüş eşiği): ${md ? `${md.durum === 'DUR' ? 'ALARM' : md.durum === 'uyari' ? 'uyarı' : 'normal'}${md.metin ? ` — ${md.metin}` : ''}` : 'veri yok'}`,
      ].join('\n');
    });
    return `DURUM · ${new Date(simdi).toISOString().slice(0, 16).replace('T', ' ')} UTC\n\n${bloklar.join('\n\n')}`;
  }

  async function pozisyonlar() {
    const liste = botlar();
    if (!liste.length) return 'Portföy botu tanımlı değil.';
    const bloklar = [];
    for (const b of liste) {
      const ad = (b.bot && b.bot.adGorunen) || b.ad;
      const baslik = `■ ${ad} — ${modAdi(b.mod)}`;
      if (!b.y || !b.y.borsa) { bloklar.push(`${baslik}\nborsaya bağlı değil (bot kapalıyken bağlantı kurulmaz)`); continue; }
      try {
        const h = await zamanAsimli(b.y.hesap(), zm, 'borsa');
        const top = h.bakiye && +h.bakiye.toplam, serb = h.bakiye && +h.bakiye.serbest;
        // 74.0: tutar yok — serbest teminatın hesaba oranı (yüzde) yeter.
        const satirlar = [baslik, Number.isFinite(top) && top > 0 && Number.isFinite(serb) ? `Serbest teminat: hesabın %${Math.round(Math.max(0, serb) / top * 100)}'i` : 'Serbest teminat: --'];
        if (b.bot && b.bot.ayar && b.bot.ayar.btcAyak === 'spot') satirlar.push('BTC spot teminatta (miktar Telegram\'da gösterilmez)');
        if (!h.pozisyonlar.length) satirlar.push('Açık vadeli pozisyon yok.');
        for (const p of h.pozisyonlar) {
          const yon = p.side === 'short' ? 'SHORT' : 'LONG';
          const nominal = Number.isFinite(+p.nominal) && p.nominal !== null ? Math.abs(+p.nominal) : (Number.isFinite(+p.mark) ? Math.abs(p.miktar * p.mark) : null);
          // 74.0: K/Z girişe göre YÜZDE (tutar yok): gerçekleşmemiş / (nominal − gerçekleşmemiş) (yön işaretli)
          const maliyet = nominal != null && Number.isFinite(+p.gerceklesmemis) ? (yon === 'SHORT' ? nominal + +p.gerceklesmemis : nominal - +p.gerceklesmemis) : null;
          const kz = maliyet && maliyet > 0 ? +p.gerceklesmemis / maliyet : null;
          satirlar.push(`${String(p.symbol).split(':')[0]} ${yon} · gerçekleşmemiş K/Z ${kz != null ? yuzde(kz) : '--'} (girişe göre)`);
        }
        bloklar.push(satirlar.join('\n'));
      } catch (e) { bloklar.push(`${baslik}\nokunamadı: ${temizle(e.message)}`); }
    }
    return `POZİSYONLAR (yalnız okuma · tutar ve miktar gizli — yalnız yüzde)\n\n${bloklar.join('\n\n')}`;
  }

  function ozet() {
    const oz = (ctx.bildirici && ctx.bildirici.sonOzetler) || {};
    const anahtarlar = Object.keys(oz).sort((a, b) => oz[b].zaman - oz[a].zaman);
    if (!anahtarlar.length) return 'Henüz günlük özet yok (bot ilk günlük çalışmasını yapınca oluşur).';
    const simdi = simdiFn();
    return anahtarlar.map((k) => {
      const x = oz[k];
      return [`📊 ${x.baslik}`, `(${onceMetni(x.zaman, simdi)} üretildi)`, '', ...(x.satirlar || [])].join('\n');
    }).join('\n\n');
  }

  function saglik() {
    const simdi = simdiFn();
    const satirlar = [
      `Sunucu: çalışma süresi ${sureMetni(simdi - (ctx.baslangic || simdi))} · sürüm ${ctx.surum || '--'}`,
    ];
    const liste = botlar();
    satirlar.push('Borsa bağlantısı:');
    for (const b of liste) {
      const ad = (b.bot && b.bot.adGorunen) || b.ad;
      satirlar.push(`  ${ad} (${modAdi(b.mod)}): ${b.y && b.y.borsa ? `${b.y.durum || 'bağlı'} (${b.y.ortam || '--'})` : 'bağlı değil'}${b.bot && b.bot.durum && b.bot.durum.calisiyor ? ' · bot çalışıyor' : ''}`);
    }
    if (!liste.length) satirlar.push('  portföy botu yok');
    const tg = ctx.bildirici ? ctx.bildirici.durum() : { bagli: false, neden: 'bildirim ayarlı değil' };
    satirlar.push(`Telegram bildirim: ${tg.bagli ? 'bağlı' : tg.neden}`);
    if (ctx.yoklayici) {
      const y = ctx.yoklayici.durum();
      satirlar.push(`Telegram komut yoklaması: ${y.calisiyor ? 'çalışıyor' : 'kapalı'} · son yoklama ${onceMetni(y.sonYoklama, simdi)}${y.sonHata ? ` · son hata: ${temizle(y.sonHata.metin)}` : ''}`);
    }
    const hc = (ad, s) => {
      if (!s) return `healthchecks (${ad}): yok`;
      const d = s.durum();
      if (!d.ayarli) return `healthchecks (${ad}): ayarlı değil`;
      const son = d.son ? `son ping ${onceMetni(d.son.zaman, simdi)} ${d.son.ok ? 'gönderildi' : `GÖNDERİLEMEDİ (${temizle(d.son.hata)})`} [${d.son.tur}]` : 'henüz ping yok';
      return `healthchecks (${ad}): ayarlı · ${son}`;
    };
    // 68.8: bot başına check (ctx.saglik.botlar: { hucum, denge }); eski bağlamda tek "bot" satırı.
    const BOT_AD = { hucum: require('./botAdlari').ad('hucum'), denge: require('./botAdlari').ad('denge') };
    if (ctx.saglik && ctx.saglik.botlar) for (const [ad, s] of Object.entries(ctx.saglik.botlar)) satirlar.push(hc(BOT_AD[ad] || ad, s));
    else satirlar.push(hc('bot', ctx.saglik && ctx.saglik.bot));
    satirlar.push(hc('sunucu', ctx.saglik && ctx.saglik.sunucu));
    return `SAĞLIK\n\n${satirlar.join('\n')}`;
  }

  /** Bot tarafındaki yapılacaklar (Ana sayfa listesinin bot kısmı; kişisel portföy tutarı Telegram'a gitmez). */
  function yapilacaklar() {
    const simdi = simdiFn();
    const l = [];
    for (const b of botlar()) {
      let o;
      try { o = b.bot.ozet(simdi); } catch (e) { l.push(`• ${b.ad}: durum okunamadı`); continue; }
      const ad = o.adGorunen || b.ad;
      const kd = o.kalpDurumu || I.kalpDurumu(o.kalp, simdi);
      if (o.engel) l.push(`• ${ad} kendini durdurdu — onay bekliyor: ${o.engel} (panelde Botlar)`);
      if (o.calisiyor && kd && kd.gecikti) l.push(`• ${ad} 26 saattir başarılı çalışmadı`);
      if (o.model && o.model.durum === 'DUR') l.push(`• ${ad}: modelin düşüş sınırı aşıldı — durdurmayı değerlendirin`);
      const mj = o.marj;
      if (mj && (mj.seviye === 'alarm' || mj.seviye === 'uyari')) l.push(`• ${ad} marj ${mj.seviye === 'alarm' ? 'TEHLİKE' : 'dikkat'}${mj.oran != null ? ` (marj oranı %${(mj.oran * 100).toFixed(1)})` : ''}`);
      const kr = o.koruma || {};
      const krHata = kr.sonGuncelleme && kr.sonGuncelleme.hatalar && kr.sonGuncelleme.hatalar.length;
      if (krHata) l.push(`• ${ad} felaket stopu ${krHata} pozisyonda konamadı`);
      if (o.uygulama && o.uygulama.bant === 'incele') l.push(`• ${ad}: gerçek sonuç modelden ayrılıyor (incelenmeli)`);
    }
    return `YAPILACAKLAR (bot tarafı)\n\n${l.length ? l.join('\n') : 'Yapılacak bir şey yok — botlar tarafında her şey yolunda.'}\n\nKişisel portföy (Portföyüm, Bu ay) Telegram'a gitmez — panelde Ana sayfa.`;
  }

  /** İleri test durumu + hüküm tarihleri (ara rapor — hüküm değil). `ctx.ileri()` → { demo, kontrol, bollingerHukum }. */
  function ileri() {
    let v = null;
    try { v = ctx.ileri ? ctx.ileri() : null; } catch (e) { return `İleri test durumu okunamadı: ${temizle(e.message)}`; }
    if (!v) return 'İleri test bilgisi bu sunucuda yok.';
    const satirlar = ['İLERİ TEST (ara rapor — hüküm değil)', ''];
    if (v.bollingerHukum) satirlar.push(`Bollinger düşüş azaltıcı: hüküm ${v.bollingerHukum}`);
    for (const b of botlar()) {
      let o; try { o = b.bot.ozet(simdiFn()); } catch { continue; }
      if (o.model) satirlar.push(`${o.adGorunen || b.ad} gölge: ${o.model.durum === 'DUR' ? 'ALARM' : o.model.durum === 'uyari' ? 'uyarı' : 'eşik içinde'}${o.model.metin ? ` — ${o.model.metin}` : ''}`);
    }
    if (Array.isArray(v.kontrol) && v.kontrol.length) satirlar.push(`Kairos/Tao kontrol noktaları: ${v.kontrol.map(k => `${k.gun} g (${k.tarih})`).join(' · ')}`);
    const d = v.demo;
    if (d) satirlar.push(d.veriVar ? `Demo kabul protokolü: ${d.gecenGun}. gün / 63 · hüküm ${d.hukumTarihi || '--'}`
      : `Demo kabul protokolü: başlamadı${d.calisma && !d.calisma.calisiyor ? ' — Kairos demo botu durmuş (panelde Botlar › Başlat)' : ' — ilk günlük çalışma bekleniyor'}`);
    return satirlar.join('\n');
  }

  /** 73.7: etkin sorunlar + ilk 2 adım (ctx.teshis() → düz metin; sunucu lib/sorunlar.js telegramTeshis ile üretir, sır temizlenmiş). */
  function teshis() {
    try { const t = ctx.teshis ? ctx.teshis() : null; return t || 'Teşhis bu sunucuda üretilemedi.'; } catch (e) { return `Teşhis üretilemedi: ${temizle(e.message)}`; }
  }

  function yardim() {
    return [
      'KOMUTLAR (yalnız okuma)',
      '',
      '/menu — düğmeli ana menü (tek mesaj; düğmeye bastıkça aynı mesaj güncellenir)',
      '/botlar /sorunlar /portfoy /piyasa /bilanco /guncelleme /makineler — menünün ekranlarını doğrudan açar',
      '/durum — portföy botları: mod, çalışıyor mu, son çalışma, BTC trend kuralı, kendini durdurdu mu, sermaye, gölge farkı, model alarmı',
      '/pozisyonlar — borsadaki gerçek pozisyonlar (demo hesap / kâğıt): sembol, yön, gerçekleşmemiş K/Z yüzdesi',
      '/ozet — son günlük özeti yeniden gönderir',
      '/saglik — sunucu çalışma süresi, sürüm, borsa bağlantısı, Telegram ve healthchecks durumu',
      '/teshis — etkin sorunlar ve her biri için ne yapmalı (Panel › Sorunlar ile aynı)',
      '/yapilacaklar — bot tarafında yapılacaklar (durdurulmuş / gecikmiş bot, marj, felaket stopu)',
      '/ileri — ileri test durumu ve hüküm tarihleri (ara rapor)',
      '/yardim — bu liste',
      '',
      'Aynı komut 10 saniyede bir cevaplanır.',
      '',
      'BİLİNÇLİ OLARAK YOK: emir veren, botu başlatan/durduran, acil durduran ya da ayar değiştiren komut. ' +
      'Telefonunuz kaybolur ya da bot token\'ı sızarsa hesabınız tehlikeye girmesin diye bu bot yalnız OKUR. ' +
      'Başlatma, durdurma ve acil durdurma yalnız panelden yapılır; menüdeki ↗ düğmeleri paneli açar (işlem orada acil PIN ile). ' +
      'Tek istisna: bildirim ayarlarındaki "1 saat sessize al" (yalnız kritik OLMAYAN bildirimleri bekletir).',
      '',
      'Tutarlar (USD / TL) Telegram\'da gösterilmez — yalnız yüzde.',
    ].join('\n');
  }

  const ISLEYICILER = { durum, pozisyonlar, ozet, saglik, teshis, yapilacaklar, ileri, yardim };

  return async function isle(komut) {
    const k = TAKMA[komut] || komut;
    // 74.0: menü ekranı (düğmeli) → { metin, klavye } — yoklayıcı reply_markup ile gönderir. Menü yoksa düz metne düşer.
    if (MENU_KOMUT[k]) {
      if (ctx.menu) return ctx.menu.ekran(MENU_KOMUT[k]);
      return k === 'sorunlar' ? tutarGizle(teshis()) : 'Menü bu sunucuda kurulu değil. Komut listesi için /yardim yazın.';
    }
    const f = ISLEYICILER[k];
    if (!f) return `Bilinmeyen komut: /${String(komut).slice(0, 32)}\nKomut listesi için /yardim yazın.`;
    // 74.0: son geçiş — hiçbir cevapta para tutarı kalmasın (kullanıcı kararı: Telegram'da yalnız yüzde).
    return tutarGizle(await f());
  };
}

module.exports = { komutIsleyici, KOMUTLAR, TAKMA, MENU_KOMUT, sureMetni };
