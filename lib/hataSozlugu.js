/**
 * HATA SÖZLÜĞÜ (73.6, Sorun merkezi P1) — Binance hata kodlarının sade anlamı ve ciddiyet SINIFI. Saf modül: alt süreç,
 * dosya, ağ YOK. Kullananlar: lib/ozDenetim.js (emir reddi sınıflandırıcısı — hangi ret TAM KAPANMA sayar), Telegram / Sağlık
 * metinleri. 73.7–73.8 (P2) "Neden durdu?" kartı ve borsa hata metinleri de bu modülü kullanır.
 *
 * SINIFLAR:
 *   zararsiz    borsaya gitmeyen ön kontrol ya da kendiliğinden geçen durum (asgari tutar altı, fiyat bandı, sıfır miktar,
 *               geri çekilme, belirsiz/zaman aşımı). Tam kapanma SAYILMAZ (tekrarlarsa güvenli kip sayacı yakalar).
 *   dikkat      hesapta gerçek bir şey var (teminat / bakiye yetmedi, API anahtarı, pozisyon modu, stop zaten var) — kullanıcı bakar.
 *   kod-hatasi  Pusula borsaya kurala uymayan istek yolladı (ondalık, parametre, çift emir kimliği) — geliştirmeye yazılır.
 *   tehlike     koruma kurulamıyor (stop hemen tetiklenir).
 * Emir reddi TAM KAPANMASI yalnız `dikkat` + `kod-hatasi` sınıfındaki BORSA retlerinde (lib/ozDenetim.js emirRetSatiri).
 * Kaynak: envanter 2026-10-24 §2 (Binance hata kodu sözlüğü) + lib/live/yurutucu.js hataSinifi + lib/live/onKontrol.js.
 */
'use strict';

/** kod → { ton, anlam, neYapmali, gelistirme? }. `ton` = sınıf. */
const KODLAR = {
  '-1000': { ton: 'zararsiz', anlam: 'Borsa cevabı belirsiz geldi; emir gitmiş olabilir.', neYapmali: 'Pusula aynı kimlikle soruyor, kendisi çözer. Dokunmayın.' },
  '-1001': { ton: 'zararsiz', anlam: 'Borsa bağlantısı koptu; emir gitmiş olabilir.', neYapmali: 'Pusula aynı kimlikle soruyor, kendisi çözer. Dokunmayın.' },
  '-1006': { ton: 'zararsiz', anlam: 'Borsadan beklenmeyen cevap geldi.', neYapmali: 'Pusula emri sorguluyor; dokunmayın.' },
  '-1007': { ton: 'zararsiz', anlam: 'Borsa zamanında cevap vermedi.', neYapmali: 'Pusula emri sorguluyor; dokunmayın.' },
  '-1008': { ton: 'zararsiz', anlam: 'Borsa aşırı yüklü.', neYapmali: 'Pusula biraz sonra yeniden dener.' },
  '-1003': { ton: 'zararsiz', anlam: 'Borsaya çok sık istek gitti (hız sınırı).', neYapmali: 'Pusula bekliyor; paneli tekrar tekrar yenilemeyin.' },
  '-1015': { ton: 'zararsiz', anlam: 'Emir hızı sınırı.', neYapmali: 'Pusula bekliyor; kendisi sürer.' },
  '-1021': { ton: 'dikkat', anlam: 'Bilgisayar saati borsadan farklı.', neYapmali: 'Ayarlar › Saat ve dil › "Saati şimdi eşitle".' },
  '-5028': { ton: 'dikkat', anlam: 'Bilgisayar saati borsadan farklı.', neYapmali: 'Ayarlar › Saat ve dil › "Saati şimdi eşitle".' },
  '-1013': { ton: 'zararsiz', anlam: 'Emir borsa kurallarına uymadığı için verilmedi (miktar sıfır ya da fiyat yok).', neYapmali: 'Tek seferse zararsız. Sık tekrarlıyorsa hesaplama hatasıdır: geliştirme sohbetine yazın.' },
  '-1100': { ton: 'kod-hatasi', anlam: 'Pusula borsaya geçersiz bir parametre yolladı.', neYapmali: 'Botu açmadan geliştirme sohbetine olay raporuyla yazın.', gelistirme: true },
  '-1102': { ton: 'kod-hatasi', anlam: 'Pusula borsaya eksik parametreyle istek yolladı.', neYapmali: 'Botu açmadan geliştirme sohbetine olay raporuyla yazın.', gelistirme: true },
  '-1106': { ton: 'kod-hatasi', anlam: 'Pusula borsaya gereksiz bir parametre yolladı.', neYapmali: 'Botu açmadan geliştirme sohbetine olay raporuyla yazın.', gelistirme: true },
  '-1111': { ton: 'kod-hatasi', anlam: 'Miktar ya da fiyatın ondalığı borsa kuralına uymadı.', neYapmali: 'Kod hatası: botu açmayın, geliştirme sohbetine olay raporuyla yazın.', gelistirme: true },
  '-1116': { ton: 'kod-hatasi', anlam: 'Geçersiz emir türü.', neYapmali: 'Botu açmadan geliştirme sohbetine yazın.', gelistirme: true },
  '-1121': { ton: 'dikkat', anlam: 'Coin borsada bulunamadı (borsadan çıkarılmış olabilir).', neYapmali: 'Sağlık › Delist duyurularına bakın.' },
  '-2010': { ton: 'dikkat', anlam: 'Hesapta bu emir için bakiye yok.', neYapmali: 'Binance\'te elle çekim ya da işlem yaptıysanız sebep bu; değilse Botlar › Hesap görünümünde bakiyeye bakın.' },
  '-2011': { ton: 'zararsiz', anlam: 'Borsa iptal edilecek emri bulamadı.', neYapmali: 'Pusula tekrar soruyor; dokunmayın.' },
  '-2013': { ton: 'zararsiz', anlam: 'Borsa emri bulamadı.', neYapmali: 'Pusula tekrar soruyor; dokunmayın.' },
  '-2014': { ton: 'dikkat', anlam: 'API anahtarı biçimi geçersiz.', neYapmali: 'Ayarlar › Anahtarlar › anahtarı yeniden girin, "Sına".' },
  '-2015': { ton: 'dikkat', anlam: 'API anahtarı reddedildi (silinmiş, IP kısıtında sunucunun adresi yok ya da izin eksik).', neYapmali: 'Binance › API Management\'ı kontrol edin; Ayarlar › Anahtarlar › "Sına".' },
  '-2008': { ton: 'dikkat', anlam: 'API anahtarı geçersiz.', neYapmali: 'Ayarlar › Anahtarlar › anahtarı yeniden girin.' },
  '-1022': { ton: 'dikkat', anlam: 'İmza geçersiz (Secret yanlış).', neYapmali: 'Ayarlar › Anahtarlar › Secret\'ı yeniden girin.' },
  '-1002': { ton: 'dikkat', anlam: 'Bu istek için yetki yok.', neYapmali: 'Binance › API Management › izinleri kontrol edin.' },
  '-2019': { ton: 'dikkat', anlam: 'Hesapta yeni pozisyon için teminat kalmadı (açık emirler de teminat bağlar).', neYapmali: 'Botlar › Hesap görünümünde teminat oranına bakın; elle çekim yaptıysanız sebep bu.' },
  '-2021': { ton: 'tehlike', anlam: 'Fiyat zaten stop seviyesinin ötesinde; stop konamıyor.', neYapmali: 'Pozisyonu Binance\'te değerlendirin.' },
  '-2022': { ton: 'dikkat', anlam: 'Kapatılacak pozisyon borsada yok (stop zaten kapatmış olabilir).', neYapmali: 'Sağlık › mutabakata ("Borsayla karşılaştır") bakın.' },
  '-2025': { ton: 'dikkat', anlam: 'Bu coinde açık emir sınırına ulaşıldı.', neYapmali: 'Botlar › İşlemler › Bekleyen emirlere bakın.' },
  '-4003': { ton: 'zararsiz', anlam: 'Emir borsanın asgari miktarından küçük olduğu için verilmedi.', neYapmali: 'Küçük sermayede beklenen; bir şey yapmayın.' },
  '-4004': { ton: 'zararsiz', anlam: 'Emir miktarı borsanın asgarisinin altında.', neYapmali: 'Küçük sermayede beklenen; bir şey yapmayın.' },
  '-4005': { ton: 'zararsiz', anlam: 'Piyasa emri üst sınırı — emir parçalara bölünür.', neYapmali: 'Bir şey yapmayın.' },
  '-4014': { ton: 'kod-hatasi', anlam: 'Fiyat adım katı değil.', neYapmali: 'Tekrarlıyorsa geliştirme sohbetine yazın.', gelistirme: true },
  '-4023': { ton: 'kod-hatasi', anlam: 'Miktar adım katı değil.', neYapmali: 'Tekrarlıyorsa geliştirme sohbetine yazın.', gelistirme: true },
  '-4015': { ton: 'kod-hatasi', anlam: 'Aynı emir kimliği ikinci kez gönderildi.', neYapmali: 'Botu açmadan geliştirme sohbetine yazın.', gelistirme: true },
  '-4016': { ton: 'zararsiz', anlam: 'Fiyat izin verilen bandın dışında; emir verilmedi.', neYapmali: 'Tek seferse zararsız (oynak piyasa).' },
  '-4024': { ton: 'zararsiz', anlam: 'Fiyat izin verilen bandın dışında; emir verilmedi.', neYapmali: 'Tek seferse zararsız (oynak piyasa).' },
  '-4131': { ton: 'zararsiz', anlam: 'Fiyat şu anki fiyattan çok uzak olduğu için emir verilmedi; DCA bunu bekletir.', neYapmali: 'Tek seferse zararsız (oynak piyasa).' },
  '-4046': { ton: 'zararsiz', anlam: 'Değişiklik gerekmiyor (zaten bu kipte).', neYapmali: '—' },
  '-4059': { ton: 'zararsiz', anlam: 'Değişiklik gerekmiyor (zaten bu kipte).', neYapmali: '—' },
  '-4061': { ton: 'dikkat', anlam: 'Binance\'te pozisyon modu (Hedge / tek yön) değişmiş.', neYapmali: 'Binance\'te pozisyon modunu geri alın ya da geliştirme sohbetine yazın.' },
  '-4067': { ton: 'zararsiz', anlam: 'Açık emir varken kip değiştirilemedi (kip zaten doğru).', neYapmali: '—' },
  '-4120': { ton: 'dikkat', anlam: 'Stop emri yanlış uca gönderildi.', neYapmali: 'Geliştirme sohbetine yazın.' },
  '-4130': { ton: 'dikkat', anlam: 'Borsada bu coinde başka bir kapatma stopu var (elle konmuş olabilir).', neYapmali: 'Binance › Koşullu emirler\'den fazla stopu silin.' },
  '-4164': { ton: 'zararsiz', anlam: 'Emir borsanın asgari tutarının (5 USDT) altında; verilmedi.', neYapmali: 'Küçük sermayede beklenen; bir şey yapmayın.' },
  '-4171': { ton: 'zararsiz', anlam: 'Çoklu varlık modu zaten aynı.', neYapmali: '—' },
  '-5012': { ton: 'zararsiz', anlam: 'Cüzdan aktarımı sürüyor.', neYapmali: 'Sonuç bekleniyor.' },
  '-5013': { ton: 'zararsiz', anlam: 'Aktarılacak bakiye yok (acil satışta dilim küçültülür, beklenen).', neYapmali: '—' },
  MARK: { ton: 'zararsiz', anlam: 'Borsa fiyatı okunamadı; güvenlik için büyüten emir verilmedi.', neYapmali: 'Kendiliğinden geçer.' },
  GERI_CEKILME: { ton: 'zararsiz', anlam: 'Borsa beklemesi sürüyor; istek atılmadı.', neYapmali: 'Süre bitince kendisi sürer; düğmelere tekrar tekrar basmayın.' },
};

/** Saf: metindeki ilk Binance hata kodu ("code":-2019 · -4164: … · (-1111)) ya da iç kod (MARK, GERI_CEKILME) — yoksa null. */
function kodBul(metin) {
  const s = String(metin == null ? '' : metin);
  let m = s.match(/"code"\s*:\s*(-\d{3,4})\b/);
  if (m) return m[1];
  m = s.match(/(?:^|[\s(:;,"'])(-\d{4})\b/);
  if (m) return m[1];
  if (/\bMARK\b/.test(s)) return 'MARK';
  if (/GERI_CEKILME|geri çekilme/i.test(s)) return 'GERI_CEKILME';
  return null;
}

/** Saf: kod (ya da metin) → sözlük kaydı { kod, ton, anlam, neYapmali, gelistirme } | null. */
function aciklama(kodVeyaMetin) {
  const k = KODLAR[String(kodVeyaMetin)] ? String(kodVeyaMetin) : kodBul(kodVeyaMetin);
  if (!k || !KODLAR[k]) return null;
  return { kod: k, gelistirme: false, ...KODLAR[k] };
}

/**
 * Saf: bir emir reddinin sınıfı. `onKontrol` = emir borsaya HİÇ gitmedi (yürütücünün "Emir gönderilmedi" satırı).
 * Ön kontrol retleri her zaman zararsız (borsa görmedi; sık tekrar güvenli kip sayacına girer). Borsa retleri sözlüğe göre;
 * sözlükte olmayan kod ya da kodsuz kesin red → 'dikkat' (güvenlik gevşemesin).
 */
function retSinifi(kodVeyaMetin, { onKontrol = false } = {}) {
  if (onKontrol) return 'zararsiz';
  const a = aciklama(kodVeyaMetin);
  if (a) return a.ton === 'tehlike' ? 'dikkat' : a.ton;
  if (/Margin is insufficient|insufficient (balance|margin)/i.test(String(kodVeyaMetin || ''))) return 'dikkat';
  return 'dikkat';
}

/** Tam kapanma sayılan sınıflar (emir reddi). */
const TAM_KAPANMA_SINIFI = new Set(['dikkat', 'kod-hatasi']);

/**
 * Saf: günlük satırı yürütücünün EMİR satırı mı? (tek kaynak — Y-01 çift sayım düzeltmesi). Bot katmanı satırları
 * (`DCA … gönderilmedi`, `KAPANIŞ REDDEDİLDİ`, çoklu varlık aktarımı) aynı reddin kopyasıdır ya da emir değildir — sayılmaz.
 *   "[TAO] borsa: Emir gönderilmedi (…): -4131: …"   → { kaynak: 'on-kontrol', kod, sinif: 'zararsiz' }
 *   "[TAO] borsa: Emir ag-… reddedildi: binanceusdm {"code":-2019,…}" → { kaynak: 'borsa', kod: '-2019', sinif: 'dikkat' }
 * @returns null | { kaynak, kod, sinif, tamKapanma }
 */
function emirRetSatiri(m) {
  const s = String(m || '');
  const on = /\bborsa: emir gönderilmedi\b/i.test(s);
  const borsa = !on && /\bborsa: emir (?:\S+ )?reddedildi\b/i.test(s);
  if (!on && !borsa) return null;
  const govde = s.replace(/^[\s\S]*?\bborsa: emir (?:gönderilmedi(?: \([^)]*\))?|(?:\S+ )?reddedildi):?\s*/i, '');
  const kod = kodBul(govde);
  const sinif = retSinifi(kod || govde, { onKontrol: on });
  return { kaynak: on ? 'on-kontrol' : 'borsa', kod, sinif, tamKapanma: TAM_KAPANMA_SINIFI.has(sinif) };
}

/** Saf: tam kapanma metni (sayılan retlerin kodlarına göre) — "miktar ya da bakiye hesabı bozuk olabilir" tek tip metni yerine. */
function retOzeti(kayitlar) {
  const l = (kayitlar || []).filter(Boolean);
  const kodlar = [...new Set(l.map(x => x.kod).filter(Boolean))];
  const kodHatasi = l.some(x => x.sinif === 'kod-hatasi');
  const ilk = kodlar.map(k => aciklama(k)).filter(Boolean)[0];
  const ne = kodHatasi
    ? 'Kod hatası olabilir: botu açmadan geliştirme sohbetine olay raporuyla yazın.'
    : ilk ? ilk.neYapmali : 'Sağlık › Olay raporları › son dosyadaki ret satırlarına bakın.';
  return { kodlar, kodHatasi, metin: `${kodlar.length ? `kod ${kodlar.join(', ')}` : 'kodsuz ret'}${ilk ? ` — ${ilk.anlam}` : ''}`, neYapmali: ne };
}

module.exports = { KODLAR, kodBul, aciklama, retSinifi, emirRetSatiri, retOzeti, TAM_KAPANMA_SINIFI };
