# Paneli telefondan açmak (sürüm 60.5)

**60.5 kararı (PLAN-UYGULAMA-YOL-HARITASI.md §0, sıfır bütçe):** telefondan panel **yalnız izler ve acil durdurur**.
Bu bilgisayardan gelmeyen her istek (Tailscale, Wi-Fi köprüsü) "telefon kademesi"dir: okuma serbest; yazma yalnız acil
durdurma uçları ve onlar da **acil PIN + "DURDUR"** ister. Eski `--tam` (tam erişim) kaldırıldı.

İki yol: **Tailscale** (evden uzakta da, HTTPS, önerilen — §0) ya da **ev Wi-Fi köprüsü** (`npm run telefon`, §1–5).

## 0. Tailscale ile (ücretsiz, evden uzakta da) ve acil PIN

1. Evdeki bilgisayara Tailscale (tailscale.com/download, ücretsiz Personal plan), telefona Tailscale uygulaması — aynı hesap.
2. Bot çalışırken: `tailscale serve --bg 3000` → `tailscale serve status` adresi verir: `https://<makine>.<ağ>.ts.net`
   (ilk seferde HTTPS sertifikası için verilen bağlantıyı onaylayın). Kapatmak: `tailscale serve reset`.
3. Giriş karekodu: `npm run telefon-jeton -- --adres https://<makine>.<ağ>.ts.net` (jeton yoksa üretir:
   `data/telefon-jeton.json`). Telefonda Tailscale açıkken okutun; Chrome → **Ana ekrana ekle / Uygulamayı yükle** (PWA).
4. Acil PIN: `npm run acil-pin` (6–12 hane; yalnız scrypt özeti `data/acil-pin.json`). Tanımlı değilse telefondan acil
   durdurma KAPALI. 1 dk'da 5 yanlış PIN → 1 dk kilit + Telegram uyarısı. Silmek: `npm run acil-pin -- --sil`.
5. Telefon kaybolursa: Tailscale yönetim panelinden cihazı çıkarın + `npm run telefon-jeton -- --yeni` (+ gerekirse yeni PIN).

Teknik: `tailscale serve` isteği 127.0.0.1'e iletir ama `Host: *.ts.net` ve X-Forwarded-For / Tailscale-User-* ekler →
`lib/guvenlik.js` bunu "yerel" SAYMAZ (telefon kademesi, jeton/çerez zorunlu). Masaüstü (`localhost`, vekil başlığı yok) değişmedi.

Ev Wi-Fi köprüsü: bilgisayarda `npm run telefon` yazın, terminalde çıkan **karekodu** telefonun kamerasıyla okutun.
Panel telefonda açılır; giriş bir kez yapılır (30 gün geçerli).

## 1. Ön koşullar

- Telefon ve bilgisayar **aynı Wi-Fi**'da olmalı (telefonun mobil verisi değil).
- Bilgisayarda bir kez `npm install` yapılmış olmalı (karekod için küçük bir paket geldi: `qrcode-terminal`).
  Paket yoksa da çalışır; yalnız karekod yerine adres basılır.

## 2. Başlatma

Proje klasöründe (PowerShell ya da Git Bash):

```
npm run telefon
```

Terminalde şunlar yazar:

```
==================== 📱 Telefondan Pusula ====================
  Kip:    ...
  Telefon AYNI Wi-Fi'da olmalı. Kamerayla karekodu okutun ya da adresi açın:
    http://192.168.1.43:3100/#jeton=…
    (karekod)
  Jeton sorulursa elle: …
```

1. Telefonun kamerasıyla karekodu okutun → çıkan bağlantıya dokunun.
2. Panel açılır. Adres çubuğundaki `#jeton=…` kısmı kendiliğinden silinir.
3. Sonraki açılışlarda yalnız `http://192.168.1.43:3100/` yeter (telefonun ana ekranına kısayol
   olarak ekleyebilirsiniz). Adres sizin bilgisayarınızın yerel IP'sidir; terminaldekini kullanın.

Durdurmak: terminalde **Ctrl+C**.

### Hangi kipte açılır?

Komut kendisi karar verir:

| Bu bilgisayarda | Ne olur | Telefondan ne yapılabilir |
|---|---|---|
| Pusula **çalışmıyor** (geliştirme bilgisayarı) | Yerel ağ adresinde **araştırma modunda** yeni bir sunucu açılır: Telegram kapalı, hiçbir bot başlamaz | Her ekran, backtest, portföy laboratuvarı. Bot/borsa/emir düğmeleri kapalı |
| Pusula **zaten çalışıyor** (`localhost:3000`, ör. evdeki canlı bot) | İkinci sunucu AÇILMAZ; çalışan panele **köprü** kurulur (bot yeniden başlamaz, dosyalara yazılmaz) | **Telefon kademesi**: her ekranı görürsünüz; tek eylem PIN'li **Acil durdur** (bot başlat/durdur, ayar, emir, backtest kapalı) |

Araştırma modu bu makinede seçildi çünkü canlı bot evdeki bilgisayarda çalışıyor: aynı Telegram bot
jetonunu iki sunucu dinlerse komutlar çakışır, botların burada başlaması da gereksiz.

Seçenekler (`npm run telefon -- <seçenek>`):

- `--port 3200` — telefonun bağlanacağı port (varsayılan 3100).
- `--ip 192.168.1.43` — bilgisayarda birden çok ağ varsa doğru adres (terminal diğer adresleri listeler).
- `--hedef 3000` — köprü kipinde çalışan panelin portu.
- `--yeni-jeton` — yeni jeton üretir; telefonlardaki eski girişler geçersiz olur (telefon kaybolursa bunu yapın).
- `--karekod-yok` — yalnız adres basar.

## 3. Windows güvenlik duvarı (ilk seferde)

Komut ilk kez çalıştığında Windows **"Windows Güvenlik Duvarı bu uygulamanın bazı özelliklerini
engelledi — Node.js JavaScript Runtime"** penceresi açabilir:

- **"Özel ağlar"** kutusunu işaretleyin, **"Ortak ağlar"ı işaretlemeyin**, **"Erişime izin ver"**e basın
  (yönetici parolası sorabilir).

Bilgisayarın Wi-Fi'ı Windows'ta **"Ortak"** (Public) olarak tanımlıysa "Özel ağlar" izni yetmez ve telefon
bağlanamaz (bu geliştirme bilgisayarının Wi-Fi'ı 2026-10-08'de "Ortak" görünüyordu). Ev Wi-Fi'ı için doğrusu
ağı **Özel** yapmaktır:

- Ayarlar → Ağ ve İnternet → Wi-Fi → (bağlı ağın adı) → **Ağ profili türü: Özel ağ**.
- Ya da yönetici PowerShell'de: `Get-NetConnectionProfile` (durumu gösterir) ·
  `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private`

Pencere hiç çıkmadıysa ya da yanlışlıkla "İptal"e basıldıysa, yönetici PowerShell'de yalnız bu porta izin verin:

```
New-NetFirewallRule -DisplayName "Pusula telefon 3100" -Direction Inbound -Protocol TCP -LocalPort 3100 -Profile Private -Action Allow
```

(Kafe/okul gibi ortak ağlarda paneli açmayın; kural da yalnız "Özel" profilde geçerli.)

## 4. Sorun giderme

| Belirti | Ne yapmalı |
|---|---|
| Telefonda "siteye ulaşılamıyor" / sonsuz yükleme | Aynı Wi-Fi mı? Bilgisayarın ağı **Özel** mi, güvenlik duvarı izni var mı (§3)? Modemde "misafir ağı"/"AP yalıtımı" açıksa cihazlar birbirini göremez — ana ağa bağlanın |
| Adres terminaldekinden farklı bir IP'yle açılıyor | Bilgisayarın IP'si değişmiş olabilir (modem yeniden başladı). Komutu yeniden çalıştırıp yeni adresi kullanın; jeton aynı kalır |
| "Bu IP adresi bu bilgisayarda yok" | `--ip` ile `ipconfig` çıktısındaki "IPv4 Adresi"ni verin |
| "Port … kullanımda" | `npm run telefon -- --port 3200` (güvenlik duvarı kuralı yazdıysanız portu orada da değiştirin) |
| Panel yerine "Pusula · giriş" sayfası açılıyor | Jeton istenir: karekodu yeniden okutun ya da terminaldeki "Jeton sorulursa elle" satırını yapıştırın |
| "Jeton yanlış" / "Çok fazla yanlış deneme" | Terminaldeki güncel jetonu kullanın (`--yeni-jeton` sonrası eski jeton geçmez). 10 yanlışta 10 dakika bekleyin |
| Panel açıldı ama düğmeler gri, "Araştırma modu" rozeti var | Beklenen: bu makinede bot çalışmaz (§2 tablo) |
| Bir düğme "yalnız izleme ve acil durdurma" hatası veriyor | Beklenen (60.5): o işlem evdeki bilgisayardaki panelden yapılır |
| Turuncu "sürüm" bandı | Bilgisayardaki sunucu eski sürümü çalıştırıyor: sunucuyu yeniden başlatın, telefonda sayfayı yenileyin |

## 5. Evdeki bilgisayarda (canlı bot) kullanılabilir mi?

**Evet, köprü kipinde.** Canlı bot çalışırken `npm run telefon` ikinci bir sunucu açmaz; çalışan panele
köprü kurar (bot yeniden başlamaz, `data/`ya yazmaz). Köprü varken `--yeni` (ikinci sunucu) reddedilir —
aynı klasörde iki sunucu birbirinin kaydını ezebilirdi.

Risk notları:

- Bağlantı ev ağında **şifresiz HTTP**'dir. Jeton ve oturum çerezi Wi-Fi'ı dinleyebilen birine görünebilir.
  Yalnız güvendiğiniz, parolalı ev Wi-Fi'ında kullanın; misafir/ortak ağda açmayın, modemde port
  yönlendirme (internete açma) YAPMAYIN.
- Telefon kademesi: bot durdurulamaz/başlatılamaz, emir verilemez; yalnız **acil PIN + DURDUR** ile acil durdurma.
  `--tam` 60.5'te kaldırıldı.
- Telefon kaybolursa: `npm run telefon -- --yeni-jeton` (eski girişler geçersiz olur).
- Köprü yalnız terminal açıkken çalışır; otomatik başlatmaya eklenmedi (bilinçli: ağa açık kalıcı kapı olmasın).

## Teknik özet (geliştirici için)

- Ağa açık dinlemede (`HOST` 127.0.0.1 değil) jeton zorunlu. Tarayıcı `x-panel-token` başlığını gönderemediği
  için `lib/guvenlik.js` jetonsuz SAYFA isteğine kendi içinde bir giriş sayfası döner (401); `POST /api/giris`
  doğru jetona `pusula_oturum` çerezi verir (HttpOnly, SameSite=Lax, 30 gün; değer jetonun HMAC'i). HTTP ve
  WebSocket bu çerezle doğrulanır. Host/Origin denetimi önce ve aynen çalışır. Betikler için `x-panel-token`
  başlığı (WebSocket'te `?token=`) çalışmaya devam eder.
- Jeton sırası: `PANEL_TOKEN` → `data/secrets.json` `panelToken` → `data/telefon-jeton.json` (üretilir). Sunucu da aynı
  sırayla okur (`guvenlik.jetonBul`/`jetonOkuyucu`, 5 sn önbellek); köprü arkaya kendi jetonunu `x-panel-token` ile iletir.
- Telefon kademesi + acil PIN: `lib/guvenlik.js` (`kademe`, `telefonIzinliMi`), `lib/acilPin.js`; testler `guvenlik-selftest`.
- Köprü: `lib/telefonKopru.js`; başlatıcı: `scripts/telefon.js`; test: `scripts/telefon-selftest.js` (npm test).
