/**
 * LİSTE KAYDI — arkadaşın coin listelerinin TARİH DAMGALI, DEĞİŞTİRİLEMEZ kaydı (seçilenler + elenenler).
 *
 * Neden: ANALIZ-TEMMUZ-LISTESI.md §6.4 — "listenin Temmuz'da yazıldığı tarih damgasıyla doğrulanamıyor; analizin en
 * büyük zaafı". Bundan sonraki listeler girildiği an kayda geçer; elenenler de kaydedilir ki seçim etkisi ölçülebilsin.
 *
 * DEPO: `data/tarama/listeler.jsonl` — YALNIZ EKLENİR. Her kayıt:
 *   { surum, no, tur: 'liste'|'duzeltme', girisZamani, kim, ..., onceki: <önceki kaydın özeti>, ozet: SHA-256(kanonik kayıt − ozet) }
 *   ilk kaydın `onceki`si 64 sıfır. Bir satırı değiştirmek o satırın özetini, silmek/sıra değiştirmek bir sonrakinin
 *   `onceki` bağını bozar → `dogrula()` hangi kayıtta bozulduğunu söyler.
 * DÜZELTME: eski kayıt silinmez/değiştirilmez; `tur:'duzeltme'` kaydı { duzelttigi, neden, degisiklik } eklenir.
 *   Etkin görünüm = liste + sırayla düzeltmeleri.
 * DIŞA AKTARIM: her kayıt `kayitlar/listeler/NNNN-<tarih>-<kaynak>.json` (depoda izlenir; kullanıcı isterse git'e işler —
 *   SUNUCU GIT KOMUTU ÇALIŞTIRMAZ). Piyasa anlık görüntüsü `kayitlar/listeler/piyasa/NNNN.json`.
 *   `esitle()`: veri dizininde kayıt yoksa / eksikse dışa aktarımdan (zincir doğrulanarak) tamamlanır — sunucu
 *   `git pull` ile listeleri alır. Çelişki (aynı no, farklı özet) → uyarı, hiçbir şey ezilmez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { dizinler, satirEkle, satirlariOku, kanonik, sha256, atomikYaz, gunStr, gecerliGun, temizMetin, klasor } = require('./ortak');
const { AGLAR } = require('./aglar');
const { KAYNAKLAR } = require('./kaynaklar');

const SIFIR = '0'.repeat(64);
const SURUM = 1;
const DURUMLAR = ['secildi', 'elendi'];

class ListeHatasi extends Error {}
const hata = (m) => { throw new ListeHatasi(m); };

function ozetHesapla(kayit) { const { ozet, ...govde } = kayit; return sha256(kanonik(govde)); }
const dosyaAdiParcasi = (s) => String(s || 'liste').toLowerCase().replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'liste';

/** Panelden gelen coin satırı → temiz satır. */
function coinSatiri(g, i) {
  if (!g || typeof g !== 'object') hata(`${i + 1}. coin satırı eksik`);
  const sembol = String(g.sembol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(sembol)) hata(`${i + 1}. satır: sembol 1–20 harf/rakam olmalı`);
  const durum = String(g.durum || 'secildi');
  if (!DURUMLAR.includes(durum)) hata(`${sembol}: durum "seçildi" ya da "elendi" olmalı`);
  let ag = g.ag ? String(g.ag).trim().toLowerCase() : null;
  if (ag && !AGLAR[ag]) hata(`${sembol}: bilinmeyen ağ ${ag}`);
  let sozlesme = g.sozlesme ? String(g.sozlesme).trim() : null;
  if (sozlesme) {
    if (!ag) hata(`${sembol}: sözleşme verildiyse ağ da seçilmeli`);
    if (AGLAR[ag].evm && !/^0x[0-9a-fA-F]{40}$/.test(sozlesme)) hata(`${sembol}: EVM sözleşmesi 0x + 40 hane olmalı`);
    if (ag === 'sol' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sozlesme)) hata(`${sembol}: Solana mint adresi base58 olmalı`);
    if (AGLAR[ag].evm) sozlesme = sozlesme.toLowerCase();
  }
  // İsteğe bağlı fiyat kaynağı (aynı sembollü farklı coin tuzağı: LIT spot = eski Litentry). Verilmezse otomatik çözülür.
  let fiyatKaynagi = null;
  if (g.fiyatKaynagi && typeof g.fiyatKaynagi === 'object') {
    const f = g.fiyatKaynagi, borsa = String(f.borsa || '').toLowerCase(), piyasa = String(f.piyasa || 'spot').toLowerCase(), s = String(f.sembol || '').toUpperCase();
    if (!['binance', 'bybit', 'okx', 'gate'].includes(borsa) || !['spot', 'perp'].includes(piyasa) || (piyasa === 'perp' && borsa !== 'binance') || !/^[A-Z0-9]{2,20}(-USDT|_USDT|USDT)$/.test(s)) hata(`${sembol}: fiyat kaynağı geçersiz`);
    fiyatKaynagi = { borsa, piyasa, sembol: s };
  }
  return { sembol, durum, not: g.not ? temizMetin(g.not, 300) : null, ag: ag || null, sozlesme: sozlesme || null, ...(fiyatKaynagi ? { fiyatKaynagi } : {}) };
}

class Listeler {
  /**
   * @param o { dizin?, disaDizin?, simdi, fiyat: () => FiyatKaynagi, piyasa: () => Piyasa, http: () => Istemci, log }
   */
  constructor(o = {}) {
    this.D = dizinler(o);
    this.simdi = o.simdi || (() => Date.now());
    this.fiyatFn = o.fiyat || null;
    this.piyasaFn = o.piyasa || null;
    this.httpFn = o.http || null;
    this.log = o.log || (() => {});
    this._kuyruk = Promise.resolve();
    this.piyasaDizin = path.join(this.D.disa, 'piyasa');
  }

  oku() { return satirlariOku(this.D.listeler); }

  /** Tek yazar: kayıt ekleme işleri sıraya girer (aynı no iki kez verilmesin). */
  _sirayla(is) { const p = this._kuyruk.then(is, is); this._kuyruk = p.catch(() => {}); return p; }

  // ── Doğrulama ────────────────────────────────────────────────────────────
  dogrula() {
    const metin = (() => { try { return fs.readFileSync(this.D.listeler, 'utf8'); } catch { return ''; } })();
    const satirlar = metin.split('\n').filter(s => s.trim());
    const hatalar = []; const kayitlar = [];
    let onceki = SIFIR;
    satirlar.forEach((s, i) => {
      const no = i + 1;
      let k;
      try { k = JSON.parse(s); } catch { hatalar.push({ no, neden: 'satır JSON değil (bozulmuş)' }); onceki = null; return; }
      kayitlar.push(k);
      if (k.no !== no) hatalar.push({ no, neden: `sıra numarası ${k.no} (beklenen ${no}) — kayıt silinmiş ya da yer değiştirmiş` });
      if (onceki !== null && k.onceki !== onceki) hatalar.push({ no, neden: 'önceki kaydın özetiyle bağ kopuk (önceki kayıt değişmiş/silinmiş)' });
      const h = ozetHesapla(k);
      if (h !== k.ozet) hatalar.push({ no, neden: 'içerik özeti tutmuyor (kayıt sonradan değiştirilmiş)' });
      if (k.tur === 'duzeltme') {
        const hedef = kayitlar.find(x => x.no === k.duzelttigi);
        if (!hedef || hedef.tur !== 'liste' || k.duzelttigi >= no) hatalar.push({ no, neden: `düzeltme geçersiz bir kayda bağlı (#${k.duzelttigi})` });
      }
      onceki = k.ozet;
    });
    // Ekler: piyasa anlık görüntüsü dosyaları (özet kayıtta)
    const ekler = [];
    for (const k of kayitlar) {
      if (!k.piyasaAnlik || !k.piyasaAnlik.sha256) continue;
      const p = this.piyasaAnlikYolu(k.no);
      let icerik = null;
      try { icerik = fs.readFileSync(p, 'utf8'); } catch { /* yok */ }
      if (icerik === null) ekler.push({ no: k.no, neden: 'piyasa anlık görüntüsü dosyası yok' });
      else if (sha256(icerik) !== k.piyasaAnlik.sha256) ekler.push({ no: k.no, neden: 'piyasa anlık görüntüsü değişmiş (özet tutmuyor)' });
    }
    // Dışa aktarım karşılaştırması (uyarı; zincir bozulması değil)
    const disa = this._disaOku();
    const disaAktarim = { eksik: [], farkli: [], fazla: [] };
    for (const k of kayitlar) { const d = disa.get(k.no); if (!d) disaAktarim.eksik.push(k.no); else if (d.ozet !== k.ozet || ozetHesapla(d) !== d.ozet) disaAktarim.farkli.push(k.no); }
    for (const no of disa.keys()) if (!kayitlar.some(k => k.no === no)) disaAktarim.fazla.push(no);
    return { gecerli: hatalar.length === 0, kayitSayisi: satirlar.length, sonOzet: kayitlar.length ? kayitlar[kayitlar.length - 1].ozet : SIFIR, hatalar, ekler, disaAktarim,
      zaman: new Date(this.simdi()).toISOString() };
  }

  // ── Dışa aktarım / eşitleme ─────────────────────────────────────────────
  disaDosyaAdi(k) { return `${String(k.no).padStart(4, '0')}-${k.tur === 'duzeltme' ? `duzeltme-${k.duzelttigi}` : `${k.tarih}-${dosyaAdiParcasi(k.kaynak)}`}.json`; }
  piyasaAnlikYolu(no) { return path.join(this.D.dizin, 'piyasa', `anlik-${String(no).padStart(4, '0')}.json`); }
  _disaOku() {
    const m = new Map();
    let dosyalar = [];
    try { dosyalar = fs.readdirSync(this.D.disa).filter(f => /^\d{4}-.+\.json$/.test(f)); } catch { return m; }
    for (const f of dosyalar) { try { const k = JSON.parse(fs.readFileSync(path.join(this.D.disa, f), 'utf8')); if (k && Number.isInteger(k.no)) m.set(k.no, k); } catch { /* bozuk dosya: karşılaştırmada "farklı/eksik" görünür */ } }
    return m;
  }
  _disaYaz(k) {
    klasor(this.D.disa);
    atomikYaz(path.join(this.D.disa, this.disaDosyaAdi(k)), JSON.stringify(k, null, 2) + '\n');
    if (k.piyasaAnlik) {
      try { const icerik = fs.readFileSync(this.piyasaAnlikYolu(k.no), 'utf8'); klasor(this.piyasaDizin); atomikYaz(path.join(this.piyasaDizin, `${String(k.no).padStart(4, '0')}.json`), icerik); } catch { /* dosya yoksa doğrulama söyler */ }
    }
  }

  /**
   * Veri dizini ↔ dışa aktarım. (1) Kayıtta olup dışa aktarımda olmayan → yazılır. (2) Dışa aktarımda olup kayıtta olmayan
   * (sunucuda `git pull` sonrası) → zincir sürekliyse sona eklenir. Çelişki → { catisma } (hiçbir şey ezilmez).
   */
  esitle() {
    const { satirlar } = this.oku();
    const disa = this._disaOku();
    for (const k of satirlar) if (!disa.has(k.no)) { try { this._disaYaz(k); } catch (e) { this.log('WARN', `liste #${k.no} dışa aktarılamadı: ${e.message}`); } }
    for (const k of satirlar) {
      const d = disa.get(k.no);
      if (d && (d.ozet !== k.ozet || ozetHesapla(d) !== d.ozet)) return { catisma: `#${k.no}: kayıt (${k.ozet.slice(0, 8)}) ile dışa aktarım (${String(d.ozet).slice(0, 8)}${ozetHesapla(d) !== d.ozet ? ', içeriği özetiyle tutmuyor' : ''}) farklı`, eklenen: 0 };
    }
    const fazla = [...disa.keys()].filter(no => no > satirlar.length).sort((a, b) => a - b);
    let onceki = satirlar.length ? satirlar[satirlar.length - 1].ozet : SIFIR, eklenen = 0;
    for (const no of fazla) {
      const k = disa.get(no);
      if (no !== satirlar.length + eklenen + 1) return { catisma: `dışa aktarımda #${no} var ama önceki kayıt eksik`, eklenen };
      if (k.onceki !== onceki || ozetHesapla(k) !== k.ozet) return { catisma: `dışa aktarımdaki #${no} zincire uymuyor`, eklenen };
      // Piyasa anlık görüntüsü de içe alınır (özet tutuyorsa).
      if (k.piyasaAnlik) {
        try { const icerik = fs.readFileSync(path.join(this.piyasaDizin, `${String(no).padStart(4, '0')}.json`), 'utf8'); if (sha256(icerik) === k.piyasaAnlik.sha256) atomikYaz(this.piyasaAnlikYolu(no), icerik); } catch { /* yoksa doğrulama söyler */ }
      }
      satirEkle(this.D.listeler, k);
      onceki = k.ozet; eklenen++;
    }
    if (eklenen) this.log('INFO', `📋 ${eklenen} liste kaydı dışa aktarımdan (kayitlar/listeler) içe alındı`);
    return { catisma: null, eklenen };
  }

  // ── Okuma: etkin görünüm ────────────────────────────────────────────────
  etkin() {
    const { satirlar } = this.oku();
    const listeler = new Map();
    for (const k of satirlar) {
      if (k.tur === 'liste') listeler.set(k.no, { ...k, duzeltmeler: [] });
      else if (k.tur === 'duzeltme' && listeler.has(k.duzelttigi)) {
        const l = listeler.get(k.duzelttigi);
        const d = k.degisiklik || {};
        const yeni = { ...l, duzeltmeler: [...l.duzeltmeler, { no: k.no, neden: k.neden, girisZamani: k.girisZamani }] };
        for (const a of ['tarih', 'kaynak', 'not']) if (d[a] !== undefined) yeni[a] = d[a];
        if (Array.isArray(d.coinler)) yeni.coinler = d.coinler;
        if (d.tarih !== undefined) yeni.geriyeDonuk = d.tarih < String(l.girisZamani).slice(0, 10) || l.geriyeDonuk;
        listeler.set(k.duzelttigi, yeni);
      }
    }
    return [...listeler.values()].sort((a, b) => b.no - a.no);
  }

  // ── Fiyat yakalama (giriş anı) ──────────────────────────────────────────
  async _fiyatlar(coinler) {
    const fiyat = this.fiyatFn ? this.fiyatFn() : null;
    const http = this.httpFn ? this.httpFn() : null;
    const out = [];
    for (const c of coinler) {
      let f = { deger: null, kaynak: null, sembol: null, zaman: null, neden: 'fiyat kaynağı yok' };
      try {
        const k = c.fiyatKaynagi || (fiyat ? await fiyat.cozumle(c.sembol) : null);
        if (k) {
          const a = await fiyat.anlik(k);
          if (a.ok) f = { deger: a.fiyat, kaynak: a.kaynak, sembol: a.sembol, zaman: new Date(this.simdi()).toISOString(), hacim24: a.hacim24 };
          else f = { deger: null, kaynak: `${k.borsa}-${k.piyasa}`, sembol: k.sembol, zaman: null, neden: a.hata };
        }
        if (f.deger === null && c.ag && c.sozlesme && AGLAR[c.ag] && AGLAR[c.ag].dex && http) {
          const d = await KAYNAKLAR.dexscreener.getir({ ag: c.ag, sozlesme: c.sozlesme }, { http });
          if (d.durum === 'ok' && d.ham.fiyat > 0) f = { deger: d.ham.fiyat, kaynak: 'dexscreener', sembol: `${c.ag}:${c.sozlesme}`, zaman: new Date(this.simdi()).toISOString(), likidite: d.ham.toplamLikidite };
          else if (f.deger === null) f = { ...f, neden: `${f.neden || ''}${f.neden ? ' · ' : ''}DEX: ${d.neden || d.hata || 'fiyat yok'}` };
        } else if (f.deger === null && !k) f = { ...f, neden: 'merkezi borsada USDT paritesi bulunamadı (ağ + sözleşme girilirse DEX fiyatı denenir)' };
      } catch (e) { f = { ...f, neden: temizMetin(e.message, 160) }; }
      out.push({ ...c, fiyat: f });
    }
    return out;
  }

  /** Yeni liste. Giriş anında fiyatlar + BTC + piyasa anlık görüntüsü çekilip kayda eklenir. */
  ekle(g, { kim = null, fiyatsiz = false } = {}) {
    return this._sirayla(async () => {
      if (!g || typeof g !== 'object') hata('liste bilgisi eksik');
      const bugun = gunStr(this.simdi());
      const tarih = g.tarih ? String(g.tarih) : bugun;
      if (!gecerliGun(tarih)) hata('tarih YYYY-AA-GG olmalı');
      if (tarih > bugun) hata('liste tarihi gelecekte olamaz');
      const kaynak = temizMetin(g.kaynak, 60) || 'arkadaş';
      if (!Array.isArray(g.coinler) || !g.coinler.length) hata('en az bir coin girilmeli');
      if (g.coinler.length > 200) hata('bir listede en çok 200 coin');
      const coinler0 = g.coinler.map(coinSatiri);
      const tekrar = coinler0.map(c => `${c.sembol}:${c.ag || ''}:${c.sozlesme || ''}`).filter((x, i, a) => a.indexOf(x) !== i);
      if (tekrar.length) hata(`aynı coin iki kez: ${tekrar[0].split(':')[0]}`);
      const coinler = fiyatsiz ? coinler0.map(c => ({ ...c, fiyat: { deger: null, neden: 'fiyat çekilmedi' } })) : await this._fiyatlar(coinler0);
      let kiyas = null, piyasaAnlik = null, piyasaIcerik = null;
      if (!fiyatsiz) {
        const fiyat = this.fiyatFn ? this.fiyatFn() : null;
        try { const b = fiyat ? await fiyat.anlik({ borsa: 'binance', piyasa: 'spot', sembol: 'BTCUSDT' }) : null; kiyas = { BTC: b && b.ok ? { deger: b.fiyat, kaynak: b.kaynak, zaman: new Date(this.simdi()).toISOString() } : { deger: null, neden: b ? b.hata : 'fiyat kaynağı yok' } }; } catch (e) { kiyas = { BTC: { deger: null, neden: temizMetin(e.message, 160) } }; }
        try {
          const p = this.piyasaFn ? await this.piyasaFn().anlikFiyatlar() : null;
          if (p) { piyasaIcerik = JSON.stringify(p); piyasaAnlik = { sha256: sha256(piyasaIcerik), n: p.n, zaman: p.zaman, kaynak: p.kaynak }; }
        } catch (e) { piyasaAnlik = null; this.log('WARN', `liste piyasa anlık görüntüsü alınamadı: ${e.message}`); }
      }
      const { satirlar } = this.oku();
      const v = this.dogrula();
      if (!v.gecerli) hata(`kayıt zinciri bozuk (#${v.hatalar[0].no}: ${v.hatalar[0].neden}) — önce sorunu inceleyin; bozuk zincire ekleme yapılmaz`);
      const no = satirlar.length + 1;
      const k = { surum: SURUM, no, tur: 'liste', tarih, girisZamani: new Date(this.simdi()).toISOString(), geriyeDonuk: tarih < bugun, kaynak,
        not: g.not ? temizMetin(g.not, 1000) : null, kim: temizMetin(kim, 80) || null, coinler, kiyas, piyasaAnlik, onceki: v.sonOzet };
      if (g.ek && typeof g.ek === 'object') k.ek = JSON.parse(JSON.stringify(g.ek));
      k.ozet = ozetHesapla(k);
      if (piyasaIcerik) atomikYaz(this.piyasaAnlikYolu(no), piyasaIcerik);
      satirEkle(this.D.listeler, k);
      try { this._disaYaz(k); } catch (e) { this.log('WARN', `liste #${no} dışa aktarılamadı: ${e.message}`); }
      this.log('SUCCESS', `📋 Liste kaydı #${no} (${tarih}, ${kaynak}): ${coinler.filter(c => c.durum === 'secildi').length} seçilen, ${coinler.filter(c => c.durum === 'elendi').length} elenen`);
      return k;
    });
  }

  /** Düzeltme kaydı: eskisi silinmez. degisiklik = { tarih?, kaynak?, not?, coinler? } (coinler verilirse listenin YENİ tam hali). */
  duzelt(g, { kim = null } = {}) {
    return this._sirayla(async () => {
      if (!g || typeof g !== 'object') hata('düzeltme bilgisi eksik');
      const neden = temizMetin(g.neden, 500);
      if (!neden || neden.length < 3) hata('düzeltmenin nedeni yazılmalı');
      const hedefNo = Number(g.duzelttigi);
      const et = this.etkin().find(l => l.no === hedefNo);
      if (!et) hata(`#${g.duzelttigi} numaralı liste kaydı yok`);
      const d = g.degisiklik && typeof g.degisiklik === 'object' ? g.degisiklik : {};
      const degisiklik = {};
      if (d.tarih !== undefined) { if (!gecerliGun(String(d.tarih)) || String(d.tarih) > gunStr(this.simdi())) hata('tarih YYYY-AA-GG olmalı ve gelecekte olamaz'); degisiklik.tarih = String(d.tarih); }
      if (d.kaynak !== undefined) degisiklik.kaynak = temizMetin(d.kaynak, 60) || 'arkadaş';
      if (d.not !== undefined) degisiklik.not = d.not ? temizMetin(d.not, 1000) : null;
      if (d.coinler !== undefined) {
        if (!Array.isArray(d.coinler) || !d.coinler.length) hata('coin listesi boş olamaz');
        const temiz = d.coinler.map(coinSatiri);
        // Önceden fiyatı yakalanmış coin fiyatını korur; yeni eklenen coinin fiyatı ŞİMDİ yakalanır (fiyat.zaman bunu gösterir).
        const eskiler = new Map((et.coinler || []).map(c => [c.sembol, c]));
        const yeniler = temiz.filter(c => !eskiler.has(c.sembol));
        const fiyatli = yeniler.length ? await this._fiyatlar(yeniler) : [];
        degisiklik.coinler = temiz.map(c => (eskiler.has(c.sembol) ? { ...c, fiyat: eskiler.get(c.sembol).fiyat } : fiyatli.find(x => x.sembol === c.sembol)));
      }
      if (!Object.keys(degisiklik).length) hata('değişiklik yok');
      const v = this.dogrula();
      if (!v.gecerli) hata(`kayıt zinciri bozuk (#${v.hatalar[0].no}) — bozuk zincire ekleme yapılmaz`);
      const no = v.kayitSayisi + 1;
      const k = { surum: SURUM, no, tur: 'duzeltme', duzelttigi: hedefNo, neden, degisiklik, girisZamani: new Date(this.simdi()).toISOString(), kim: temizMetin(kim, 80) || null, onceki: v.sonOzet };
      k.ozet = ozetHesapla(k);
      satirEkle(this.D.listeler, k);
      try { this._disaYaz(k); } catch (e) { this.log('WARN', `düzeltme #${no} dışa aktarılamadı: ${e.message}`); }
      this.log('INFO', `📋 Liste #${hedefNo} için düzeltme kaydı #${no}: ${neden}`);
      return k;
    });
  }
}

module.exports = { Listeler, ListeHatasi, ozetHesapla, SIFIR, coinSatiri, dosyaAdiParcasi };
