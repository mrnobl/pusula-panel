# Tatbikatlar {#tatbikat}

## Ne işe yarar {#ne-ise-yarar}

Bir şeyin bozulduğu anı **bilerek** canlandırıp botun doğru davrandığını görmek. Pusula her tatbikatı adım adım yönetir:

1. **Amaç** — bu prova neyi gösterir.
2. **Önkoşullar** — Pusula kendisi denetler (bot çalışıyor mu, borsaya bağlı mı, ENGEL var mı, stop var mı…). Kırmızı "eksik" varken tatbikat başlamaz; sarı "dikkat" yalnız uyarıdır (ör. botun 03:02 günlük çalışmasına yakın saat).
3. **Adımlar** — ne yapacağınız açık metinle yazar. Her adımı yapınca düğmesine basarsınız ("İptal ettim", "Şimdi kesiyorum" …).
4. **Pusula'nın doğrulamaları** — kayıtlardan kendisi bakar: uyarı geldi mi, Telegram'a gitti mi, ne kadar sürede, mutabakat temiz mi, Pusula yeniden açıldı mı, kaçırılan gün yazıldı mı.
5. **Sonuç** — doğrulamalar bitince Pusula "geçti" ya da "geçmedi" önerir; siz kaydedersiniz.

**Pusula burada hiçbir şey yaptırmaz:** emir vermez, botu başlatmaz / durdurmaz, programı ya da bilgisayarı kapatmaz, bot ayarına dokunmaz. Adımları siz yaparsınız; Pusula yalnız izler ve yazar.

Tatbikatlar:

| No | Tatbikat | Siz ne yaparsınız | Pusula neye bakar |
|---|---|---|---|
| 1 | Felaket stopu kaybolması (yalnız demo) | Binance demo'da en küçük pozisyonun stopunu elle iptal edersiniz | saatlik denetimin stopu fark edip yeniden koyması, Telegram "felaket stopu kayboldu", süre ≤ 70 dk |
| 2 | Pusula çökmesi | Görev Yöneticisi'nden Pusula'yı (node.exe) sonlandırırsınız | yeniden açılış, botun kendiliğinden bağlanması, mutabakat temiz, ENGEL yok, çift emir yok |
| 3 | İnternet kesintisi (30 dk) | Wi-Fi'ı / kabloyu 30 dk kesip geri açar, "Mutabakat"a basarsınız | kesintinin süresi, botun DURMAMASI, mutabakat temiz, sonraki stop denetimi temiz |
| 4 | Uzun kapanış (26 saat) | Bilgisayarı 03:02'yi kapsayacak şekilde ≥ 26 saat kapalı tutarsınız | kapalı süre, "… saattir çalışmadı" uyarısı, kaçırılan gün kaydı (yalnız bugünkü hedef) |
| 5 | Acil durdurma denemesi | Botu durdurup Botlar'daki "Acil durdurmayı dene"ye basarsınız | denemenin başarısı, mutabakat temiz, Telegram "ACİL" |
| 6 | Mutabakat provası (isteğe bağlı) | Botlar'daki "Mutabakat"a basarsınız | elle mutabakatın temiz olması |
| 7 | Makine devri | Botu Ayarlar › Makineler'den başka sunucuya taşır, orada başlatırsınız | bot kaydının hedefte olması, buradaki kopyanın durması |

## Ne zaman kullanılır {#ne-zaman}

- **Kairos demo kabulü:** zorunlu provalar 1–4 burada hazır; 5 (acil durdurma) 63. günden **sonra** açılır. Sihirbazla yaptığınız provanın sonucu demo kabul prova günlüğüne **kendiliğinden** eklenir — elle JSON yazmanız gerekmez.
- Yeni bir sürümden, makine değişikliğinden ya da uzun bir aradan sonra "her şey hâlâ doğru çalışıyor mu?" diye bakmak için.
- **Aylık otomatik denetim:** ayın ilk pazarı 11:30'da Pusula kâğıt ve demo botlarda son mutabakatı, felaket stopu denetimini, son acil deneme kaydını ve veri kapısının bozuk mumu reddettiğini kendisi denetler (yalnız okuma — emir yok, acil durdurma denenmez). Sonuç Telegram'a tek mesaj gider; "Şimdi çalıştır" ile hemen de yapılabilir. Kairos demo kabulü bitene kadar (2026-12-09) Kairos bu denetimin dışındadır.

## Ekran {#ekran}

![Sistem › Tatbikatlar](ekran:tatbikat-1400)

Yukarıdan aşağı: **süren tatbikat** (varsa — adımlar, şu anki adımın yönergesi, doğrulama tablosu, öneri ve kaydet düğmeleri), **Kairos demo kabulü — provalar** (hangisi yapıldı, hükmü, hangisi sihirbazda hazır), her **tatbikatın kartı** (amaç, bot seçimi, önkoşul listesi, "Tatbikatı başlat"), **aylık otomatik denetim** ve **geçmiş**.

## Alanlar {#alanlar}

- **Önkoşul rozetleri** — *tamam* (yeşil), *eksik* (kırmızı — tatbikat başlamaz), *dikkat* (sarı — başlar ama uyarır).
- **Doğrulama durumu** — *geçti*, *kaldı*, *bekleniyor* (kayıt henüz gelmedi), *bilgi* (hükme girmez, ör. denetleyici kaydı, gölge uyarısı).
- **Kalan süre** — Pusula'nın bekleyeceği en uzun süre. Süre dolunca bekleyen doğrulamalar "kaldı" olur, öneri "geçmedi"ye döner.
- **Pusula'nın önerisi** — bütün zorunlu doğrulamalar geçtiyse "geçti", biri kaldıysa "geçmedi".

## Adım adım {#adim-adim}

1. Tatbikatın kartında botu seçin; önkoşulların hepsi yeşil ya da sarı olsun.
2. **Tatbikatı başlat**. Sayfanın üstünde "Süren tatbikat" kartı açılır.
3. Yönergeyi okuyun, adımı yapın, düğmesine basın. Bir sonraki adım açılır.
4. Son adımda Pusula izlemeye geçer — sayfayı kapatabilirsiniz. Pusula'yı ya da bilgisayarı kapattığınız provalarda (2 ve 4) Pusula açılınca **kaldığı adımdan sürer**.
5. Öneri çıkınca **Geçti / Geçmedi olarak kaydet**. Kayıt yerel PIN ister (demo kabul günlüğüne yazar). Pusula'nın önerisinden farklı bir hüküm ancak kısa bir açıklamayla kaydedilir.

## Uyarılar {#uyarilar}

- Aynı anda **tek** tatbikat sürer. Yarıda bırakmak için "Tatbikatı iptal et" — iptal edilen tatbikat prova günlüğüne **yazılmaz**. Borsada bir şeyi değiştirdiyseniz (ör. stopu iptal ettiyseniz) önce yerine geldiğinden emin olun; gerekirse "geçmedi" olarak kaydedin.
- **Acil durdurma denemesi bütün pozisyonları piyasadan kapatır.** Kairos'ta yalnız demo kabulünün 63. gününden sonra açılır.
- Prova günlüğünün biçimi değişmez: kayıt `{ no, bas, bit, adimlar, gozlenen, sure, hukum }` satırı olarak eklenir; `bas` provanın başladığı, `bit` doğrulamanın bittiği an (bu aralık demo kabul ölçümünden düşülür). Var olan satırlara dokunulmaz; dosya bozuksa üzerine yazılmaz, kayıt reddedilir.
- Geliştirme bilgisayarında (araştırma kopyası) tatbikat başlatılamaz — botlar sunucuda çalışır, tatbikatı sunucunun panelinden yapın. Telefondan yalnız izlenir.
- Canlı hesap botlarında tatbikat bu sürümde kapalıdır.
