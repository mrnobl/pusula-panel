# Bot hesabı (Botlar › Hesap) {#hesaplar}

## Ne işe yarar {#ne-ise-yarar}

"Botun borsadaki hesabında gerçekte ne var?" Her botun **Hesap** görünümü (`#/botlar/hucum/hesap`, `#/botlar/denge/hesap`) o botun kullandığı hesabı gösterir: Kairos için **Binance demo**, Tao için **Tao kâğıt hesabı**. Hesap = bot olduğu için ayrı sekme şeridi yoktur; botu yan menüden (Botlar › Kairos / Tao) seçersiniz. Önce bağlantının sağlığı, sonra bakiye, açık pozisyonlar, bekleyen emirler ve geçmiş işlemler; altında **Binance bakiyesi** kartı ([Binance'in kendi alanları](#/kilavuz/botlar/binance-bakiyesi)).

Eskiden ayrı bir menü sayfasıydı (**Borsa hesapları**); eski `#/borsa` adresi Botlar › Kairos › Hesap'ı açar. Senin kendi hesapların (Midas, banka, kripto borsaları) burada değil, [Portföy](#/kilavuz/portfoy)'de.

## Ne zaman kullanılır {#ne-zaman}

- Botun borsada gerçekten ne yaptığını görmek için (pozisyon, emir, koruma stopu).
- Bağlantıda sorun var mı bakmak için: büyük durum rozeti ve sağlık kutuları.
- Ana sayfadaki Sistem kartında **Bot hesapları** ışığı sarı/kırmızıysa (ışığa tıklayınca bu görünüm açılır).

## Ekran {#ekran}

![Botlar › Kairos › Hesap (bakiyeler görüntüde maskeli)](ekran:hesaplar-1400)

![Geçmiş işlemler](ekran:hesaplar-tablo-1400)

![Telefon — tablolar kart olur](ekran:hesaplar-390)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Durum rozeti | **Bağlantı sağlıklı** · **Bot durdu** · **Okunamadı** · **Durduruldu** · **Kayıtlar borsayla farklı** · **Saat kaymış** · **Koruma stopu eksik** · **Kilitli** (Kairos demoda BTC ayağı **bilerek stopsuz** — eksik sayılmaz) |
| Ne oldu? / Ne yapmalı | Sorun varsa tek cümleyle ne olduğu ve ne yapacağınız (ör. "Botlar › Tao › Başlat") |
| Sayılar | Bakiye (pozisyonlar dahil) · açık pozisyon ve şu anki kâr/zararı · bekleyen emir (kaçı koruma stopu, kaçı kademe) · bu ay ödenen ücret |
| Sağlık kutuları | **Borsaya bağlı** (son okuma) · **Kayıtlar borsayla aynı** (son karşılaştırma) · **Saat doğru** (borsayla fark) · **Her pozisyonun koruma stopu var**. Yalnız borsadaki hesaplarda; kâğıt hesapta yalnız ilki |
| Kimin | Pozisyonu ya da emri kim açtı: Kairos · Tao · Elle · Acil fren |
| Şimdi | Borsanın güncel (işaret) fiyatı |
| Şu an K/Z | Açık pozisyonun şu anki kâr/zararı, USDT ve yüzde |
| Koruma stopu | Pozisyona bağlı, borsada bekleyen satış emri: **yerinde** / **yok** (vadeli pozisyonda uyarı). Fiyat zorla kapanma (tasfiye) seviyesine %10'dan yakınsa satır kırmızı ve **"zorla kapanmaya yakın"** yazar |
| Bekleyen emirler › Ne | Koruma stopu · Kademe alımı ("henüz borsaya gitmedi" = fiyat bandı dışında, bilgisayarda bekliyor) · Kâr alma · Limit / Piyasa emri |
| Geçmiş işlemler | Son 30 gün: tarih, coin, alış/satış, kimin, miktar, fiyat, tutar, ücret, kâr/zarar; fonlama satırları ayrı. Altta toplam |

Bot pozisyonuna (Kairos / Tao) tıklayınca o botun [Botlar](#/kilavuz/botlar) sayfası açılır. Tablolar masaüstünde sütun başlığına tıklayınca sıralanır; telefonda tablonun üstündeki **Sırala** seçicisini kullanın.

## Ayarlar › Bağlantılar {#anahtar}

Bir kez yapılan işler **Ayarlar › Bağlantılar**'da (eski adı Ayarlar › Borsa; adres `#/ayarlar/borsa`):

![Ayarlar › Bağlantılar](ekran:hesaplar-anahtar-1400)

1. **Demo hesap API anahtarı** katını açın. Binance → Futures → **Demo Trading** → API Management'tan aldığınız anahtarı iki alana yazın → **Anahtarları kaydet**. Anahtarlar `data/secrets.json`'a yazılır; panelde yalnız son 4 hanesi görünür. Kairos ve Tao kendi bağlantılarını kullanır; ayrıca "bağlan" gerekmez.
2. **Canlı hesap** katı: canlı API anahtarı alanları ve **Canlı hesaba bağlan** düğmesi.

> **Tehlike:** Canlı hesap yolu bilinçli olarak **kapalı**: düğme pasiftir; sunucu da ayar dosyasında bilinçli `canliIzin: true` olmadıkça canlı bağlantıyı reddeder. Bu bayrak **yalnız ayar dosyası elle düzenlenerek** açılır — veri klasöründeki `ayarlar.json` (eski kurulumda, ilk ayar kaydından önce kökteki `config.json`), Pusula yeniden başlayınca geçerli; Ayarlar sayfası onu göstermez ve değiştirmez; panelin ayar kaydı (ya da herhangi bir istek) onu yazamaz. En erken 5 Ocak 2027, canlı hesap şartları (G1–G9) sağlanınca. Canlı anahtarda **para çekme yetkisi KAPALI** olmalı.

## Başka yerlere taşınanlar {#elle-emir}

- **İşlem dökümü (CSV)** — bütün emir ve işlemler (vergi ve kayıt için): [Portföy › İşlem defteri](#/kilavuz/islem-defterim) › kaynak **Bot**. Hesap, kimin ve tarih aralığını seçip **CSV indir**; Excel'de açılır (`;` ayraçlı; tarihler sizin gününüze göre).
- **Kâğıt test hesabı** (arşivdeki kâğıt test motorunun sanal hesabı): aynı panelle [Arşiv › Kâğıt test](#/kilavuz/kagit-test)'te; kâğıt pozisyonu **Kapat** düğmesi orada.
- **Elle emir**: botlardan bağımsız tek emir (demo hesap). [Arşiv](#/kilavuz/arsiv)'de katlı: üstte bağlantı kutusu, altında form — sembol, yön, tür, miktar → **Önizle** → geçerliyse **Emri gönder**.

> **Uyarı:** Demo hesapta elle açtığınız pozisyonu bot başlamadan önce kapatın; bot tanımadığı pozisyonu görünce kendini durdurur.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Bot durdu**: bot çalışmıyor, hesap borsadan okunmuyor — botun Genel görünümünden **Başlat**.
- **Okunamadı**: ağ ya da anahtar sorunu — internet bağlantısını ve Ayarlar › Bağlantılar'daki anahtarı kontrol edin; ekran açıkken 15 sn'de bir kendiliğinden yeniden okunur.
- **Kayıtlar borsayla farklı**: Botlar › <bot> › Yönetim › **Borsayla karşılaştır**; fark sürerse bot kendini durdurur.
- **Saat kaymış** (borsayla fark 1 sn'yi aşarsa): Windows › Tarih ve saat › **Şimdi eşitle**.
- **Koruma stopu eksik**: bot sonraki çalışmasında yeniden koyar; sürerse Borsayla karşılaştır.
- **Elle emir İptal** onay ister; araştırma modunda kilitlidir.
- **Telefonda** geçmiş işlemler ilk 5 kayıtla başlar; **Tümünü gör** ile hepsi açılır.
