/**
 * SAĞLIK SİNYALİ — healthchecks.io "ölü adam anahtarı" (dead man's switch).
 *
 * Telegram alarmı ancak sunucu AYAKTAYKEN gider: bilgisayar kapanırsa, elektrik/internet
 * giderse ya da süreç donarsa kimse "bot çalışmadı" demez. healthchecks.io tersini yapar:
 * belirli sürede ping GELMEZSE kendisi uyarır (e-posta / healthchecks'in Telegram botu).
 *
 * Uçlar (healthchecks sözleşmesi):  <url>        başarı
 *                                    <url>/start  çalışma başladı (süre ölçümü)
 *                                    <url>/fail   başarısız — gövde hata özeti
 *   `?rid=<uuid>` aynı çalışmanın start ↔ bitiş eşleşmesi (iki bot aynı URL'ye ping atabilir).
 *
 * KURAL: ping ASLA istisna atmaz, botu durdurmaz. Zaman aşımı 10 sn, 1 tekrar.
 * URL bir SIRdır (data/secrets.json); hiçbir log/hata metnine yazılmaz. Gövde `temizle`den geçer.
 */
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const GOVDE_SINIRI = 1000;

/** Gövdedeki olası sırları siler: URL sorgu dizgileri, uzun anahtar benzeri dizgiler, bot token'ı. */
function temizle(metin) {
  return String(metin == null ? '' : metin)
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token]')                 // Telegram bot token'ı
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1?[…]')                // imza/anahtar taşıyan sorgu
    .replace(/https?:\/\/hc-ping\.com\/[^\s]+/gi, 'hc-ping.com/[…]')       // ping URL'si
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[gizli]')                         // API anahtarı / uuid benzeri
    .slice(0, GOVDE_SINIRI);
}

/** Geçerli bir ping URL'si mi (http/https, boşluksuz). Yerel kurulu healthchecks da kabul. */
function urlGecerli(url) {
  if (typeof url !== 'string' || url.length < 12 || url.length > 300) return false;
  if (!/^https?:\/\/[^\s/]+\/[^\s]+$/.test(url)) return false;
  try { const u = new URL(url); return !u.search && !u.hash; } catch { return false; }
}

/**
 * 68.8 BOT BAŞINA ADRES (kullanıcı 2026-10-20: iki bot aynı check'e ping atıyordu — biri dursa öbürünün sinyali onu örterdi):
 * Hücum eski `healthchecksUrl`'yi kullanır (geri uyum); diğer botlar `bindirme.<ad>.healthchecksUrl`. Adres yoksa '' — o bot
 * ping GÖNDERMEZ, ortak adrese asla düşmez.
 */
function botUrl(cfg, ad) {
  if (!cfg) return '';
  if (ad === 'hucum') return String(cfg.healthchecksUrl || '').trim();
  const b = cfg.bindirme && cfg.bindirme[ad];
  return String((b && b.healthchecksUrl) || '').trim();
}

/** Varsayılan HTTP istemcisi. @returns Promise<{ status }> — ağ hatası/zaman aşımı istisna. */
function varsayilanIstek(url, { yontem = 'GET', govde = null, zamanAsimiMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const modul = u.protocol === 'http:' ? http : https;
    const basliklar = { 'User-Agent': 'pusula-panel' };
    if (govde != null) { basliklar['Content-Type'] = 'text/plain; charset=utf-8'; basliklar['Content-Length'] = Buffer.byteLength(govde); }
    const req = modul.request(u, { method: yontem, headers: basliklar }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', (e) => reject(new Error(e.zamanAsimi ? e.message : (e.code || 'ağ hatası'))));   // e.message hostname taşıyabilir; kod yeterli
    req.setTimeout(zamanAsimiMs, () => { req.destroy(Object.assign(new Error(`zaman aşımı (${+(zamanAsimiMs / 1000).toFixed(1)} sn)`), { zamanAsimi: true })); });
    if (govde != null) req.write(govde);
    req.end();
  });
}

class SaglikSinyali {
  /**
   * @param ayar { ad (log etiketi), urlFn: () → string ('' = ayarsız), istekFn (testler için),
   *               zamanAsimiMs (10000), tekrar (1), tekrarBeklemeMs (3000), kaydet(seviye, metin) }
   */
  constructor(ayar = {}) {
    this.ad = ayar.ad || 'sağlık sinyali';
    this.urlFn = ayar.urlFn || (() => '');
    this.istekFn = ayar.istekFn || varsayilanIstek;
    this.zamanAsimiMs = ayar.zamanAsimiMs ?? 10000;
    this.tekrar = ayar.tekrar ?? 1;
    this.tekrarBeklemeMs = ayar.tekrarBeklemeMs ?? 3000;
    this.kaydet = ayar.kaydet || (() => {});
    this.son = null;          // { zaman, tur, ok, hata?, deneme }
    this.sonBasari = null;    // ok:true olan son ping zamanı
  }

  _url() { try { return String(this.urlFn() || '').trim(); } catch { return ''; } }
  ayarli() { return urlGecerli(this._url()); }
  static yeniRid() { return crypto.randomUUID(); }

  /**
   * @param tur 'basari' | 'start' | 'fail'
   * @param secenek { govde (yalnız metin; temizlenir), rid }
   * @returns {Promise<{ ok, atlandi?, hata?, deneme, status? }>} — ASLA reddetmez.
   */
  async ping(tur = 'basari', secenek = {}) {
    try {
      const taban = this._url();
      if (!urlGecerli(taban)) return { ok: false, atlandi: true, deneme: 0 };
      const ek = tur === 'start' ? '/start' : tur === 'fail' ? '/fail' : '';
      const rid = secenek.rid && /^[0-9a-f-]{36}$/i.test(secenek.rid) ? `?rid=${secenek.rid}` : '';
      const url = taban.replace(/\/+$/, '') + ek + rid;
      const govde = secenek.govde != null ? temizle(secenek.govde) : null;
      let hata = null, status = null, deneme = 0;
      for (let i = 0; i <= this.tekrar; i++) {
        deneme++;
        try {
          const r = await this.istekFn(url, { yontem: govde != null ? 'POST' : 'GET', govde, zamanAsimiMs: this.zamanAsimiMs });
          status = r && r.status;
          if (status >= 200 && status < 300) { hata = null; break; }
          hata = `HTTP ${status}`;
          if (status >= 400 && status < 500 && status !== 429) break;      // 4xx: tekrar etmek düzeltmez
        } catch (e) { hata = (e && e.message) || 'ağ hatası'; }
        if (i < this.tekrar && this.tekrarBeklemeMs > 0) await new Promise(r => setTimeout(r, this.tekrarBeklemeMs));
      }
      const ok = !hata;
      this.son = { zaman: Date.now(), tur, ok, hata, deneme };
      if (ok) this.sonBasari = this.son.zaman;
      else this.kaydet('WARN', `${this.ad}: healthchecks ${tur} ping gönderilemedi (${hata}) — bot etkilenmez`);
      return { ok, hata, deneme, status };
    } catch (e) {
      // Buraya düşmemeli; düşerse de bot durmaz.
      this.son = { zaman: Date.now(), tur, ok: false, hata: 'beklenmeyen hata', deneme: 0 };
      return { ok: false, hata: 'beklenmeyen hata', deneme: 0 };
    }
  }

  durum() {
    return { ayarli: this.ayarli(), son: this.son, sonBasari: this.sonBasari };
  }
}

module.exports = { SaglikSinyali, temizle, urlGecerli, botUrl };
