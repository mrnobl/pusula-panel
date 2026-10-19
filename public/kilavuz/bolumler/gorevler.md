# Sık görevler (adım adım) {#gorevler}

En sık yapılan işler, kısa adımlarla. Her görevin sonunda ayrıntılı bölümün bağlantısı var.

## Her sabah bakış {#her-sabah}

1. **Ana sayfa**yı açın; en üstteki **Yapman gerekenler** boş, Sistem ışıkları yeşil ve botlar "Çalışıyor" ise iş yok.
2. Yapman gerekenlerde satır varsa satıra tıklayın — ilgili ekran açılır.

Ayrıntı: [Ana sayfa](#/kilavuz/ana).

## Botu demo modunda başlatmak {#demo-baslat}

1. **Ayarlar › Bağlantılar › Demo hesap API anahtarı** → Binance Demo Trading anahtarını iki alana yazın → **Anahtarları kaydet**.
2. Demo hesapta elle açılmış pozisyon varsa kapatın.
3. **Botlar › Hücum › Yönetim** → **Hesap türü** → **demo** → onaylayın.
4. Aynı yerde **Deneme (emirsiz)** ile bugünkü planı görün.
5. **Botlar › Hücum › Genel** → **Başlat**.
6. Ertesi gün künyedeki **Son çalışma** ve **Koruma stopu** satırlarını kontrol edin.

![Botlar › Hücum › Yönetim](ekran:botlar-eylem-1400)

Ayrıntı: [Botlar › demo modunda başlatmak](#/kilavuz/botlar/demo-baslat).

## Acil durdurma {#acil-durdurma}

1. **Botlar › <bot> › Genel** → kırmızı **Acil fren** (bot çalışırken üst çubuktaki **Acil durdur** da aynı işi yapar).
2. Onayı okuyun → onaylayın. Bütün emirler iptal, pozisyonlar piyasadan kapanır, bot durur.
3. Telefondan: kırmızı **Acil durdur** → acil PIN + **DURDUR** yazın (PIN sunucuda `npm run acil-pin` ile tanımlanır).

![Acil fren düğmesi](ekran:botlar-1400)

Ayrıntı: [Botlar › Acil durdurma](#/kilavuz/botlar/acil-fren).

## Yeni liste girmek {#yeni-liste}

1. **Coin tarama › Listeler** (yalnız sunucuda).
2. Tarih (bugün), kaynak, her coin için **seçildi / elendi** (ya da **Toplu ekle** → **Satırlara dönüştür**).
3. **Listeyi kaydet**.
4. Git'e işleyin: `git add kayitlar/listeler`, `git commit -m "liste kaydı"`, `git push`.

![Yeni liste formu](ekran:listeler-1400)

Ayrıntı: [Listeler](#/kilavuz/listeler/yeni-liste).

## Telefondan açmak {#telefondan}

1. Bilgisayarda `npm run telefon`.
2. Karekodu telefonla okutun.

Ayrıntı: [Telefondan açmak](#/kilavuz/telefon).

## Portföy tutarlarını girmek {#tutarlar}

1. **Portföy › Hesaplar** → yeni hesapsa **Yeni hesap**; elinde zaten olan hisse, fon, kripto, altın ve nakit için **Varlık ekle**; sonraki alış, satış, temettü ve para giriş/çıkışı için hesap kartında **+ işlem** (geçmiş tarihli kayıt da olur).
2. Kaydedince Pano, Varlıklar ve Hedefim kendiliğinden güncellenir; Binance/OKX bakiyesi salt okuma anahtarıyla kendiliğinden gelir.
3. Model portföyün bu ayki emirlerini uyguladıysanız **Portföy › Modeller › Bu ay › Uyguladım…** hepsini tek seferde yazar.

Ayrıntı: [Portföy](#/kilavuz/portfoy).

## Bir stratejiyi backtestte denemek {#backtest}

1. **Araştırma › Stratejiler** → stratejiyi seçin → **Backtest'te aç**.
2. Sembol, zaman dilimi, tarih aralığı → **Backtest çalıştır**.
3. Getiri, al-tut farkı, Sharpe, en büyük düşüşe bakın.

Ayrıntı: [Backtest](#/kilavuz/backtest).

## TradingView betiği denemek {#pine}

**Araştırma › Pine** → **+ Yeni** → yapıştır → **Denetle** → **Kaydet** → **Backtest'te dene**. Ayrıntı: [Pine](#/kilavuz/pine).

## Telegram'ı kurmak {#telegram}

@BotFather'dan token, @userinfobot'tan chat id → **Ayarlar › Bildirimler › Telegram** → Etkinleştir → Kaydet → **Test mesajı gönder**. Ayrıntı: [Ayarlar › Bildirimler › Telegram](#/kilavuz/ayarlar/telegram).

## Verileri elle güncellemek {#veri}

**Veri › Kaynaklar** → **Bayatları güncelle**. Genelde gerekmez; gece kendiliğinden güncellenir. Ayrıntı: [Veri](#/kilavuz/veri).

## Sunucuyu güncellemek {#guncelleme}

**Kendiliğinden** (61.3'ten beri, görev kuruluysa): her gün 12:00'de yeni sürüm varsa panel değişiklikleri kurulur; bot kodu değiştiyse Telegram haber verir ve **Ayarlar › Güncelleme › Güncellemeyi kur** ile siz kurarsınız. Kurulum: [Otomatik güncelleme](#/kilavuz/kurulum/adim-22).

**Elle** (görev yoksa ya da güncelleme "elle bakılmalı" dediyse): Botu durdur → yedekle → `git pull` → `npm install` → başlat → sürümü doğrula. Ayrıntı: [Sunucuya kurulum](#/kilavuz/kurulum).
