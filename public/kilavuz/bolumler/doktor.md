# Pusula Doktoru {#doktor}

## Ne işe yarar {#ne-ise-yarar}

Pusula'nın sağlığına **tek sayfadan** bakmak için. Yazılım bilgisi gerekmez. Sayfa dört soruyu cevaplar:

| Soru | Sayfada |
|---|---|
| **Şu an ne bozuk?** | Teşhis kartları. Kartlar [Sorunlar](#/kilavuz/sorunlar) sayfasındaki kartların sade özetidir. Doktor'un kendi denetimlerinin kartları da buraya eklenir |
| **Bunun anlamı ne, kendiliğinden düzelir mi?** | Her kartta "Bunun anlamı" ve "Kendiliğinden düzelir mi". Düzelecekse tahmini saat de yazar |
| **Siz ne yapmalısınız?** | 1–5 adım, "Dokunmayın" uyarısı ve kılavuzdaki rehber bağlantısı |
| **Pusula bugün kendiliğinden neyi düzeltti?** | Onarım günlüğü: yeniden bağlanma, yeniden açılma, güncelleme geri alma, felaket stopunu yeniden koyma, güvenli kip … |
| **Doktor neyi kendisi onarırdı / onardı?** | [Onarım motoru](#/kilavuz/doktor/onarim-motoru): ilk 7 gün gölge kipinde yalnız "şunu yapardım" der; etkin kipe yalnız siz geçirirsiniz |

Doktor bir yapay zekâ ajanı **değildir**. Önceden yazılmış ve test edilmiş kurallarla çalışır. Teşhis kısmı yalnız **bakar ve söyler**. İki zararsız bakım işi dışında kendiliğinden yapabildiği tek şey **onarım motorunun** dört küçük işidir; motor da ilk 7 gün yalnız izler (bkz. [Onarım motoru](#/kilavuz/doktor/onarim-motoru) ve [Doktor ne yapar, ne yapmaz](#/kilavuz/doktor/sinirlar)).

## Ne zaman kullanılır {#ne-zaman}

- Telegram'dan bir uyarı geldiğinde ilk bakılacak yer. Kartlar "geçer mi, ne yapmalı" sorusunu cevaplar. Ayrıntılı düğmeler (borsayla karşılaştır, güvenli kipi kaldır, sorun araçları) [Sorunlar](#/kilavuz/sorunlar) sayfasındadır.
- Sabah "gece bir şey oldu mu?" diye bakarken: üstteki **Bugün kendiliğinden düzelen** sayısına ve onarım günlüğüne bakın.
- Telefondan: sayfa telefonda da açılır ve aynı bilgiyi gösterir. Telefondaki tek düğmeler onarım motorunu **izleme kipine döndürmek** ve **kapatmaktır** (PIN gerekmez). Etkin kipe geçiş telefondan yapılamaz.
- Gölge süresi dolunca (7. gün): Telegram ve Sorunlar sayfası bir kez "gölge sonuçlarına bakıp karar verin" der. Onarım motoru bölümündeki "Şunu yapardım" listesine bakıp karar verin.

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
| Onarım motoru | Kip (**gölge** / **etkin** / **kapalı**), gölge gün sayacı, dört kural (şu an tetik var mı, neden yapmadı, son karar, sınır), **Şunu yapardım** listesi, etkin kipte yaptıkları, size devredilenler. Düğmeler: **Etkin kipe geç…** (yalnız sunucudaki panelde), **İzleme kipine dön**, **Kapat**, kural başına **Aç (PIN)** / **Kapat** — ayrıntı [Onarım motoru](#/kilavuz/doktor/onarim-motoru) |
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

## Onarım motoru {#onarim-motoru}

Doktor'un **kendiliğinden** deneyebildiği dört küçük iş. Hepsi riski artırmaz: bir şeyi yeniden dener ya da size haber ulaştırır. Pozisyona, bota, ayara dokunan hiçbiri yoktur.

| Kural | Ne zaman | Ne yapar | Sınır | Olmazsa |
|---|---|---|---|---|
| **D4 Veri kaynağını yeniden deneme** | Bir veri kaynağının son güncellemesi hata verdi ve veri bayat | Veri yöneticisine o kaynağı yeniden indirmesini söyler (veri yöneticisinin kendi bekleme kuralları geçerli) | Kaynak başına 6 saatte bir, günde en çok 3; Binance hız sınırı beklemesinde denemez | Onarım Rehberi **S-100** |
| **D5 İleriye kayıtçıyı yeniden başlatma** | Bir kayıtçı 6 saattir yazmıyor ya da bir tasfiye akışından (ör. OKX) 6 saattir satır gelmiyor | Kayıtçının kendi yeniden deneme / yeniden bağlanma yolunu bir kez çalıştırır. Botları etkilemez | Kayıtçı başına 3 saatte bir, günde en çok 2 | **S-102** |
| **D6 Yedeği yeniden deneme** | Son yedek başarısız ya da 26 saatten eski; yedek diski takılı ve boş yeri yetiyor | Her gün 05:30'da çalışan yedek komutunu bir kez daha çalıştırır | Günde 1, yalnız TR 10:00–22:00. **Varsayılan KAPALI** — isterseniz siz açarsınız | **S-105** |
| **D7 Telegram ulaşmıyorsa ikinci kanala özet** | Telegram'a gidemeyen iletiler 30 dakikadan uzun süredir bekliyor | Bekleyen iletilerin başlıklarını tek ileti olarak ikinci kanala (ntfy) gönderir. İkinci kanal kurulu değilse bir şey yapmaz | 2 saatte bir, günde en çok 6 | **S-087** |

**Kipler:**

- **Gölge (izleme)** — ilk 7 gün bu kiptedir. Doktor sorunu görünce "şunu yapardım" diye kaydeder, **hiçbir şey yapmaz**. Aynı sınırlar gölgede de geçerlidir; yani liste, etkin kipte gerçekten ne olacağını gösterir. Bir süre sonra "sonra" satırı düşer: sorun Doktor bir şey yapmadan **kendiliğinden geçti** mi, yoksa **sürüyor** muydu. 7. gün Telegram ve Sorunlar sayfası **bir kez** "gölge sonuçlarına bakıp karar verin" der. Pusula kipi **kendisi değiştirmez**.
- **Etkin** — açık kurallar sınırları içinde kendiliğinden uygulanır. Her denemenin önce / sonra durumu kaydedilir ve onarım günlüğünde görünür. Geçiş yalnız **sunucudaki panelden**: **Etkin kipe geç…** → hangi kuralların uygulanacağını ve sınırları gösteren önizleme → **ONAR** yazın → acil PIN. Telefondan etkin kipe geçilemez.
- **Kapalı** — Doktor onarım için ne izler ne yapar. Teşhis ve bakım işleri sürer.
- **İzleme kipine dön** ve **Kapat** PIN istemez ve telefondan da yapılır (güvenli yön). Kural kapatmak PIN istemez; kural açmak (ör. D6) acil PIN ister. İkisi de yalnız sunucudaki panelden.

**Ortak sınırlar** (her kural, her kip):

- TR 02:30–04:30 arası hiçbir şey yapmaz (botların karar saati). Pusula açıldıktan sonraki ilk 15 dakika ve botun günlük çalışması sürerken de yapmaz.
- Kairos'a (demo kabulü, 2026-12-09'a kadar) dokunan hiçbir şey yapmaz.
- Bir şeyi ölçemezse ("bilinmiyor") hiçbir şey yapmaz.
- Sayaçlar Pusula yeniden başlasa da korunur.
- Aynı iş art arda **3 kez** olmazsa durur ve **size devreder**: Telegram iletisi + Sorunlar'da kırmızı "Pusula Doktoru size devretti" kartı + Onarım Rehberi kart numarası. 24 saat sonra bir kez daha dener; olmazsa yine size bırakır. 24 saat sorunsuz geçerse sayaç sıfırlanır.

**Sessiz saatte yeniden başlatma kuralı yok.** Yeniden başlatmanın gerçekten çözdüğü iki durumu (bellek şişmesi, botun işinin takılması) öz denetim zaten kendisi çözüyor. Yeni kod indikten sonraki yeniden başlatma güncellemenin güvenlik adımlarını atlayacağı için, denetleyicisiz başlatılmış Pusula ise yeniden başlatılınca kapalı kalacağı için listeye alınmadı.

**Açılış yeniden denemesi:** botlar açılışta borsaya bağlanamazsa yeniden deneme beklemeleri artık ±%20 kaydırılır (hepsi aynı dakikada yüklenmesin). Kairos'ta demo kabul boyunca kaydırma yok.

## Doktor ne yapar, ne yapmaz {#sinirlar}

**Yapar:**

- Şu an ne bozuk olduğunu, anlamını, kendiliğinden düzelip düzelmeyeceğini ve sizin ne yapmanız gerektiğini söyler.
- Pusula'nın kendiliğinden yaptığı onarımları tek listede toplar. Bunun için yeni bir kayıt yazmaz, Pusula'nın var olan kayıtlarını okur.
- Yukarıdaki iki bakım işini yapar.
- Onarım motorunun dört işini — gölge kipte yalnız "yapardım" diye kaydeder, etkin kipte sınırları içinde uygular.

**Yapmaz** (bunlar her zaman sizin kararınızdır):

- Pozisyon açmaz, kapatmaz ya da küçültmez. Emir vermez, acil durdurma yapmaz.
- ENGEL kaldırmaz, güvenli kipten çıkarmaz, "Borsayla karşılaştır" yapmaz.
- Ayar gevşetmez. Para hareketini, sapmayı ya da yatırmayı kabul etmez. Canlı hesaba geçmez. Güncelleme onaylamaz.
- Devralma ya da bot taşıma yapmaz. Veri, günlük ya da yedek silmez.
- Kod ya da ayar dosyası yazmaz, komut penceresi açmaz, başka program kapatmaz. Pusula'yı yeniden başlatmaz.
- Kendi kipini değiştirmez: gölgeden etkine yalnız siz geçirirsiniz.
- Kairos'a demo kabulü boyunca (2026-12-09'a kadar) hiçbir şey yapmaz.
- İçinde serbest çalışan bir yapay zekâ yoktur.

## Uyarılar {#uyarilar}

- Doktor'un teşhisi Sorunlar sayfasıyla aynı kaynaktan gelir. Bir kart Doktor'da varsa Sorunlar'da da vardır (Doktor'un kendi kartları hariç). Düğmeler Sorunlar sayfasındadır.
- Onarım günlüğü, Pusula'nın kayıtlarındaki belirli cümlelerden çıkarılır. Günlükten yalnız son 7 günün cümleleri taranır; olay akışı ve Doktor'un kendi kaydı 30 güne kadar görünür. Listede olmayan bir onarım yapılmamış olmayabilir. Ayrıntı için [Olay akışı](#/kilavuz/olay-akisi) ve [Günlükler](#/kilavuz/gunluk) sayfalarına bakın.
- Geliştirme bilgisayarında bu sayfa sunucunun Doktor'unu gösterir (sunucu bağlantısı kuruluysa). Sunucuya ulaşılamıyorsa bu bilgisayarın kendi durumu görünür; botlar burada çalışmaz.
- "Sorun merkezi okunamadı" yazıyorsa Doktor tam teşhis koyamıyordur. [Sorunlar](#/kilavuz/sorunlar) ve [Sağlık](#/kilavuz/saglik) sayfalarına bakın. Değişmezse "Sohbete gönder" ile geliştirme sohbetine yazın.
