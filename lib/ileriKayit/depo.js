'use strict';
/**
 * İLERİYE KAYIT — DEPO (73.3): günlük jsonl dosyaları, gün bitince zlib (gzip) sıkıştırma, durum dosyası, isteğe bağlı saklama.
 * ═══════════════════════════════════════════════════════════════════════════
 *   <kok>/<kayitci>/<YYYY-MM-DD>.jsonl      bugünün (UTC) dosyası — YALNIZ EKLENİR (appendFileSync, tam satırlar)
 *   <kok>/<kayitci>/<YYYY-MM-DD>.jsonl.gz   geçmiş günler: gün bitince sıkıştırılır (geçici dosya + fsync + ad değiştir +
 *                                           açıp birebir karşılaştır; ancak AYNIYSA düz dosya silinir — veri kaybı yok)
 *   <kok>/durum.json                        kayıtçı başına son yazım / deneme / hata / bugünkü satır / imleçler (atomik)
 * Satır biçimi kayıtçıların işi; depo yalnız JSON.stringify eder. Yarım kalmış son satır (elektrik kesintisi) varsa bir
 * sonraki eklemeden önce satır sonu konur — okuyucu bozuk satırı atlar, sonraki kayıtlar kaybolmaz.
 * SAKLAMA: varsayılan SONSUZ (ham veri silinmez). Yalnız ayarda `saklaGun` verilmiş kayıtçının o günden eski dosyaları silinir.
 * Dış paket yok (zlib yerleşik).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GUN_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/;
const gunStr = (t) => new Date(t).toISOString().slice(0, 10);

function jsonOku(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function atomikYaz(f, metin) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, metin);
  fs.renameSync(tmp, f);
}

class Depo {
  /** @param o { kok, simdi?: () => ms } */
  constructor({ kok, simdi } = {}) {
    if (!kok) throw new Error('ileriye kayıt deposu: kök yok');
    this.kok = kok;
    this.simdi = simdi || (() => Date.now());
    this._durum = null;
  }

  dizin(kayitci) { return path.join(this.kok, kayitci); }
  dosya(kayitci, gun) { return path.join(this.dizin(kayitci), `${gun}.jsonl`); }

  // ── Durum ──────────────────────────────────────────────────────────────
  durum() {
    if (!this._durum) this._durum = jsonOku(path.join(this.kok, 'durum.json')) || {};
    if (!this._durum.kayitcilar) this._durum.kayitcilar = {};
    return this._durum;
  }
  kayitciDurum(ad) {
    const d = this.durum();
    return d.kayitcilar[ad] || (d.kayitcilar[ad] = {});
  }
  durumYaz() {
    const d = this.durum();
    d.surum = 1;
    d.guncelleme = new Date(this.simdi()).toISOString();
    try { atomikYaz(path.join(this.kok, 'durum.json'), JSON.stringify(d)); } catch { /* disk sorunu: bir sonraki yazımda yeniden denenir */ }
  }

  // ── Yazım ──────────────────────────────────────────────────────────────
  /**
   * Satırları bugünün (UTC) dosyasına ekler; durumu (sonYazim, bugunSatir, toplamSatir) günceller.
   * @returns {number} yazılan satır sayısı
   */
  ekle(kayitci, satirlar) {
    if (!Array.isArray(satirlar) || !satirlar.length) return 0;
    const simdi = this.simdi();
    const gun = gunStr(simdi);
    const f = this.dosya(kayitci, gun);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let blok = '';
    for (const s of satirlar) blok += JSON.stringify(s) + '\n';
    // Yarım son satır (kesinti) → önce satır sonu.
    try {
      const st = fs.statSync(f);
      if (st.size > 0) {
        const fd = fs.openSync(f, 'r');
        try { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, st.size - 1); if (b[0] !== 0x0a) blok = '\n' + blok; } finally { fs.closeSync(fd); }
      }
    } catch { /* dosya yok */ }
    fs.appendFileSync(f, blok);
    const k = this.kayitciDurum(kayitci);
    if (k.bugunGun !== gun) { k.bugunGun = gun; k.bugunSatir = 0; }
    k.bugunSatir = (k.bugunSatir || 0) + satirlar.length;
    k.toplamSatir = (k.toplamSatir || 0) + satirlar.length;
    k.sonYazim = new Date(simdi).toISOString();
    return satirlar.length;
  }

  /** Bugünkü satır sayısı (durumdan; gün dönmüşse 0). */
  bugunSatir(kayitci) {
    const k = this.kayitciDurum(kayitci);
    return k.bugunGun === gunStr(this.simdi()) ? (k.bugunSatir || 0) : 0;
  }

  // ── Sıkıştırma ─────────────────────────────────────────────────────────
  /** Geçmiş günlerin düz dosyalarını sıkıştırır. @returns {{ sikisan: number, hata: string[] }} */
  sikistir(kayitci) {
    const bugun = gunStr(this.simdi());
    const out = { sikisan: 0, hata: [] };
    let adlar = [];
    try { adlar = fs.readdirSync(this.dizin(kayitci)); } catch { return out; }
    for (const ad of adlar) {
      const m = GUN_RE.exec(ad);
      if (!m || m[2] || m[1] >= bugun) continue;
      const duz = path.join(this.dizin(kayitci), ad);
      const gz = duz + '.gz';
      try {
        const ham = fs.readFileSync(duz);
        // .gz zaten varsa (yarıda kalmış önceki sıkıştırma): içeriği düz dosyayla aynıysa yalnız düzü sil; değilse düz
        // dosya esas alınır (o günün tamamı odur) ve yeniden sıkıştırılır.
        if (fs.existsSync(gz)) {
          let ayni = false;
          try { ayni = zlib.gunzipSync(fs.readFileSync(gz)).equals(ham); } catch { ayni = false; }
          if (ayni) { fs.unlinkSync(duz); out.sikisan++; continue; }
        }
        const sik = zlib.gzipSync(ham, { level: 9 });
        const tmp = `${gz}.${process.pid}.tmp`;
        const fd = fs.openSync(tmp, 'w');
        try { fs.writeSync(fd, sik); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(tmp, gz);
        if (!zlib.gunzipSync(fs.readFileSync(gz)).equals(ham)) throw new Error('sıkıştırılmış dosya düz dosyayla aynı değil — düz dosya korunuyor');
        fs.unlinkSync(duz);
        out.sikisan++;
      } catch (e) { out.hata.push(`${kayitci}/${ad}: ${e.message}`); }
    }
    return out;
  }

  // ── Saklama (yalnız istenirse) ─────────────────────────────────────────
  /** saklaGun verilmişse son saklaGun gün (bugün dahil) dışındaki dosyaları siler. saklaGun yok / 0 / null → hiçbir şey silinmez. */
  saklama(kayitci, saklaGun) {
    const n = Number(saklaGun);
    if (!Number.isFinite(n) || n <= 0) return { silinen: 0 };
    const sinir = gunStr(this.simdi() - (Math.floor(n) - 1) * 864e5);   // son n gün (bugün dahil) kalır
    let silinen = 0;
    let adlar = [];
    try { adlar = fs.readdirSync(this.dizin(kayitci)); } catch { return { silinen }; }
    for (const ad of adlar) {
      const m = GUN_RE.exec(ad);
      if (!m || m[1] >= sinir) continue;
      try { fs.unlinkSync(path.join(this.dizin(kayitci), ad)); silinen++; } catch { /* sonra */ }
    }
    return { silinen };
  }

  // ── Okuma (öz test, ileride analiz) ────────────────────────────────────
  /** Bir günün satırları (düz ya da sıkıştırılmış). Bozuk satır atlanır. */
  oku(kayitci, gun) {
    const f = this.dosya(kayitci, gun);
    let metin = null;
    if (fs.existsSync(f)) metin = fs.readFileSync(f, 'utf8');
    else if (fs.existsSync(f + '.gz')) metin = zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8');
    if (metin == null) return [];
    const out = [];
    for (const s of metin.split('\n')) { if (!s.trim()) continue; try { out.push(JSON.parse(s)); } catch { /* yarım satır */ } }
    return out;
  }

  /** Disk kullanımı: { bayt, dosya, ilkGun, sonGun, sikisikBayt, duzBayt }. */
  boyut(kayitci) {
    const out = { bayt: 0, dosya: 0, ilkGun: null, sonGun: null, sikisikBayt: 0, duzBayt: 0, sikisikGun: 0 };
    let adlar = [];
    try { adlar = fs.readdirSync(this.dizin(kayitci)); } catch { return out; }
    for (const ad of adlar) {
      const m = GUN_RE.exec(ad);
      if (!m) continue;
      let b = 0;
      try { b = fs.statSync(path.join(this.dizin(kayitci), ad)).size; } catch { continue; }
      out.bayt += b; out.dosya++;
      if (m[2]) { out.sikisikBayt += b; out.sikisikGun++; } else out.duzBayt += b;
      if (!out.ilkGun || m[1] < out.ilkGun) out.ilkGun = m[1];
      if (!out.sonGun || m[1] > out.sonGun) out.sonGun = m[1];
    }
    return out;
  }
}

module.exports = { Depo, gunStr, GUN_RE };
