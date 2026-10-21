/**
 * DONCHIAN CANLI BOTU — `lib/strategies/donchianEnsemble.js`i günde bir kez
 * çalıştırıp hedef pozisyonu yürütücüye verir.
 *
 * Neden bu bot (PLAN-GECE.md F6): bu gece ölçülen adaylar içinde kill
 * kriterlerinin kesin olanlarını geçen tek strateji. Durumu BEKLET — kâr
 * tek yıla yaslı. Bu yüzden sermaye TAVANLI çalışır: hedef nominal
 * `sermayeTavani` × maruziyet'i aşmaz, yürütücünün tavanları da ayrıca geçerli.
 *
 * Backtest ile aynılık:
 *   · aynı `adim()` fonksiyonu, aynı varsayılanlar
 *   · yalnız KAPANMIŞ günlük mumlar (son, oluşmakta olan mum atılır —
 *     dahil etmek ileriye bakış olurdu)
 *   · karar kapanışta, emir hemen ardından (backtest: ertesi açılış)
 * Durum her çalışmada geçmişten YENİDEN hesaplanır (1000 gün): yeniden
 * başlatmada kaybolacak bir iç durum yok.
 *
 * NOKTA-ZAMANLI EVREN (`ayar.evren`, `lib/live/evren.js`): verilirse sembol
 * listesi her ay başı son 30 günün hacmiyle ilk 15 perp olur (B Kalkan
 * ölçümünün evreni). Evrenden çıkan ve botun daha önce işlem yaptığı
 * sembolde hedef 0 → pozisyon kapanır (backtest: "evrende değil → kapat").
 * Verilmezse sabit liste (`semboller` / `symbol`) eskisi gibi çalışır.
 * `ayar.donchian` strateji ayarı olarak `donchianEnsemble`e geçirilir.
 */
const fs = require('fs');
const path = require('path');
const D = require('../strategies/donchianEnsemble');

const GUN = 86400000;

/**
 * PORTFÖY HEDEFLERİ — `scripts/donchian-portfoy.js` ile aynı kural:
 * hazır sembollere eşit ağırlık (1/n), toplam brüt maruziyet kaldıraç
 * tavanını aşarsa orantılı küçültme. Tek sembolde ağırlık 1 → tek varlık
 * botuyla birebir aynı. Saf fonksiyon (test edilir).
 * @param seriler [{ symbol, kapanislar }]  yalnız KAPANMIŞ günler
 * @returns [{ symbol, maruziyet, agirlikliMaruziyet, hedefNominal, hedefMiktar, sonKapanis, acikAltModel, vol, altlar }]
 */
function portfoyHedefleri(seriler, ozsermaye, ayar) {
  const a = D.ayarKur(ayar);
  const w = 1 / seriler.length;
  const sonuc = seriler.map(({ symbol, kapanislar }) => {
    let durum = D.yeniDurum(ayar), son = null;
    for (let t = 0; t < kapanislar.length; t++) { son = D.adim(durum, kapanislar.slice(0, t + 1), ayar); durum = son.durum; }
    return { symbol, maruziyet: son.maruziyet, agirlikliMaruziyet: son.maruziyet * w, sonKapanis: kapanislar[kapanislar.length - 1],
      acikAltModel: son.acikSayisi, altModel: durum.altlar.length, vol: son.vol,
      altlar: durum.altlar.map(x => ({ N: x.N, acik: x.acik, stop: x.stop })) };
  });
  const toplam = sonuc.reduce((t, x) => t + Math.abs(x.agirlikliMaruziyet), 0);
  const olcek = toplam > a.kaldiracTavani ? a.kaldiracTavani / toplam : 1;
  for (const x of sonuc) {
    x.agirlikliMaruziyet *= olcek;
    x.hedefNominal = x.agirlikliMaruziyet * ozsermaye;
    x.hedefMiktar = x.hedefNominal / x.sonKapanis;
  }
  return sonuc;
}

class DonchianBot {
  /**
   * @param yurutucu CanliYurutucu
   * @param ayar { dizin, symbol, sermayeTavani (USDT), kaydet }
   */
  constructor(yurutucu, ayar = {}) {
    this.y = yurutucu;
    this.evren = ayar.evren || null;
    this.ayar = { symbol: 'BTC/USDT:USDT', sermayeTavani: 200, ...ayar };
    this.kaydet = ayar.kaydet || (() => {});
    this.dosya = ayar.dizin ? path.join(ayar.dizin, 'donchian-bot.json') : null;
    this.durum = { calisiyor: false, sonGun: null, sonRapor: null, islemGorenler: [] };
    if (this.dosya && fs.existsSync(this.dosya)) {
      try { this.durum = { ...this.durum, ...JSON.parse(fs.readFileSync(this.dosya, 'utf8')) }; } catch { /* bozuk dosya → varsayılan */ }
    }
    this.zamanlayici = null;
  }

  _kaydetDurum() {
    if (this.dosya) fs.writeFileSync(this.dosya, JSON.stringify(this.durum, null, 2), 'utf8');
  }

  /** Kapanmış günlük mumlar (en eski → en yeni). */
  async gunlukMumlar(symbol, simdi = Date.now()) {
    return kapanmisGunlukMumlar(this.y.borsa, symbol, simdi);
  }

  /**
   * Hesapla, gerekirse emir ver. Tek sembol ya da portföy (`ayar.semboller`).
   * @param {boolean} kuru true → yalnız hesap, emir YOK
   */
  async calistir({ kuru = false, simdi = Date.now() } = {}) {
    if (!this.y.borsa) throw new Error('borsaya bağlı değil');
    let evrenRapor = null;
    if (this.evren) evrenRapor = await this.evren.guncelle(this.y.borsa, simdi, { kalici: !kuru });
    const semboller = evrenRapor ? evrenRapor.semboller : this.semboller();
    const seriler = [];
    const atlanan = [];
    for (const symbol of semboller) {
      const mumlar = await this.gunlukMumlar(symbol, simdi);
      if (mumlar.length < D.isinma(this.ayar.donchian)) { atlanan.push({ symbol, sebep: `yetersiz geçmiş: ${mumlar.length} gün` }); continue; }
      seriler.push({ symbol, kapanislar: mumlar.map(m => m.close), sonGun: mumlar[mumlar.length - 1].time });
    }
    if (!seriler.length) throw new Error(`hiçbir sembolde yeterli geçmiş yok (gereken ${D.isinma(this.ayar.donchian)} gün)`);

    const hesap = await this.y.hesap();
    const ozsermaye = Math.min(hesap.bakiye.toplam || 0, this.ayar.sermayeTavani);
    const hedefler = portfoyHedefleri(seriler, ozsermaye, this.ayar.donchian);
    // Evrenden çıkan: botun işlem yaptığı, artık evrende olmayan, pozisyonu açık sembol → hedef 0.
    const cikanlar = [];
    if (this.evren) {
      for (const symbol of this.durum.islemGorenler || []) {
        if (semboller.includes(symbol)) continue;
        const poz = (hesap.pozisyonlar || []).find(p => p.symbol === symbol);
        if (!poz || !(Math.abs(+poz.miktar) > 0)) continue;
        const kapanis = +poz.mark || +poz.giris;
        cikanlar.push(symbol);
        hedefler.push({ symbol, maruziyet: 0, agirlikliMaruziyet: 0, hedefNominal: 0, hedefMiktar: 0, sonKapanis: kapanis,
          acikAltModel: 0, altModel: 0, vol: null, altlar: [], evrendenCikti: true });
        // Kapanış verisi bayat sayılmasın: bugünün kapanışı yerine "şimdi" (hedef zaten 0, risk artmaz).
        seriler.push({ symbol, kapanislar: [kapanis], sonGun: simdi - GUN });
      }
    }

    /**
     * RİSK KATMANI (`lib/risk/`, PLAN-RISK.md) — araştırma simülasyonuyla AYNI
     * `riskUygula`. Hedefler yalnız küçülebilir: bayat veri, kill hiyerarşisi
     * (K3 mandalı yeniden başlatmayla kalkmaz), sembol/brüt tavan. Eşikler
     * `lib/risk/esikler.json` (bootstrap kalibrasyonu). Durum `data/risk-durum.json`.
     */
    const RK = require('../risk/katmanlar');
    const RD = require('../risk/durum');
    let esikler = null;
    try { esikler = require('../risk/esikler.json'); } catch { /* kalibrasyon yoksa yalnız tavanlar */ }
    // Kayıp limitleri hesabın gerçek özsermayesine göre izlenir.
    // Dosya botun veri dizininde; dizin yoksa (testler) diske yazılmaz.
    const riskDosya = this.ayar.dizin ? path.join(this.ayar.dizin, 'risk-durum.json') : null;
    let riskDurum = RD.guncelle(riskDosya ? RD.yukle(riskDosya) : RD.bos(), hesap.bakiye.toplam || 0, simdi);
    const piyasa = { _simdi: simdi };
    const hedefOran = {};
    for (const h of hedefler) {
      const seri = seriler.find(x => x.symbol === h.symbol);
      const poz = (hesap.pozisyonlar || []).find(p => p.symbol === h.symbol);
      const nominal = poz ? (poz.side === 'short' ? -1 : 1) * Math.abs(+poz.nominal || poz.miktar * (poz.mark || h.sonKapanis)) : 0;
      // Son KAPANMIŞ günün bitişi = gün başı + 1 gün.
      piyasa[h.symbol] = { mevcutOran: ozsermaye > 0 ? nominal / ozsermaye : 0, veriZamani: seri ? seri.sonGun + GUN : -Infinity };
      hedefOran[h.symbol] = h.agirlikliMaruziyet;
    }
    const risk = RK.riskUygula(hedefOran, riskDurum, piyasa, { esikler, ...(this.ayar.risk || {}) });
    riskDurum = RD.killIsle(riskDurum, risk, simdi);
    if (!kuru && riskDosya) RD.kaydet(riskDurum, riskDosya);
    for (const h of hedefler) {
      const yeni = risk.hedefler[h.symbol];
      if (yeni !== h.agirlikliMaruziyet) {
        h.riskOncesiNominal = h.hedefNominal;
        h.agirlikliMaruziyet = yeni;
        h.hedefNominal = yeni * ozsermaye;
        h.hedefMiktar = h.hedefNominal / h.sonKapanis;
      }
    }
    if (risk.kararlar.length) this.kaydet(risk.kill >= 3 ? 'ERROR' : 'WARN', `Risk katmanı: ${risk.kararlar.map(k => `${k.katman}${k.sembol ? ' ' + k.sembol.split('/')[0] : ''}: ${k.neden}`).join(' · ')}`);

    const rapor = {
      zaman: simdi, gun: new Date(Math.max(...seriler.map(x => x.sonGun))).toISOString().slice(0, 10),
      kuru, ortam: this.y.ortam, ozsermaye, atlanan, semboller: hedefler,
      evren: evrenRapor ? { ay: evrenRapor.ay, semboller: evrenRapor.semboller, eklenen: evrenRapor.eklenen, cikan: evrenRapor.cikan, bayat: evrenRapor.bayat } : null,
      evrendenKapanan: cikanlar,
      risk: { kararlar: risk.kararlar, kill: risk.kill, killNedeni: risk.killNedeni, dusus: risk.dd, carpanlar: risk.carpanlar }
    };
    // Tek sembolde alanlar düz de verilir (panel ve eski kayıtlar bunu okur).
    if (hedefler.length === 1) Object.assign(rapor, hedefler[0]);

    if (!kuru) {
      rapor.yurutme = [];
      for (const h of hedefler) {
        try {
          const r = await this.y.hedefeGetir(h.symbol, h.hedefMiktar, 'dc');
          rapor.yurutme.push({ symbol: h.symbol, net: r.net, atlandi: r.atlandi || null,
            emirler: r.emirler.map(e => ({ basarili: e.basarili, sebep: e.sebep || null, id: e.emir && e.emir.id, durum: e.emir && e.emir.durum })) });
        } catch (e) {
          rapor.yurutme.push({ symbol: h.symbol, hata: e.message });
        }
      }
      this.durum.sonGun = rapor.gun;
      // Evrende işlem gören semboller hatırlanır (çıkınca kapatılacaklar);
      // kapanışı başarılı olan çıkan sembol listeden düşer.
      const gor = new Set(this.durum.islemGorenler || []);
      for (const h of hedefler) if (h.hedefMiktar !== 0) gor.add(h.symbol);
      for (const yr of rapor.yurutme) {
        const h = hedefler.find(x => x.symbol === yr.symbol);
        if (h && h.evrendenCikti && !yr.hata && (yr.atlandi || (yr.emirler || []).every(e => e.basarili))) gor.delete(yr.symbol);
      }
      this.durum.islemGorenler = [...gor];
    }
    this.durum.sonRapor = rapor;
    this._kaydetDurum();
    const ozetMetin = hedefler.map(h => `${h.symbol.split('/')[0]} ${h.acikAltModel}/9 → ${h.hedefNominal.toFixed(2)} USDT`).join(' · ');
    this.kaydet('INFO', `Donchian ${kuru ? '(kuru) ' : ''}${rapor.gun}: ${ozetMetin}`);
    return rapor;
  }

  semboller() {
    if (this.evren) return this.evren.semboller();
    return Array.isArray(this.ayar.semboller) && this.ayar.semboller.length ? this.ayar.semboller : [this.ayar.symbol];
  }

  /** Günde bir: UTC gün değiştikten 2 dk sonra, o gün henüz çalışmadıysa. */
  async _tik() {
    if (!this.durum.calisiyor || !this.y.borsa || this.y.durum !== 'AKTIF') return;
    const simdi = Date.now();
    const dun = new Date(simdi - GUN).toISOString().slice(0, 10);
    if (this.durum.sonGun === dun) return;
    if (simdi % GUN < 2 * 60000) return;
    try { await this.calistir({ simdi }); } catch (e) { this.kaydet('ERROR', `Donchian botu: ${e.message}`); }
  }

  baslat() {
    this.durum.calisiyor = true; this._kaydetDurum();
    if (!this.zamanlayici) this.zamanlayici = setInterval(() => this._tik(), 60000);
    this.kaydet('INFO', `Donchian botu başlatıldı (${this.ayar.symbol}, sermaye tavanı ${this.ayar.sermayeTavani} USDT)`);
  }

  durdur() {
    this.durum.calisiyor = false; this._kaydetDurum();
    if (this.zamanlayici) { clearInterval(this.zamanlayici); this.zamanlayici = null; }
    this.kaydet('INFO', 'Donchian botu durduruldu (açık pozisyon KAPATILMADI — gerekirse acil durdurma)');
  }

  ozet() { return { ...this.durum, ayar: { symbol: this.semboller().join(', '), semboller: this.semboller(), sermayeTavani: this.ayar.sermayeTavani, pit: !!this.evren }, evren: this.evren ? this.evren.ozet() : null }; }
}

/** Kapanmış günlük mumlar (en eski → en yeni); oluşmakta olan gün atılır. */
async function kapanmisGunlukMumlar(borsa, symbol, simdi = Date.now(), gun = 1000) {
  const ham = await borsa.fetchOHLCV(symbol, '1d', simdi - gun * GUN, gun);
  // Denetim O6 (62.1): "kapanmış" BORSA saatiyle — Windows saati ileriyse 00:02'de dünkü mum kapanmadan kapanmış sayılıyordu.
  // ccxt timeDifference = yerel − sunucu (ms); gerçek borsada ayrıca 30 sn pay (kâğıt borsa sentetik saatle çalışır, pay yok).
  const fark = borsa && borsa.options && Number.isFinite(+borsa.options.timeDifference) ? +borsa.options.timeDifference : 0;
  const sinir = simdi - fark - (borsa && borsa.kagit ? 0 : 30000);
  return ham.filter(m => m[0] + GUN <= sinir).map(m => ({ time: m[0], open: m[1], high: m[2], low: m[3], close: m[4], volume: m[5] }));
}

/**
 * 69.3 VERİ KAPISI (saf): karar öncesi kapanmış günlük mumların makullüğü (CCXT tek sayfa döndürür; göstergeler sessizce
 * kısmi veriyle hesaplanabilir). Bakılan: en az 2 mum, son mum dünün (bayat değil), son `pencere` (30) mumda gün boşluğu yok,
 * fiyat > 0, son 3 mumun hepsi sıfır hacim değil, günlük |değişim| ≤ sicrama.
 * 69.6 (güvenlik testi O2): DÜŞÜŞ de denetlenir (günlük düşüş ≤ dusus; eskiden en çok %100 olabildiği için hiç yakalanmıyordu);
 * fiyat denetimi göstergelerin kullandığı geçmişi kapsar (fiyatPencere, varsayılan 250 mum; boşluk denetimi yine son `pencere`);
 * açılış/yüksek/düşük varsa tutarlı olmalı (hepsi > 0, low ≤ min(open, close), max(open, close) ≤ high).
 * @returns {{ gecerli: boolean, sebep: string|null }}
 */
function mumKapisi(mumlar, simdi = Date.now(), { sicrama = 3, dusus = 0.8, pencere = 30, fiyatPencere = 250, bayatGun = 2 } = {}) {
  if (!Array.isArray(mumlar) || mumlar.length < 2) return { gecerli: false, sebep: 'yeterli mum yok' };
  const son = mumlar[mumlar.length - 1];
  const yas = Math.floor(simdi / GUN) - Math.floor(son.time / GUN);
  if (yas > bayatGun) return { gecerli: false, sebep: `son mum ${yas} gün önceki (bayat)` };
  const l = mumlar.slice(-pencere);
  for (let i = 1; i < l.length; i++) {
    const fark = l[i].time - l[i - 1].time;
    if (fark !== GUN) return { gecerli: false, sebep: `${new Date(l[i - 1].time).toISOString().slice(0, 10)} sonrasında ${Math.round(fark / GUN) - 1} günlük boşluk` };
  }
  const g = (m) => new Date(m.time).toISOString().slice(0, 10);
  const f = mumlar.slice(-Math.max(pencere, fiyatPencere));
  for (let i = 0; i < f.length; i++) {
    const m = f[i];
    if (!(m.close > 0)) return { gecerli: false, sebep: 'sıfır ya da geçersiz fiyat' };
    if (m.open !== undefined || m.high !== undefined || m.low !== undefined) {
      if (!(m.open > 0) || !(m.high > 0) || !(m.low > 0)) return { gecerli: false, sebep: `${g(m)} açılış/yüksek/düşük geçersiz` };
      const pay = m.high * 1e-9;
      if (m.low > Math.min(m.open, m.close) + pay || Math.max(m.open, m.close) > m.high + pay) return { gecerli: false, sebep: `${g(m)} mum tutarsız (düşük/yüksek açılış-kapanışı kapsamıyor)` };
    }
    if (i === 0) continue;
    const o = f[i - 1].close;
    if (!(o > 0)) return { gecerli: false, sebep: 'sıfır ya da geçersiz fiyat' };
    const r = m.close / o - 1;
    if (r > sicrama) return { gecerli: false, sebep: `${g(m)} günlük %${(r * 100).toFixed(0)} değişim (şüpheli veri)` };
    if (-r > dusus) return { gecerli: false, sebep: `${g(m)} günlük %${(-r * 100).toFixed(0)} düşüş (şüpheli veri)` };
  }
  if (l.slice(-3).every(m => !(m.volume > 0))) return { gecerli: false, sebep: 'son 3 gün hacim sıfır' };
  return { gecerli: true, sebep: null };
}

module.exports = { DonchianBot, portfoyHedefleri, kapanmisGunlukMumlar, mumKapisi };
