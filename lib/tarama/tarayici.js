/**
 * COIN TARAMA — günlük tarama koşusu (ileriye dönük kayıt). Alım/satım yapmaz; canlı botu etkilemez.
 *
 *   const t = new Tarayici({ ayarlar, kayit, fetch?, kota?, simdi?, uyu?, log?, bildirici? });
 *   t.otomatikGerekli() → { gerekli, neden }
 *   t.baslat({ neden, kim }) → { baslatildi, neden? }        arka planda (bekletmez)
 *   await t.tara({ neden, kim })                             bekler; kilit varsa KilitHatasi
 *   t.isDurum() → { durum, oran, asama, aciklama, sure, ... }  (AG.ilerleme biçimi)
 *
 * KİLİT: aynı anda iki koşu olmaz — süreç içi bayrak + süreçler arası kilit dosyası (`data/tarama/tarama.kilit`, wx ile
 * oluşturulur; sahibi ölmüş ya da 3 saatten eski kilit bayat sayılır). Sunucu, `npm run tarama` ve zamanlayıcı aynı kilidi kullanır.
 *
 * KISMİ BAŞARI: her coin × kaynak ayrı denenir; biri düşerse diğerleri sürer. Tarama durumu:
 *   tamam = hiç hata yok · kismi = en az bir hata, en az bir başarı · hata = hiçbir kaynak veri vermedi (sonBasari GÜNCELLENMEZ).
 * Binance hız sınırı (KotaHatasi) yalnız Binance'i o koşuda bırakır; diğer kaynaklar sürer.
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const { Istemci } = require('./http');
const { FiyatKaynagi } = require('./fiyat');
const { KAYNAKLAR, SIRA } = require('./kaynaklar');
const { jsonOku, atomikYaz, gunStr, surecCanli, temizMetin } = require('./ortak');
const { uyarilar } = require('./uyarilar');

const KILIT_OMUR_MS = 3 * 3600e3;
const COIN_PARALEL = 3;
const BOOTSTRAP_OMUR_MS = 30 * 864e5;

class KilitHatasi extends Error {}

class Tarayici {
  /**
   * @param o { ayarlar: AyarDeposu, kayit: Kayit, fetch, kota: () => BinanceKota|null, simdi, uyu, log(lv,msg),
   *            bildirici: { gonder(tur, baslik, satirlar, secenek) } | null, zincirFn: () => doğrulama | null }
   */
  constructor(o) {
    this.ayarlar = o.ayarlar;
    this.kayit = o.kayit;
    this.D = o.kayit.D;
    this.fetch = o.fetch || null;
    this.kotaFn = o.kota || (() => null);
    this.simdi = o.simdi || (() => Date.now());
    this.uyu = o.uyu || null;
    this.log = o.log || (() => {});
    this.bildirici = o.bildirici || null;
    this.zincirFn = o.zincirFn || (() => null);
    this.calisiyor = false;
    this.is = null;           // { id, durum, oran, asama, aciklama, basladi, bitti, hata }
    this.sonSonuc = null;
  }

  // ── Kilit ──────────────────────────────────────────────────────────────
  kilitDurumu() {
    const k = jsonOku(this.D.kilit, null);
    if (!k) return null;
    const yas = this.simdi() - Date.parse(k.bas || 0);
    const bayat = !(yas < KILIT_OMUR_MS) || (k.pid !== process.pid && !surecCanli(k.pid));
    return { ...k, bayat };
  }
  _kilitAl(neden) {
    fs.mkdirSync(this.D.dizin, { recursive: true });
    const yaz = () => { const fd = fs.openSync(this.D.kilit, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, bas: new Date(this.simdi()).toISOString(), neden })); fs.closeSync(fd); };
    try { yaz(); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const k = this.kilitDurumu();
    if (k && !k.bayat) throw new KilitHatasi(`tarama başka bir süreçte sürüyor (pid ${k.pid}, ${k.bas}'den beri)`);
    try { fs.unlinkSync(this.D.kilit); } catch { /* yarış: diğeri sildi */ }
    try { yaz(); } catch (e) { if (e.code === 'EEXIST') throw new KilitHatasi('tarama başka bir süreçte yeni başladı'); throw e; }
  }
  _kilitBirak() {
    const k = jsonOku(this.D.kilit, null);
    if (k && k.pid === process.pid) { try { fs.unlinkSync(this.D.kilit); } catch { /* yok */ } }
  }

  // ── Zamanlama kararı ───────────────────────────────────────────────────
  otomatikGerekli() {
    if (this.calisiyor) return { gerekli: false, neden: 'tarama sürüyor' };
    const k = this.kilitDurumu();
    if (k && !k.bayat) return { gerekli: false, neden: 'başka süreçte tarama sürüyor' };
    const a = this.ayarlar.oku();
    if (!a.izleme.some(c => c.aktif !== false)) return { gerekli: false, neden: 'izleme listesi boş' };
    const d = this.kayit.durumOku();
    const sonB = Date.parse(d.sonBasari || ''), sonD = Date.parse(d.sonDeneme || '');
    // Hatalı denemeden sonra 30 dk beklenir (kaynak kesikken her panel açılışında yeniden denemesin).
    if (Number.isFinite(sonD) && this.simdi() - sonD < 30 * 60e3 && (!Number.isFinite(sonB) || sonB < sonD)) return { gerekli: false, neden: 'son deneme 30 dk içinde başarısız oldu' };
    if (!Number.isFinite(sonB)) return { gerekli: true, neden: 'hiç başarılı tarama yok' };
    const h = (this.simdi() - sonB) / 3600e3;
    if (h >= a.otomatikSaat) return { gerekli: true, neden: `son başarılı tarama ${Math.round(h)} saat önce (aralık ${a.otomatikSaat} saat)` };
    return { gerekli: false, neden: `son tarama ${h < 1 ? `${Math.round(h * 60)} dk` : `${Math.round(h)} saat`} önce (aralık ${a.otomatikSaat} saat)` };
  }

  isDurum() {
    if (!this.is) return null;
    return { ...this.is, sure: (this.is.bitti || this.simdi()) - this.is.basladi };
  }

  /** Arka planda başlat (bekletmez). Kilit/çalışma varsa başlatmaz. */
  baslat({ neden = 'elle', kim = null } = {}) {
    if (this.calisiyor) return { baslatildi: false, neden: 'tarama zaten sürüyor', is: this.isDurum() };
    const k = this.kilitDurumu();
    if (k && !k.bayat) return { baslatildi: false, neden: `tarama başka bir süreçte sürüyor (pid ${k.pid})` };
    const p = this.tara({ neden, kim });
    p.catch(e => this.log('WARN', `🔎 Coin tarama (${neden}): ${e.message}`));
    return { baslatildi: true, is: this.isDurum() };
  }

  async _rdapBootstrap(http) {
    const b = jsonOku(this.D.rdapBootstrap, null);
    if (b && b.harita && this.simdi() - Date.parse(b.zaman || 0) < BOOTSTRAP_OMUR_MS) return b.harita;
    const r = await http.json('https://data.iana.org/rdap/dns.json', { host: 'iana', araMs: 0, denemeler: 2 });
    if (!r.ok || !r.veri || !Array.isArray(r.veri.services)) return b && b.harita ? b.harita : null;
    const harita = {};
    for (const s of r.veri.services) {
      if (!Array.isArray(s) || !Array.isArray(s[0]) || !Array.isArray(s[1])) continue;
      const url = s[1].find(u => /^https:\/\//.test(String(u))) || s[1][0];
      for (const tld of s[0]) if (/^[a-z0-9-]{2,63}$/i.test(tld) && url) harita[String(tld).toLowerCase()] = temizMetin(url, 200);
    }
    try { atomikYaz(this.D.rdapBootstrap, JSON.stringify({ zaman: new Date(this.simdi()).toISOString(), harita })); } catch { /* yoksay */ }
    return harita;
  }

  /** Tek coin: etkin kaynaklar (paralel grup, sonra RDAP). Her kaynak ayrı try/catch. */
  async _coinTara(c, ctx, etkin, taramaId) {
    const zaman = new Date(this.simdi()).toISOString();
    const row = { v: 1, taramaId, zaman, gun: gunStr(this.simdi()), coin: { id: c.id, sembol: c.sembol, ad: c.ad || null, ag: c.ag, sozlesme: c.sozlesme || null }, kaynaklar: {} };
    const calistir = async (ad, ek) => {
      const k = KAYNAKLAR[ad];
      const des = k.destekler(c);
      if (des !== true) { row.kaynaklar[ad] = { durum: 'atlandi', neden: des }; return; }
      const bas = this.simdi();
      try {
        const r = await k.getir(c, { ...ctx, ...ek });
        row.kaynaklar[ad] = { ...r, alindi: new Date(this.simdi()).toISOString(), ms: r.ms != null ? r.ms : this.simdi() - bas };
      } catch (e) {
        const kota = e && e.constructor && e.constructor.name === 'KotaHatasi';
        row.kaynaklar[ad] = { durum: 'hata', hata: temizMetin(kota ? e.message : `beklenmeyen: ${e.message}`, 200), alindi: new Date(this.simdi()).toISOString(), ms: this.simdi() - bas };
      }
    };
    const onceki = ctx.oncekiler.get(c.id) || null;
    await Promise.all(SIRA.paralel.filter(a => etkin[a]).map(a => calistir(a, { onceki })));
    for (const a of SIRA.sonra.filter(x => etkin[x])) {
      // eslint-disable-next-line no-await-in-loop
      await calistir(a, { onceki, dex: row.kaynaklar.dexscreener && row.kaynaklar.dexscreener.durum === 'ok' ? row.kaynaklar.dexscreener : null });
    }
    return row;
  }

  async tara({ neden = 'elle', kim = null } = {}) {
    if (this.calisiyor) throw new KilitHatasi('tarama zaten sürüyor');
    this._kilitAl(neden);
    this.calisiyor = true;
    const taramaId = `t-${new Date(this.simdi()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(2).toString('hex')}`;
    this.is = { id: taramaId, durum: 'calisiyor', oran: 0, asama: 'başlıyor', aciklama: neden, basladi: this.simdi(), bitti: null, hata: null };
    const basIso = new Date(this.simdi()).toISOString();
    try { this.kayit.durumYaz({ sonDeneme: basIso, calisiyor: { id: taramaId, bas: basIso, neden, pid: process.pid } }); } catch { /* durum dosyası yazılamadı */ }
    try {
      const a = this.ayarlar.oku();
      const coinler = a.izleme.filter(c => c.aktif !== false);
      const http = new Istemci({ fetch: this.fetch || undefined, simdi: this.simdi, uyu: this.uyu || undefined, zamanAsimiMs: a.zamanAsimiSn * 1000 });
      const fiyat = new FiyatKaynagi({ http, kota: this.kotaFn, onbellekDosya: this.D.fiyatOnbellek, simdi: this.simdi });
      let bootstrap = null;
      const ctx = { http, fiyat, ayar: a, simdi: this.simdi, oncekiler: this.kayit.sonSatirlar(),
        rdapBootstrap: async () => { if (bootstrap === null) bootstrap = (await this._rdapBootstrap(http)) || {}; return bootstrap; } };
      const etkin = { ...a.kaynaklar };
      const ozet = {};
      let biten = 0, eksikCoin = 0, okToplam = 0;
      const kuyruk = coinler.slice();
      const isci = async () => {
        for (;;) {
          const c = kuyruk.shift();
          if (!c) return;
          // eslint-disable-next-line no-await-in-loop
          const row = await this._coinTara(c, ctx, etkin, taramaId);
          this.kayit.satirYaz(row);
          let eksik = false;
          for (const [k, v] of Object.entries(row.kaynaklar)) {
            const s = ozet[k] || (ozet[k] = { ok: 0, bos: 0, hata: 0, atlandi: 0, onbellek: 0, sonHata: null });
            s[v.durum] = (s[v.durum] || 0) + 1;
            if (v.durum === 'hata') { s.sonHata = v.hata; eksik = true; }
            if (v.durum === 'ok') okToplam++;   // önbellekten (RDAP) gelen ağdan alınmış sayılmaz
          }
          if (eksik) eksikCoin++;
          biten++;
          this.is.oran = coinler.length ? biten / coinler.length : 1;
          this.is.asama = `${biten}/${coinler.length} coin · son: ${c.sembol}`;
        }
      };
      await Promise.all(Array.from({ length: Math.min(COIN_PARALEL, Math.max(1, coinler.length)) }, isci));
      const hataVar = Object.values(ozet).some(s => s.hata > 0);
      const durum = !coinler.length ? 'tamam' : okToplam === 0 ? 'hata' : hataVar ? 'kismi' : 'tamam';
      const bitIso = new Date(this.simdi()).toISOString();
      const t = { id: taramaId, bas: basIso, bit: bitIso, sureSn: Math.round((Date.parse(bitIso) - Date.parse(basIso)) / 1000), neden, kim: temizMetin(kim, 80) || null,
        coin: coinler.length, eksikCoin, durum, kismi: hataVar, kaynakOzet: ozet, istek: http.sayac,
        hata: durum === 'hata' ? 'hiçbir kaynak veri vermedi (ağ bağlantısını kontrol edin)' : null };
      this.kayit.taramaYaz(t);
      const yeniDurum = { sonTarama: t, calisiyor: null };
      if (durum !== 'hata') yeniDurum.sonBasari = bitIso;
      const dur = this.kayit.durumYaz(yeniDurum);
      const oz = this.kayit.ozetUret(a);
      this.sonSonuc = t;
      this.is = { ...this.is, durum: 'bitti', oran: 1, asama: `tamamlandı — ${durum}`, bitti: this.simdi() };
      this.log(durum === 'tamam' ? 'SUCCESS' : 'WARN', `🔎 Coin tarama (${neden}): ${coinler.length} coin, ${t.sureSn} sn, durum ${durum}${hataVar ? ` · hatalı kaynaklar: ${Object.entries(ozet).filter(([, s]) => s.hata).map(([k, s]) => `${k} ${s.hata}`).join(', ')}` : ''}`);
      await this.bildir(uyarilar({ durum: dur, ozet: oz, zincir: this._zincir(), ayar: a, simdi: this.simdi() }), a);
      return t;
    } catch (e) {
      this.is = { ...this.is, durum: 'hata', hata: e.message, bitti: this.simdi() };
      try { this.kayit.durumYaz({ calisiyor: null, sonHata: { zaman: new Date(this.simdi()).toISOString(), hata: temizMetin(e.message, 200) } }); } catch { /* yoksay */ }
      throw e;
    } finally {
      this.calisiyor = false;
      this._kilitBirak();
    }
  }

  _zincir() { try { return this.zincirFn(); } catch { return null; } }

  /** Telegram (ayarla açıksa): tarama kaynaklı uyarılar; Bildirici kısıtı (aynı anahtar 24 saatte bir) korunur. */
  async bildir(liste, ayar) {
    if (!this.bildirici || !ayar || !ayar.telegram) return { gonderilen: 0 };
    let n = 0;
    for (const u of liste) {
      if (u.seviye === 'bilgi') continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await this.bildirici.gonder(u.seviye === 'tehlike' ? 'alarm' : 'uyari', 'Coin tarama', [u.metin, 'Kırmızı bayrak alım/satım sinyali değildir.'], { anahtar: `tarama:${u.anahtar}`, kisitMs: 24 * 3600e3 });
        if (r && r.ok) n++;
      } catch { /* bildirim taramayı bozmaz */ }
    }
    return { gonderilen: n };
  }
}

module.exports = { Tarayici, KilitHatasi, KILIT_OMUR_MS };
