# Raporlar {#raporlar}

## Ne işe yarar {#ne-ise-yarar}

"Dün (geçen hafta, geçen ay, geçen yıl) ne oldu?" sorusunun tek sayfalık cevabı. Her sabah 09:00'dan sonra **dünün günlük raporu**, pazartesi sabahı **geçen haftanın (pazartesi–pazar) haftalık raporu**, ayın 1'i 09:00'dan sonra **geçen ayın aylık raporu** ve 1 Ocak 09:00'dan sonra **geçen yılın yıllık raporu** kendiliğinden hazırlanır, burada arşivlenir ve kısa özeti Telegram'a gider ([Bildirimler](#/kilavuz/bildirimler) › "Günlük / haftalık rapor" — aylık ve yıllık da aynı türdedir). Aylık ve yıllık rapor günlükle **aynı içeriktir**, yalnız dönem uzundur.

Rapor üç şeyi anlatır:

- **Botlar** — Kairos ve Tao'nun hesap değeri, dönemdeki değişimi, yaptığı işlemler (alış / satış, ücret, gerçekleşen kâr/zarar) ve günün kararı.
- **Model emirleri** — model portföylerin bu ayki emirleri uygulandı mı, kaç gündür bekliyor.
- **Portföy botlarının tercihleri** — her model portföyün kâğıt hesabında bugün neyi tuttuğu (pay ile), döneme giren / çıkan hisseler ve dönemdeki işlemleri.

## Ne zaman kullanılır {#ne-zaman}

- Her sabah bir kez: Telegram'daki özet "Dikkat" diyorsa ayrıntıya bakmak için.
- Haftada bir: geçen haftayı tek ekranda görmek için.
- Ayda / yılda bir: dönemin toplam değer değişimini, ücretini ve gerçekleşen kâr/zararını görmek için (ör. vergi hazırlığı, yıllık değerlendirme).

## Ekran {#ekran}

![Günlük › Raporlar (örnek rapor, sahte sayılar)](ekran:raporlar-1400)

![Aylık rapor (örnek, sahte sayılar)](ekran:raporlar-aylik-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Günlük · Haftalık · Aylık · Yıllık · ‹ › | Rapor türü ve dönemi (gün · "… haftası" · "Ekim 2026" · "2026"); oklar aynı türün önceki / sonraki raporuna geçer |
| Botlar · değer değişimi | İki botun dönemdeki toplam değer değişimi (gerçekleşen + açık pozisyon), botların özsermaye eğrisinden |
| Bot işlemleri | Dönemdeki dolum sayısı ve ödenen ücret; fonlama ayrı tutulur |
| Gerçekleşen kâr/zarar | Dönemde kapanan pozisyonların kâr/zararı |
| Dikkat | Engel durumundaki bot, bekleyen model emri gibi senden bir şey bekleyen konular |
| Botlar tablosu | Durum (çalışıyor / durdu / ENGEL), hesap değeri, değişim, işlem sayısı, ücret, karar. **İşlemler** katında her dolum |
| Model emirleri | Durum ve bekleme günü raporun hazırlandığı anınki |
| Portföy botlarının tercihleri | Kâğıt hesap değeri ve değişimi, pozisyonlar (pay), giren / çıkan, dönemdeki işlemler |
| Telegram'a giden özet | Telefona giden metnin aynısı |

**Şimdi hazırla** (yalnız masaüstünde): seçili türde son **biten** dönemin raporunu hemen hazırlar — dün · geçen hafta · geçen ay · geçen yıl; Telegram'a göndermez.

## Uyarılar ve ne yapmalı {#uyarilar}

- Raporlar **sunucuda** hazırlanır; geliştirme bilgisayarı sunucudakileri gösterir. Sunucu 09:00'da kapalıysa rapor açılınca hazırlanır. Kaçırılan hafta ya da ay da sonradan hazırlanır; bitişinden 3 günden fazla geçtiyse Telegram'a gönderilmez, yalnız arşive yazılır (güncellemeden sonra eski ayların özetleri telefona yağmasın).
- Uzun dönemde (ay, yıl) bütün bot işlemleri sayfa sayfa okunur; rapor listesinde en son 100 işlem görünür, sayılar hepsinden hesaplanır.
- Bot değeri "—" ise botun özsermaye eğrisi henüz yok (bot hiç çalışmadı ya da kayıt okunamadı).
- Raporlar `data/raporlar/` altında JSON dosyalarıdır (git dışı); silinmez.
