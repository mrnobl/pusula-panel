const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/**
 * Piyasa verisi deposu — mum ve funding geçmişi.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN JSON'DAN ÇIKILDI
 * ─────────────────────────────────────────────────────────────────────────
 * Eski depo `data/candles_cache.json` idi: tek dosya, 23 MB, ve HER yazmada
 * tamamı yeniden serileştiriliyordu. Vadeli işlem altyapısıyla birlikte veri
 * hacmi (iki borsa × spot+perp × çok sayıda sembol × zaman dilimi) katlanıyor;
 * aynı şemayla devam etmek her mum çekiminde on megabaytlarca yazma demekti.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ASIL DÜZELTİLEN HATA: ÖNBELLEK ANAHTARI
 * ─────────────────────────────────────────────────────────────────────────
 * Eski anahtar `sembol_zamandilimi` idi. Yani BTC/USDT'nin SPOT mumlarıyla
 * PERP mumları aynı kovaya yazılıyordu; iki borsadan veri çekilse ikisi de
 * aynı yere. Fiyatlar birbirine yakın olduğu için bu sessizce bozar —
 * backtest hiç var olmamış bir seri üzerinde ölçüm yapardı. Yeni anahtar:
 *
 *     borsa + piyasa tipi + sembol + zaman dilimi
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SÜRÜCÜ SEÇİMİ
 * ─────────────────────────────────────────────────────────────────────────
 * Node 24'ün yerleşik `node:sqlite`'ı kullanılıyor: bağımlılık yok, native
 * derleme yok. `better-sqlite3` de denendi ve çalıştı; yerleşik olan varken
 * kurulum betiği gerektiren bir native paket taşımanın karşılığı yok.
 *
 * SAKLAMA SINIRI YOK: eski depo dosya boyutunu tutmak için seri başına 6000
 * mumla sınırlıydı. Vadeli backtestlerde 1h/15m serilerde on binlerce bar
 * gerekiyor; SQLite bunu taşır, sınır kaldırıldı.
 */
/** SQLite bozulma hatası mı (SQLITE_CORRUPT 11 / SQLITE_NOTADB 26 ya da ileti) — kilit / izin hatası DEĞİL. */
function bozulmaMi(e) {
  const kod = e && (e.errcode & 0xff);
  return kod === 11 || kod === 26 || /file is not a database|database disk image is malformed|SQLITE_CORRUPT|SQLITE_NOTADB/i.test(String(e && (e.message || e.errstr) || ''));
}

class CandleStore {
  /**
   * @param o.bozuksaKenaraAl A-01/S-099 (78.x): yalnız ana süreç (lib/database.js) verir — veritabanı BOZUK açılırsa
   *   (SQLite "file is not a database" / "malformed") market.db (+ -wal / -shm) `market.db.bozuk-<zaman>` adıyla kenara alınır,
   *   boş veritabanı kurulur (veri orkestratörü açılıştan ~2 dk sonra bayat Binance verisini yeniden indirir), `this.kurtarma` dolar.
   *   Eskiden Pusula require sırasında atıp çökme döngüsüne giriyordu. Kenara alma da olmazsa dosya adıyla açık hata (süreç çıkar).
   *   Bozulma dışı hata (kilit, izin) kenara ALINMAZ — eskisi gibi atar. Seçenek yoksa (betikler, iş parçacıkları) davranış eskisi.
   */
  constructor(dbPath, o = {}) {
    this.dbPath = dbPath;
    this.kurtarma = null;
    try { this._ac(); } catch (e) {
      if (!o.bozuksaKenaraAl || !bozulmaMi(e) || dbPath === ':memory:') {
        try { if (this.db) this.db.close(); } catch { /* yarım açılmış bağlantı (dosya kilidi kalmasın) */ }
        if (dbPath !== ':memory:' && e && typeof e.message === 'string' && !e.message.includes(path.basename(dbPath))) e.message = `mum veritabanı açılamadı (${dbPath}): ${e.message}`;
        throw e;
      }
      this._kenaraAl(e, o.simdi || Date.now);
    }
  }

  _kenaraAl(hata, simdi) {
    try { if (this.db) this.db.close(); } catch { /* yarım açılmış bağlantı */ }
    this.db = null;
    const zaman = simdi();
    const kenar = [];
    for (const ek of ['', '-wal', '-shm']) {
      const kaynak = this.dbPath + ek;
      if (!fs.existsSync(kaynak)) continue;
      const hedef = `${this.dbPath}.bozuk-${zaman}${ek}`;
      try { fs.renameSync(kaynak, hedef); kenar.push(path.basename(hedef)); } catch (e) {
        throw new Error(`mum veritabanı bozuk (${String(hata.message).slice(0, 120)}) ve kenara alınamadı: ${kaynak} → ${path.basename(hedef)} (${e.code || e.message}). `
          + 'Pusula bu dosya olmadan açılamıyor: Pusula kapalıyken dosyayı elle başka bir adla kenara alın (silmeyin), sonra yeniden başlatın.');
      }
    }
    try { this._ac(); } catch (e) {
      throw new Error(`mum veritabanı bozuktu, kenara alındı (${kenar.join(', ')}) ama yeni boş veritabanı da açılamadı: ${this.dbPath} (${e.message})`);
    }
    this.kurtarma = { zaman, hata: String(hata.message).slice(0, 200), kenar };
  }

  _ac() {
    const dbPath = this.dbPath;
    this.db = new DatabaseSync(dbPath);

    // WAL: panel okurken motor yazabilsin. `synchronous=NORMAL` WAL ile
    // güvenli ve her yazmada disk senkronizasyonu beklemez.
    // busy_timeout: başka süreç (sunucu, indirme betiği, iş parçacığı) yazarken
    // "database is locked" hatasıyla yazımı SESSİZCE düşürmek yerine 10 sn
    // beklenir. Yoktu; arşiv indirmesinde aylık yazımlar kayboluyordu (2026-10-07).
    this.db.exec('PRAGMA busy_timeout = 10000');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candles (
        venue     TEXT    NOT NULL,
        market    TEXT    NOT NULL,
        symbol    TEXT    NOT NULL,
        timeframe TEXT    NOT NULL,
        time      INTEGER NOT NULL,
        open      REAL,
        high      REAL,
        low       REAL,
        close     REAL,
        volume    REAL,
        PRIMARY KEY (venue, market, symbol, timeframe, time)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS series_meta (
        venue       TEXT NOT NULL,
        market      TEXT NOT NULL,
        symbol      TEXT NOT NULL,
        timeframe   TEXT NOT NULL,
        lastFetched TEXT,
        PRIMARY KEY (venue, market, symbol, timeframe)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS funding (
        venue  TEXT    NOT NULL,
        market TEXT    NOT NULL,
        symbol TEXT    NOT NULL,
        time   INTEGER NOT NULL,
        rate   REAL    NOT NULL,
        PRIMARY KEY (venue, market, symbol, time)
      ) WITHOUT ROWID;
    `);

    this.stmt = {
      mumEkle: this.db.prepare(`
        INSERT INTO candles (venue, market, symbol, timeframe, time, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(venue, market, symbol, timeframe, time) DO UPDATE SET
          open = excluded.open, high = excluded.high, low = excluded.low,
          close = excluded.close, volume = excluded.volume
      `),
      // Son N mum: SQLite'tan tersten alıp çeviriyoruz — `ORDER BY time DESC
      // LIMIT n` birincil anahtarı kullanır, tüm seriyi taramaz.
      mumOku: this.db.prepare(`
        SELECT time, open, high, low, close, volume FROM candles
        WHERE venue = ? AND market = ? AND symbol = ? AND timeframe = ?
        ORDER BY time DESC LIMIT ?
      `),
      mumSay: this.db.prepare(`
        SELECT COUNT(*) AS n, MIN(time) AS ilk, MAX(time) AS son FROM candles
        WHERE venue = ? AND market = ? AND symbol = ? AND timeframe = ?
      `),
      // Tarih aralığı: backtest artık "son N mum" değil [bas, bit] ister.
      mumAralik: this.db.prepare(`
        SELECT time, open, high, low, close, volume FROM candles
        WHERE venue = ? AND market = ? AND symbol = ? AND timeframe = ? AND time >= ? AND time <= ?
        ORDER BY time ASC
      `),
      mumAralikSay: this.db.prepare(`
        SELECT COUNT(*) AS n, MIN(time) AS ilk, MAX(time) AS son FROM candles
        WHERE venue = ? AND market = ? AND symbol = ? AND timeframe = ? AND time >= ? AND time <= ?
      `),
      metaYaz: this.db.prepare(`
        INSERT INTO series_meta (venue, market, symbol, timeframe, lastFetched)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(venue, market, symbol, timeframe) DO UPDATE SET lastFetched = excluded.lastFetched
      `),
      metaOku: this.db.prepare(`
        SELECT lastFetched FROM series_meta
        WHERE venue = ? AND market = ? AND symbol = ? AND timeframe = ?
      `),
      seriler: this.db.prepare(`
        SELECT venue, market, symbol, timeframe, COUNT(*) AS n,
               MIN(time) AS ilk, MAX(time) AS son
        FROM candles GROUP BY venue, market, symbol, timeframe
        ORDER BY venue, market, symbol, timeframe
      `),
      fundingEkle: this.db.prepare(`
        INSERT INTO funding (venue, market, symbol, time, rate) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(venue, market, symbol, time) DO UPDATE SET rate = excluded.rate
      `),
      fundingOku: this.db.prepare(`
        SELECT time, rate FROM funding
        WHERE venue = ? AND market = ? AND symbol = ? AND time >= ? AND time <= ?
        ORDER BY time ASC
      `),
      fundingSay: this.db.prepare(`
        SELECT COUNT(*) AS n, MIN(time) AS ilk, MAX(time) AS son FROM funding
        WHERE venue = ? AND market = ? AND symbol = ?
      `)
    };
  }

  /**
   * Kaynak normalizasyonu. Çağıranların çoğu yalnızca sembol+zaman dilimi
   * biliyor; varsayılan `binance/spot`, yani eski davranış birebir korunur.
   */
  static kaynak(k = {}) {
    const venue = String(k.venue || k.exchange || 'binance').toLowerCase();
    let market = String(k.market || k.marketType || 'spot').toLowerCase();
    // `perpetual`, `swap`, `future` hepsi aynı kovaya: perp.
    if (market === 'perpetual' || market === 'swap' || market === 'future' || market === 'futures') market = 'perp';
    return { venue, market };
  }

  saveCandles(symbol, timeframe, candles, kaynak = {}) {
    if (!candles || candles.length === 0) return 0;
    const { venue, market } = CandleStore.kaynak(kaynak);

    this.db.exec('BEGIN');
    try {
      for (const c of candles) {
        if (!Number.isFinite(c.time)) continue;
        this.stmt.mumEkle.run(
          venue, market, symbol, timeframe, c.time,
          Number(c.open), Number(c.high), Number(c.low), Number(c.close), Number(c.volume || 0)
        );
      }
      this.stmt.metaYaz.run(venue, market, symbol, timeframe, new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      console.error('Mum yazma hatası:', e.message);
      return 0;
    }
    return candles.length;
  }

  getCandles(symbol, timeframe, limit = 500, kaynak = {}) {
    const { venue, market } = CandleStore.kaynak(kaynak);
    const satirlar = this.stmt.mumOku.all(venue, market, symbol, timeframe, Math.max(1, limit | 0));
    // Sorgu yeniden eskiye; motor ve backtester eskiden yeniye bekliyor.
    return satirlar.reverse();
  }

  /** [bas, bit] aralığındaki mumlar, eskiden yeniye (uçlar dahil, ms). */
  getCandlesRange(symbol, timeframe, bas, bit, kaynak = {}) {
    const { venue, market } = CandleStore.kaynak(kaynak);
    return this.stmt.mumAralik.all(venue, market, symbol, timeframe, Math.floor(bas), Math.floor(bit));
  }

  /** Aralıktaki mum sayısı ve uçları — indirmeden önce eksik var mı sorusu. */
  rangeStats(symbol, timeframe, bas, bit, kaynak = {}) {
    const { venue, market } = CandleStore.kaynak(kaynak);
    const r = this.stmt.mumAralikSay.get(venue, market, symbol, timeframe, Math.floor(bas), Math.floor(bit)) || {};
    return { count: r.n || 0, firstTime: r.ilk || null, lastTime: r.son || null };
  }

  stats(symbol, timeframe, kaynak = {}) {
    const { venue, market } = CandleStore.kaynak(kaynak);
    const r = this.stmt.mumSay.get(venue, market, symbol, timeframe) || {};
    const m = this.stmt.metaOku.get(venue, market, symbol, timeframe) || {};
    return {
      count: r.n || 0,
      firstTime: r.ilk || null,
      lastTime: r.son || null,
      lastFetched: m.lastFetched || null
    };
  }

  listSeries() {
    return this.stmt.seriler.all();
  }

  // ── Funding geçmişi (vadeli motorun gerçek maliyet kaynağı) ──────────────
  saveFunding(symbol, kayitlar, kaynak = {}) {
    if (!kayitlar || kayitlar.length === 0) return 0;
    const { venue, market } = CandleStore.kaynak({ market: 'perp', ...kaynak });

    this.db.exec('BEGIN');
    try {
      for (const f of kayitlar) {
        const t = Number(f.time ?? f.timestamp);
        const r = Number(f.rate ?? f.fundingRate);
        if (!Number.isFinite(t) || !Number.isFinite(r)) continue;
        this.stmt.fundingEkle.run(venue, market, symbol, t, r);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      console.error('Funding yazma hatası:', e.message);
      return 0;
    }
    return kayitlar.length;
  }

  getFunding(symbol, baslangic = 0, bitis = Date.now(), kaynak = {}) {
    const { venue, market } = CandleStore.kaynak({ market: 'perp', ...kaynak });
    return this.stmt.fundingOku.all(venue, market, symbol, baslangic, bitis);
  }

  fundingStats(symbol, kaynak = {}) {
    const { venue, market } = CandleStore.kaynak({ market: 'perp', ...kaynak });
    const r = this.stmt.fundingSay.get(venue, market, symbol) || {};
    return { count: r.n || 0, firstTime: r.ilk || null, lastTime: r.son || null };
  }

  /**
   * Eski JSON önbelleğini bir kez içeri alır.
   *
   * Eski anahtarda borsa ve piyasa tipi YOK. O veri Binance SPOT'tan çekilmişti
   * (`exchange.js` `defaultType: 'spot'` ve `fetchMarkets: ['spot']` ile kilitli
   * çalışıyordu), bu yüzden hepsi `binance/spot` altına yazılıyor. Varsayım
   * burada AÇIKÇA yazılı; başka bir borsadan veri varsa yeniden çekilmeli.
   *
   * JSON silinmez, `.migrated` uzantısıyla bırakılır.
   */
  migrateFromJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) return { imported: 0, series: 0, skipped: 'dosya yok' };

    const mevcut = this.db.prepare('SELECT COUNT(*) AS n FROM candles').get();
    if ((mevcut.n || 0) > 0) return { imported: 0, series: 0, skipped: 'depo zaten dolu' };

    let ham;
    try {
      ham = JSON.parse(fs.readFileSync(jsonPath, 'utf8').trim() || '{}');
    } catch (e) {
      return { imported: 0, series: 0, skipped: 'JSON okunamadı: ' + e.message };
    }

    let toplam = 0, seri = 0;
    for (const [key, kayit] of Object.entries(ham)) {
      const mumlar = kayit && kayit.candles;
      if (!Array.isArray(mumlar) || mumlar.length === 0) continue;

      // Anahtar `SEMBOL_zamandilimi`; sembolde `/` var, zaman dilimi son parça.
      const sonAlt = key.lastIndexOf('_');
      const symbol = kayit.symbol || key.slice(0, sonAlt);
      const timeframe = kayit.timeframe || key.slice(sonAlt + 1);
      if (!symbol || !timeframe) continue;

      toplam += this.saveCandles(symbol, timeframe, mumlar, { venue: 'binance', market: 'spot' });
      seri++;
    }

    try {
      fs.renameSync(jsonPath, jsonPath + '.migrated');
    } catch (e) {
      console.error('Eski önbellek yeniden adlandırılamadı:', e.message);
    }

    return { imported: toplam, series: seri };
  }

  close() {
    try { this.db.close(); } catch (e) { /* kapanışta sessiz */ }
  }
}

module.exports = { bozulmaMi, CandleStore };
