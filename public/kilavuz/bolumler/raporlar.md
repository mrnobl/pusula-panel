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

## Haftalık karne {#karne}

Sayfanın en üstündeki kart: **geçen haftanın** (pazartesi–pazar) tek bakışlık karnesi, **yalnız yüzdelerle**. Pazartesi 09:00'dan sonra aynı karne Telegram'a **tek mesaj** olarak gider ([Bildirimler](#/kilavuz/bildirimler) › "Haftalık karne"); eski "Gölge testler haftalık özeti" artık bu mesajın içindedir, ayrıca gelmez.

![Haftalık karne (örnek, sahte sayılar)](ekran:raporlar-karne-1400)

| Alan | Anlamı |
|---|---|
| ‹ Önceki · Sonraki › · Bu hafta (sürüyor) | Haftalar arasında gezinme. Süren hafta o ana kadarki **önizlemedir**; kayıtlı karne pazartesi sabahı yazılır |
| BTC bu hafta | Aynı haftada BTC al-tut getirisi (botların grafiğindeki BTC çizgisiyle aynı) |
| Bu hafta | Botun haftalık getirisi — Botlar grafiğindeki "bot" çizgisinin haftalık değişimi (panelden kaydedilen para yatırma / çekme getiri sayılmaz) |
| BTC'ye fark | Bot getirisi − BTC getirisi, puan olarak. Artı = bot BTC'den iyi |
| En büyük düşüş | Hafta içinde (günlük kapanışlarla) zirveden en derin iniş |
| Tepeden | Botun bugüne kadarki en yüksek değerinden şu anki uzaklığı |
| İşlem | Haftadaki dolum sayısı |
| Portföy | Portföyüm (USD endeksi) ve model portföylerin haftalık getirisi (Lydia TL) |
| Sorunlar | Karnenin hazırlandığı andaki etkin sorunlar + haftanın alarm / uyarı olayları ([Olay akışı](#/kilavuz/olay-akisi)) |
| Kairos demo kabulü · Gölge testler | İleri testin ara durumu — **hüküm değildir**; gölge satırları İleri test sayfasıyla aynı kaynaktan |
| Telegram'a giden metin | Telefona giden mesajın aynısı (tutar yok, yalnız yüzde) |

- Karne bu makinenin botlarını sayar. Telegram'a yalnız Telegram'ı dinleyen makine gönderir (eşlenmiş makine yoksa sunucu); öbür makine karnesini kaydeder ama mesaj atmaz.
- Bir bot o hafta hiç değer kaydı yazmadıysa satırında "veri yok" yazar (bot durmuştu ya da yeni kuruldu).
- Karneler `veri/karne/<pazartesi>.json` dosyalarıdır (yedeğe ve taşıma dosyasına girer).

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
