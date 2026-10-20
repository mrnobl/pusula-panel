# Kurulum sihirbazı {#kurulum-sihirbazi}

## Ne işe yarar {#ne-ise-yarar}

Pusula'yı ilk kez kuran kişiyi adım adım hazırlar. **Zorunlu değildir:** kurulum tamamlanmadıysa panelin üstünde her girişte bir uyarı şeridi çıkar ("Kurulum sihirbazını aç" · "Şimdilik geç" — geç, yalnız o oturum için gizler). Sihirbaz **Bilgi › Kurulum sihirbazı**'ndan istediğin zaman açılır. Sekiz adım:

1. **Hoş geldin** — Pusula nedir; verilerin yalnız bu bilgisayarda durduğu; adımların hiçbirinin paneli kullanmak için zorunlu olmadığı (sonra Ayarlar'dan ya da buradan yapılır — tek şart, bir botu başlatmadan önce riskleri onaylamak). Burada iki yol seçersin: **Yeni kurulum** (aşağıdaki adımlar) ya da **Başka bilgisayardan taşı** ([aşağıda](#/kilavuz/kurulum-sihirbazi/tasi)).
2. **Riskler ve kullanım şartları** — dört madde ayrı ayrı onaylanır ([tam metin](#/kilavuz/kullanim-sartlari)). Onay verilmeden **botlar başlatılamaz** ve hesap türü değiştirilemez.
3. **Pusula ne yapar, ne yapmaz** — para çekmez, senin yerine karar vermez, kazanç sözü vermez.
4. **Binance demo anahtarı** — Demo Trading'de anahtar oluşturma (çekim izni kapalı), Ayarlar › Bağlantılar'a girme.
5. **Telegram botun** — @BotFather, chat id, Ayarlar › Bildirimler.
6. **Telefondan erişim** — Tailscale ve telefon jetonu.
7. **Acil durdurma** — acil PIN'i tanımlama ve bir kez deneme.
8. **İlk deneme (demo)** — Hücum'u demo hesapta başlatma; **Kurulumu bitir**.

Adım 4–7'nin yanında ✓ işareti sunucunun bugünkü durumundan gelir (anahtar kayıtlı mı, Telegram bağlı mı, telefon jetonu ve acil PIN var mı).

## Ne zaman kullanılır {#ne-zaman}

- İlk kurulumda: [kurulum programı](#/kilavuz/kurulum-programi) son ekranında "Pusula'yı başlat ve kurulum sihirbazını aç" ile doğrudan buraya getirir; ya da üstteki uyarı şeridinden.
- Bir adımı sonradan tamamlamak ya da kontrol etmek için.

Daha önce kurulmuş bir Pusula'da (anahtarları zaten kayıtlı) uyarı şeridi çıkmaz ve onay istenmez.

## Ekran {#ekran}

![Kurulum sihirbazı — riskler ve kullanım şartları](ekran:kurulum-1400)

## Başka bilgisayardan taşı {#tasi}

Eski bilgisayarında **Ayarlar › Yedek ve taşıma › Taşıma dosyası oluştur** ile aldığın `.pusula` dosyası (ya da USB yedeği) varsa sihirbazın sekiz adımına gerek yok:

1. **Hoş geldin** adımında **Başka bilgisayardan taşı**'yı seç. Bu yolda alt çubukta **Devam et** yoktur: taşıma aşağıdaki kendi düğmeleriyle ilerler.
2. Dosyayı seç (ya da bu bilgisayardaki tam yolunu yaz) → **Dosyayı aç**.
3. Dosyanın şifresini yaz → **Doğrula ve önizle**: ne geleceğini, ne kadar olduğunu ve hangi sürümden geldiğini görürsün; henüz hiçbir şey değişmemiştir.
4. **Bu bilgisayara taşı** → Pusula'yı kapatıp yeniden aç.

Kurulum onayın, ayarların, anahtarların ve jetonların dosyadan gelir. **Botlar kendiliğinden başlamaz:** her bot için önce **Mutabakat**, temiz çıkınca **Başlat** (uyarı şeridi o zamana kadar durur). Bu bilgisayarda zaten kişisel veri varsa üzerine yazılmaz. Ayrıntı: [Yedek ve taşıma](#/kilavuz/yedek-tasima/ice-aktarma).

![Kurulum sihirbazı — başka bilgisayardan taşı](ekran:kurulum-tasi-1400)

## Uyarılar ve ne yapmalı {#uyarilar}

- Onay metni değişirse (yeni sürüm) yeniden onay istenir; o zamana kadar botlar başlatılamaz.
- Onay, tarihi ve metnin sürümüyle yalnız bu bilgisayarda (`data/kurulum.json`) saklanır.
- Kullanım şartlarının metni taslaktır; dağıtımdan önce hukukçu tarafından gözden geçirilmelidir.
