# Ana sayfa {#ana}

## Ne işe yarar {#ne-ise-yarar}

"Bugün bir şey yapmam gerekiyor mu, her şey yolunda mı?" sorusunun cevabı. Yukarıdan aşağıya: en üstte **Yapman gerekenler**; altında geniş **Portföyüm** kartı (Portföy › Pano'nun kısası) ve yanında **Sistem** ışıkları; en altta **Botlar** (Kairos ve Tao yan yana) ve küçük **Bu hafta** kartı (73.9 — haftanın piyasa olayları, yalnız bilgi). Grafik yoktur — grafikler [Portföy](#/kilavuz/portfoy) ve [Botlar](#/kilavuz/botlar) sayfalarındadır. Yeni bir sürüm geldiğinde en üstte bir kez ince **"bu sürümde yeni"** şeridi çıkar. **Yeni kurulumda** (kurulum programıyla, henüz kendi verin yokken) üstte kısa bir **"Botlarımızın gerçekleşmiş sonuçları"** kartı da durur — grafikli hâli ve açıklaması [Botlar](#/kilavuz/botlar/bot-performansi) sayfasında.

## Ne zaman kullanılır {#ne-zaman}

Her gün bir kez, paneli açınca. "Yapman gereken bir şey yok" yazıyor, Sistem ışıkları yeşil ve botlar "Çalışıyor" ise yapılacak bir şey yoktur.

## Ekran {#ekran}

![Ana sayfa — masaüstü](ekran:ana-1400)

![Ana sayfa — telefon](ekran:ana-390)

Telefonda kartlar alt alta durur, aynı sırayla: **Yapman gerekenler → Portföyüm → Sistem → Botlar → Bu hafta**.

Her sayfada olan **üst çubuk**: solda kırıntı ve sayfa adı (ör. "Günlük › Ana sayfa"), mod rozetleri (Araştırma modu / Telefon: izleme); sağda **Kur** (kur çevirici), **? Kılavuz** (açık ekranın kılavuz bölümü), bot çalışırken kırmızı **Acil durdur** ve tema düğmesi (koyu varsayılan). Portföy sayfalarında üst çubukta ayrıca portföy seçici (Ben / … / Tümü) ve **$ / ₺ / Gizli** seçicisi çıkar.

## Kartlar ve alanlar {#alanlar}

| Kart / alan | Anlamı |
|---|---|
| Bu sürümde yeni | İnce şerit: **Sürüm notlarını oku** · **Kılavuzu aç** · **Tamam, gördüm** (bir daha göstermez); ayrıntı [Sürüm notları](#/kilavuz/surum-notlari) |
| **Yapman gerekenler** | Yalnız sizin elinizle yapacağınız işler; aynı iş tek satır, gecikme etiketiyle. Satıra tıklayınca ilgili ekran açılır |
| **Portföyüm** | Portföy hesaplarınızın toplamı (USD), bu ayki getiri (zaman ağırlıklı), ≈ TL. Altta **Pano ›**; hedef bandı dışı varlık varsa "N varlık hedef bandı dışında ›" (Hedefim'i açar); kayıt yoksa **Hesaplar ›** |
| **Sistem sağlığı** | En üstte **öz denetim** ([Sağlık](#/kilavuz/saglik)): tamamen kapalı ya da güvenli kipteki bot, sonra sarı / kırmızı denetimler (en çok 3); sorun yoksa "37 / 37 denetim tamam". Altında beş ışık: **veri** (güncel / N kaynak güncellenemedi / bayat), **bot hesapları** (okunuyor / okunamıyor / borsaya bağlı hesap yok), **günlük** (son 24 saatte hata yok / N uyarı / N hata — [Günlükler](#/kilavuz/gunluk)), **toplam risk** (eşiklerin altında, hesap türü başına brüt kaldıraç / eşik aşıldı — izleme kipinde ve kâğıt / demo hesapta yalnız uyarı / henüz ölçülmedi — [Toplam risk](#/kilavuz/saglik/toplam-risk)), **Pusula sürümü** (kurulu / onay bekliyor / elle bakılmalı). Işığa tıklayınca ilgili sayfa açılır (Sağlık · Veri · Botlar › Kairos › Hesap · Günlükler · Ayarlar › Güncelleme); altta **Sağlık sayfasını aç →** |
| **Botlar** | Kairos ve Tao yan yana: büyük durum (Çalışıyor / Durdu / Durduruldu — onay bekliyor), hesap türü (kâğıt / Binance demo — canlı hesap değil). Sağ üstte **Ayrıntı ve yönetim: Botlar ›** |
| Hesap değeri | Botun hesabındaki toplam (USDT, pozisyonlar dahil) |
| Başlangıçtan | Botun başladığı günden bu yana getiri; parantezde aynı dönemde BTC al-tut |
| Son karar | Botun son günlük kararı (üstüne gelince son çalışma zamanı) |
| Koruma stopu | Borsada bekleyen koruma emirleri ("N pozisyon korunuyor"; kâğıtta gerekmez) |
| Ne yapmalı | Yalnız bot durduysa ya da onay bekliyorsa: ör. "Botlar › Tao › Başlat" |
| **Bu hafta** | Bu haftanın (pazartesi–pazar) piyasa olayları: FOMC faiz kararı, TÜFE (Türkiye, ABD), BIST bilanço son günleri, elle eklenen kilit açılımları; açıklananların altında sonucu ("Fed politika faizini … sabit bıraktı", "TÜFE … aylık +%…"). Bu haftanın kalan olayı yoksa (ör. hafta sonu) altında **Gelecek hafta** da yazar. Yalnız bilgi — botların kararına girmez. Altta **Piyasa bağlamı →** ([ayrıntı](#/kilavuz/piyasa-baglami)) |

Model portföylerin kartı Ana sayfada yoktur: modellerin yapılacak işi (bu ayki emirler, ay sonu listesi) **Yapman gerekenler**'de yazar, ayrıntısı [Portföy](#/kilavuz/portfoy)'de. Modeller satırının altındaki **Portföy botları** bağlantıları (Nova · Lydia · Simurg) her modelin kâğıt hesabını bot sayfası olarak açar ([Portföy botları](#/kilavuz/portfoy-botlari)).

> **Not:** Portföy hesaplarındaki tutarlar elle girilir; Binance/OKX borsa bakiyeleri salt okuma anahtarıyla Portföy toplamına kendiliğinden katılır. Model portföyler sanaldır (canlı hesap değil). Bot hesapları (kâğıt/demo) portföy toplamına katılmaz.

## Yapman gerekenler listesinde neler çıkar {#yapilacaklar}

- **Bot durduruldu — onayınızı bekliyor:** [Botlar › Durduruldu bandı](#/kilavuz/botlar/durduruldu).
- **Çalışan bot 26 saattir çalışmadı:** bilgisayar kapalı kalmış ya da sunucu durmuş olabilir; [Kurulum › Botların sağlığı](#/kilavuz/kurulum/adim-13).
- **Teminat uyarısı / koruma stopu konamadı / tetiklendi:** [Botlar](#/kilavuz/botlar/uyarilar).
- **Model "DUR" verdi:** simülasyonun alarm eşiği aşıldı; [İleri test](#/kilavuz/ileri-test).
- **N modelin bu ayki emirleri Midas'a girilmedi** (tek satır, en uzun gecikme etiketiyle; 3 günü geçince kırmızı): modelin **Bu ay** kartındaki emirleri ([ayrıntı](#/kilavuz/tasarimci)) aracı kurumda girin, sonra **Uyguladım**.
- **Ay sonu listesi hazır** (emir beklemiyorsa): yeni karar alındı, uygulama günü gelmedi.
- **Simurg: Kairos payı bant dışında:** QQQ ↔ Binance dengeleme.
- **Pusula X kurulmayı bekliyor / güncellemeye elle bakılmalı:** [Ayarlar › Güncelleme](#/kilavuz/ayarlar/guncelleme).
- **Portföyüne hesap ve varlıklarını gir (Portföy › Hesaplar) / N varlık hedef bandının dışında (Portföy › Hedefim):** [Portföy](#/kilavuz/portfoy).

**Burada çıkmayanlar (62.8):** coin tarama notları ([Coin tarama](#/kilavuz/coin-tarama) — menüdeki kırmızı sayı), veri kaynağı hataları ve bayat veri ([Veri](#/kilavuz/veri) — Sistem kartında ışık), kararda eksik veri ([Model portföyler](#/kilavuz/model-portfoy)). Bunlar sizden bir şey beklemez.

## Adım adım: ay sonu listesini uygulamak {#tutar-guncelle}

1. Yapman gerekenlerde **Midas'a girilmedi** ya da **Ay sonu listesi hazır** satırına basın — Portföy › Modeller o modelle açılır.
2. Modelin **Bu ay** kartında listeyi okuyun; aracı kurumda emirleri uygulama günü girin, sonra **Uyguladım**.
3. **Uyguladım** yaptığınız alım/satımları portföy kayıtlarına yazar (gerekirse [Portföy](#/kilavuz/portfoy) › Hesaplar'da düzeltin); Ana sayfadaki Portföyüm toplamı güncellenir.

## Uyarılar ve ne yapmalı {#uyarilar}

> **Uyarı:** Yapman gerekenlerde "26 saattir çalışmadı" görüyorsanız (yalnız çalışan bot için çıkar) ve bot sunucuda çalışıyorsa, bilgisayarın açık olduğundan ve PusulaBot görevinin çalıştığından emin olun ([Kurulum › Bilinen risk](#/kilavuz/kurulum/bilinen-risk)).

Bu bilgisayar araştırma modundaysa (başlıkta turuncu rozet) Botlar kartı bu bilgisayardaki eski kayıtları gösterir; asıl durum sunucudaki paneldedir.
