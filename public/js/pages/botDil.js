/**
 * BOT DİLİ — Hücum / Denge durumunu SADE TÜRKÇEYE çeviren saf fonksiyonlar (Pusula P2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ana sayfadaki bot sağlığı şeridi (js/pages/anasayfa.js) ve Botlar ekranındaki
 * kartlar (js/pages/botlar.js) AYNI metni göstermeli: biri "Durduruldu — onay
 * bekliyor" derken öbürü "⛔ Engelli" demesin. Bu yüzden çeviri tek yerde.
 *
 * Girdi: GET /api/bindirme/:ad/durum yanıtı (`d`) ya da onun `bot` alanı
 * (`b` = lib/live/bindirmeBot.js `ozet()`). Çıktı: { metin, ton, ... } —
 * `ton`: '' | 'iyi' | 'uyari' | 'tehlike' (CSS sınıfına çevirme çağıranda).
 * DOM ve ağ YOK; Node'da da çalışır (testler).
 */
(function (global) {
  'use strict';
  const AG = global.AG || (global.AG = {});

  const yuzde = (x, b = 1) => (x == null || !Number.isFinite(+x) ? '—' : `${x < 0 ? '-' : ''}%${Math.abs(x * 100).toFixed(b).replace('.', ',')}`);
  const isaretli = (x, b = 1) => (x == null || !Number.isFinite(+x) ? '—' : `${x > 0 ? '+' : ''}${yuzde(x, b)}`);
  const para = (x) => (x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('tr-TR', { maximumFractionDigits: 0 }));
  const kisa = (s) => String(s || '').split('/')[0];
  const TON_SINIF = { iyi: 'tone-success', uyari: 'tone-warning', tehlike: 'tone-danger', '': '' };
  const ROZET_SINIF = { iyi: 'badge badge-success', uyari: 'badge badge-warning', tehlike: 'badge badge-danger', '': 'badge' };

  /** Botun hesap değeri (USDT). Perp (demo) ayağında BTC kârı zaten USDT toplamında; spot (kâğıt) ayağında BTC ayrı varlık. */
  function ozsermaye(d) {
    const hesap = d && d.hesap && !d.hesap.hata ? d.hesap : null;
    const btc = d && d.btc && !d.btc.hata ? d.btc : null;
    if (!hesap || !btc || !hesap.bakiye) return null;
    return (hesap.bakiye.toplam || 0) + (btc.ayak === 'perp' ? 0 : (btc.deger || 0));
  }

  /** Mod: kâğıt | demo | canlı hesap (sade ad). */
  const mod = (d, b) => { const m = (d && d.mod) || (b && b.mod); return m === 'demo' ? 'demo' : m === 'canli' ? 'canlı hesap' : 'kâğıt'; };

  /**
   * Durum: ENGEL → "Durduruldu — onay bekliyor" + neden; çalışıyor / durdu.
   * `onayBekliyor`: kullanıcı bir şey yapmadan bot yeniden emir vermez.
   */
  function durum(b) {
    if (!b) return { metin: 'durum alınamadı', ton: 'tehlike', onayBekliyor: false, neden: null };
    if (b.engel) {
      const neden = String(b.bindirmeEngel || b.kolEngel || b.engel);
      return { metin: 'Durduruldu — onay bekliyor', ton: 'tehlike', onayBekliyor: true, neden: sadeNeden(neden), ham: neden, kaldirilabilir: !!b.bindirmeEngel };
    }
    if (b.model && b.model.durum === 'DUR') return { metin: 'Çalışıyor — modelin düşüş sınırı aşıldı', ton: 'tehlike', onayBekliyor: false, neden: b.model.metin || null };
    if (b.calisiyor) return { metin: 'Çalışıyor', ton: 'iyi', onayBekliyor: false, neden: null };
    return { metin: 'Durdu', ton: '', onayBekliyor: false, neden: null };
  }

  /** İç terimleri (ENGEL, mutabakat, yürütücü…) taşıyan nedeni sadeleştirir; ayrıntı `ham`da kalır. */
  function sadeNeden(n) {
    const s = String(n || '');
    if (/uygulama sapması/i.test(s)) return `Gerçek sonuç simülasyondan fazla ayrıldı (${(s.match(/%[\d.,]+/) || [''])[0]} > %5)`;
    if (/uyuşmaz|mutabakat/i.test(s)) return 'Borsadaki pozisyonlar botun kayıtlarıyla uyuşmuyor';
    if (/yürütücü/i.test(s)) return 'Borsa bağlantısında sorun';
    return s.replace(/\bENGEL(Lİ)?\b:?\s*/g, '').replace(/^kol\s+/i, 'Coin sepeti: ');
  }

  /**
   * Saf: süre (saat) → okunur metin (denetim A-10): "45 dk", "5 saat", "4 gün 10 saat". Ondalık saat yazılmaz
   * ("106,4 saat" okunması zordu).
   */
  function sureMetni(saat) {
    if (!Number.isFinite(saat) || saat < 0) return '—';
    if (saat < 1) return `${Math.max(1, Math.round(saat * 60))} dk`;
    if (saat < 24) return `${Math.round(saat)} saat`;
    const gun = Math.floor(saat / 24), kalan = Math.round(saat - gun * 24);
    return kalan === 24 ? `${gun + 1} gün` : kalan ? `${gun} gün ${kalan} saat` : `${gun} gün`;
  }
  /** Kalp metninden saat ("son çalışma 106.4 saat önce" / "45 dk önce"); sunucu `saat` verdiyse o. */
  function kalpSaati(kd) {
    if (Number.isFinite(kd.saat)) return kd.saat;
    const s = String(kd.metin || '');
    const sa = s.match(/([\d.,]+)\s*saat/), dk = s.match(/(\d+)\s*dk/);
    if (sa) return Number(sa[1].replace(',', '.'));
    if (dk) return Number(dk[1]) / 60;
    return null;
  }

  /**
   * Son çalışma (kalp atışı). Denetim A-10: gecikme alarmı yalnız ÇALIŞAN bot için anlamlı — durmuş botta gri
   * "… önce (bot durdu)"; süre gün/saat olarak yazılır.
   */
  function kalp(b) {
    const kd = (b && b.kalpDurumu) || {};
    if (kd.var === false || !kd.metin) return { metin: 'hiç çalışmadı', ton: '', gecikti: false };
    const saat = kalpSaati(kd);
    const hatali = /\(hatalı\)/.test(String(kd.metin));
    const m = saat == null
      ? String(kd.metin).replace(/^son çalışma\s+/i, '').replace(/(\d)\.(\d)/g, '$1,$2')
      : `${sureMetni(saat)} önce${hatali ? ' (hatalı)' : ''}`;
    if (b && b.calisiyor === false) return { metin: `${m} (bot durdu)`, ton: '', gecikti: false, durdu: true };
    return { metin: kd.gecikti ? `${m} — 26 saati geçti` : m, ton: kd.gecikti ? 'tehlike' : '', gecikti: !!kd.gecikti };
  }

  /**
   * Saf: bu bilgisayarın YEREL günü 'YYYY-AA-GG' (denetim A-07). `toISOString` UTC verir; Türkiye'de 00:00–03:00
   * arası dünkü günü gösterirdi.
   */
  function yerelGun(t) {
    const d = t == null ? new Date() : new Date(t);
    const iki = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
  }
  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  /** Saf: 'YYYY-AA-GG' → "12 Ekim" / `haftaGunu` → "12 Ekim Pazartesi" (takvim günü; saat dilimi kaydırmaz). */
  function gunAdi(g, haftaGunu) {
    const m = String(g || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(g || '—');
    const gun = Number(m[3]), ay = Number(m[2]) - 1;
    const hg = GUNLER[new Date(Date.UTC(Number(m[1]), ay, gun)).getUTCDay()];
    return `${gun} ${AYLAR[ay]}${haftaGunu ? ' ' + hg : ''}`;
  }

  /**
   * Son karar, sade. `bugun`: 'YYYY-AA-GG' — YEREL gün (yerelGun). Bot UTC gün kapanışına göre karar verdiği için
   * gün her zaman tarihle yazılır ("11 Ekim (bugün): …"); yalnız "Bugün" yazmak 00:00–03:00 arası yanıltıyordu (A-07).
   */
  function karar(b, bugun) {
    const k = b && b.sonKarar;
    if (k) {
      const bt = k.btc || {};
      const yon = String((bt.islem && bt.islem.yon) || '');
      const ne = !bt.islem ? 'BTC değişmedi' : /KAPAT/i.test(yon) ? 'BTC satıldı (trend düşüşe döndü)' : /AÇ/i.test(yon) ? 'BTC alındı (trend yükselişe döndü)' : `BTC ${yon}`;
      const bugunMu = k.gun === bugun;
      return { metin: `${gunAdi(k.gun)}${bugunMu ? ' (bugün)' : ''}: ${ne}${k.risk && k.risk.kill ? ' · coin sepeti riski düşürüldü' : ''}`, gun: k.gun, bugun: bugunMu };
    }
    if (b && b.sonKuru) return { metin: 'henüz gerçek karar yok (yalnız deneme hesabı)', gun: null, bugun: false };
    return { metin: 'henüz karar yok', gun: null, bugun: false };
  }

  /**
   * BTC trend kuralı: "trend açık / kapalı". Denetim A-09: bot DURMUŞSA "BTC tutuluyor" yazılmaz — kural açık olsa da
   * bot alım yapmıyor (`alt`: kartın alt satırı).
   */
  function rejim(b) {
    const rj = b && b.rejim;
    if (!rj) return { metin: 'henüz hesaplanmadı', ton: '', acik: null, ayrinti: '', alt: 'henüz hesaplanmadı' };
    const ayrinti = `karar ${rj.kararGun || '—'} · kapanış ${para(rj.kapanis)} · 100 günlük ort. ${para(rj.sma100)}`;
    if (b.calisiyor === false) {
      return { metin: rj.icerde ? 'BTC trendi yükselişte (bot durduğu için alım yapılmıyor)' : 'BTC trendi düşüşte (bot durdu)', ton: '', acik: !!rj.icerde, durdu: true,
        alt: rj.icerde ? 'bot durdu — alım yapılmıyor' : 'bot durdu', ayrinti };
    }
    return { metin: rj.icerde ? 'BTC trendi yükselişte — BTC tutuluyor' : 'BTC trendi düşüşte — nakitte (USDT) bekliyor', ton: rj.icerde ? 'iyi' : 'uyari', acik: !!rj.icerde,
      alt: rj.icerde ? 'BTC tutuluyor' : 'nakitte bekliyor', ayrinti };
  }

  /**
   * Felaket stopu (borsada bekleyen koruma emri). `modAd`: mod() çıktısı ('kâğıt' | 'demo').
   * Demo modda koruma etkin değilse (bot borsaya bağlı değil / durmuş) "kâğıt modda" YAZILMAZ.
   */
  function koruma(b, modAd) {
    const kr = (b && b.koruma) || {};
    if (!kr.aktif) {
      if (!modAd || modAd === 'kâğıt') return { metin: 'kâğıt modda gerekmez', ton: '', sorun: false };
      return b && b.calisiyor ? { metin: 'etkin değil — bot borsaya bağlı değil', ton: 'uyari', sorun: false }
        : { metin: 'etkin değil (bot durmuş)', ton: '', sorun: false };
    }
    const stoplar = Object.entries(kr.stoplar || {});
    const hata = kr.sonGuncelleme && kr.sonGuncelleme.hatalar && kr.sonGuncelleme.hatalar.length;
    const tetik = (kr.olaylar || []).filter(o => o.tur === 'tetiklendi').slice(-1)[0];
    const ayrinti = stoplar.map(([s, x]) => `${kisa(s)} ${x.yon} stop ${x.fiyat}`).join('\n');
    if (tetik) return { metin: `tetiklendi: ${kisa(tetik.symbol)}`, ton: 'tehlike', sorun: true, ayrinti };
    if (hata) return { metin: `${hata} pozisyonda konamadı`, ton: 'tehlike', sorun: true, ayrinti };
    return { metin: stoplar.length ? `${stoplar.length} pozisyon korunuyor` : 'açık pozisyon yok', ton: stoplar.length ? 'iyi' : '', sorun: false, ayrinti };
  }

  /** Marj durumu (saatlik denetim). `modAd`: mod() çıktısı ('kâğıt' | 'demo'). */
  function marj(b, modAd) {
    const mj = b && b.marj;
    if (!mj) return { metin: ((modAd && modAd !== 'kâğıt') || (b && b.koruma && b.koruma.aktif)) ? 'henüz ölçülmedi' : 'kâğıt modda yok', ton: '', seviye: null };
    if (mj.hata) return { metin: `okunamadı: ${mj.hata}`, ton: 'uyari', seviye: 'hata' };
    const oran = mj.oran != null ? `teminat kullanımı ${yuzde(mj.oran, 1)}` : 'teminat kullanımı —';
    const yakin = mj.enYakin ? ` · likidasyona en yakın ${kisa(mj.enYakin.symbol)} ${yuzde(mj.enYakin.mesafe, 0)}` : '';
    if (mj.seviye === 'alarm') return { metin: `Tehlike: ${oran}${yakin}`, ton: 'tehlike', seviye: 'alarm', ayrinti: (mj.uyarilar || []).join('\n') };
    if (mj.seviye === 'uyari') return { metin: `Dikkat: ${oran}${yakin}`, ton: 'uyari', seviye: 'uyari', ayrinti: (mj.uyarilar || []).join('\n') };
    return { metin: `Güvenli (${oran})`, ton: 'iyi', seviye: 'normal' };
  }

  /** Coin sepetinin iki yarısı: trend takibi (Donchian) / kademeli alım (DCA). */
  function kolPay(b) {
    const k = (b && b.sonKarar && b.sonKarar.kolPay) || (b && b.sonKuru && b.sonKuru.kolPay) || null;
    return k ? `Trend takibi ${yuzde(k.don, 0)} · kademeli alım ${yuzde(k.dca, 0)}` : '—';
  }

  /** Simülasyona (eski adıyla gölge) göre 30 günlük sapma (uygulama bandı). */
  function sapma(b) {
    const uy = (b && b.uygulama) || {};
    if (!uy.kayit) return { metin: 'henüz ölçülmedi', ton: '', olculdu: false, deger: '—', bant: null };
    const bant = uy.bant === 'normal' ? 'normal' : uy.bant === 'incele' ? 'incelenmeli' : 'sınır aşıldı';
    const deger = isaretli(uy.birikim, 2);
    return { metin: `${deger} (${bant})`, deger, bant, olculdu: true, ton: uy.bant === 'engel' ? 'tehlike' : uy.bant === 'incele' ? 'uyari' : '' };
  }

  /** Görünen ad + kısa açıklama: "Hücum (BTC oranı %100 + coin sepeti ×3)" — 62.6 sade terimler. */
  function ad(b, yedek) {
    const adG = (b && b.adGorunen) || yedek || '';
    return { ad: adG, alt: b && b.kolCarpani ? `BTC oranı en çok %${Math.round((b.btcPay || 0) * 100)} + coin sepeti ×${b.kolCarpani}` : '' };
  }

  AG.botDil = { ozsermaye, mod, durum, sadeNeden, kalp, sureMetni, yerelGun, gunAdi, karar, rejim, koruma, marj, kolPay, sapma, ad, yuzde, isaretli, para, TON_SINIF, ROZET_SINIF };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.botDil;
})(typeof window !== 'undefined' ? window : globalThis);
