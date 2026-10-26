# Pusula Doktoru {#doktor}

## Ne işe yarar {#ne-ise-yarar}

Pusula'nın sağlığına **tek sayfadan** bakmak için. Yazılım bilgisi gerekmez. Sayfa dört soruyu cevaplar:

| Soru | Sayfada |
|---|---|
| **Şu an ne bozuk?** | Teşhis kartları. Kartlar [Sorunlar](#/kilavuz/sorunlar) sayfasındaki kartların sade özetidir. Doktor'un kendi denetimlerinin kartları da buraya eklenir |
| **Bunun anlamı ne, kendiliğinden düzelir mi?** | Her kartta "Bunun anlamı" ve "Kendiliğinden düzelir mi". Düzelecekse tahmini saat de yazar |
| **Siz ne yapmalısınız?** | 1–5 adım, "Dokunmayın" uyarısı ve kılavuzdaki rehber bağlantısı |
| **Pusula bugün kendiliğinden neyi düzeltti?** | Onarım günlüğü: yeniden bağlanma, yeniden açılma, güncelleme geri alma, felaket stopunu yeniden koyma, güvenli kip … |

Doktor bir yapay zekâ ajanı **değildir**. Önceden yazılmış ve test edilmiş kurallarla çalışır. Bu sürümde yalnız **bakar ve söyler**. İki zararsız bakım işi dışında hiçbir şeyi kendisi yapmaz (bkz. [Doktor ne yapar, ne yapmaz](#/kilavuz/doktor/sinirlar)).

## Ne zaman kullanılır {#ne-zaman}

- Telegram'dan bir uyarı geldiğinde ilk bakılacak yer. Kartlar "geçer mi, ne yapmalı" sorusunu cevaplar. Ayrıntılı düğmeler (borsayla karşılaştır, güvenli kipi kaldır, sorun araçları) [Sorunlar](#/kilavuz/sorunlar) sayfasındadır.
- Sabah "gece bir şey oldu mu?" diye bakarken: üstteki **Bugün kendiliğinden düzelen** sayısına ve onarım günlüğüne bakın.
- Telefondan: sayfa telefonda da açılır ve aynı bilgiyi gösterir. Yalnız okunur, düğme yoktur.

## Ekran {#ekran}

![Sistem › Pusula Doktoru: özet ve hazır olma, teşhis kartları, onarım günlüğü (örnek veri)](ekran:doktor-1400)

![Telefonda Pusula Doktoru (örnek veri)](ekran:doktor-390)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Üst kart | Genel durum: **Her şey yolunda**, **Bakmanız iyi olur** ya da **Sizin bir adımınız gerekiyor**. Altında müdahale / dikkat / kendiliğinden geçecek kart sayısı ve bugün kendiliğinden düzelenlerin sayısı yazar |
| Hazır / Hazır değil | Pusula süreci (ne zamandır açık, denetleyiciyle mi açıldı), öz denetimin son yoklaması ve her botun durumu: **hazır**, **ENGEL**, **güvenli kip**, **bağlı değil**, **gecikti**, **durduruldu** ya da **okunamadı**. Botun son kararının ne kadar önce verildiği de yazar |
| Teşhis | Kartlar önem sırasıyla dizilir: kırmızı müdahale, sarı dikkat, mavi kendiliğinden geçecek. **Doktor** etiketli kartlar Doktor'un kendi denetimlerinden gelir. **Sorunlar sayfasında aç** aynı kartı düğmeleriyle açar |
| Kendiliğinden yapılan onarımlar | Son 1 / 7 / 30 gün. Sonuç sütununda **kendisi onardı**, **kendiliğinden düzeldi**, **koruyucu adım** (ör. güvenli kip), **olmadı — size kaldı** ya da **atlandı** yazar |
| Doktor'un kendi denetimleri | D1 konsol günlüğü, D2 geçici tatbikat artığı, D3 bayat kilit, D10 hazır olma. Her biri için durum (var / yok / bilinmiyor) ve Doktor'un ne yaptığı yazar |
| Doktor ne yapar, ne yapmaz | Aşağıdaki sınırlar ve Pusula'nın kendiliğinden yaptığı onarımların tam listesi |

## Hazır olma {#hazir}

"Hazır" demek, Pusula açık ve her **çalışan** bot karar verebilir durumda demektir. Bunun için bot borsaya bağlı olmalı, ENGEL ve güvenli kip olmamalı, son günlük çalışması da 26 saatten yeni olmalıdır. Durdurduğunuz bot hesaba katılmaz; o sizin kararınızdır.

- Hazır olmamak **hiçbir otomatik işe yol açmaz**. Pusula bu yüzden yeniden başlamaz, botu durdurmaz. Çökme ve donmayı ayrı bir bekçi yakalar.
- "Okunamadı" hiçbir zaman "hazır" sayılmaz.
- Aynı bilgi sayfa dışından da okunabilir: `/api/hazir`. Bu adres yalnız okunur; sağlık sinyali servisine bağlı değildir.

## Bakım işleri {#bakim}

Doktor'un kendiliğinden yaptığı iki iş vardır. İkisi de risk getirmez:

1. **Konsol günlüğünü döndürme (D1).** Pusula'nın ekran çıktısının yazıldığı dosya (`sunucu-konsol.log`) ve denetleyici günlüğü (`supervisor.log`) 20 MB'ı aşınca Pusula'nın bir sonraki açılışında `.1` adıyla kenara alınır. En çok 3 eski kopya tutulur. Dosya o an başka bir program tarafından açıksa iş atlanır ve sonraki açılışa kalır. Denetleyici günlüğünü Kairos demo kabul raporu da okur. Bu yüzden o dosya demo kabul bitişinden 14 gün sonrasına (2026-12-24) kadar döndürülmez.
2. **Geçici tatbikat artığını silme (D2).** Yarıda kalmış geri dönüş tatbikatı ya da kuru deneme, işletim sisteminin geçici klasöründe bir klasör bırakabilir. Doktor günde bir, **yalnız Pusula'nın açtığı** ve 24 saatten eski bu klasörleri siler. Başka hiçbir dosya ya da klasör silinmez.

**Bayat kilit (D3) yalnız raporlanır.** Bir iş yarıda kalınca kilit dosyası yerinde kalabilir. Kilidi o işin kendisi (ya da öz denetim) bir sonraki çalışmasında siler; Doktor silmez.

Bakım işleri **TR 02:30–04:30 arasında yapılmaz** (botların günlük karar saati). Yapılan her iş onarım günlüğünde görünür.

## Doktor ne yapar, ne yapmaz {#sinirlar}

**Yapar:**

- Şu an ne bozuk olduğunu, anlamını, kendiliğinden düzelip düzelmeyeceğini ve sizin ne yapmanız gerektiğini söyler.
- Pusula'nın kendiliğinden yaptığı onarımları tek listede toplar. Bunun için yeni bir kayıt yazmaz, Pusula'nın var olan kayıtlarını okur.
- Yukarıdaki iki bakım işini yapar.

**Yapmaz** (bunlar her zaman sizin kararınızdır):

- Pozisyon açmaz, kapatmaz ya da küçültmez. Emir vermez, acil durdurma yapmaz.
- ENGEL kaldırmaz, güvenli kipten çıkarmaz, "Borsayla karşılaştır" yapmaz.
- Ayar gevşetmez. Para hareketini, sapmayı ya da yatırmayı kabul etmez. Güncelleme onaylamaz.
- Kod ya da ayar dosyası yazmaz, komut penceresi açmaz, başka program kapatmaz.
- Kairos'a demo kabulü boyunca (2026-12-09'a kadar) hiçbir şey yapmaz.
- İçinde serbest çalışan bir yapay zekâ yoktur.

## Uyarılar {#uyarilar}

- Doktor'un teşhisi Sorunlar sayfasıyla aynı kaynaktan gelir. Bir kart Doktor'da varsa Sorunlar'da da vardır (Doktor'un kendi kartları hariç). Düğmeler Sorunlar sayfasındadır.
- Onarım günlüğü, Pusula'nın kayıtlarındaki belirli cümlelerden çıkarılır. Günlükten yalnız son 7 günün cümleleri taranır; olay akışı ve Doktor'un kendi kaydı 30 güne kadar görünür. Listede olmayan bir onarım yapılmamış olmayabilir. Ayrıntı için [Olay akışı](#/kilavuz/olay-akisi) ve [Günlükler](#/kilavuz/gunluk) sayfalarına bakın.
- Geliştirme bilgisayarında bu sayfa sunucunun Doktor'unu gösterir (sunucu bağlantısı kuruluysa). Sunucuya ulaşılamıyorsa bu bilgisayarın kendi durumu görünür; botlar burada çalışmaz.
- "Sorun merkezi okunamadı" yazıyorsa Doktor tam teşhis koyamıyordur. [Sorunlar](#/kilavuz/sorunlar) ve [Sağlık](#/kilavuz/saglik) sayfalarına bakın. Değişmezse "Sohbete gönder" ile geliştirme sohbetine yazın.
