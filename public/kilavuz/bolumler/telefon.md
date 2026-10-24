# Telefondan açmak {#telefon}

Telefondan panel **yalnız izler ve acil durdurur** (60.5). Her ekranı görürsünüz; bot başlatma/durdurma, ayar, emir ve backtest yalnız sunucudaki panelden yapılır. Telefonda başlıkta **Telefon: izleme** rozeti çıkar. Ekranın altında çubuk vardır: **Ana · Portföy · Botlar · Sinyaller · Menü** — **Menü** yan menünün aynısını açar.

![Telefonda Ana sayfa](ekran:ana-390)

**Portföy telefonda:** Pano, Varlıklar, Hedefim, Modeller (Bu ay kartı dahil), Rapor ve laboratuvar Tasarımcı telefonda tam görünür; Portföy › Hesaplar'daki giriş formları ve düğmeler gizlidir (kartlar alt alta, tablolar karta döner); **Riski dene** düğmesi gizlenir ve yerine "sunucudaki panelden" notu çıkar. Model portföy tutarları yalnız sunucuda tanımlıysa görünür.

![Telefonda Araştırma › Portföy laboratuvarı › Tasarımcı](ekran:tasarimci-390)

İki yol var, ikisi de ücretsiz:

| Yol | Nerede çalışır | Bağlantı |
|---|---|---|
| **Tailscale** (önerilen) | Her yerde (mobil veri dahil), dışarıdan da | `https://<makine>.<ağ>.ts.net` — şifreli, internete açık değil |
| **Wi-Fi köprüsü** (`npm run telefon`) | Yalnız aynı Wi-Fi | `http://192.168.x.x:3100` — şifresiz, yalnız yerel ağda |

## Tailscale ile (dışarıdan da) {#tailscale}

Bir kez kurulur; sonra telefonda Tailscale açıkken panel adresi her yerden açılır. Modemde port açılmaz, panel internete açılmaz.

1. **Sunucuya** Tailscale kurun: tailscale.com/download → Windows → kurun ve bir hesapla (ör. Google) giriş yapın. Ücretsiz **Personal** plan yeter.
2. **Telefona** Tailscale uygulamasını kurun (Play Store / App Store), **aynı hesapla** giriş yapın, bağlantıyı açın.
3. Sunucuda PowerShell'de paneli Tailscale ağına HTTPS ile açın (bot `localhost:3000`'de çalışıyor olmalı):

```powershell
tailscale serve --bg 3000
tailscale serve status
```

   İlk seferde HTTPS sertifikasını etkinleştirmek için bir bağlantı verirse açıp onaylayın. `status` çıktısındaki adres sizin panel adresinizdir: `https://<makine>.<ağ>.ts.net`.
4. Proje klasöründe giriş karekodunu alın (adresi kendi adresinizle değiştirin):

```powershell
npm run telefon-jeton -- --adres https://<makine>.<ağ>.ts.net
```

5. Telefonda (Tailscale açıkken) karekodu okutun → panel açılır, giriş 30 gün geçerli.
6. **Ana ekrana ekleyin:** Chrome menüsü → **Ana ekrana ekle / Uygulamayı yükle** (iPhone'da Safari → Paylaş → Ana Ekrana Ekle). Panel uygulama gibi açılır.

Tailscale'den kapatmak: `tailscale serve reset`.

## Acil durdurma ve acil PIN {#acil-pin}

Telefondaki tek eylem kırmızı **Acil durdur**'dur (botun Genel görünümünde; bot çalışırken üst çubukta da): bot durur, bütün emirler iptal edilir, TÜM pozisyonlar piyasadan kapanır, BTC satılır — geri alınamaz. Bu yüzden iki kilit ister:

1. **Acil PIN** (6–12 hane, panel jetonundan ayrı). Yalnız sunucuda belirlenir:

```powershell
npm run acil-pin
```

2. Pencerede **DURDUR** yazmak (yanlışlıkla dokunmaya karşı).

**Sorun araçları (73.8):** Sorunlar sayfasındaki **Kaydı borsaya eşitle**, **Zarar sınırını sıfırla**, **Farkı kabul et** ve **Yatırmayı kabul et** telefondan da kullanılır: önce önizleme, sonra aynı acil PIN ve onay kelimesi (ESITLE / SIFIRLA / KABUL). Önizlemeden sonra durum değiştiyse hiçbir şey uygulanmaz, yeni önizleme gelir. Ayrıntı: [Sorun giderme › Sorun araçları](#/kilavuz/sorun-giderme/sorun-araclari).

PIN tanımlı değilse telefondan acil durdurma **kapalıdır**. 1 dakikada 5 yanlış PIN → 1 dakika kilit + Telegram uyarısı (73.0; kilit her zaman 1 dakika). PIN'i değiştirmek için komutu yeniden çalıştırın (eski PIN'i sormaz — unuttuysanız da böyle) ya da panelde [Ayarlar › Anahtarlar › PIN'i değiştir](#/kilavuz/ayarlar/pin-degistir) (eski PIN ister). **Ortak PIN:** PIN bütün bilgisayarlarda aynıdır; değiştirdiğinizde öbür bilgisayarlarda da aynı PIN'i girin (Faz 3'te kendiliğinden eşitlenecek). Silmek için `npm run acil-pin -- --sil`. Telegram'dan acil durdurma yoktur (Telegram yalnız okur).

## Wi-Fi köprüsüyle {#adimlar}

1. Telefon ve bilgisayar **aynı Wi-Fi**'da olsun (telefonun mobil verisi değil).
2. Bilgisayarda proje klasöründe:

```powershell
npm run telefon
```

3. Terminalde çıkan **karekodu** telefonun kamerasıyla okutun → bağlantıya dokunun.
4. Panel açılır; adres çubuğundaki `#jeton=…` kısmı kendiliğinden silinir.
5. Sonraki açılışlarda terminaldeki adres (ör. `http://192.168.1.43:3100/`) yeter.
6. İş bitince bilgisayarda terminalde **Ctrl+C**.

| Bu bilgisayarda | Ne olur |
|---|---|
| Pusula **çalışmıyor** (geliştirme bilgisayarı) | Araştırma modunda yeni bir sunucu açılır (Telegram kapalı, bot başlamaz) |
| Pusula **çalışıyor** (sunucu) | Çalışan panele **köprü** kurulur (bot yeniden başlamaz); telefon kademesi: izleme + acil durdurma |

Seçenekler: `--yeni-jeton` (telefon kaybolursa eski girişleri geçersiz kılar), `--port 3200`, `--ip <adres>`, `--karekod-yok`. Eski `--tam` (tam erişim) 60.5'te kaldırıldı.

## İlk seferde: güvenlik duvarı ve "Özel" ağ {#guvenlik-duvari}

Yalnız Wi-Fi köprüsü için (Tailscale'de gerekmez):

- Windows **"Node.js'in bazı özellikleri engellendi"** penceresi açarsa: **Özel ağlar** işaretli, **Ortak ağlar** işaretsiz → **Erişime izin ver**.
- Bilgisayarın Wi-Fi'ı **Ortak** (Public) tanımlıysa telefon bağlanamaz: Ayarlar → Ağ ve İnternet → Wi-Fi → (ağın adı) → **Ağ profili türü: Özel ağ**. Ya da yönetici PowerShell'de:

```powershell
Get-NetConnectionProfile
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

- Pencere hiç çıkmadıysa yönetici PowerShell'de yalnız bu porta izin verin:

```powershell
New-NetFirewallRule -DisplayName "Pusula telefon 3100" -Direction Inbound -Protocol TCP -LocalPort 3100 -Profile Private -Action Allow
```

## Sorun giderme {#sorun}

| Belirti | Ne yapmalı |
|---|---|
| Tailscale adresi açılmıyor | Telefonda Tailscale **açık** mı (VPN simgesi)? Sunucu açık ve Tailscale'e bağlı mı? `tailscale serve status` adresi gösteriyor mu? |
| "Telefondan erişim kapalı: panel jetonu tanımlı değil" | Sunucuda `npm run telefon-jeton` (jeton üretir) |
| "Siteye ulaşılamıyor" (Wi-Fi köprüsü) | Aynı Wi-Fi mı? Ağ **Özel** mi, güvenlik duvarı izni var mı? Modemde misafir ağı / AP yalıtımı kapalı mı? |
| "Pusula · giriş" sayfası | Karekodu yeniden okutun ya da jetonu elle yapıştırın |
| "Çok fazla yanlış deneme" | 10 yanlışta 10 dakika bekleyin |
| Bir düğme "yalnız izleme ve acil durdurma" diyor | Beklenen: telefondan yalnız izleme; işlemi sunucuda yapın |
| "Acil PIN tanımlı değil" | Sunucuda `npm run acil-pin` |
| Üstte "Sunucuya ulaşılamıyor — son görülen" | Sunucu kapalı/uykuda ya da bağlantı yok; ekrandaki sayılar o saatten kalma |
| Düğmeler gri, "Araştırma modu" | Beklenen (geliştirme bilgisayarı) |

## Uyarılar {#uyarilar}

> **Uyarı:** Wi-Fi köprüsü yerel ağda **şifresiz HTTP**'dir: yalnız parolalı bir Wi-Fi ağında kullanın, modemde port yönlendirme (internete açma) YAPMAYIN. Dışarıdan yalnız **Tailscale**. Telefon kaybolursa: Tailscale yönetim panelinden telefonu çıkarın ve `npm run telefon-jeton -- --yeni` (eski girişler düşer); gerekiyorsa `npm run acil-pin` ile PIN'i değiştirin.

Köprü yalnız terminal açıkken çalışır; `tailscale serve --bg` ise kapatılana kadar açık kalır (yine yalnız sizin Tailscale cihazlarınız görür).


## Oturum, bantlar ve kilitler {#oturum}

- Telefon oturumu 30 gün geçerlidir. Süre dolunca ya da panel jetonu değişince üstte **"Oturum süresi doldu — Yeniden giriş"** bandı çıkar; bağlantıya dokunup jetonla yeniden girin.
- Uyarı bantları telefonda tek satırdır, dokununca açılır; telefon bandı varken araştırma bandı ayrıca gösterilmez (üst çubuktaki rozet yeter).
- Ayarlar'daki bütün kayıt düğmeleri (Telegram, sağlık sinyali, API anahtarları; Araştırma'daki piyasa verisi ve izleme listesi) ve botların Yönetim görünümü telefonda kilitlidir. Acil PIN tanımlı değilse **Acil durdur** pasiftir.
