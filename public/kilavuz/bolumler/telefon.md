# Telefondan açmak {#telefon}

Telefondan panel **izler ve acil durdurur** (60.5); ayrıca acil PIN ve onay kelimesiyle onaylı güncellemeyi kurar, Sorunlar sayfasının araçlarını kullanır ve **botu güvenli kipe alır / güvenli kipten çıkarır**, **Borsayla karşılaştırır** ve gerekirse **Pusula'yı yeniden başlatır**. PIN'siz iki zararsız işlem de vardır: Sağlık › **Şimdi yokla** ve Bildirimler'de Telegram geçici sessizini **Erken bitir**. Her ekranı görürsünüz; bot başlatma/durdurma, Engeli kaldır, ayar, emir ve backtest yalnız sunucudaki panelden yapılır. Telefonda başlıkta **Telefon: izleme** rozeti çıkar. Ekranın altında çubuk vardır: **Ana · Portföy · Botlar · Sinyaller · Menü** — **Menü** yan menünün aynısını açar.

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

**Güvenli kip telefondan:** sunucuya ulaşamadığınızda tek imkânınız telefon olduğu için güvenli kip iki yönde de telefondan yönetilir — aynı kalıp: önce önizleme, sonra acil PIN ve onay kelimesi.

| İşlem | Nerede | Onay kelimesi | Ne olur |
|---|---|---|---|
| **Güvenli kipten çık** | Sorunlar › güvenli kip kartı › **Güvenli kipten çık (PIN)…** (botun sarı bandı ve Sağlık kartı da buraya götürür) | KALDIR | Önizleme neden güvenli kipte olduğunu, kimin koyduğunu ve çıkınca botun yeniden **yeni işlem açabileceğini** yazar. Sebep sürüyorsa bot kısa süre içinde yeniden güvenli kipe girer. Telegram'a **kritik güvenlik iletisi** gider (sessiz saatte de). |
| **Güvenli kipe al** | Sorunlar sayfasının altında **Bir botu güvenli kipe al** | GÜVENLİ | Bot yeni işlem açmaz; açık pozisyonlar kapanmaz, stoplar borsada kalır. Kendiliğinden **kalkmaz** — Güvenli kipten çık ile kalkar. Pozisyonları hemen kapatmak için bu değil **Acil durdur**. |

İkisi de borsaya emir göndermez; ENGEL'i (tam kapanma) kaldırmaz — **Engeli kaldır** yine yalnız sunucudaki panelde. Yanlış PIN sayacı aynıdır (5 yanlışta 1 dakika kilit). Her işlem günlüğe, botun olay kaydına ve Ayarlar › Ayar geçmişi'ne yazılır. Ayrıntı: [Sorun giderme › Güvenli kip](#/kilavuz/sorun-giderme/guvenli-kip).

**Telefondan başka neler yapılır:**

| İşlem | Nerede | Kilit | Ne olur |
|---|---|---|---|
| **Borsayla karşılaştır** | Sorunlar › bot kartı › **Borsayla karşılaştır (PIN)…** | Acil PIN + KARŞILAŞTIR | Masaüstündeki "Borsayla karşılaştır" ile aynı: bot kaydı borsayla karşılaştırılır, yeni emir açılmaz. Önizleme yazan yan etkileri açıkça söyler: botun kendi önekli ama kaydında olmayan (sahipsiz) kademeli alım emirlerini iptal eder, arada dolan emirleri kayda işler; fark yoksa kol engeli kalkar, fark varsa ENGEL konur. Sizin elle açtığınız emirlere dokunulmaz. |
| **Pusula'yı yeniden başlat** | Sorunlar sayfasının altında **Pusula takıldıysa: yeniden başlat** | Acil PIN + YENİDEN BAŞLAT | Pusula temiz kapanır, ~10 sn sonra aynı kodla açılır (güncelleme kurulmaz); stoplar borsada kalır. TR 02:30–04:30 arası, bir bot çalışması sürerken ve saatte birden fazla yapılamaz. Telegram'a bilgi gider. |
| **Şimdi yokla** | Sağlık (ve Sorunlar kartları) | PIN'siz, dakikada en çok 1 | Öz denetim hemen koşar; hiçbir şeyi değiştirmez. |
| **Erken bitir** (geçici sessiz) | Sistem › Bildirimler | PIN'siz | Telegram menüsünden açılan "1 saat sessize al"ı bitirir; bekleyenler tek özet olarak gelir. Sessize **almak** telefondan panelde yoktur (Telegram menüsünden). |

PIN tanımlı değilse telefondan acil durdurma **kapalıdır**. 1 dakikada 5 yanlış PIN → 1 dakika kilit + Telegram uyarısı (73.0; kilit her zaman 1 dakika). PIN'i değiştirmek için komutu yeniden çalıştırın (eski PIN'i sormaz — unuttuysanız da böyle) ya da panelde [Ayarlar › Anahtarlar › PIN'i değiştir](#/kilavuz/ayarlar/pin-degistir) (eski PIN ister). **Ortak PIN:** PIN bütün bilgisayarlarda aynıdır; değiştirdiğinizde öbür bilgisayarlarda da aynı PIN'i girin (Faz 3'te kendiliğinden eşitlenecek). Silmek için `npm run acil-pin -- --sil`. Telegram'dan acil durdurma yoktur (Telegram yalnız okur; [Telegram menüsü](#/kilavuz/telegram-menu)'ndeki ↗ düğmeleri bu panelin doğru sayfasını açar, işlem burada acil PIN ile).

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
| Bir düğme "yalnız izleme ve acil durdurma" diyor | Beklenen: telefondan yalnız izleme, acil durdurma, güncelleme ve PIN'li araçlar; işlemi sunucuda yapın |
| "Telefondan dakikada en çok bir kez yoklanır" | Bir dakika bekleyip yeniden **Şimdi yokla** |
| Yeniden başlatma "saatte en çok bir kez" / "02:30–04:30" diyor | Beklenen; yazan saatten sonra yeniden deneyin. Pusula takılı kalırsa bekçi kendisi yeniden açar |
| Güvenli kipten çıktım, bot yeniden güvenli kipe girdi | Sebep (bakım, fiyat farkı, veri kalitesi, tekrarlayan hata) hâlâ sürüyor — kartın "Kendiliğinden geçer mi" satırını okuyup bekleyin |
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
