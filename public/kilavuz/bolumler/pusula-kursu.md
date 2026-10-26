# Pusula Kursu {#pusula-kursu}

## Ne işe yarar {#ne-ise-yarar}

Pusula Kursu panelin içindedir: sol menüde **Bilgi › Pusula Kursu** (Kılavuz, Pusula Kitabı ve Kitapçık'ın altında). Paneli baştan sona **kendi elinizle deneyerek** öğrenmek için sıralı görevlerden oluşur. Kılavuz "bu düğme ne yapar" sorusunu cevaplayan bir başvuru kaynağıdır; kurs ise "şimdi şunu yap, şunu görmelisin, görmediysen şuna bak" diye ilerler.

| Kısım | İçinde ne var |
|---|---|
| **Modüller** | Panel açma ve gezinme, Ana sayfa, Anahtarlar ve borsa hesabı, Ayarlar, Portföy, İşlem defteri, Botlar, kâğıt deneme botu, İleri test, Sistem sayfaları, bildirimler, güncelleme, telefon, Bilgi menüsü. Her modülün ön koşulu yazar. |
| **Görev** | Amaç (tek cümle), başlamadan önce, adımlar (menü yolu ve düğme adlarıyla), doğru gittiyse ne görürsünüz, olmadıysa en olası nedenler ve her biri için çözüm, panel ve kılavuz bağlantısı. |
| **Sorun çözme senaryoları** | Bot durdu, Telegram gelmiyor, güncelleme "elle bakılmalı", Sağlık sarı/kırmızı, para hareketi onay bekliyor, anahtar sınaması başarısız, telefon bağlanmıyor, makine sessiz, güvenli kip gibi durumlarda teşhis sırası, çözüm ve doğrulama. |

Her görevin altında **Tamamlandı** kutusu ve **Not / sorun** alanı vardır. İşaretler ve notlar yalnız bu tarayıcıda saklanır (sunucuya gitmez). Üstteki çubuk ilerlemeyi gösterir; **Notlarımı kopyala** düğmesi tamamlanmayan görevleri ve notlarınızı düz metin olarak panoya alır (geliştirme sohbetine yapıştırmak için).

## Ne zaman kullanılır {#ne-zaman}

- Paneli ilk kez baştan sona tanırken: modülleri sırayla yapın, her modülün ön koşulu bir öncekinin bitmesidir.
- Yeni bir özelliği denerken ya da bir akışın gerçekten çalışıp çalışmadığını görmek istediğinizde: ilgili görevi yapın, "olmadıysa" bölümündeki adımlarla sorunu çözmeye çalışın, çözülmeyeni not alanına yazın.
- Bir uyarıyla karşılaştığınızda: son modüldeki **Sorun çözme senaryoları** nereye bakacağınızı sırayla söyler.

## Ekran {#ekran}

![Pusula Kursu](ekran:kurs-1400)

1. **Yeni sekmede aç** — kursu panelsiz, tam ekran ayrı sekmede açar (paneli bir pencerede, kursu yanında ayrı pencerede tutmak için).
2. **Kurs** — panelin içinde, ekran yüksekliğinde; kendi içinde kayar. Modüller kursun kendi sol menüsündedir.

Telefonda aynı ekran; kursun menüsü üstteki **İçindekiler** düğmesiyle açılır:

![Pusula Kursu telefonda](ekran:kurs-390)

## Güvenlik kuralları {#guvenlik}

Kurs görevleri çalışan botların ölçümünü bozmamak için şöyle kurulmuştur:

- Ölçüm süren botlarda (Kairos demo kabulü, Tao kâğıt ölçümü) **durumu değiştiren hiçbir görev yoktur**: acil durdurma, durdur/başlat, sermaye, hesap türü, engel kaldırma bu botlarda yapılmaz; bu botlarda yalnız okuma görevleri vardır.
- Deneme gereken her görev, kursun başında oluşturulan **"Kurs" adlı kâğıt botta** yapılır ([Botlar › Yeni bot](#/kilavuz/ayarlar/bot-kayitlari)); kurs sonunda bu bot arşivlenir.
- Canlı hesap hiçbir görevde yoktur. Sermaye dağıtımı yalnız **prova** olarak denenir.
- Anahtarlar, PIN ve jetonlar kursun not alanına ya da başka bir yere yazılmaz.
- Tatbikatlar sayfasında yalnız sayfa tanınır; provaların kendisi ayrı bir günde yapılır ([Tatbikatlar](#/kilavuz/tatbikat)).

## Uyarılar ve ne yapmalı {#uyarilar}

- Kurs **yalnız yol gösterir**: kendisi hiçbir emir vermez, ayar değiştirmez. Kurstaki bağlantılar paneldeki ilgili ekranı açar; işlemi siz yaparsınız.
- Kurstaki tutar ve bakiye örnekleri **örnektir**; kendi değerleriniz panelin kendisindedir.
- İşaretler ve notlar tarayıcıda saklanır: başka bir tarayıcıda, gizli pencerede ya da tarayıcı verisi silinince boş başlar. Önemli notları **Notlarımı kopyala** ile bir yere alın.
- Görevdeki bir düğme adı panelde farklıysa (yeni bir sürümde değişmiş olabilir) kılavuzdaki ilgili bölüm esastır; farkı not alanına yazın.
