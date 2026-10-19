/**
 * PORTFÖYÜM — VERİ MODELİ (sürüm 60.8, PLAN-PORTFOYUM §0 + P1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Gerçek portföyün kaydı. TEK DOSYA, YALNIZ EKLENİR: `data/portfoyum/kayit.jsonl` (git dışı). Her satır bir kayıt;
 * hiçbir kayıt silinmez ya da değiştirilmez. Durum (kurumlar, hesaplar, varlıklar, işlemler, elle fiyatlar, hedef)
 * kayıtların SIRAYLA yeniden oynatılmasıyla kurulur (`durumKur`).
 *
 * Kayıt türleri (`tur`):
 *   kurum         { id, ad }                                   kurum ekle (aracı kurum, banka, borsa…)
 *   kurum-ad      { kurum, ad }                                kurumu yeniden adlandır
 *   hesap         { id, kurum, ad, hesapTuru, para, portfoy? } hesap ekle (para = hesabın ana para birimi; bilgi amaçlı;
 *                                                              portfoy yoksa 'ben' — yeni panel F3)
 *   portfoy       { id, ad }                                   PORTFÖY (SAHİP) ekle — yeni panel F3 (PLAN-PANEL-YENI §4/1). Varsayılan
 *                                                              portföy 'ben' ("Ben") dosyada YOKTUR, her zaman vardır; eski kayıtlar ona düşer
 *   portfoy-ad    { portfoy, ad }                              portföyü yeniden adlandır ('ben' de)
 *   hesap-portfoy { hesap, portfoy }                           hesabı bir portföye bağla (ör. eşin hesabı → "Eş" portföyü); iptal edilebilir:
 *                                                              iptal edilince önceki bağ geçerli olur
 *   hesap-kapsam  { hesap, dahil }                             hesap portföy TOPLAMINA dahil mi (varsayılan evet); iptal edilebilir
 *   hesap-ad      { hesap, ad }                                hesabı yeniden adlandır
 *   hesap-kapat   { hesap, tarih }                             hesabı KAPAT (silme değil; geçmiş korunur; kapanıştan sonra işlem yok)
 *   hesap-faiz    { hesap, oran, vadeGun, stopaj, vadeBaslangic, yenile }   64.2 MEVDUAT FAİZİ ayarı (yıllık % brüt, vade gün,
 *                                                              stopaj %, ilk vadenin başladığı gün, vade sonunda yenile mi). Bir hesabın
 *                                                              ayarları vadeBaslangic sırasıyla dönemlere ayrılır; oran 0 = o günden
 *                                                              sonra faiz yok. Faiz kayıtları dosyaya YAZILMAZ: her yüklemede
 *                                                              lib/portfoyum/faiz.js biten vadelerden türetir (kimlik of-<hesap>-<vade sonu>)
 *   varlik        { id, sembol, ad, sinif, para, kaynak, kod }  varlık ekle (kaynak: yahoo | tefas | binance | altin | elle)
 *   varlik-guncelle { varlik, ad?, sinif?, kaynak?, kod? }     varlık bilgisini güncelle (para birimi DEĞİŞMEZ — geçmişi bozar)
 *   islem         { id, islem, tarih, hesap, … }               aşağıda
 *   fiyat         { id, varlik, tarih, fiyat }                 elle fiyat (fiyat kaynağı olmayan varlık ya da düzeltme)
 *   hedef         { id, duzey: 'sinif'|'varlik', agirliklar: {anahtar: yüzde}, bant, kaynak, portfoy? }   hedef dağılım
 *                                                              (portföy başına sonuncusu geçerli; portfoy yoksa 'ben' — K-F)
 *   duzeltme      { id, hedef, neden }                         TERS KAYIT: `hedef` kimlikli işlem / fiyat / hesap-kapat / hesap-faiz
 *                                                              kaydı yok sayılır (kayıt dosyada durur, ekranda "iptal" görünür).
 *                                                              hedef 'of-…' = otomatik faiz kaydı: o vadenin faizi bir daha eklenmez
 *                                                              (D.otoFaizIptal — kullanıcının sildiği otomatik faizler listesi)
 *
 * İşlem türleri (`islem`) ve alanları — her tutar KENDİ para biriminde (ana para birimi yok):
 *   acilis    hesap, tarih, varlik + adet (+ birimMaliyet isteğe bağlı)  |  hesap, tarih, para + tutar (nakit açılışı)
 *   al / sat  hesap, tarih, varlik, adet, fiyat (+ ucret)      nakit varlığın para biriminde azalır / artar
 *   temettu   hesap, tarih, varlik, tutar (+ vergi)            nakit artar; para = varlığın para birimi
 *   faiz      hesap, tarih, para, tutar (+ vergi)
 *   yatir / cek hesap, tarih, para, tutar                      DIŞ AKIŞ (getiri hesabını bozmaz — TWR)
 *   ucret     hesap, tarih, para, tutar                        saklama/hesap ücreti (getiriden düşer)
 *   transfer  hesap → hedefHesap, tarih, varlik + adet | para + tutar   hesaplar arası (maliyet lotlarıyla taşınır)
 *   bolunme   tarih, varlik, oran (ör. 2 = 1 pay → 2 pay)      bütün hesaplarda adet × oran, birim maliyet ÷ oran
 *
 * AÇILIŞ KURALI (ekranda da yazar; `ACILIS_KURALI`): açılış bakiyesi, açılış gününün SONUNDAKİ bakiyedir. Aynı hesap ve
 * aynı varlık (ya da para birimi) için açılış tarihinde ve öncesinde kaydedilen işlemler bu bakiyeye DAHİL sayılır — adedi
 * ikinci kez değiştirmez (çift sayım yok); yalnız maliyet / gerçekleşen K/Z geçmişi için kullanılır. Sonraki günlerin
 * işlemleri açılış bakiyesinin üstüne eklenir. Bir hesap+varlık için tek açılış olur (yenisi için eskisi düzeltmeyle iptal edilir).
 *
 * Denetleyici (`durumKur` kayıt düzeyi + `muhasebe` adet düzeyi): bilinmeyen kurum/hesap/varlık, kapalı hesaba (kapanış
 * tarihinden sonra) işlem, para birimi uyuşmazlığı, negatif / sıfır tutar, gelecek tarih, ikinci açılış, NEGATİF ADET
 * (hata); nakit eksiye düştü, açılış öncesi kayıtlar açılış adediyle tutarsız (uyarı).
 */
'use strict';

const PARALAR = ['USD', 'TRY', 'EUR', 'GBP'];
const PARA_SIMGE = { USD: '$', TRY: '₺', EUR: '€', GBP: '£' };
const SINIFLAR = {
  'hisse-endeks': 'Endeks / ETF', hisse: 'Hisse', tahvil: 'Tahvil', fon: 'Yatırım fonu', kripto: 'Kripto', emtia: 'Altın / emtia',
  doviz: 'Döviz', mevduat: 'Mevduat', 'tl-nakit': 'TL nakit', nakit: 'Döviz nakit', diger: 'Diğer'
};
const FIYAT_KAYNAKLARI = {
  yahoo: 'Yahoo Finance (günlük kapanış)', tefas: 'TEFAS (fon fiyatı)', binance: 'Binance (spot)',
  altin: 'Gram altın (türetilir: GC=F × USD/TRY ÷ 31,1035)', elle: 'Elle fiyat'
};
const HESAP_TURLERI = {
  'abd-araci': 'ABD aracı kurum', 'tr-banka': 'TR banka', 'bist-araci': 'BIST aracı kurum', tefas: 'Fon hesabı (TEFAS)',
  binance: 'Binance / kripto borsası', altin: 'Fiziki altın', nakit: 'Nakit', diger: 'Diğer'
};
const ISLEM_TURLERI = {
  acilis: 'Açılış bakiyesi', al: 'Alış', sat: 'Satış', temettu: 'Temettü / kupon', faiz: 'Faiz', yatir: 'Para yatırma', cek: 'Para çekme',
  transfer: 'Hesaplar arası transfer', bolunme: 'Bölünme', ucret: 'Ücret / gider'
};
const KAYIT_TURLERI = ['kurum', 'kurum-ad', 'hesap', 'hesap-ad', 'hesap-kapat', 'hesap-faiz', 'varlik', 'varlik-guncelle', 'islem', 'fiyat', 'hedef', 'duzeltme',
  'portfoy', 'portfoy-ad', 'hesap-portfoy', 'hesap-kapsam'];
/** Düzeltmeyle (ters kayıt) iptal edilebilen kayıt türleri. Kurum/hesap/varlık/portföy oluşturma iptal edilmez (işlemler/hesaplar yetim kalırdı). */
const IPTAL_EDILEBILIR = new Set(['islem', 'fiyat', 'hesap-kapat', 'hesap-faiz', 'hedef', 'hesap-portfoy', 'hesap-kapsam']);
/** Yeni panel F3: varsayılan portföy — dosyada kaydı yok, her zaman var; portföysüz eski hesaplar ve hedefler buna düşer. */
const VARSAYILAN_PORTFOY = 'ben';
const VARSAYILAN_PORTFOY_AD = 'Ben';
const PORTFOY_KIMLIK_RE = /^[a-z0-9_.-]{1,48}$/;
/** Otomatik (türetilmiş) mevduat faizi kaydının kimliği: of-<hesap>-<vade sonu> (lib/portfoyum/faiz.js). */
const OTO_FAIZ_RE = /^of-.+-\d{4}-\d{2}-\d{2}$/;
const VADE_EN_COK_GUN = 3660;

const ACILIS_KURALI = 'Açılış bakiyesi, açılış gününün SONUNDAKİ bakiyedir. Aynı hesap ve aynı varlık (ya da para birimi) için açılış tarihinde '
  + 've öncesinde kaydedilen işlemler bu bakiyeye DAHİL sayılır: adedi ikinci kez değiştirmez (çift sayım yok), yalnız maliyet ve gerçekleşen '
  + 'K/Z geçmişinde kullanılır. Sonraki günlerin işlemleri açılış bakiyesinin üstüne eklenir. Açılış GÜNÜNE tarihli bir işlemi açılış kaydından '
  + 'sonra girerseniz panel sorar: "açılıştan sonra yapıldı" derseniz bakiyeye eklenir, "açılışa dahil" derseniz eklenmez.';

const EPS = 1e-9;
const GUN_ICI_EN_COK = 999;
/** Tasarımcı paketinin gün içi sıra tabanı (Ö10): önce satış, sonra aktarım, sonra alış. */
const TASARIMCI_SIRA = { sat: 100, transfer: 200, al: 300 };
const TARIH_RE = /^\d{4}-\d{2}-\d{2}$/;
const AD_EN_COK = 120;

/**
 * Sayı çözümü (bağımsız denetim 2026-10-09: "0.125" → 125, "2.000" → 2000 hatası düzeltildi). Kurallar:
 *   · number olduğu gibi; boş → NaN.
 *   · Hem "." hem "," varsa SONDAKİ ondalık ayracıdır, diğeri binlik ("1.234,56" = 1234,56; "1,234.56" = 1234,56).
 *   · Yalnız "," → Türkçe ondalık ("1,5"; "0,125"); birden çok "," ve 3'lü gruplar → binlik ("1,234,567").
 *   · Yalnız "." → ops.nokta === 'ondalik' ise (',' ayraçlı CSV) HER ZAMAN ondalık. Değilse: "0." ile başlıyorsa ondalık;
 *     birden çok "." ve 3'lü gruplar binlik ("1.234.567"); TEK nokta + TAM 3 hane ("2.000", "1.234") BELİRSİZ → hata
 *     ("1.234 mü 1234 mü? Ondalık için virgül kullanın"); diğerleri ondalık ("1.5", "1234.56").
 * Döndürür: { deger: number|NaN, hata: metin|null }.
 */
function sayiCoz(x, ops = {}) {
  if (typeof x === 'number') return { deger: x, hata: Number.isFinite(x) ? null : 'sayı değil' };
  if (x == null) return { deger: NaN, hata: 'boş' };
  let s = String(x).trim().replace(/[\s ]/g, '');
  if (!s) return { deger: NaN, hata: 'boş' };
  const ham = s;
  const taninmadi = { deger: NaN, hata: "'" + ham + "' sayı biçimi tanınmadı" };
  const nokta = s.includes('.'), virgul = s.includes(',');
  if (nokta && virgul) {
    const ondalik = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const tam = s.slice(0, s.lastIndexOf(ondalik)), kesir = s.slice(s.lastIndexOf(ondalik) + 1);
    const grup = ondalik === ',' ? /^-?\d{1,3}(\.\d{3})*$/ : /^-?\d{1,3}(,\d{3})*$/;
    if (!grup.test(tam) || !/^\d+$/.test(kesir)) return taninmadi;
    s = tam.replace(/[.,]/g, '') + '.' + kesir;
  } else if (virgul) {
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '');
    else return taninmadi;
  } else if (nokta && ops.nokta !== 'ondalik') {
    if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
    else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
      return { deger: NaN, hata: "'" + ham + "' belirsiz: " + ham + ' mü, ' + ham.replace('.', '') + ' mü? Ondalık için virgül kullanın (ör. '
        + ham.replace('.', '') + ' ya da ' + ham.split('.')[0] + ',5); binlik ayracı yazmayın' };
    }
  }
  if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return { deger: NaN, hata: "'" + ham + "' sayı değil" };
  return { deger: Number(s), hata: null };
}
/** Sayı: number | NaN (ayrıntılı hata için sayiCoz). */
function sayi(x, ops) { return sayiCoz(x, ops).deger; }
const bosMu = (x) => x === undefined || x === null || x === '';
const metin = (x) => (x == null ? '' : String(x)).trim();

/** Geçerli takvim günü mü (YYYY-MM-DD, 30 Şubat değil). */
function tarihGecerli(s) {
  if (!TARIH_RE.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
/** Yerel (bu bilgisayarın saat dilimi) bugünün YYYY-MM-DD'si. */
function yerelGun(ms) {
  const d = new Date(ms == null ? Date.now() : ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const gunMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const msGun = (t) => new Date(t).toISOString().slice(0, 10);

/** Çift anahtarı: hesap + varlık ya da hesap + nakit para birimi. */
const ciftAnahtari = (hesap, varlikVeyaPara, nakit) => `${hesap}|${nakit ? '$' + varlikVeyaPara : varlikVeyaPara}`;

/**
 * Bir işlem kaydını sayılara çevirir (formdan / CSV'den metin gelebilir). Bilinmeyen alanlar atılır.
 * Döndürür: yeni nesne (girdi değişmez).
 */
function islemNormalle(k, ops = {}) {
  const x = { tur: 'islem', islem: metin(k.islem).toLowerCase(), tarih: metin(k.tarih) };
  for (const a of ['hesap', 'hedefHesap', 'varlik', 'not']) if (!bosMu(k[a])) x[a] = metin(k[a]);
  if (!bosMu(k.para)) x.para = metin(k.para).toUpperCase().replace(/^TL$/, 'TRY');
  const sayiHatalari = [];
  for (const a of ['adet', 'fiyat', 'tutar', 'ucret', 'vergi', 'oran', 'birimMaliyet', 'ulasanTutar']) {
    if (bosMu(k[a])) continue;
    const c = sayiCoz(k[a], ops);
    x[a] = c.deger;
    if (c.hata) sayiHatalari.push(a + ': ' + c.hata);
  }
  // Açılış GÜNÜNE tarihli işlem açılıştan SONRA mı yapıldı (true) yoksa açılış bakiyesine dahil mi (yok)? — ACILIS_KURALI
  if (k.acilisSonrasi === true || k.acilisSonrasi === 'true' || k.acilisSonrasi === '1') x.acilisSonrasi = true;
  // Tasarımcı kaydı için açık "dahil" (false) da taşınır (CSV gidiş-dönüşü; muhasebe.acilisSonrasiKumesi).
  else if ((k.acilisSonrasi === false || k.acilisSonrasi === 'false' || k.acilisSonrasi === '0') && metin(k.kaynakKayit) === 'tasarimci') x.acilisSonrasi = false;
  // Gün içi sıra (Ö10, 61.1): 0–999 tam sayı, küçük önce; boş = varsayılan (tür sırası). Geçersizse hata (aşağıda denetlenir).
  if (!bosMu(k.gunIciSira)) { const g = Number(String(k.gunIciSira).trim()); x.gunIciSira = Number.isFinite(g) ? g : NaN; }
  // Kaydın kaynağı: 'tasarimci' (Portföy › Bu ay "Uyguladım") ya da boş = elle. CSV gidiş-dönüşü için taşınır.
  if (metin(k.kaynakKayit) === 'tasarimci') x.kaynakKayit = 'tasarimci';
  // Sayı hataları kayıtla taşınır (kopyalarda kaybolmasın); hatalı kayıt zaten yazılmaz.
  if (sayiHatalari.length) x._sayiHatalari = sayiHatalari;
  if (x.not && x.not.length > 500) x.not = x.not.slice(0, 500);
  return x;
}

/** Varlık kaydı normalle. */
function varlikNormalle(k) {
  const x = { tur: 'varlik', sembol: metin(k.sembol).toUpperCase(), ad: metin(k.ad), sinif: metin(k.sinif), para: metin(k.para).toUpperCase().replace(/^TL$/, 'TRY'),
    kaynak: metin(k.kaynak) || 'elle', kod: metin(k.kod) };
  if (!x.kod && x.kaynak !== 'elle' && x.kaynak !== 'altin') x.kod = x.sembol;
  if (!x.ad) x.ad = x.sembol;
  return x;
}

/** Bir kaydın kendi içinde geçerliliği (başvurusuz denetimler). Döndürür: [mesaj]. */
function bicimDenetle(k) {
  const h = [];
  if (!k || typeof k !== 'object') return ['kayıt nesne değil'];
  if (!KAYIT_TURLERI.includes(k.tur)) return [`bilinmeyen kayıt türü '${k.tur}'`];
  const adDenetle = (ad, ne) => { if (!metin(ad)) h.push(`${ne} adı boş`); else if (metin(ad).length > AD_EN_COK) h.push(`${ne} adı ${AD_EN_COK} karakterden uzun`); };
  if (k.tur === 'kurum' || k.tur === 'kurum-ad') adDenetle(k.ad, 'kurum');
  if (k.tur === 'portfoy' || k.tur === 'portfoy-ad') adDenetle(k.ad, 'portföy');
  if (k.tur === 'portfoy-ad' && !metin(k.portfoy)) h.push('portföy seçilmedi');
  if (k.tur === 'hesap-portfoy') { if (!metin(k.hesap)) h.push('hesap seçilmedi'); if (!metin(k.portfoy)) h.push('portföy seçilmedi'); }
  if (k.tur === 'hesap-kapsam') { if (!metin(k.hesap)) h.push('hesap seçilmedi'); if (typeof k.dahil !== 'boolean') h.push('"toplama dahil" evet/hayır olmalı'); }
  if ((k.tur === 'hesap' || k.tur === 'hedef') && k.portfoy != null && !PORTFOY_KIMLIK_RE.test(String(k.portfoy))) h.push('portföy kimliği geçersiz');
  if (k.tur === 'hesap' || k.tur === 'hesap-ad') adDenetle(k.ad, 'hesap');
  if (k.tur === 'hesap') {
    if (!HESAP_TURLERI[k.hesapTuru]) h.push(`hesap türü '${k.hesapTuru}' bilinmiyor (${Object.keys(HESAP_TURLERI).join(', ')})`);
    if (!PARALAR.includes(k.para)) h.push(`para birimi '${k.para}' desteklenmiyor (${PARALAR.join(', ')})`);
  }
  if (k.tur === 'hesap-kapat' && !tarihGecerli(k.tarih)) h.push('kapanış tarihi YYYY-AA-GG olmalı');
  if (k.tur === 'hesap-faiz') {
    if (!metin(k.hesap)) h.push('hesap seçilmedi');
    if (!(Number.isFinite(k.oran) && k.oran >= 0 && k.oran <= 200)) h.push('yıllık faiz oranı 0–200 arası yüzde olmalı (ör. 42,5)');
    if (!(Number.isInteger(k.vadeGun) && k.vadeGun >= 1 && k.vadeGun <= VADE_EN_COK_GUN)) h.push(`vade 1–${VADE_EN_COK_GUN} arası tam gün olmalı (ör. 32)`);
    if (!(Number.isFinite(k.stopaj) && k.stopaj >= 0 && k.stopaj <= 100)) h.push('stopaj oranı 0–100 arası yüzde olmalı (ör. 15)');
    if (!tarihGecerli(k.vadeBaslangic)) h.push('vade başlangıcı YYYY-AA-GG olmalı');
    if (typeof k.yenile !== 'boolean') h.push('"vade sonunda yenile" evet/hayır olmalı');
  }
  if (k.tur === 'varlik') {
    if (!/^[A-Z0-9.^=\-_/:]{1,32}$/.test(k.sembol || '')) h.push('sembol 1–32 karakter: harf, rakam ve . ^ = - _ / :');
    adDenetle(k.ad, 'varlık');
    if (!SINIFLAR[k.sinif]) h.push(`sınıf '${k.sinif}' bilinmiyor`);
    if (!PARALAR.includes(k.para)) h.push(`para birimi '${k.para}' desteklenmiyor (${PARALAR.join(', ')})`);
    if (!FIYAT_KAYNAKLARI[k.kaynak]) h.push(`fiyat kaynağı '${k.kaynak}' bilinmiyor`);
    if ((k.kaynak === 'yahoo' || k.kaynak === 'tefas' || k.kaynak === 'binance') && !/^[A-Za-z0-9.^=\-]{1,24}$/.test(k.kod || '')) h.push('fiyat kaynağı kodu geçersiz (ör. QQQ, AFT, BTC)');
    if (k.kaynak === 'tefas' && k.para !== 'TRY') h.push('TEFAS fonu TRY olmalı');
    if (k.kaynak === 'altin' && k.para !== 'TRY') h.push('gram altın TRY olmalı');
    if (k.kaynak === 'binance' && k.para !== 'USD') h.push('Binance fiyatı USD (USDT) — para USD olmalı');
  }
  if (k.tur === 'varlik-guncelle') {
    if (k.ad != null) adDenetle(k.ad, 'varlık');
    if (k.sinif != null && !SINIFLAR[k.sinif]) h.push(`sınıf '${k.sinif}' bilinmiyor`);
    if (k.kaynak != null && !FIYAT_KAYNAKLARI[k.kaynak]) h.push(`fiyat kaynağı '${k.kaynak}' bilinmiyor`);
    if (k.para != null) h.push('para birimi sonradan değiştirilemez (geçmiş işlemler o birimde) — yeni varlık ekleyin');
  }
  if (k.tur === 'fiyat') {
    if (!tarihGecerli(k.tarih)) h.push('fiyat tarihi YYYY-AA-GG olmalı');
    if (!(Number.isFinite(k.fiyat) && k.fiyat > 0)) h.push('fiyat pozitif sayı olmalı');
  }
  if (k.tur === 'hedef') {
    if (!['sinif', 'varlik'].includes(k.duzey)) h.push("hedef düzeyi 'sinif' ya da 'varlik'");
    const a = k.agirliklar && typeof k.agirliklar === 'object' ? Object.entries(k.agirliklar) : null;
    if (!a || !a.length) h.push('hedef ağırlıkları boş');
    else {
      if (a.some(([, v]) => !(Number.isFinite(v) && v >= 0 && v <= 100))) h.push('her ağırlık 0–100 arası yüzde');
      const t = a.reduce((s, [, v]) => s + (Number.isFinite(v) ? v : 0), 0);
      if (Math.abs(t - 100) > 0.01) h.push(`ağırlıklar toplamı %100 olmalı (şu an %${t.toFixed(2).replace('.', ',')})`);
    }
    if (k.bant != null && !(Number.isFinite(k.bant) && k.bant >= 0 && k.bant <= 50)) h.push('sapma bandı 0–50 puan');
  }
  if (k.tur === 'duzeltme' && !metin(k.hedef)) h.push('düzeltilecek kayıt kimliği yok');
  if (k.tur === 'islem') {
    // Sayı çözüm hatası olan alan için ikinci (genel) mesaj yazılmaz.
    const sh = k._sayiHatalari || [];
    const AD = { adet: 'adet', fiyat: 'fiyat', tutar: 'tutar', ucret: 'ücret', vergi: 'vergi', oran: 'bölünme oranı', birimMaliyet: 'birim maliyet', ulasanTutar: 'ulaşan tutar' };
    const bozuk = sh.map(x => AD[x.split(':')[0]]).filter(Boolean);
    h.push(...sh, ...islemBicimDenetle(k).filter(m => !bozuk.some(b => m.startsWith(b + ' ') || m.startsWith('açılış adedi') && b === 'adet' || m.startsWith('nakit açılış tutarı') && b === 'tutar')));
  }
  return h;
}

function islemBicimDenetle(k) {
  const h = [];
  if (!ISLEM_TURLERI[k.islem]) return [`işlem türü '${k.islem}' bilinmiyor (${Object.keys(ISLEM_TURLERI).join(', ')})`];
  if (!tarihGecerli(k.tarih)) h.push('tarih YYYY-AA-GG olmalı');
  const poz = (a, ad) => { if (!(Number.isFinite(k[a]) && k[a] > 0)) h.push(`${ad} pozitif sayı olmalı`); };
  const negDegil = (a, ad) => { if (k[a] != null && !(Number.isFinite(k[a]) && k[a] >= 0)) h.push(`${ad} negatif olamaz`); };
  const varlikVar = !bosMu(k.varlik), paraVar = !bosMu(k.para);
  if (k.islem !== 'bolunme' && bosMu(k.hesap)) h.push('hesap seçilmedi');
  switch (k.islem) {
    case 'acilis':
      if (varlikVar) { if (!(Number.isFinite(k.adet) && k.adet >= 0)) h.push('açılış adedi 0 ya da pozitif olmalı'); negDegil('birimMaliyet', 'birim maliyet'); }
      else if (paraVar) { if (!Number.isFinite(k.tutar)) h.push('nakit açılış tutarı sayı olmalı'); }
      else h.push('açılış için varlık (adet) ya da para birimi (tutar) gerekli');
      break;
    case 'al': case 'sat':
      if (!varlikVar) h.push('varlık seçilmedi');
      poz('adet', 'adet'); if (!(Number.isFinite(k.fiyat) && k.fiyat >= 0)) h.push('fiyat 0 ya da pozitif sayı olmalı'); negDegil('ucret', 'ücret');
      break;
    case 'temettu':
      if (!varlikVar) h.push('varlık seçilmedi');
      poz('tutar', 'tutar'); negDegil('vergi', 'vergi');
      break;
    case 'faiz':
      if (!paraVar) h.push('para birimi seçilmedi');
      poz('tutar', 'tutar'); negDegil('vergi', 'vergi');
      break;
    case 'yatir': case 'cek': case 'ucret':
      if (!paraVar) h.push('para birimi seçilmedi');
      poz('tutar', 'tutar');
      break;
    case 'transfer':
      if (bosMu(k.hedefHesap)) h.push('hedef hesap seçilmedi');
      else if (k.hedefHesap === k.hesap) h.push('kaynak ve hedef hesap aynı');
      if (varlikVar) poz('adet', 'adet'); else if (paraVar) poz('tutar', 'tutar'); else h.push('transfer için varlık (adet) ya da para birimi (tutar) gerekli');
      // B6 (62.1): nakit transferde hedefe ULAŞAN tutar (ör. Midas → Binance: banka/kur/P2P masrafı). Boş = gönderilenle aynı.
      if (k.ulasanTutar != null) {
        if (varlikVar) h.push('ulaşan tutar yalnız nakit transferde');
        else if (!(Number.isFinite(k.ulasanTutar) && k.ulasanTutar > 0)) h.push('ulaşan tutar pozitif sayı olmalı');
        else if (Number.isFinite(k.tutar) && k.ulasanTutar > k.tutar + EPS) h.push('ulaşan tutar gönderilenden büyük olamaz (fark kur/masraf ise ulaşanı düşük yazın)');
      }
      break;
    case 'bolunme':
      if (!varlikVar) h.push('varlık seçilmedi');
      if (!(Number.isFinite(k.oran) && k.oran > 0)) h.push('bölünme oranı pozitif sayı olmalı (ör. 2 = her pay 2 pay olur; 0,5 = birleşme)');
      else if (Math.abs(k.oran - 1) < EPS) h.push('bölünme oranı 1 olamaz');
      break;
    default: break;
  }
  if (paraVar && !PARALAR.includes(k.para)) h.push(`para birimi '${k.para}' desteklenmiyor (${PARALAR.join(', ')})`);
  if (k.gunIciSira != null && !(Number.isInteger(k.gunIciSira) && k.gunIciSira >= 0 && k.gunIciSira <= GUN_ICI_EN_COK)) h.push(`aynı gün sırası 0–${GUN_ICI_EN_COK} arası tam sayı olmalı (küçük önce)`);
  if (k.dahilEdilen != null && (k.islem !== 'acilis' || !Array.isArray(k.dahilEdilen) || k.dahilEdilen.some(x => typeof x !== 'string'))) h.push('dahilEdilen yalnız açılış kaydında kimlik listesi olabilir');
  return h;
}

/**
 * Kayıtları sırayla oynatır → durum. Kayıt düzeyindeki hatalar `hatalar`a (kimlik + sıra + mesaj) yazılır; hatalı kayıt
 * DURUMA GİRMEZ. Adet hesabı `muhasebe` (lib/portfoyum/muhasebe.js) ile yapılır.
 *   ops.bugun: 'YYYY-AA-GG' (gelecek tarih denetimi)
 */
function durumKur(kayitlar, ops = {}) {
  const bugun = ops.bugun || yerelGun();
  const D = {
    kurumlar: new Map(), hesaplar: new Map(), varliklar: new Map(), islemler: [], iptalEdilen: new Map(), tumKayitlar: [],
    fiyatlar: new Map(), hedef: null, hedefGecmisi: [], hatalar: [], uyarilar: [], kimlikler: new Map(), sonSira: 0,
    faizAyarlari: new Map(), otoFaizIptal: new Map(), otoFaizler: [],
    // Yeni panel F3: portföyler (sahip katmanı) ve portföy başına hedef. D.hedef = 'ben' portföyünün hedefi (eski ekranlar için).
    portfoyler: new Map([[VARSAYILAN_PORTFOY, { id: VARSAYILAN_PORTFOY, ad: VARSAYILAN_PORTFOY_AD, varsayilan: true, olusturma: null }]]),
    hedefler: new Map()
  };
  const kucuk = (x) => metin(x).toLocaleLowerCase('tr-TR');
  const portfoyAdiVar = (ad, haric) => [...D.portfoyler.values()].some(p => p.id !== haric && kucuk(p.ad) === kucuk(ad));
  const hata = (k, mesaj, kod = 'kayit') => D.hatalar.push({ kod, id: k && k.id ? k.id : null, sira: k && k.sira, mesaj });

  // İptaller önce toplanır: bir kayıt, kendisinden SONRA eklenen düzeltmeyle iptal edilir (sıra önemli değil — düzeltme hedefi kimlikle bulunur).
  const liste = (kayitlar || []).filter(k => k && typeof k === 'object');
  for (const k of liste) if (k.sira > D.sonSira) D.sonSira = k.sira;
  const kimlikSayaci = new Map();
  for (const k of liste) if (k.id) kimlikSayaci.set(k.id, (kimlikSayaci.get(k.id) || 0) + 1);
  for (const k of liste) {
    if (k.tur !== 'duzeltme') continue;
    const b = bicimDenetle(k);
    if (b.length) { hata(k, `düzeltme: ${b.join('; ')}`); continue; }
    const hedef = liste.find(x => x.id === k.hedef);
    if (!hedef && OTO_FAIZ_RE.test(String(k.hedef))) {
      // 64.2: otomatik faiz kaydı (dosyada yok, türetilir) — silindi listesine girer; bir daha eklenmez.
      if (D.iptalEdilen.has(k.hedef)) { hata(k, `'${k.hedef}' zaten iptal edilmiş`); continue; }
      const ip = { id: k.id, neden: k.neden || '', zaman: k.zaman || null, otomatik: true };
      D.iptalEdilen.set(k.hedef, ip); D.otoFaizIptal.set(k.hedef, ip);
      continue;
    }
    if (!hedef) { hata(k, `düzeltme: '${k.hedef}' kimlikli kayıt yok`); continue; }
    if (hedef.tur === 'duzeltme') { hata(k, 'düzeltme kaydı düzeltilemez (yeni kayıt girin)'); continue; }
    if (!IPTAL_EDILEBILIR.has(hedef.tur)) { hata(k, `'${hedef.tur}' kaydı iptal edilemez (kurum/hesap/varlık kapatılır ya da adı değiştirilir)`); continue; }
    if (hedef.sira > k.sira) { hata(k, 'düzeltme, hedefinden önce eklenmiş'); continue; }
    if (D.iptalEdilen.has(k.hedef)) { hata(k, `'${k.hedef}' zaten iptal edilmiş`); continue; }
    D.iptalEdilen.set(k.hedef, { id: k.id, neden: k.neden || '', zaman: k.zaman || null });
  }

  const acilislar = new Map();   // çift → işlem kimliği
  for (const k of liste) {
    D.tumKayitlar.push(k);
    if (k.id && kimlikSayaci.get(k.id) > 1) { hata(k, `kimlik '${k.id}' birden çok kayıtta`); continue; }
    if (k.tur === 'duzeltme') continue;
    const b = bicimDenetle(k);
    if (b.length) { hata(k, b.join('; ')); continue; }
    if (D.iptalEdilen.has(k.id)) continue;   // iptal: durumu etkilemez (dosyada durur)
    switch (k.tur) {
      case 'kurum':
        D.kurumlar.set(k.id, { id: k.id, ad: metin(k.ad), olusturma: k.zaman || null, sonKayit: k.zaman || null });
        break;
      case 'kurum-ad': {
        const x = D.kurumlar.get(k.kurum);
        if (!x) { hata(k, `bilinmeyen kurum '${k.kurum}'`, 'bilinmeyen'); break; }
        x.ad = metin(k.ad);
        break;
      }
      case 'hesap': {
        if (!D.kurumlar.has(k.kurum)) { hata(k, `bilinmeyen kurum '${k.kurum}'`, 'bilinmeyen'); break; }
        const pid = k.portfoy == null ? VARSAYILAN_PORTFOY : String(k.portfoy);
        if (!D.portfoyler.has(pid)) { hata(k, `bilinmeyen portföy '${pid}'`, 'bilinmeyen'); break; }
        D.hesaplar.set(k.id, { id: k.id, kurum: k.kurum, ad: metin(k.ad), hesapTuru: k.hesapTuru, para: k.para, durum: 'acik', kapanis: null, kapanisKayit: null,
          olusturma: k.zaman || null, sonKayit: k.zaman || null, portfoy: pid, toplamaDahil: true });
        break;
      }
      case 'portfoy':
        if (k.id === VARSAYILAN_PORTFOY || D.portfoyler.has(k.id)) { hata(k, `portföy kimliği '${k.id}' kullanılıyor`, 'cift'); break; }
        if (portfoyAdiVar(k.ad)) { hata(k, `'${metin(k.ad)}' adlı portföy zaten var`, 'cift'); break; }
        D.portfoyler.set(k.id, { id: k.id, ad: metin(k.ad), varsayilan: false, olusturma: k.zaman || null });
        break;
      case 'portfoy-ad': {
        const x = D.portfoyler.get(k.portfoy);
        if (!x) { hata(k, `bilinmeyen portföy '${k.portfoy}'`, 'bilinmeyen'); break; }
        if (portfoyAdiVar(k.ad, x.id)) { hata(k, `'${metin(k.ad)}' adlı portföy zaten var`, 'cift'); break; }
        x.ad = metin(k.ad);
        break;
      }
      case 'hesap-portfoy': {
        const x = D.hesaplar.get(k.hesap);
        if (!x) { hata(k, `bilinmeyen hesap '${k.hesap}'`, 'bilinmeyen'); break; }
        if (!D.portfoyler.has(k.portfoy)) { hata(k, `bilinmeyen portföy '${k.portfoy}'`, 'bilinmeyen'); break; }
        x.portfoy = k.portfoy;
        break;
      }
      case 'hesap-kapsam': {
        const x = D.hesaplar.get(k.hesap);
        if (!x) { hata(k, `bilinmeyen hesap '${k.hesap}'`, 'bilinmeyen'); break; }
        x.toplamaDahil = k.dahil;
        break;
      }
      case 'hesap-ad': {
        const x = D.hesaplar.get(k.hesap);
        if (!x) { hata(k, `bilinmeyen hesap '${k.hesap}'`, 'bilinmeyen'); break; }
        x.ad = metin(k.ad);
        break;
      }
      case 'hesap-kapat': {
        const x = D.hesaplar.get(k.hesap);
        if (!x) { hata(k, `bilinmeyen hesap '${k.hesap}'`, 'bilinmeyen'); break; }
        if (x.durum === 'kapali') { hata(k, `hesap '${x.ad}' zaten kapalı`, 'kapali'); break; }
        if (k.tarih > bugun) { hata(k, 'kapanış tarihi gelecekte', 'tarih'); break; }
        x.durum = 'kapali'; x.kapanis = k.tarih; x.kapanisKayit = k.id;
        break;
      }
      case 'hesap-faiz': {
        const x = D.hesaplar.get(k.hesap);
        if (!x) { hata(k, `bilinmeyen hesap '${k.hesap}'`, 'bilinmeyen'); break; }
        if (k.vadeBaslangic > bugun) { hata(k, 'vade başlangıcı gelecekte — faiz yalnız başlamış vadeler için', 'tarih'); break; }
        if (!D.faizAyarlari.has(k.hesap)) D.faizAyarlari.set(k.hesap, []);
        const a = { id: k.id, hesap: k.hesap, oran: k.oran, vadeGun: k.vadeGun, stopaj: k.stopaj, vadeBaslangic: k.vadeBaslangic, yenile: k.yenile, sira: k.sira, zaman: k.zaman || null };
        const l = D.faizAyarlari.get(k.hesap);
        // Denetim 64.2: etkin (iptal edilmemiş) son ayardan DAHA ERKEN başlayan ayar reddedilir — geçmiş faizleri sessizce
        // yeniden yazmasın. Aynı gün = düzeltme (izinli). Daha erkene almak için önce mevcut ayar iptal edilir.
        const sonA = l.length ? l[l.length - 1] : null;
        if (sonA && k.vadeBaslangic < sonA.vadeBaslangic) { hata(k, `yeni faiz ayarının başlangıcı (${k.vadeBaslangic}) mevcut ayarınkinden (${sonA.vadeBaslangic}) önce — önce mevcut ayarı iptal edin (Gelişmiş › Mevduat faizi › Ayarı iptal et)`, 'faiz-erken'); break; }
        l.push(a);
        l.sort((p, q) => (p.vadeBaslangic < q.vadeBaslangic ? -1 : p.vadeBaslangic > q.vadeBaslangic ? 1 : p.sira - q.sira));
        x.faiz = l[l.length - 1];
        break;
      }
      case 'varlik': {
        const ayni = [...D.varliklar.values()].find(v => v.sembol === k.sembol && v.para === k.para);
        if (ayni) { hata(k, `${k.sembol} (${k.para}) zaten var (${ayni.id})`, 'cift'); break; }
        D.varliklar.set(k.id, { id: k.id, sembol: k.sembol, ad: metin(k.ad), sinif: k.sinif, para: k.para, kaynak: k.kaynak, kod: k.kod || '' });
        break;
      }
      case 'varlik-guncelle': {
        const x = D.varliklar.get(k.varlik);
        if (!x) { hata(k, `bilinmeyen varlık '${k.varlik}'`, 'bilinmeyen'); break; }
        // Birleşik sonuç OLUŞTURMADAKİ kurallarla denetlenir (ör. USD varlığa "gram altın" kaynağı, geçersiz Yahoo kodu).
        const yeni = { ...x };
        for (const a of ['ad', 'sinif', 'kaynak', 'kod']) if (k[a] != null) yeni[a] = metin(k[a]);
        if (k.kaynak != null && k.kod == null && ['yahoo', 'tefas', 'binance'].includes(yeni.kaynak) && !yeni.kod) yeni.kod = yeni.sembol;
        const bh = bicimDenetle({ ...yeni, tur: 'varlik' });
        if (bh.length) { hata(k, 'varlık güncellemesi: ' + bh.join('; '), 'para'); break; }
        Object.assign(x, yeni);
        break;
      }
      case 'fiyat': {
        const v = D.varliklar.get(k.varlik);
        if (!v) { hata(k, `bilinmeyen varlık '${k.varlik}'`, 'bilinmeyen'); break; }
        if (k.tarih > bugun) { hata(k, 'fiyat tarihi gelecekte', 'tarih'); break; }
        if (!D.fiyatlar.has(k.varlik)) D.fiyatlar.set(k.varlik, []);
        D.fiyatlar.get(k.varlik).push({ id: k.id, tarih: k.tarih, fiyat: k.fiyat, sira: k.sira });
        break;
      }
      case 'hedef': {
        const pid = k.portfoy == null ? VARSAYILAN_PORTFOY : String(k.portfoy);
        if (!D.portfoyler.has(pid)) { hata(k, `bilinmeyen portföy '${pid}'`, 'bilinmeyen'); break; }
        const h = { id: k.id, duzey: k.duzey, agirliklar: { ...k.agirliklar }, bant: k.bant == null ? 5 : k.bant, kaynak: k.kaynak || 'elle', zaman: k.zaman || null, portfoy: pid };
        if (h.duzey === 'sinif') { const yok = Object.keys(h.agirliklar).filter(a => !SINIFLAR[a]); if (yok.length) { hata(k, `bilinmeyen sınıf: ${yok.join(', ')}`, 'bilinmeyen'); break; } }
        if (h.duzey === 'varlik') {
          const yok = Object.keys(h.agirliklar).filter(a => !D.varliklar.has(a) && !(/^nakit:/.test(a) && PARALAR.includes(a.slice(6))));
          if (yok.length) { hata(k, `hedefte bilinmeyen varlık: ${yok.join(', ')}`, 'bilinmeyen'); break; }
        }
        D.hedefler.set(pid, h); D.hedefGecmisi.push(h);
        if (pid === VARSAYILAN_PORTFOY) D.hedef = h;
        break;
      }
      case 'islem': {
        const m = islemBaglamDenetle(k, D, bugun);
        if (m.length) { hata(k, m.join('; '), m.kod || 'kayit'); break; }
        const v = k.varlik ? D.varliklar.get(k.varlik) : null;
        const x = { ...k, para: k.para || (v ? v.para : undefined) };
        if (x.islem === 'acilis') {
          const c = v ? ciftAnahtari(x.hesap, x.varlik) : ciftAnahtari(x.hesap, x.para, true);
          if (acilislar.has(c)) { hata(k, `bu hesap ve ${v ? v.sembol : x.para} için açılış zaten var (${acilislar.get(c)}) — yenisi için eskisini düzeltmeyle iptal edin`, 'acilis'); break; }
          acilislar.set(c, x.id);
        }
        D.islemler.push(x);
        for (const hid of [x.hesap, x.hedefHesap]) { const hs = hid && D.hesaplar.get(hid); if (hs && k.zaman && (!hs.sonKayit || k.zaman > hs.sonKayit)) hs.sonKayit = k.zaman; }
        break;
      }
      default: break;
    }
  }
  // Kapalı hesap: kapanış tarihinden SONRA tarihli işlem (kapanış sonradan girildiyse de yakalanır).
  for (const hs of D.hesaplar.values()) {
    if (hs.durum !== 'kapali') continue;
    const sonra = D.islemler.filter(x => (x.hesap === hs.id || x.hedefHesap === hs.id) && x.tarih > hs.kapanis);
    for (const x of sonra) {
      const kapanisKaydi = liste.find(y => y.id === hs.kapanisKayit);
      const sucluKayit = kapanisKaydi && kapanisKaydi.sira > x.sira ? kapanisKaydi : x;
      hata(sucluKayit, `kapalı hesap '${hs.ad}' (kapanış ${hs.kapanis}): ${x.tarih} tarihli işlem kapanıştan sonra`, 'kapali');
    }
    if (sonra.length) D.islemler = D.islemler.filter(x => !sonra.includes(x));
  }
  for (const l of D.fiyatlar.values()) l.sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.sira - b.sira));
  return D;
}

/*
 * ESKİ (61.0) tasarımcı kayıtları (gunIciSira yok) bellekte de DEĞİŞTİRİLMEZ (karar Ö21, denetim 61.1 O2): gün içi sıra ve
 * açılış dahil/sonra kararı 61.0'daki gibi yalnız kendi acilisSonrasi işaretinden okunur — muhasebe.js eskiTasarimciMi /
 * acilisKarari. (61.1 ilk sürümü burada sıra türetip işareti düşürüyordu; geçmiş muhasebe sonucu sessizce değişiyordu.)
 */

/** İşlemin başvurularını (hesap, varlık, para birimi, tarih) duruma göre denetler. Döndürür: [mesaj] (+ .kod). */
function islemBaglamDenetle(k, D, bugun) {
  const h = [];
  const isaret = (kod) => { if (!h.kod) h.kod = kod; };
  if (k.tarih > bugun) { h.push(`tarih gelecekte (${k.tarih})`); isaret('tarih'); }
  const hesapDen = (id, ne) => {
    if (bosMu(id)) return;
    const hs = D.hesaplar.get(id);
    if (!hs) { h.push(`bilinmeyen ${ne} '${id}'`); isaret('bilinmeyen'); return; }
    if (hs.durum === 'kapali' && k.tarih > hs.kapanis) { h.push(`${ne} '${hs.ad}' kapalı (kapanış ${hs.kapanis}) — kapanıştan sonra işlem girilemez`); isaret('kapali'); }
  };
  hesapDen(k.hesap, 'hesap');
  hesapDen(k.hedefHesap, 'hedef hesap');
  if (!bosMu(k.varlik)) {
    const v = D.varliklar.get(k.varlik);
    if (!v) { h.push(`bilinmeyen varlık '${k.varlik}'`); isaret('bilinmeyen'); }
    else if (!bosMu(k.para) && k.para !== v.para && k.islem !== 'acilis') { h.push(`para birimi uyuşmazlığı: ${v.sembol} ${v.para}, işlem ${k.para}`); isaret('para'); }
    else if (k.islem === 'acilis' && !bosMu(k.para) && k.para !== v.para) { h.push(`para birimi uyuşmazlığı: ${v.sembol} ${v.para}, açılış ${k.para}`); isaret('para'); }
  }
  return h;
}

module.exports = {
  PARALAR, PARA_SIMGE, SINIFLAR, FIYAT_KAYNAKLARI, HESAP_TURLERI, ISLEM_TURLERI, KAYIT_TURLERI, IPTAL_EDILEBILIR, ACILIS_KURALI, EPS, GUN_ICI_EN_COK, TASARIMCI_SIRA, OTO_FAIZ_RE, VADE_EN_COK_GUN,
  VARSAYILAN_PORTFOY, VARSAYILAN_PORTFOY_AD, PORTFOY_KIMLIK_RE,
  sayi, sayiCoz, tarihGecerli, yerelGun, gunMs, msGun, ciftAnahtari, islemNormalle, varlikNormalle, bicimDenetle, durumKur
};
