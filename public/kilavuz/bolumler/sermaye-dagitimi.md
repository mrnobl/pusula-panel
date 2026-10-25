# Sermaye dağıtımı {#sermaye-dagitimi}

## Ne işe yarar {#ne-ise-yarar}

Botların sermaye paylarını **tek yerden** izlemek ve gerektiğinde botların hesapları arasında para taşımak:

1. **Hedef paylar** — her bota sermayenin yüzde kaçının düşeceğini yazarsınız (ör. Kairos %60, Tao %40).
2. **Sapma** — Pusula botların son ölçülen özsermayesinden hedefe göre farkı hesaplar. Fark **sapma bandını** aşınca bot "bant dışı" olur.
3. **Öneri** — sapmayı kapatan **en az sayıda** aktarım önerilir. Öneri yalnız formu doldurur; hiçbir şey kendiliğinden taşınmaz.
4. **Aktarım** — her aktarımı siz başlatırsınız: **Önizle** → acil PIN + **AKTAR** → **Aktar**.

**Kesin kurallar:**

- Pusula **dışarıya para çekmez**. API anahtarındaki para çekme izni her zaman **kapalı** kalmalıdır; aktarımdan hemen önce izinler borsadan yeniden okunur, çekme izni açıksa aktarım **yapılmaz** ve Telegram'a alarm gider.
- Aktarım yalnız **aynı borsa hesabının kendi ana / alt hesapları** arasında olur (Binance alt hesap aktarımı). Hedef yalnız Anahtarlar'da kayıtlı hesaplardan seçilir; liste dışı adrese aktarım yapılamaz.
- **Otomatik aktarım yok.** Tavanlar: tek aktarım ≤ *tek aktarım tavanı*, bir günde (Türkiye günü) ≤ *günlük tavan*, kaynak bottan en çok özsermayesinin **%50'si**.

## Ne zaman kullanılır {#ne-zaman}

- Botlardan biri hedef payının çok üstüne ya da altına çıktığında (örneğin biri çok kazandı, öbürü geride kaldı) payları yeniden dengelemek için.
- Yeni bir bota başlangıç sermayesi vermek ya da bir botun fazlasını ana hesaba almak için.
- **Bugün yalnız prova:** canlı hesap aktarımı kapısı **kapalıdır** (aşağıda). Prova kipinde bütün akışı (tavanlar, önizleme, PIN, kayıt) sahte borsada deneyebilirsiniz — para hareketi olmaz, botlara dokunulmaz.

## Ekran {#ekran}

![Botlar › Sermaye dağıtımı](ekran:sermaye-1400)

Yukarıdan aşağı: **Aktarım kipi** (yalnız prova / canlı hesap aktarımı açık; kapalıysa nedenleri), **Hedef paylar ve sapma** (bot, son özsermaye, hedef pay, hedef tutar, fark, bant durumu; sapma bandı ve tavanlar), **Öneriler**, **Aktarım** (kip, kaynak, hedef, tutar → önizleme → PIN + AKTAR) ve **Son aktarımlar**.

## Alanlar {#alanlar}

- **Kip** — *Prova*: sahte borsa, para hareketi yok, kayda "prova" yazılır. *Canlı hesap*: yalnız kapı açıkken seçilebilir; para gerçekten taşınır.
- **Ana hesap** — aktarım anahtarının sahibi olan ana hesap (spot cüzdan). Botlar kendi alt hesaplarının vadeli cüzdanındadır.
- **Ana hesabın işlem hesabı** — bir bot doğrudan ana hesapta çalışıyorsa (alt hesapta değil) o hesabı seçin; o botun tarafı ana hesabın vadeli cüzdanı olur.
- **Durum** — *tamamlandı*, *yapılmadı* (borsa reddetti, para hareketi yok), *belirsiz* (borsa cevap vermedi; aktarım **tekrarlanmaz** — "Borsadan sorgula").
- **Botlar sütunu** — canlı aktarımda botlara yazılan *onaylı para akışı* ön kaydının sonucu.

## Adım adım {#adim-adim}

1. Hedef pay sütununa yüzdeleri yazın, gerekirse sapma bandını ve tavanları değiştirin, **Payları kaydet** (acil PIN).
2. Öneri çıktıysa **Forma al**; ya da kaynak, hedef ve tutarı kendiniz seçin.
3. **Önizle**. Pusula tavanları, kaynak botun durumunu, belirsiz aktarım olup olmadığını denetler ve ne olacağını satır satır yazar.
4. Acil PIN'i ve **AKTAR** yazıp **Aktar** (provada **Provayı çalıştır**). Önizlemeden sonra bir şey değiştiyse Pusula yeni önizlemeyi gösterir; yeniden onaylarsınız.
5. Sonuç *belirsiz* ise biraz sonra **Borsadan sorgula**. Sorgu aynı kimlikle borsaya bakar; aktarımı ikinci kez göndermez.

## Botlar ve para akışı onayı {#para-akisi}

Canlı aktarım tamamlanınca, para akışı onayı açık olan botlara **onaylı para çıkışı / girişi** ön kaydı yazılır — "Para yatırdım / çektim" kaydıyla aynı yol. Bot borsadaki hareketi görünce ön kayıtla eşleştirir: **durmaz**, sermaye tavanı, pozisyon boyutu, risk ve kesici tabanları yeni bakiyeyle sürer; hareket getiri sayılmaz. Ön kayıt yazılamazsa bot hareketi *onay bekleyen* olarak görür (çıkışta durur — güvenli yön); Sorunlar › "Para hareketini onayla" ile sürdürürsünüz. Bkz. [Para akışı onayı](#/kilavuz/sorun-giderme/para-akisi-onay).

## Canlı hesap aktarım kapısı {#kapi}

Kapı **varsayılan kapalı** ve panelden açılamaz. Açılması ayrı ve yazılı bir karardır; şunların hepsi gerekir:

- sunucu bilgisayarında `npm run aktarim-kapisi -- --ac --gerekce "…"` (en erken **2027-01-05**),
- canlı hesap kapısının genel şartları: G1–G9 yazılı onayı (`npm run canli-kapilar`), araştırma kopyası değil,
- Ayarlar › Anahtarlar'da **aktarım** türünde ayrı bir anahtar (ana hesabın; alt hesap aktarımı izni açık, **para çekme izni kapalı**, IP kısıtlı),
- iki taraftaki botlar canlı hesapta ve kendi canlı hesap kapıları açık; botların hesaplarında alt hesap e-postası kayıtlı.

Kapatmak her zaman serbesttir: `npm run aktarim-kapisi -- --kapat`.

## Uyarılar {#uyarilar}

- **Kairos demo kabulü** (2026-12-09'a kadar) aktarım kapsamı dışındadır. **Çoklu varlık** botları da dışındadır (alt hesap aktarımı onların para hareketi geçmişinde görünmez).
- Demo hesapta alt hesap aktarımı yoktur (Binance demo bunu desteklemez); demo ve kâğıt botlar canlı aktarımda seçilemez, provada seçilebilir.
- Kaynak bot çalışıyorsa aktarılan para açık pozisyonların marjından düşer — tutarı küçük tutun. Bot günlük çalışmadayken aktarım yapılmaz.
- Telefondan ve geliştirme bilgisayarından yalnız izlenir; aktarım sunucudaki panelden yapılır.
- Her aktarım Sistem › [Olay akışı](#/olaylar)'na ve ayar geçmişine yazılır (olay akışında tutar yazılmaz).
