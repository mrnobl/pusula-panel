# Listeler {#listeler}

## Ne işe yarar {#ne-ise-yarar}

Arkadaşınızın coin listelerinin **tarih damgalı, değiştirilemez** kaydı ve sonradan **değerlendirmesi**. Her liste girildiği an kayda geçer: seçilenler ve elenenler, o anki fiyatlar, BTC ve piyasanın anlık görüntüsü. Her kayıt bir öncekinin özetini (SHA-256) taşır; biri sonradan değiştirilirse zincir bozulur ve görünür.

## Ne zaman kullanılır {#ne-zaman}

- Arkadaşınız yeni bir liste verdiğinde — **aynı gün** girin.
- Bir listenin tarihinden bugüne seçilenler, elenenler, BTC ve piyasa nasıl gitti görmek için.

## Ekran {#ekran}

![Yeni liste formu](ekran:listeler-1400)

![Kayıtlar](ekran:listeler-kayit-1400)

![Telefon](ekran:listeler-390)

## Adım adım: yeni liste girmek {#yeni-liste}

1. **Liste tarihi** (varsayılan bugün; geçmiş tarih girilirse kayıt "geriye dönük" işaretlenir), **Kaynak** ("arkadaş") ve isteğe bağlı **Not** yazın.
2. Her coin için **Sembol** ve **Durum**: **seçildi** ya da **elendi**. Elenenleri de girin — seçimin işe yarayıp yaramadığı ancak böyle ölçülür. Ağ ve sözleşme isteğe bağlıdır (borsada olmayan coinler için).
3. Çok coin varsa **Toplu ekle** kutusuna her satıra bir coin yazın (`MET`, elenen için `-NES` ya da `NES elendi`; isterseniz `CLANKER base 0x…`) → **Satırlara dönüştür**.
4. **Listeyi kaydet**. O anki fiyatlar, BTC ve piyasa kayda eklenir; kayıt **Kayıtlar** tablosuna düşer.
5. Sunucuda kalıcı tarih damgası için git'e işleyin: [Kurulum › Adım 19](#/kilavuz/kurulum/adim-19).

> **Uyarı:** Listeleri **yalnız sunucudan** girin. İki bilgisayarda ayrı liste girilirse zincirde çelişki çıkar.

## Adım adım: hatayı düzeltmek {#duzeltme}

Kayıt değiştirilemez. Yanlış girdiyseniz satırdaki **Düzeltme ekle**: nedeni ve değişikliği yazın; eski kayıt silinmez, düzeltme yeni bir kayıt olarak eklenir. Değerlendirme düzeltmeleri sırayla uygular.

## Adım adım: değerlendirmek {#degerlendir}

1. Kaydın satırında **Değerlendir**.
2. Seçilenler / elenenler için ortalama, kırpılmış ortalama ve medyan getiri; BTC ve piyasa medyanı görünür.
3. Geçmiş bir gün için piyasa kıyası yoksa **Piyasa kıyasını hesapla** (bir kez, ~10 dk, arka planda).

> **Not:** Değerlendirme betimleyicidir: tek liste × tek dönem şanstan ayrılamaz. Giriş fiyatı başlangıç gününün açılışıdır, ücret/kayma yoktur.

## Zincir göstergesi {#zincir}

Üstteki gösterge **"zincir sağlam · N kayıt"** demeli. **Zinciri doğrula** her kaydın özetini yeniden hesaplar. "Zincir BOZUK" görürseniz: bir kayıt sonradan değiştirilmiş, silinmiş ya da sırası bozulmuş demektir — hangi kayıt olduğunu gösterge söyler. Kayıtları elle düzeltmeye çalışmayın; durumu geliştirme sohbetine iletin.

İlk kayıt Temmuz listesidir: **geriye dönük girildi (2026-10-08), tarihi doğrulanamıyor**, elenenler bilinmiyor.

## Uyarılar ve ne yapmalı {#uyarilar}

| Uyarı | Ne yapmalı |
|---|---|
| Zincir BOZUK | Kayıt dosyası elle değişmiş; düzeltmeye çalışmayın, geliştirme sohbetine iletin |
| Çelişki (dışa aktarım farklı) | İki bilgisayarda ayrı liste girilmiş olabilir; listeleri yalnız sunucudan girin |
| Piyasa dosyası değişmiş | Değerlendirmenin piyasa kıyası güvenilmez; geliştirme sohbetine iletin |
| Fiyat bulunamadı | Coin borsada yoksa ağ ve sözleşme adresini girin (DEX fiyatı alınır) |
