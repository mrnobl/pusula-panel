# Telegram menüsü {#telegram-menu}

Telegram'da Pusula botuna **/menu** yazın: tek bir mesaj açılır, altında düğmeler. Bir düğmeye bastığınızda **aynı mesaj** güncellenir, sohbet dolmaz. Her ekranın altında **◀ Menü** (ya da bir üst ekrana dönen **◀**) düğmesi vardır. Menü yalnız **sunucuda** çalışır; geliştirme bilgisayarında Telegram bilinçli olarak kapalıdır.

Telegram'ın kendi komut listesi de dolu: sohbette **/** yazınca ya da sol alttaki **Menü** düğmesine basınca bütün komutlar açıklamalarıyla çıkar. Pusula bu listeyi sunucu açılırken Telegram'a bir kez tanıtır.

## Ekranlar {#ekranlar}

| Düğme | Ne gösterir |
|---|---|
| 🤖 **Botlar** | Bot başına bir satır: ad, mod (demo / kâğıt), BTC LONG ya da nakitte, son günün yüzdesi, son çalışma saati. Bota basınca ayrıntı: başlangıçtan getiri ve aynı dönemde BTC, gölgeye göre fark, koruma stopu, teminat durumu, bot kendini durdurdu mu, sonraki çalışma. **Pozisyonlar**: borsadaki pozisyonların yönü ve girişe göre yüzde kâr / zarar. |
| ⚠️ **Sorunlar** | [Sistem › Sorunlar](#/kilavuz/sorunlar) ile aynı kartlar: ne oldu, ciddi mi, kendiliğinden geçer mi, ne yapmalı, dokunmayın. Sayım dökümü olan kartta **Neyi saydı?** |
| 💼 **Portföy** | Portföyüm'ün bugün / bu ay / yıl başından yüzdesi ve model portföylerin başlangıçtan getirisi. |
| 🧪 **İleri test** | Başında her zaman **🧪 GÖLGE TESTİ — emir yok; ara sonuç, hüküm değil**. Gölge başına tek satır (haftalık gölge özetiyle aynı rakamlar), demo kabul günü; **Hüküm takvimi** düğmesi. |
| 🌍 **Piyasa** | [Piyasa bağlamı](#/kilavuz/piyasa-baglami)'ndan bu haftanın olayları ve kısa makro satırı (faiz, USD/TRY, enflasyon, korku-açgözlülük). Yalnız bilgi. |
| 🏛️ **Bilanço** | Son bilanço özetinin kısa hâli: elinizdekiler 📌 ile, çeyrek net kâr değişimi yüzde olarak. |
| 🔄 **Güncelleme** | Çalışan sürüm, GitHub'da bekleyen sürüm ve durumu (güncel / onay bekliyor / elle bakılmalı …). |
| 🖥️ **Makineler** | Sunucu (sürüm, çalışma süresi, botlar) ve araştırma kopyasının son görülmesi. Eşlenmiş makine varsa (75.9) **🧭 Yönetici makine** bölümü: hangi makine yönetici (seçildi / varsayılan), Telegram komutlarını **şu an kim dinliyor** (yönetici ulaşılamadığı için başka sunucu geçici devraldıysa "geçici devralma — 14:20'den beri"), her eşin rolü, sürümü, **son nabzı** ve bot sayısı. Yalnız okuma; yöneticiyi değiştirmek panelde ([Ayarlar › Makineler](#/kilavuz/ayarlar/makineler)). |
| ⚙️ **Bildirim ayarları** | Sessiz saat, varsa geçici sessiz, açık / kapalı bildirim türleri; **🔕 1 saat sessize al** düğmesi. |
| ❓ **Komutlar** | Bütün komutlar. |

Doğrudan açmak için komutlar: `/menu` `/botlar` `/sorunlar` `/portfoy` `/piyasa` `/bilanco` `/guncelleme` `/makineler`. Eski komutlar aynen çalışır: `/durum` `/pozisyonlar` `/ozet` `/saglik` `/teshis` `/yapilacaklar` `/ileri` `/yardim`. `/start` artık menüyü açar.

## Telegram'dan yazma yok {#yazma-yok}

Telegram yalnız **okur**. Güncellemeyi kurmak, botu yeniden açmak, kaydı eşitlemek, ayar değiştirmek gibi işlerde düğme **paneli açar** (↗ işaretli düğmeler): doğrudan doğru sayfa açılır (Sorunlar, Botlar › o bot, Ayarlar › Güncelleme, Bildirimler …), işlem orada **acil PIN** ile yapılır. Telefon kaybolursa ya da bot jetonu sızarsa ele geçiren biri en fazla durumu okuyabilir; hesaba dokunamaz.

↗ düğmelerinin çıkması için [Ayarlar › Bildirimler](#/kilavuz/ayarlar/telegram) › **Panel adresi**'ne sunucunun Tailscale adresini girin. Boşsa düğme çıkmaz, mesajda yalnız yolu yazar (ör. "Panel › Sorunlar").

**Tek istisna: 🔕 1 saat sessize al.** Kritik **olmayan** bildirimler (uyarı, güncelleme, yedek, ileri test, rapor …) bir saat bekletilir; süre bitince bekleyenler **tek özet** mesajı olarak gelir. **Acil durum, koruma stopu, ENGEL / güvenli kip / emir freni ve güvenlik** uyarıları asla susmaz. Yeniden basmak süreyi "şimdiden bir saat sonra"ya taşır. Bir saat dolunca kendiliğinden biter; erken bitirmek için panelde **Sistem › Bildirimler › Sessiz saatler › Erken bitir** (74.1 — Telegram'da bu düğme bilinçli olarak yok).

## Bildirimlerdeki düğmeler {#bildirim-dugmeleri}

Alarm ve uyarı mesajlarının altında:

- **Ayrıntı** — o sorunun Sorunlar kartını yeni bir menü mesajı olarak açar (adımlar, varsa "Neyi saydı?"). Sorun o arada geçtiyse kartın kısa adımları ve "şu an etkin değil" yazar.
- **Panelde çöz ↗** — panelde Sorunlar sayfasını açar (panel adresi girilmişse).
- **🔕 1 saat sessize al** — yalnız kritik olmayan uyarılarda. Kritik alarmda bu düğme yoktur; kritik uyarı zaten susmaz.

Günlük özet, işlem ve rapor gibi bilgi mesajları düğmesizdir.

## Gizlilik {#gizlilik}

- **Tutarlar gösterilmez:** Telegram'daki menü ve komut cevaplarında USD / TL tutarı ya da coin miktarı yoktur, yalnız yüzde. `/durum`'daki sermaye satırı, `/pozisyonlar`'daki nominal ve kâr / zarar tutarı yüzdeye döndü; `/ozet`'te tutar "•••" görünür. Tutarları panelde görürsünüz.
- 74.1: **bildirim mesajlarında** da tutarlar varsayılan olarak gizli (günlük özet, işlem, alarm) — Ayarlar › Bildirimler › **Telegram'da tutarları gizle**; ayrıntı [Bildirimler › Tutarlar](#/kilavuz/bildirimler/tutarlar).
- Jeton, chat id, sağlık adresi gibi sırlar hiçbir ekrana girmez (Sorunlar'daki teşhis paketiyle aynı sır taraması).
- Düğmelere yalnız Ayarlar'daki **chat id**'den basılabilir; başka sohbetten gelen basış sessizce yok sayılır.

## Süresi dolan düğmeler {#suresi-doldu}

Yalnız **en son** menü mesajının düğmeleri çalışır. Eski bir menü mesajındaki düğmeye basarsanız "Bu menünün süresi doldu — /menu yazın" çıkar. 24 saatten eski menü ve 7 günden eski bildirim düğmeleri de süresi dolmuş sayılır. Çok hızlı art arda basınca "Çok hızlı — birkaç saniye bekleyin" çıkar.

## Uyarılar {#uyarilar}

- Menü yalnız sunucuda çalışır. Aynı bot jetonunu başka bir bilgisayar da yoklarsa Telegram çakışma verir ([Sorun giderme › Telegram 409](#/kilavuz/sorun-giderme/telegram-409)).
- Menüdeki rakamlar panelle aynı kaynaktan gelir; ayrıntı ve tutarlar için panel.
- Gölge testlerinin satırları ara sonuçtur; hüküm yalnız hüküm takvimindeki tarihlerde verilir.
