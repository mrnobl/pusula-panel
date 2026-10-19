# Binance'e bağlanma rehberi

Panel → **Borsa** sekmesi. Sıra önemli: önce testnet, sonra küçük sermayeyle
canlı. Her adımda bir şey ters giderse **ACİL DURDUR** her zaman çalışır.

## 0. Bilmen gerekenler

- Canlı katman (`lib/live/`) kâğıt motordan **ayrı**. Paneldeki eski botlar
  kâğıtta kalır; borsaya emir veren yalnız Borsa sekmesi ve Donchian botu.
- Sunucu açılışta borsaya **kendiliğinden bağlanmaz**. Canlı emir kilidi
  bellekte durur; sunucu yeniden başlarsa kapanır.
- Tavanlar (`config.json` → `canli`): emir başı **200 USDT**, sembol başı
  **500 USDT**, Donchian sermaye tavanı **200 USDT**. Değiştirmek için
  `config.json`'a şunu ekle, sunucuyu yeniden başlat:
  ```json
  "canli": { "maxEmirNominal": 200, "maxPozisyonNominal": 500, "sermayeTavani": 200, "symbol": "BTC/USDT:USDT" }
  ```
- Sunucu yalnız `127.0.0.1`'de dinler. VPS'e taşırsan `HOST=0.0.0.0` +
  `data/secrets.json` içinde `panelToken` (≥24 karakter) zorunlu.

## 1. Testnet (gerçek para yok)

1. https://www.binance.com → Futures → **Demo Trading**'e geç; demo hesabın
   **API Management** sayfasından anahtar oluştur. (Prod anahtarı demo'da
   çalışmaz; eski testnet.binancefuture.com da aynı arka uç.)
2. Borsa sekmesi → **API anahtarları** → Testnet Key/Secret → Kaydet.
3. **Testnet'e bağlan**. Beklenen: durum **AKTIF**, pozisyon modu `oneway`.
4. **Elle emir**: `BTC/USDT:USDT`, Al, Piyasa, `0.001` → **Önizle**.
   Önizleme borsanın yuvarlayacağı miktarı, nominali, ücreti gösterir.
   Geçerliyse **Emri gönder**. Pozisyon tablosunda görünmeli.
5. Aynı miktarda Sat + **Yalnız azalt** → pozisyon kapanmalı.
6. **ACİL DURDUR**'u bir kez dene: açık emirlerimiz iptal, pozisyonlar
   kapanır, durum DURDURULDU olur. **Mutabakat** düğmesi tekrar AKTIF yapar.
7. Donchian: **Kuru hesapla** → bugünkü hedefi gösterir, emir vermez.
   **Botu başlat** → her UTC günü kapanışından ~2 dk sonra çalışır.

⚠ Demo'nun fiyatı, funding'i ve filtreleri prod'dan farklı (ör. BTC adım
0.0001 vs 0.001). Demo K/Z'si prod'u temsil etmez; demo yalnız **mekaniği**
doğrular.

## 1b. Hücum / Denge'yi demo hesapta çalıştırma

Hücum ve Denge kendi yürütücüleriyle çalışır; Borsa sekmesindeki bağlantıdan
bağımsızdır ama **aynı demo anahtarını** kullanır. Gerçek para yok.

**Önce bil:**
- Tek demo hesap var → aynı anda **yalnız biri** (Hücum ya da Denge) demo
  modunda olabilir. Borsa sekmesindeki Donchian botu demo'da çalışıyorsa önce
  onu durdur.
- Demo'da BTC ayağı **BTCUSDT perp LONG** ile temsil edilir. Bu bir **demo
  yaklaşımıdır — gerçekte BTC spot teminat olarak tutulur.** (Demo'nun vadeli
  hesabına BTC teminat aktarılamıyor; çoklu varlık modu anahtarsız
  doğrulanamadı.) Fark: perp LONG funding öder (yılda ~%10), spot ödemez.
- Kararlar (günlük mumlar, evren) Binance'in **gerçek** piyasa verisinden,
  emirler demo hesaba gider. Böylece demo sonucu gölge izleyiciyle (ideal
  sistem) kıyaslanabilir.
- Demo sermaye tavanı varsayılan **1000 USDT** (`config.bindirme.hucum.demoSermayeTavani`);
  demo hesapta daha çok para olsa da bot yalnız bu kadarını kullanır.
- Sermaye 5000 $'ın altındayken **Hücum-S** (küçük sermaye uyarlaması) otomatik
  açılır: 1000 $'da değişmemiş Hücum kolun ~%60'ını yürütebilir (asgari emir
  tutarları yüzünden). Hücum-S yalnız asgari tutarı geçebilen coinlerle çalışır,
  DCA merdivenini kısaltır (PLAN-SERMAYE-1000.md). Satırdaki seçici: oto / açık / kapalı.

**Adımlar (panelde):**
1. Borsa sekmesi → **API anahtarları** → Testnet Key/Secret'ı gir → Kaydet
   (1. bölümün 1–2. adımları).
2. **Testnet'e bağlan** → durum **AKTIF** olmalı.
3. **Elle küçük emir**: `BTC/USDT:USDT`, Al, Piyasa, `0.001` → **Önizle** →
   **Emri gönder**; sonra aynı miktarda Sat + **Yalnız azalt** ile kapat.
   ⚠ Bu testi Hücum/Denge'yi başlatmadan ÖNCE yap ve pozisyonu kapat: bot
   açılışta hesabı kendi defteriyle karşılaştırır, tanımadığı pozisyon görürse
   **ENGEL**'e geçer (bu bilinçli bir güvenlik).
4. Canlı İzleme → **Portföy botları** tablosu → Hücum satırında mod seçiciyi
   **demo** yap → onayla.
5. Aynı satırda **Acil durdurmayı dene (demo)**: demo hesaba küçük, dolmayacak
   bir limit alış konur, sonra acil durdurma çalışır; "önce 1 emir → sonra 0
   emir / 0 pozisyon · mutabakat temiz" görmelisin. (Demo hesaptaki TÜM
   pozisyonlar kapanır.)
6. **Kuru** → bugünkü planı gösterir, emir vermez. BTC rejimi, kol payları ve
   (1000 $'da) Hücum-S'nin hangi coinleri kol dışı bıraktığı görünür.
7. **Başlat** → bot her UTC günü kapanışından ~2 dk sonra önce **mutabakat**
   yapar, sonra yalnız bugünkü hedefe gider. "Şimdi çalıştır" aynı işi hemen yapar.
8. Satırdaki "son çalışma X saat önce" yazısını izle: 26 saati geçerse kırmızı olur.

**Bilgisayar kapalı kalırsa:** sunucu açılınca bot kaçırılan günleri sayar,
geçmiş günlerin emirlerini VERMEZ, yalnız bugünkü hedefe gider; kaçırılan gün
sayısı ve "gölge (ideal) vs gerçekleşen" farkı satırda ve Telegram'da raporlanır.
26 saatten uzun kapalı kaldıysa açılışta Telegram uyarısı gider.

**ENGEL ne demek:** bot yeni emir vermez (acil durdurma yine çalışır). İki sebep:
(a) borsadaki pozisyon defterle tutmuyor → sebebi bul (elle emir mi verdin?),
düzelt, **Mutabakat** düğmesine bas; (b) 30 günde gerçekleşen − gölge farkı
%5'i aştı (PLAN-ILERI-HUCUM-DENGE.md) → incele, sonra **Engeli kaldır**.

## 1c. Telegram bildirimleri (ücretsiz)

1. Telegram'da **@BotFather** → `/newbot` → bir ad ver → sana bir **token** verir
   (`8123456789:AAH...`).
2. Kendi botuna Telegram'dan **/start** yaz (bot sana ancak böyle yazabilir).
3. Chat id'ni öğren: **@userinfobot**'a herhangi bir mesaj at → `Id` satırı.
4. Panel → **Ayarlar** sekmesi → **Telegram bildirimleri**: token + chat id gir,
   **Etkinleştir** kutusunu işaretle → **Kaydet** → **Test** (telefonuna test
   mesajı gelmeli). Token `data/secrets.json`'a yazılır, config.json'a değil.
5. Portföy botları tablosunun üstündeki satır "Telegram bağlı" demeli.
   Token yokken bot normal çalışır, yalnız bildirim göndermez ("Telegram bağlı değil").

Gelen mesajlar: 📊 günlük özet (karar, pozisyonlar, özsermaye, modele ve
gölgeye göre sapma) · 💱 işlemler · 🚨 hata / uyuşmazlık / ENGEL / acil
durdurma · ⚠️ "İncele" bandı, kaçırılan günler, 26 saat çalışmama ·
ileri veri "DUR" (gölge MaxDD p99'u aştı).

## 2. Canlı (gerçek para)

1. Binance API Management'ta yeni anahtar:
   - ✅ Enable Reading, ✅ Enable Futures
   - ❌ **Enable Withdrawals KAPALI** — açıksa bot bağlanmayı REDDEDER
   - ✅ IP erişim kısıtı (bu bilgisayarın dış IP'si)
2. Futures cüzdanına yalnız denemek istediğin kadar USDT aktar.
3. Borsa sekmesi → CANLI Key/Secret → Kaydet → **CANLI bağlan** ("CANLI" yaz).
   Bağlantı izinleri kontrol eder; durum AKTIF olmalı.
4. Emir vermek için **Emir kilidini aç** ("CANLI" yaz). Kilit kapalıyken
   (ve her yeniden başlatmadan sonra) emir gitmez; acil kapatma yine çalışır.
5. Önce en küçük emirle (BTC min nominal 50 USDT) testnet'teki 4–6. adımları
   tekrarla.
6. Donchian botunu başlatmadan önce gece ölçümünü oku (`PLAN-GECE.md` F6):
   tek varlık (yalnız BTC) **BEKLET**, 15 varlıklı portföy **GEÇTİ** ama son
   15 ay düz ve hayatta kalma yanlılığı var. Sermaye tavanını küçük tut.

## 2c. Çoklu varlık (Multi-Assets) kurulumu — gerçek hesap (Hücum/Denge BTC ayağı; KULLANICI yapar)

> Gerçek para modu bu sürümde **kapalı**; bu adımlar 2027 geçişi içindir (`PLAN-GERCEK-PARA-2027.md` §2 C, §4). Bot bu
> akışı `btcAyak: 'coklu'` ile yürütür (`lib/live/cokluVarlik.js`); kâğıtta denendi, demo'da cüzdan aktarımı (sapi) yok.

1. **Ayrı hesap / alt hesap:** bot hesabında başka bakiye ve elle işlem olmasın (bot belirsiz aktarımı spot bakiye farkıyla doğrular).
2. **API anahtarı** (API Management → Create API → System generated):
   - ✅ Enable Reading · ✅ Enable Futures · ✅ **Enable Spot & Margin Trading** (spot BTC alım/satım)
   - ✅ **Permits Universal Transfer** (spot ↔ USDⓈ-M aktarımı)
   - ❌ **Enable Withdrawals KAPALI** (açıksa bot bağlanmaz) · ❌ diğerleri (Margin Loan, Options, Vanilla …)
   - ✅ **Restrict access to trusted IPs only** → evdeki PC'nin dış IP'si
3. **Çoklu varlık modu:** Futures işlem ekranı → ⚙ (Settings / Preference) → **Asset Mode** → **Multi-Assets Mode** → onayla (arayüz yolu değişebilir).
   Ön koşul: izole marjlı açık pozisyon olmasın (mod açıkken izole kullanılamaz). **Gerçek hesapta bot modu kendiliğinden
   AÇMAZ** (yalnız kâğıt/demo yoklamasında açar) — bu adım elle yapılır.
   Doğrulama: Futures cüzdanında BTC'nin "Margin Balance" sütununda teminat değeriyle (≈ endeks × 0,95) görünmesi.
4. **Para:** yalnız denemek istediğin kadar USDT'yi **USDⓈ-M vadeli** cüzdana koy; spot cüzdan boş kalsın. BTC'yi elle alma —
   bot alır ve vadeliye taşır.
5. **Panel:** CANLI Key/Secret → CANLI bağlan ("CANLI") → izinler denetlenir. (Canlı Hücum modu açıldığında: önce "Kuru hesapla".)
6. **İlk gün tatbikatı** (`PLAN-GERCEK-PARA-2027.md` §2 C5): ≈ 20 USDT alım → vadelide BTC → satım → USDT döner; sonra
   "Acil durdurmayı dene". Kayıt: `data/live/<ad>/coklu-varlik.jsonl`.
7. **Elle geri dönüş** (bot çalışmıyorsa): USDⓈ-M emirleri iptal → pozisyonları kapat → Transfer: BTC USDⓈ-M → Spot → spot sat
   (ya da tut) → Transfer: USDT Spot → USDⓈ-M (ya da arayüzden çek).

| görülen | anlamı | ne yap |
|---|---|---|
| "çoklu varlık modu KAPALI — vadelideki BTC teminat sayılmıyor" (ENGEL) | mod kapanmış/hiç açılmamış | 3. adım → panelden Mutabakat |
| "vadeli BTC teminatı … ≠ beklenen" (ENGEL) | elle aktarım/satış ya da negatif USDT için otomatik çevrim (auto-exchange) | Wallet → Transfer History / Convert geçmişine bak → "Engeli kaldır" |
| "BTC ayağı kısıtı … USDT yetmedi" (uyarı) | ay başı ilavesi kolun gerçekleşmemiş kârıyla yapılamadı (bulgu B1) | bilgi; o ay yeniden denenmez |
| "-5013 Asset transfer failed" | çekilebilir tutar marja bağlı ya da izin yok | Universal Transfer izni + çekilebilir miktar |
| "çözülmemiş belirsiz akış" | aktarım/emir cevabı kayboldu, sorgu da okunamadı | ağı düzelt → Mutabakat (kendisi sorgular) |
| "spot cüzdanda botun olmayan bakiye" (ENGEL) | spota elle para/BTC geldi ya da elle işlem yapıldı (adanmış hesap şartı) | spotu boşalt (vadeliye aktar ya da çek) ya da bilerek kabul edip "Engeli kaldır" |
| "bu borsa hesabında başka bir çoklu varlık botu var" | aynı hesapta ikinci çoklu varlık botu | hesap başına tek bot — ikinci strateji için ayrı alt hesap |
| "marj oranı … ≥ kapı %30" | kol pozisyonları marjın büyük kısmını kullanıyor | bilgi; BTC alımı oran düşünce yapılır |
| "durum dosyası bozuk" (ENGEL) | `coklu-varlik.json` okunamadı (yedeği `.bozuk-*.bak`) | Binance Transfer/Order History'yi incele → "Engeli kaldır" |
| "canlıda mod otomatik açılmaz" / "modu KAPALI" | gerçek hesapta mod elle açılır | 3. adım |

## 2b. Portföy modu (Aday A2 — gecenin geçen adayı)

`config.json` → `canli.semboller` verilirse bot her sembole eşit ağırlık
verir (toplam maruziyet ≤ 2x), backtest'teki `scripts/donchian-portfoy.js`
ile aynı kural:
```json
"canli": { "sermayeTavani": 3000, "maxEmirNominal": 300, "maxPozisyonNominal": 600,
  "semboller": ["BTC/USDT:USDT", "ETH/USDT:USDT", "BNB/USDT:USDT", "SOL/USDT:USDT", "XRP/USDT:USDT",
    "ADA/USDT:USDT", "DOGE/USDT:USDT", "LINK/USDT:USDT", "AVAX/USDT:USDT", "ATOM/USDT:USDT",
    "DOT/USDT:USDT", "LTC/USDT:USDT", "TRX/USDT:USDT", "UNI/USDT:USDT", "FIL/USDT:USDT"] }
```
⚠ **Asgari sermaye:** her bacak sermaye × maruziyet / 15. BTC'nin min
nominali 50 USDT; bacaklar bunun altına düşerse emir verilmez (önizleme
−4164 ile yakalar) ve portföy backtest'ten sapar. 15 varlıkta pratik alt
sınır ~2.000–4.000 USDT. Daha az sermayeyle daha az sembol seç — ama o
seçim ölçülmedi.

## 3. Bir şey ters giderse

| görülen | anlamı | ne yap |
|---|---|---|
| durum DURDURULDU, "mutabakat okunamadı" | borsa okunamadı (ağ/anahtar) | ağı kontrol et → **Mutabakat** |
| "emrin durumu çözülemedi" | gönderilen bir emrin cevabı kayboldu, sorgu da cevapsız | Binance'te açık emirlere bak → **Mutabakat** |
| −2019 marj yetersiz | cüzdan bakiyesi | miktarı düşür |
| −4164 / −4003 | nominal/miktar çok küçük | önizleme zaten yakalar; miktarı artır |
| −1021 zaman damgası | bilgisayar saati | Windows saatini senkronla |
| "PARA ÇEKME izni açık" | anahtar güvensiz | anahtarı yeniden oluştur |

Emir kayıtları: `data/live/emirler.jsonl` (her satır bir durum değişikliği).
Günlük: panel Aktivite Günlüğü, `[BORSA]` ve `[DONCHIAN]` önekli.

## 4. Henüz doğrulanmamış (anahtar gerektiği için)

İmzalı istekler gece testnet anahtarı olmadan denenemedi: bakiye, pozisyon
modu, emir/iptal, mutabakat, `apiRestrictions`. Ağsız 67 test ve halka açık
uçlara karşı yoklama (`node scripts/binance-yoklama.js`) geçiyor. İlk testnet
oturumunda yukarıdaki 1. bölümü adım adım yapmak bu doğrulamadır.

Hücum/Denge demo yolu (1b) da yalnız sahte borsayla sınandı (`npm run test:isletim`):
demo bağlantısı, perp BTC ayağı, mutabakat ENGEL'i, acil durdurma denemesi,
telafi, kalp atışı, Telegram atlanması, Hücum-S. Gerçek demo hesapta ilk
çalıştırma (1b, 1–7) bu doğrulamadır. Özellikle bakılacaklar: demo'nun
BTCUSDT asgari tutarı/adımı (satırda "demo ↔ prod filtre farkı" yazar) ve demo
hesabın çoklu varlık modu (demo botu bunu kullanmaz; BTC ayağı perp). Çoklu varlık akışının demo'da
doğrulanabilen kısmı (mod, spot emir, hesap alanları — sapi aktarımı demo'da yok): `node scripts/coklu-varlik-demo-yoklama.js` (§2c,
`PLAN-GERCEK-PARA-2027.md` §2 B).
