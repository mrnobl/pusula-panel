# TEKNİK TASARIM: Makine × hesap × bot planının uygulama aşamaları

**Kaynak:** `PLAN-MAKINE-HESAP-BOT.md` (HEAD 5463d3c). Kararlar orada; bu belge yalnız "nasıl yapılacağını" anlatır.
**Taban:** HEAD (73.6). Çalışma ağacındaki 73.7 yarım değişiklikleri hesaba katılmadı. Uygulayan ajan her aşamaya başlamadan önce 73.7'nin son hâlini almalı. Çakışma beklenen dosyalar şunlar: `lib/ozDenetim.js`, `lib/evOkuma.js`, `lib/guncelleme.js`, `lib/veriTurleri.js`, `package.json`, `public/js/pages/saglik.js`, `public/js/core/rota.js`.
**Ad karışıklığı:** Planda iki ayrı "C3" var. g1 sırasındaki C3 "yapay zekâ haber okuma", §4'teki C3 ise "sürüm uyum testi". Bu belgede ikincisi **C3-uyum** diye geçiyor.

---

## 0. Bütün aşamalarda geçerli kurallar

1. **Canlı kod sınırı.** Canlı küme şunlardır: `lib/live/*`, `lib/risk/*`, `engine`, `exchange`, `riskManager`, `telegram`, `saglikSinyali`, `acilPin` ve bunların require ettiği her dosya (`lib/guncelleme.js` `CANLI_KOK` + `canliKumesi`). Bunlara dokunan her değişiklik iki kurala uyar:
   - Yeni davranış **isteğe bağlı bir kancayla** gelir. Kanca verilmezse kod bugünküyle birebir aynı çalışır. Örnekler: `ayar.veriKapisiFn`, `ayar.riskKapisiFn`, `ayar.borsa`.
   - Sürüm onaylı gider (g3).
2. **Kairos demo kabulü (2026-12-09'a kadar) korunur.**
   - Değişmeyecekler: `data/live/hucum-demo/` dizini, hesap-işlemleri hesap adı `testnet`, gölge `hucum.C0`, `config.healthchecksUrl`, `prova-gunlugu.json` biçimi.
   - Yeni denetim/kapı/tatbikat, `mod === 'demo' && simdi < 2026-12-09T21:00Z` olan bota yalnız **haber** olarak uygulanır. Bu koşul `OzDenetim.dokunulmaz` ile aynıdır; tek kaynak olsun diye `lib/ileri/demoKabulEsikleri.js`'e `KORUMA_BITIS` diye taşınabilir.
3. **Antivirüs uyumu.**
   - PowerShell/cmd açılmaz.
   - Görev Zamanlayıcı'ya kod görev yazmaz. Kılavuz `schtasks` komutunu gösterir, kullanıcı kendisi kurar.
   - ACL değişikliği yok.
   - Şifreleme yalnız Node `crypto`, yani mevcut `lib/paket.js` `sifrele/coz` (AES-256-GCM + scrypt). DPAPI yok.
4. **Süreç kapatma** yalnız `process.pid` (donma bekçisi deseni). Başka bir süreci sihirbaz da tatbikat da kapatmaz; kullanıcıdan ister.
5. **Mühürlü dosyalar değişmez:** `scripts/dikkat-ls.js`, `scripts/dikkat-ls-veri.js`, `lib/research/pitVeri.js`.
6. **Yeni npm paketi yok.** OKX ve Bybit, kurulu `ccxt@4.5.89` içinde zaten var (`ccxt.okx`, `ccxt.bybit` doğrulandı). Tar, şifreleme ve HTTP için Node yerleşikleri yeter.
7. **Her yeni data parçası** `lib/veriTurleri.js` TABLO'ya satır olarak eklenir; eklenmezse `veri-yolu-selftest` kırılır. Yol her zaman `yollar.veri(...)` ile kurulur.
8. **Kademe (yetki seviyesi) ilkeleri:**
   - Telefon: yalnız GET + acil.
   - Geliştirme: yalnız `GELISTIRME_YAZMA` listesi. Bot, emir ve taşıma uçları bu listeye **eklenmez**.
   - Yeni **makine** kademesi (3. faz) yalnız `MAKINE_IZINLI` listesindeki uçlar içindir.
9. **Testte kaynak taraması.** 45 öz test `server.js` metnini regex ile tarıyor. C1'den önce bunlar ortak bir yardımcıya çevrilir (bkz. §3 adım 0).
10. **Her sürümde yapılacaklar:**
    - `npm test` (tam zincir).
    - Canlı kod değiştiyse güncelleyicinin kuru denemesi zaten çalışır. Ayrıca elle `scripts/kuru-deneme.js` çalıştırılır: eski/yeni kök, hucum + denge kopyaları, "ayni" sonucu beklenir.
    - Kılavuz bölümü + `kilavuz-testi`, CLAUDE.md sürüm notu, `ai/00-BASLA.md` (`ai-devir-testi`).

Büyüklük ölçeği (testler dahil, satır): **S** < 300 · **M** 300–900 · **L** 900–2000 · **XL** > 2000.

---

## 1. D4 — Veri kalitesi kapısı

**Amaç:** Botun her karar girdisi karar anından önce tek kapıdan geçsin. Ağır bozuklukta bot güvenli kipe girer, hafif bozuklukta uyarı + Sorunlar kartı. Bulgular yalnız eklenir.

### 1.1 Bugünkü durum
- BTC günlük mumları için `donchianBot.mumKapisi` var (bayat, boşluk, sıfır fiyat, OHLC tutarsızlığı, sıçrama %50 / düşüş %60, 3 gün sıfır hacim).
  - `BindirmeBot._calistir` geçersiz mumda **hata atar**, 15 dk sonra yeniden dener. Telegram uyarısı gider, healthchecks'e `log` yazılır.
- `KalkanBot` kol sembollerinde: aynı kapıdan geçemeyen sembol bu çalışmada atlanır, açık Donchian pozisyonu korunur.
- `OzDenetim` `fiyat` denetimi: iki kaynak arasında %3 sapma varsa güvenli kip, %1'in altına inince kalkar. Demo bota dokunmaz.
- `CanliYurutucu.mutabakat`: bakiye, pozisyon ve açık emir cevaplarının biçimini denetler, bozuksa DURDURULDU yapar.
- Evren: `Evren.guncelle` borsa okunamazsa eski evreni korur ve `bayat` işaretler.

### 1.2 Tasarım
Yeni saf modül **`lib/live/veriKalitesi.js`** (canlı kümede):
- `denetle(tur, girdi, baglam)` → `{ agirlik: 'temiz'|'hafif'|'agir', bulgular: [{kod, metin, deger, esik}] }`. Türler:
  - `mum-btc`: mevcut `mumKapisi` sonucu; geçersizse **agir**, bugünkü sebepler aynen. Ek kontroller:
    - **iki kaynak:** Binance perp günlük kapanışı ile Binance **spot** BTCUSDT günlük kapanışı karşılaştırılır (ikisi de `binance.com`, kuru deneme ağ kalkanından geçer). Fark %1,5'i aşarsa hafif, %3'ü aşarsa agir.
    - İkinci kaynak okunamazsa: hafif, kod `ikinci-kaynak-yok`. **Karar engellenmez.**
  - `mum-kol` (sembol başına): bugünkü atlama davranışı aynen. Ek olarak "evrenin %30'undan fazlası atlandı" durumu hafif.
  - `fiyat` (mark/ticker): sıfır/NaN ise agir; son okunan kapanıştan %20'den fazla sapıyorsa hafif.
  - `evren`: `bayat` hafif; sembol sayısı < k/2 agir; `fetchTickers` boş gelirse agir.
  - `hesap` (`y.hesap()` / mutabakat çıktısı): NaN/negatif toplam agir. "Önceki çalışmaya göre ±%30, ama işlem ya da sermaye akışı yok" hafif.
  - `funding` (yalnız demo funding düzeltmesi ölçümde kullanılıyor, kararda değil): okunamazsa ya da \|r\| > %1/8 sa ise hafif. **Asla agir değil.**
  - `oi`: bugün hiçbir karar girdisi değil. Tür tanımlanır ama yalnız ileride (ileriye kayıt) kullanılır.
- `VeriKapisi` sınıfı (bot başına):
  - `kaydet(bulgu)`: `<dizin>/veri-kalitesi.jsonl` dosyasına yalnız ekler. Bot diziniyle birlikte taşınır, mevcut `live` satırı ile KİŞİSEL sayılır.
  - `durum()`: son 30 gün özeti, açık sorunlar.

**Bota entegrasyon (asgari canlı değişiklik):**
- `BindirmeBot` kurucusuna isteğe bağlı `ayar.veriKalitesi` (`VeriKapisi` örneği) ve `ayar.veriKalitesiKip` (`'izleme'|'etkin'`) eklenir.
- `_calistir` içinde sıra şöyle:
  1. **Önce** mevcut `mumKapisi` aynen çalışır; atılan hata ve metin aynıdır.
  2. Kapıdan geçtiyse `veriKalitesi.denetle('mum-btc', …)`.
  3. Sonuç agir ise ve kip `etkin` ise ve bot `dokunulmaz` değilse: `guvenliKipKoy('veri:<kod>', metin)` → mevcut `_ertele` yolu (karar ertelenir, stop ve koruma sürer, tek bildirim).
  4. Diğer durumlarda yalnız kayıt + uyarı.
- `veriKalitesi` verilmezse ikinci kaynak hiç okunmaz → davranış birebir 73.6.
- `KalkanBot`: kol için **yalnız sayım/kayıt** kancası `ayar.veriKalitesi`. Sembol atlama kuralı değişmez.
- **Güvenli kipin kalkması:** sonraki denemede (15 dk) temizse veri kapısı `guvenliKipKaldir('veri')` çağırır. Mevcut `guvenliKipKaldir(kaynak)` ile aynı kalıp, öz denetimdeki `fiyat` örneği gibi.
- **Öz denetime** yeni denetim `veri` (grup `borsa`, kademe `koru`, belirti): bot başına son bulgular, açık güvenli kip sebebi. Sorun merkezi 73.7 kartları bu denetimden beslenir.

### 1.3 Dosyalar
- **Yeni:**
  - `lib/live/veriKalitesi.js`
  - `scripts/veri-kalitesi-selftest.js`
- **Değişen:**
  - `lib/live/bindirmeBot.js` (kanca, ~40 satır)
  - `lib/live/kalkanBot.js` (sayım kancası, ~15 satır)
  - `server.js` `bindirmeKur` (VeriKapisi'ni geçer; kip `config.veriKalitesi.kip`, varsayılan bkz. açık karar)
  - `lib/ozDenetim.js` (`veri` denetimi + DENETIMLER satırı)
  - `public/js/pages/saglik.js` / Sorunlar kartı (73.7'nin kart yapısına bir kaynak)
  - `lib/evOkuma.js` `EV_YOLU` (`veri-kalitesi$`)
  - `config.varsayilan.json` (`veriKalitesi: { kip, esikler }`)
  - `package.json` (test)
  - kılavuz `saglik.md` / `sorun-giderme.md`

### 1.4 Uçlar
- `GET /api/veri-kalitesi` → `{ botlar: { <ad>: { kip, son, acik, sayac30 } } }`. Kademe yerel/telefon/geliştirme (GET). Araştırma kopyası sunucudan okur.
- `POST /api/veri-kalitesi/kip` `{ kip }`: yerel, onay. Telefon 403, `GELISTIRME_YAZMA`'ya eklenmez.

### 1.5 Göç ve geri dönüş
Göç yok; yeni dosya bot dizininde oluşur. Geri dönüş: eski sürüm `veri-kalitesi.jsonl`'u yok sayar, `kip` ayarını tanımaz.

### 1.6 Riskler ve kanıt testleri
- **Risk:** yeni kontrol yanlış pozitifle botu güvenli kipe sokar ve günlük karar kaçar.
  - Önlem: ilk sürümde kip **izleme**, kalibrasyon sonra.
  - Demo Kairos her durumda yalnız haber alır.
- **Kanıt testleri:**
  - `bindirme-selftest` + `kalkan-selftest`: değişmeden geçmeli.
  - Yeni test: `veriKalitesi` verilmeyen bot ile verilen-ama-temiz bot için `calistir({kuru})` raporu derin eşit olmalı.
  - `mumKapisi` hata metinleri aynı kalmalı (oz-denetim / sorun-p1 bu metni regex'le tanıyor: `/^veri kapısı \(/`).
  - Kuru deneme (eski/yeni kod) sonucu "ayni" olmalı.
  - Güvenli kip yolu için `sorun-p1-selftest` `_ertele` bölümleri geçmeli.

### 1.7 Bölme, büyüklük, bağımlılık
- **Bölme:** tek sürüm (M). İstenirse iki parça: (a) modül + izleme + kart, (b) etkin kip.
- **Bağımlılık:** 73.7'nin Sorunlar kartı yapısı.

### 1.8 Açık karar
1. **İlk kip.** Plan "ağır bozuklukta güvenli kip" diyor. **Önerim:** ilk 7 gün **izleme** (A3 r1 ile aynı mantık: gerçek bulgular görülsün, sonra etkin). İki istisna:
   - Mevcut 69.3 mum kapısı zaten bugünkü gibi çalışmaya devam eder (karar vermez).
   - Kâğıt botlarda (Tao) etkin kip baştan açılabilir.
2. **İkinci kaynak.** Binance spot mu, OKX herkese açık uç mu? **Önerim:** Binance spot. Kuru denemenin ağ kalkanı yalnız Binance'e izin veriyor, kanıt testi bozulmasın.

---

## 2. A1 + 2. faz — Bot kaydı (bot başına dosya), Kairos/Tao göçü, şablonlar, hesap bağlama, a4/a5/a6

### 2.1 Bugünkü durum
- Bot listesi `lib/research/bindirme.js` `STRATEJILER` anahtarlarından geliyor (`BINDIRME_ADLAR`, server.js 684).
- Ayarlar `config.bindirme.<ad>`: `mod`, `sermayeTavani`, `kagitBakiye`, `k`, `demoSermayeTavani`, `canliSermayeTavani`, `kucukSermaye`, `btcAyak`, `tavanAkis`. Sır olan `healthchecksUrl` secrets'ta.
- Varsayılanlar `bindirmeAyar` içinde (server.js 721).
- Anahtar seçimi: `bagla()` ya `config.apiKey` ya da `testnetApiKey` kullanıyor.
- `BindirmeBot`, `STRATEJILER[ayar.ad]` üzerinden `btcPay`, `tau` (vol) ve görünen adı alıyor. Gölge model satırı da `ad` ile (`I.golgeModelDurumu(…, this.ayar.ad)`).
- Elle yazılmış listeler: panel `botlar.js ADLAR=['hucum','denge']`, `tasima.js BOTLAR`, `kuru-bilgi`, Telegram `portfoyBotlari`, `saglikBotlar` (sabit nesne), `anahtarlar.satirlar` (botlar ctx'ten).

### 2.2 Veri biçimi
Bot başına dosya: **`<veri>/live/botlar/<kimlik>.json`**.
- `live` zaten KİŞİSEL; yedeğin `KRITIK_DIZIN`'inde ve taşıma paketinde var → veriTurleri'ne yeni satır **gerekmez**.
- Yazım `kaliciDosya.yaz` ile (tmp + fsync + .yedek). Okuma `kalici.oku`; bozuksa ENGEL + yedekten kurtarma.

```json
{
  "surum": 1,
  "kimlik": "hucum",
  "sablon": "kairos",
  "motor": "bindirme",
  "strateji": "hucum",
  "adGorunen": null,
  "mod": "demo",
  "hesap": { "demo": "binance-demo", "canli": "binance-canli" },
  "sermaye": { "kagit": 10000, "demo": 1000, "canli": 0 },
  "kagitBakiye": 10000, "k": 15, "kucukSermaye": "oto", "btcAyak": null, "tavanAkis": true,
  "makine": null, "nobet": 0,
  "olusturma": "…", "degisme": "…", "goc": { "kaynak": "config.bindirme", "zaman": "…", "ozet": "<sha256 16>" }
}
```

Alanların anlamı:
- `kimlik`: `/^[a-z][a-z0-9]{1,15}$/`. **Tire yok**, çünkü `bd${ad.slice(0,2)}` ve `emirKimligi.uret` etiketi `[a-z0-9]{1,8}` istiyor. `botAdlari` kimlikleri, TAKMA'lar, `kalkan` ve `donchian` yasak.
- `strateji`: `STRATEJILER` anahtarı. Gölge modeli ve `btcPay`/`tau` buradan gelir. Kairos/Tao'da `kimlik === strateji`.
- `sermaye`: a5. Mod başına USD üst sınır; `sermayeTavani` / `demoSermayeTavani` / `canliSermayeTavani` alanlarına çevrilir. "Bakiye azsa bakiye" kuralı zaten `Ecap = min(E, sermayeTavani)` ile işliyor; değişiklik yok.
- `hesap`: mod başına Anahtarlar kimliği (`SABIT` id ya da `borsaHesaplari` id). Kâğıt modda hesap yok.
- `makine` / `nobet`: 3. faz. Şimdilik `null` = bu makine, `0`.
- Sır yok. Sağlık adresi secrets `bindirmeSaglik`'ta kalır (a1).

**Şablonlar** (`lib/botSablonlari.js`, saf, a3 — yalnız sınanmış kurallar):

| sablon | motor | strateji / model | sabitlenen |
|---|---|---|---|
| `kairos` | bindirme | hucum | — |
| `tao` | bindirme | denge | — |
| `kairos-s` | bindirme | hucum | `kucukSermaye: true` |
| `nova` / `lydia` / `simurg` | model | m-qqq-m10 / m-bist-m10 / m-837 | ikinci parça (2.6) |

### 2.3 Modül: `lib/botKayit.js` (canlı küme dışı, server tarafı)
- `liste()`, `oku(k)`, `yaz(kayit)` (doğrulama + `degisme`), `yeni({sablon, kimlik, ad, sermaye})` (a6: `mod` her zaman `'kagit'`), `arsivle(k)` (yalnız kâğıt ve durmuş bot; dizin `onceki-` ile taşınır, **silinmez**).
- `ayar(kayit, mod)` → bugünkü `bindirmeAyar(ad)` ile **aynı biçimde** nesne üretir. server.js'in `bindirmeKur`'u bu nesneyi tüketir; `bindirmeAyar` bu fonksiyona sarılır.
- `hesapCakismasi(kimlik, mod, hesapId, ctx)` (a4):
  - Kâğıtta `null` döner.
  - Kâğıt olmayan başka bir kayıt aynı hesabı kullanıyorsa ya da eski Borsa sekmesi yürütücüsü (`canli`, `donchianBot`) o hesaba bağlıysa → engel metni.
  - Bugünkü `bindirmeDemoCakisma` bunun özel hâline indirgenir.
- `gocEt(config)` (A1 göçü, aşağıda).

### 2.4 BindirmeBot değişikliği (canlı, asgari)
- Kurucu: `const tanim = STRATEJILER[ayar.strateji || ayar.ad] || {}`. Gölge çağrılarında `this.ayar.strateji || this.ayar.ad`.
- Kairos/Tao için `strateji` ya verilmez ya `ad` ile aynıdır → **bit bit aynı**.
- `scripts/kuru-deneme.js` `--strateji` argümanını kabul eder (yoksa `ad`). `kuru-bilgi` ucu `strateji`'yi de yollar.
  - Eski lib kopyası bu argümanı yok sayar. Göçten önceki botlarda `ad === strateji` olduğundan sonuç değişmez.

### 2.5 Kairos/Tao göçü (a2): birebir
Açılışta `botKayit.gocEt` çalışır. Her `ad` için (hucum, denge), `live/botlar/<ad>.json` yoksa:
1. `ham = bindirmeAyar(ad)` alınır (bugünkü birleşik nesne, varsayılanlar dahil).
2. Kayda çevrilir:
   - `strateji = ad`, `sablon = ad==='hucum' ? 'kairos' : 'tao'`
   - `hesap.demo = 'binance-demo'`, `hesap.canli = 'binance-canli'`
   - `sermaye = {kagit: ham.sermayeTavani, demo: ham.demoSermayeTavani, canli: +ham.canliSermayeTavani || 0}`
   - kalan alanlar aynen.
3. **Doğrulama:** `botKayit.ayar(kayit, mod)` derin eşittir `ham` (bilinmeyen alanlar da `ek` altında korunur). Eşit değilse göç yapılmaz, eski yol kullanılır, WARN yazılır.
4. `goc.ozet` = `ham`'ın sha256'sı.

**Çift yazım (geri dönüş için, 2 sürüm):**
- Bütün yazan uçlar hem kaydı hem `config.bindirme.<ad>`'ı günceller: `/mod`, `/kucuk-sermaye`, `/kagit-sifirla` (btcAyak), `botSaglik` ve yeni sermaye ucu.
- Eski sürüme dönülürse `config.bindirme` zaten günceldir.
- 3. sürümde çift yazım kaldırılır. Kayıt tek kaynak olur, `config.bindirme` dokunulmadan kalır.

Değişmeyenler: dizin kuralı `bindirmeDizin(ad, mod)` (`hucum`, `hucum-demo`, `hucum-canli`), hesap adı (`bindirmeHesapAdi`), healthchecks yolu, gölge dosyası.

**Kanıt (zorunlu):**
- **(a)** Yeni test `scripts/bot-kayit-selftest.js`. Matris: mod {kagit, demo, canli} × btcAyak {yok, spot, coklu} × kucukSermaye {oto, true, false} × tavan varyantları.
  - Eski yol: `bindirmeAyar` → `bindirmeKur` argümanları.
  - Yeni yol: kayıt → `ayar` → `bindirmeKur` argümanları.
  - `BindirmeBot` ve `CanliYurutucu`'ya giden ayar nesneleri **derin eşit** olmalı (fonksiyonlar adıyla karşılaştırılır).
  - Bunun için server.js'teki `bindirmeKur` saf bir fabrikaya ayrılır: `lib/sunucu/botFabrikasi.js` `argumanlar(kayit, mod, ortam)` (C1'in ilk parçası burada doğal olarak başlar).
- **(b)** Kuru deneme: eski kod (73.x) ile yeni kod, hucum ve denge bot dizini kopyalarıyla → "ayni".
- **(c)** Geçmiş yeniden üretim: `node scripts/canli-yeniden-oynat.js --mod tam --gun 120` önce ve sonra; `data/arastirma/canli-yeniden-oynat-ham/tam.json` özsermaye serisi aynı olmalı. Uzun sürer, zincirde yok; sürüm notuna sonucu yazılır.
- **(d)** Var olan zincir: `bindirme-selftest`, `bindirme-islem-selftest`, `canli-saglamlik-selftest`, `demo-kabul-selftest`, `coklu-varlik-selftest`.

### 2.6 Şablondan yeni bot (a3, a6) ve hesap bağlama
- `POST /api/botlar` `{ sablon, kimlik, adGorunen, sermaye: {kagit} }` → kayıt + `bindirmeler[kimlik] = bindirmeKur(kimlik,'kagit')`. Çalışma zamanında eklenir; `saglikBotlar` ve Telegram listesi dinamik getter olur.
- Görünen ad: `botAdlari.ad(kimlik) || kayit.adGorunen || kimlik`. `botAdlari.gorunen` bot nesnesinden okur. Ön yüz `AG.botAd` bilinmeyen kimlikte API'nin `adGorunen`'ini kullanır.
- **a6:** yeni bot kâğıtta başlar. Demo/canlıya geçiş mevcut `/api/bindirme/:ad/mod` ile; artık şu sırayla denetlenir:
  1. `hesap[mod]` bağlı mı?
  2. a4 çakışması var mı?
  3. Canlı kapısı (bugünkü `canliKapi`, yalnız `hesap.canli === 'binance-canli'` ile; yeni canlı hesaplar 5. faza kadar reddedilir: "gerçek para hesabına dokunulmaz").
- **Hesap bağlama:** `POST /api/botlar/:k/hesap` `{ mod, hesap, pin, onay:true }` (acil PIN, anahtarlar.js deseni; yanlış PIN 400, kilit 429).
  - Kurallar: hesabın `borsa === 'binance'` olmalı (A2'ye kadar), `tur` moda uymalı (`demo`↔demo, `canli`↔canli), a4 temiz olmalı.
  - Anahtar çözümü: `bagla()` yeni `hesapAnahtari(kayit, mod)` çağırır. `SABIT` id ise eski alanlar (`apiKey`/`testnetApiKey`), değilse `secrets.borsaHesaplari[id]`.
  - **Kairos için sonuç aynı** (`binance-demo` → `testnetApiKey`).
- `anahtarlar.satirlar`: `borsaHesaplari` satırının `kullanan`'ı artık bağlı botlardan gelir ("henüz hiçbir bot (Faz 2)" metni kalkar).
- `POST /api/botlar/:k/sermaye` `{ mod, tutar }`: kâğıtta onay, demo/canlıda PIN. Tutar ≤ 1e7, canlıda `canliKapi` onaylı üst sınır. Çalışan botta mevcut `sermayeDegisikligi` / `tavanAkis` yolu kullanılır.
- **Model şablonları** (nova/lydia/simurg) **ayrı parça (2c):**
  - Bugünkü `lib/tasarimci/kagit.js` model id başına tek `sermaye.json` tutuyor.
  - İkinci örnek için `kagit.js`'e `ornek` desteği gerekir: `data/tasarimci/ornekler/<kimlik>/sermaye.json`. Model kararları ortak, kâğıt hesabı ayrı.
  - Botlar sayfasında portföy botları gibi görünür.

### 2.7 Panel
- `botlar.js`: `ADLAR` yerine `GET /api/botlar` listesi. Sekme simgesi yoksa baş harf, açıklama şablondan gelir.
- Ayarlar › Botlar (`ayarlar.js #ayarBotlar`):
  - "Yeni bot" formu: şablon seç, kimlik, ad, kâğıt sermayesi.
  - Bot satırında "Hesap" seçici (Anahtarlar hesapları, moda göre süzülmüş), "Sermaye üst sınırı", "Arşivle" (yalnız kâğıt ve durmuş botta).
- `anasayfa.js`, `hesaplar.js`, `bindirmeIslem.js`, `sinyaller.js`, `ileri.js`: yalnız liste kaynağı değişir; kimlik eşleme `botAdlari` üzerinden.
- `panel-botlar-testi` ve `panel-anasayfa-testi` güncellenir.

### 2.8 Uçlar (özet)

| Uç | Yöntem | Kademe |
|---|---|---|
| `/api/botlar`, `/api/botlar/sablonlar` | GET | yerel · telefon · geliştirme (EV_YOLU'na `botlar` eklenir) |
| `/api/botlar` | POST | yerel, onay |
| `/api/botlar/:k/hesap` | POST | yerel, PIN + onay |
| `/api/botlar/:k/sermaye` | POST | yerel; demo/canlıda PIN |
| `/api/botlar/:k/arsivle` | POST | yerel, onay |
| mevcut `/api/bindirme/:ad/*` | — | aynen; `bindirmeBul` dinamik listeden |

- `ARASTIRMA_KAPALI` regex'ine `botlar` POST eklenir.
- `guvenlik.BOT_EMIR_UCLARI`'na `botlar` eklenir. Telefon zaten GET dışında keser; geliştirme kademesine eklenmez.

### 2.9 Dosyalar
- **Yeni:**
  - `lib/botKayit.js`
  - `lib/botSablonlari.js`
  - `lib/sunucu/botFabrikasi.js` (bindirmeKur'un saf argüman üretimi)
  - `scripts/bot-kayit-selftest.js`
- **Değişen:**
  - `server.js` (BINDIRME_ADLAR → dinamik; bindirmeAyar/bindirmeKur/bagla/acilisBaglan döngüsü; mod/kucuk/kagit-sifirla/botSaglik çift yazım; kuru-bilgi; Telegram ve saglikBotlar getter)
  - `lib/live/bindirmeBot.js` (strateji alanı, ~6 satır)
  - `scripts/kuru-deneme.js`, `lib/kuruDeneme.js` (`--strateji`)
  - `lib/tasima.js` (`BOTLAR` → dinamik liste + `kalkan`, `donchian`)
  - `lib/anahtarlar.js` (`kullanan`)
  - `lib/botAdlari.js` (bilinmeyen kimlik için bot nesnesinden ad)
  - `lib/telegramKomut.js` (görünen ad)
  - `public/js/core/sozluk.js`, `public/js/pages/{botlar,ayarlar,anasayfa,hesaplar}.js`
  - `lib/evOkuma.js`, `lib/guvenlik.js`
  - kılavuz `botlar.md`, `ayarlar.md`

### 2.10 Riskler
- **Çalışma zamanında bot ekleme:** öz denetim, bekçi, rapor ve gölge özeti listeyi bir kez alıp önbelleğe alıyorsa yeni bot görünmez. Hepsi fonksiyonla okumalı. Test: bot ekle → `ozDenetim.ctx.botlar()` onu içeriyor mu?
- **Gölge:** yeni Kairos tipi bot `hucum.C0` ile karşılaştırılır. Sermaye 5000 $ altında ve kucukSermaye açıksa fark büyür. Mevcut %3/%5 bandı ENGEL koyabilir. Kâğıtta bu kabul edilebilir; panelde "kıyas: Kairos modeli" notu düşülür.
- **clientOrderId öneki çakışması** (`bd` + ilk 2 harf): yalnız aynı hesapta önemli, a4 bunu zaten engelliyor. Yine de `bindirmeKur`, aynı hesap/ortamdaki iki botun aynı 2 harfle başlamasını reddeder.
- **Kâğıt botlar** ayrı `kagit-borsa.json` kullanır; a4 dışındadır.
- **`sermaye`/`sermayeTavani` eşlemesi:** demo için `demoSermayeTavani` varsayılanı 1000. Göç doğrulaması (2.5 adım 3) bunu yakalar.

### 2.11 Bölme
- **2a (L):** kayıt + göç + çift yazım + strateji alanı + `/api/botlar` GET + panel listesi dinamik. **Yeni bot oluşturma yok.** Bot kodu değiştiği için onaylı.
- **2b (M):** şablondan yeni kâğıt bot, hesap bağlama, a4, a5 uçları, Ayarlar formu.
- **2c (M):** model şablonları (tasarimci örnekleri).
- Çift yazımın kaldırılması 2c'den sonra ayrı küçük bir sürümde.
  - **74.7'de uygulandı:** kayıt tek kaynak (yazan uçlar yalnız kayda); `config.bindirme` "dokunulmadan kalır" yerine kayıttan **tek yönlü türetilen geri dönüş yansıması** seçildi — donmuş kopya, 74.4–74.6'nın açılıştaki "ayrışırsa config kazanır" kuralı yüzünden eski sürüme dönüşte kaydı eski değere ezerdi. Ayrıntı CLAUDE.md "Panel 74.7".

**Bağımlılık:** yalnız 73.0 Anahtarlar. D4 bağımsız; D4'ten sonra gelirse `veriKalitesi` kancası yeni botlara da geçirilir.

### 2.12 Açık kararlar
1. **Yeni bot oluşturma PIN istesin mi** (yalnız kâğıt)? **Önerim:** PIN yok, onay var. Para riski yok. PIN; hesap bağlama, demo/canlı geçişi ve sermaye artışında.
2. **Kairos tipi yeni botun gölge kıyası.** **Önerim:** kucukSermaye açıksa `hucumS` gölgesi (972, `lib/ileri/hucumSGolge.js`) kıyas olarak gösterilsin, ENGEL eşiği yalnız `hucum.C0`'a göre. Yeni botlar kâğıtta olduğu için ENGEL yalnız uyarı. Kullanıcıya bir kez sorulmalı.

---

## 3. C1 — server.js bölme haritası

**İlke:** davranış aynı, yalnız yer değişir. Desen bugün zaten var: `require('./lib/x').router(ctx)` (ör. `lib/tasarimci/api.js`, `lib/bildirimMerkezi.js`). Yeni klasör `lib/sunucu/`.

**Ortak bağlam** `lib/sunucu/baglam.js` server.js içinde kurulur:
```
ctx = { app, db, yollar, APP_VERSION, ARASTIRMA_MODU, HOST,
        config: () => config, configYaz: (c) => { config = c },        // config `let` — DOĞRUDAN geçirilmez
        loadSecrets, saveSecrets, saveConfig, broadcast, engine, portfoyBildirici,
        bindirmeler, botKayit, saglikBotlar, saglikSunucu, kararPenceresinde, ... }
```
Kural: modül, ctx alanını **kullanım anında** okur, kurulumda kopyalamaz. Hoisting farkı ve geç tanımlanan değişkenler bu yüzden sorun olmaz.

**Adım 0 (S, ilk sürümün başı): test altyapısı.**
- `scripts/lib/sunucuKaynak.js` eklenir: `server.js` + `lib/sunucu/*.js` metnini birleştirir.
- Kaynak tarayan 45 öz test buna çevrilir. Bu adımda kod taşınmaz; testler aynı sonucu vermeli.
- **Uç envanteri testi** `scripts/sunucu-uc-envanteri-selftest.js`:
  - Sunucuyu geçici veri köküyle açar (`PUSULA_VERI=<tmp>`, port 0, Telegram engelli).
  - `app._router.stack` dökümünü alır: sıra, yöntem, yol, ara katman adı.
  - Sonucu `scripts/fixtures/sunucu-uclari.json` ile karşılaştırır (bu dosya C1'den **önce** HEAD'den üretilir).
  - **Ara katman sırası** dahil birebir olmalı (güvenlik, yerelPin, evOkuma, evYazma, tasima, kurulum, acilPin, static).
- **`APP_VERSION` satırı server.js'te kalır.** dagitim, tasima `uygulamaSurumu`, bot-performans ve "yalnız APP_VERSION değiştiyse muaf" kuralı buna bağlı.

**Parça 1 (sürüm a, M–L): bot dışı ve araştırma blokları**

| Yeni modül | server.js'teki blok (HEAD satırı) |
|---|---|
| `lib/sunucu/arastirmaUclari.js` | 1281–1670 (indicators, strategies, pine, runBotOverlay, mumGetir, olcumDurumu, optimizasyon), 3034–3222 (backtest, venues, funding, optimize, walk-forward), 3458–3767 (veri/kapsam, backtest/is, is, strateji, scan) |
| `lib/sunucu/kagitMotorUclari.js` | 2485–3033 (candles, watchlist, start/stop, kill-switch, risk, trades, orders, logs, position/close, wallet, clear/reset, bots/*) |
| `lib/sunucu/guncellemeUclari.js` | 958–1040 (guncelleyiciBaslat, kararPenceresinde → ctx'e de verilir, guncelleme/*, sistem/*) |

**Parça 2 (sürüm b, M–L): ayar, sağlık, bildirim, ileri**

| Yeni modül | Blok |
|---|---|
| `lib/sunucu/ayarDeposu.js` | 60–293 (SECRET_KEYS, loadSecrets/saveSecrets, loadConfig/saveConfig/mergeConfig, bot sağlık sırları, commitOku, ayarIzi). `config` değişkeni server.js'te kalır, fonksiyonlar buradan gelir |
| `lib/sunucu/ayarUclari.js` | 2390–2484 (config GET/POST, secrets, sirlariUygula) |
| `lib/sunucu/saglikUclari.js` | 1041–1264 (öz denetim kurulumu + /api/saglik/*, /api/health, /api/status), 3768–3833 (saglik test/durum), 3792–3802 sunucu kalp atışı |
| `lib/sunucu/bildirimKurulum.js` | 581–611 (BILDIRIM, TELEGRAM_GELISTIRME_ENGELI), 3276–3300 (bildirim router, makine/nabız, rapor), 3804–3852 (TelegramYoklayici, telegram/test) |
| `lib/sunucu/ileriUclari.js` | 2276–2389 |
| `lib/sunucu/kisiselUclar.js` | 3223–3457 (portfoyLab, veriOrk, tarama, defter, gunluk, portfoyum, islemDefteri, anahtarlar, tasarimci routerları ve bağlamaları) |

**Parça 3 (sürüm c, L): canlıya yakın bloklar (en son ve en dikkatli)**

| Yeni modül | Blok |
|---|---|
| `lib/sunucu/botYonetimi.js` | 660–957 (bindirmeKur → botFabrikasi kullanır, acilisBaglan, açılış alarmı, bekçi, disk, dış IP, bindirmeBul, çakışma, borsaModu, ensureEngineRunning) |
| `lib/sunucu/botUclari.js` | 1828–2275 (/api/bindirme/*, hesap-islemleri, hesaplar, grafik, bindirme-telegram) |
| `lib/sunucu/borsaUclari.js` | 612–659 + 1672–1827 (eski canlı yürütücü, donchianBot, kalkan, /api/exchange/*, /api/kalkan/*) |
| `lib/sunucu/surec.js` | 3853–4164 (listen, donma bekçisi, shutdown, kapat, son-kapanış, process olayları) |

En sonunda server.js ~400 satır kalır: require'lar, `config`, `app`, ara katman zinciri (sırası **burada görünür kalır**), modül bağlama sırası, APP_VERSION.

**Her parçadan sonra doğrulama:**
1. `npm test` tam zincir.
2. Uç envanteri testi birebir (fixture yalnız bilinçli olarak, bu sürümün yeni uçları eklenince güncellenir).
3. Sunucu açılış dumanı: `scripts/ev-yazma-e2e.js`, `tasima-e2e`, `dagitim-e2e`, `kur-selftest` (sunucuyu gerçekten açanlar).
4. Kuru deneme. lib/live değişmediği için güncelleyici tetiklemez; elle çalıştırılır, parça 3'te zorunlu.
5. `node --check` her yeni dosyada.

**Riskler:**
- **`this` ve kapanış hataları:** ör. `bindirmeler` nesnesinin aynı referansla paylaşılması gerekir; ctx'e nesnenin kendisi verilir, kopyası değil.
- **Express sırası:** `app.use` çağrıları modül içine alınınca sıra değişebilir → envanter testi yakalar.
- **Çifte require:** öz testler `require('../server.js')` yapmıyor, alt süreçle açıyor; sorun beklenmez.
- **Güncelleme izni:** yeni `lib/sunucu/*` dosyaları `OTOMATIK`'te değil → her parça onaylı.
- **Geri dönüş:** her parça ayrı commit. `git revert` ile bir önceki parçaya dönülür; veri biçimi değişmediği için güvenli.

**Bağımlılık:** A1 (2a) bitmiş olmalı. Böylece bot blokları bir kez taşınır. Plan sırası da bu.
**Büyüklük:** toplam XL (taşınan ~3700 satır + test altyapısı), 3 sürüm.
- **74.8'de uygulandı: adım 0 + parça 1.** Yardımcının adı `scripts/lib/sunucuKaynak.js` (43 test çevrildi). Envanter testi server.js'i açmak yerine ön yüklemeyle (`node -r scripts/lib/ucDokumu.js`) Express çağrılarını kaydeder ve `server.listen` anında dinlemeden çıkar (port açılmaz). ctx: getter'lı nesne (`ctx.config`, tanımsız alan hata). Sıra kuralı: modül grupları server.js'te ESKİ YERLERİNDE çağrılır ve doğrudan `app.*` bağlar (Router değil) — araştırma uçları üç ayrı yerde olduğu için `arastirmaUclari.olustur(ctx)` üç bağlama işlevi döndürür. Kalan dilimler ve 74.8 satır numaraları CLAUDE.md "Panel 74.8".
- **75.0'da uygulandı: parça 2.** Haritadaki altı modül + haritada olmayan sorun/teşhis bloğu için ayrı `lib/sunucu/sorunUclari.js` (kullanıcı kararı, tek sorumluluk). `disariConfig` ayar deposuna değil server.js'te kaldı (haritadaki aralığın dışında; parça 3'te bot uçları da kullanıyor). ctx ayar deposundan önce kurulur (ayar deposu `config`, `BOT_KAYIT`, ayar geçmişini kullanım anında okur); `configYaz` alanı eklendi (`config` ataması). Çok noktalı modüller (saglik ×3, bildirim ×4, kişisel ×3) bağlama işlevleri döndürür. Kanıta ek olarak `require.cache` yükleme sırası eski/yeni karşılaştırıldı (aynı). Parça 3 için güncel satır aralıkları CLAUDE.md "Panel 75.0".
- **75.1'de uygulandı: parça 3 — C1 TAMAMLANDI.** Haritadaki dört modül: `borsaUclari.js` (`yurutuculer()` eski canlı yürütücü + Donchian + Kalkan → ctx.borsa; `uclar()` /api/exchange, /api/kalkan; `borsaHata` modül düzeyinde), `botYonetimi.js` (`kur()` → ctx.botYonetimi; `motor()` borsaModu, onTick, wss, ensureEngineRunning), `botUclari.js` (`botlarUclari()` /api/botlar*, `bindirmeUclari()` /api/bindirme/*, hesap işlemleri, hesaplar, grafik), `surec.js` (shutdown/kapat/sonKapanisPlanliMi; `baslat()` dinleme + process olayları dosya sonunda). Haritadan sapma: `surec.olustur(ctx)` güncelleme uçlarından ÖNCE kurulur (shutdown/sonKapanisPlanliMi eskiden hoisted işlevdi, güncelleme uçları ve öz denetim bağlama anında alıyor); bot kaydı ataması için `ctx.botKayitYaz`. Önceden var olan SON_KAPANIS TDZ hatası (73.6 S12) bilerek KORUNDU — düzeltme ayrı sürüm. server.js 4 976 → 551 satır (hedef ~400; kalan: require'lar, ctx, ayar deposu bağlaması, güvenlik/PIN/ev okuma-yazma/taşıma/kurulum ara katman zinciri, Portföyüm taşıma yardımcıları, motor, bildirim merkezi, bağlama satırları). Kanıtlar (envanter, yükleme sırası, duman 146 istek, kuru deneme ×3 ayni) CLAUDE.md "Panel 75.1".
**Açık karar:** yok.

---

## 4. 3. faz — Makine kimliği ve jetonlar, yönetici makine, taşıma, B1 pano, B3 kademeli güncelleme, C3-uyum

### 4.1 Veri biçimleri (yeni TABLO satırları)

| Parça | Tür | İçerik |
|---|---|---|
| `makine-kimlik.json` | MAKINE | `{ kimlik: 'm-<12 onaltılık>', ad: hostname, olusturma }`. İlk açılışta `crypto.randomBytes` ile üretilir; taşıma paketine girmez (yeni bilgisayar = yeni kimlik) |
| `makineler.json` | KISISEL | `{ surum, makineler: [{ kimlik, ad, adres: 'https://<ad>.<ağ>.ts.net', rol: 'sunucu'\|'gelistirme', sira, eklendi }], yonetici: { kimlik, surum (artan tam sayı), zaman, secen } }` |
| `makine-jetonlari.json` | GIZLI | `{ giden: { <kimlik>: <jeton 32 bayt base64url> }, gelen: { <kimlik>: { ozet: sha256, eklendi, sonKullanim } } }` |
| `makine-durum.json` | MAKINE | eşlerin son nabzı, sürümü, protokolü, botları (kimlik/nobet/mod/calisiyor), güncelleme durumu, kopya yaşı; geçici yönetici durumu `{ devralan, bas }` |
| `makine-esleme.json` | MAKINE | tek kullanımlık eşleme kodu özeti + bitiş (10 dk) |

Bot kaydındaki `makine` ve `nobet` (2. faz alanları) burada anlam kazanır.

### 4.2 Makine kademesi (f5: bugünkü sunucu bağlantısının genişletilmişi)
- `lib/guvenlik.js` ara katmanı, `gelistirme` bloğunun yanına yeni bir blok alır:
  - Başlıklar: `x-pusula-makine: <kimlik>` ve `x-pusula-makine-jeton: <jeton>`.
  - Jeton, `gelen[kimlik].ozet` ile sabit zamanlı karşılaştırılır.
  - Doğruysa `req.kademe = 'makine'`; yalnız **`MAKINE_IZINLI`** listesi geçer:
    - GET: bütün `EV_YOLU` okumaları + `/api/makine/*` okumaları.
    - POST: `/api/makine/(nabiz|yonetici-bildir|bot-al|bot-al/onay|nobet-bildir|olay)`.
  - **Emir, bot başlatma/durdurma, ayar, anahtar ve güncelleme uçları listede yok.**
  - Yanlış jeton → 403; deneme sayacı `GIRIS_HAK` deseniyle.
- Araştırma modundaki makine gelen makine jetonunu kabul eder ama yazma uçları yine kapalıdır (`ARASTIRMA_KAPALI`).
- **Eşleme:**
  1. A makinesi (yerel, PIN): `POST /api/makine/esle/kod` → 8 grup × 4 hanelik kod gösterir.
  2. B makinesi (yerel, PIN): `POST /api/makine/esle-baslat { adres, kod }` → B, A'ya `POST /api/makine/esle` (kod + B kimliği/adı/adresi + B'nin A için ürettiği jeton) gönderir.
  3. A kodu doğrular; B'nin jetonunu özet olarak `gelen`'e, kendi ürettiği jetonu yanıtla B'ye verir.
  4. B, A'nın jetonunu `giden`'e yazar.
  5. Kod tek kullanımlık ve 10 dk geçerli. `/api/makine/esle` yalnız jetonsuz ama kodlu isteği kabul eder, IP başına 10 dk'da 5 deneme.
- `ev-baglanti.json` (geliştirme bilgisayarı) **aynen kalır**. Makine jetonu ek bir yoldur, eskisi bozulmaz.

### 4.3 Yönetici makine (f1)
- **Tanım:** Telegram komutlarını dinleyen (`TelegramYoklayici`) tek makine. Bildirim **gönderimi** her makinede kendi botları için sürer; çakışma yalnız `getUpdates`'te var (409).
- **Seçim:** Ayarlar › Makineler, `POST /api/makine/yonetici { kimlik }` (yerel, onay).
  - `yonetici.surum` bir artırılır; bütün eşlere `POST /api/makine/yonetici-bildir` gider.
  - Alan makine `surum` daha büyükse kabul eder (son yazan kazanır, sayaçla).
- **Karar fonksiyonu** (saf, `lib/makine/yonetici.js`): `dinlemeli(ben, makineler, durum, simdi)` → `{ dinle, sebep }`.
  - Ben yöneticiysem → dinle.
  - Yönetici son nabzından beri ≥ 30 dk sessizse ve ben `sira`'ya göre ilk erişilebilir **sunucu** makineysem → dinle (**geçici**).
  - Yönetici geri gelirse → bırak.
- `telegramYoklayici.baslat/durdur` dakikada bir bu karara göre çağrılır.
- Geçici devralmada Telegram'a "Yönetici X 30 dk'dır ulaşılamıyor; komutları geçici olarak Y dinliyor", geri dönüşte "X geri geldi" gider.
- Tek makine varken karar her zaman "dinle" → bugünkü davranış.

### 4.4 Taşıma akışı (f2, f3), adım adım
**Ön koşullar:** kaynak ve hedef eşleşmiş, aynı `MAKINE_PROTOKOL`, karar penceresi dışında (UTC 23:50–01:30 → 409), hedef araştırma modunda değil.

1. **Başlat** (kaynak makinenin panelinden ya da başka bir masaüstü panelden): `POST /api/botlar/:k/tasi { hedef, pin, onay:'TAŞI' }`.
   - Kademe yerel. Başka bir panelden geliyorsa makine kademesiyle kaynak makineye iletilir ve PIN **kaynakta** doğrulanır.
   - Telefon 403 ("yalnız bilgisayardan").
2. **Kaynak hazırlık:**
   - Bot `durdur()` ile durdurulur (ELLE; pozisyonlara ve borsadaki felaket stoplarına dokunulmaz).
   - `_sirali` kilidi beklenir.
   - Kayda `tasiniyor: { hedef, nobet: n+1, zaman }` yazılır. Bu sırada kaynak botu **başlatmaz**.
3. **Paket:** `lib/makine/botPaketi.js` üretir:
   - bot dizinleri (bütün modlar),
   - kayıt,
   - bağlı hesabın secrets kaydı (yalnız `hesap[mod]` olanlar), `paket.sifrele(json, yedekŞifresi)` ile şifrelenir. Hedefte yedek şifresi yoksa kullanıcıdan istenir,
   - healthchecks adresi.
   - tar.gz (lib/paket.js `tarYazici`), dosya başına sha256 içeren bildiri.
4. **Aktarım:** kaynak → hedef, `POST /api/makine/bot-al` (makine kademesi, akış gövde, başlıkta toplam sha256, ≤ 200 MB).
   - Hedef geçici klasöre açar (`<veri>/tasima/bot-<kimlik>-<zaman>/`), her dosyayı doğrular. Hata varsa geçici klasör silinir, kaynakta bot "taşıma başarısız" olarak kalır ve kullanıcı Başlat'la geri açabilir.
5. **Hedef yerleştirme:**
   - Var olan dizinler `onceki-<zaman>`'a taşınır (silinmez), yenileri yerine konur.
   - Kayıt `makine = hedef`, `nobet = n+1` ile yazılır; sır secrets'a yazılır.
   - `tasima-bekliyor.json`'a bot eklenir (mevcut `tasimaLib.botBekliyor` mekanizması: bot kendiliğinden başlamaz).
6. **Mutabakat:** hedef `bagla()` + `mutabakat()` yapar (borsayla karşılaştırma). Sonuç `POST /api/makine/bot-al/onay` ile kaynağa döner. Kaynak kaydı `tasindi: { hedef, nobet }` olur; kaynak bot dizinleri olduğu gibi kalır (geri dönüş için).
7. **f3:** mutabakat temizse hedefin panelinde "Başlat" açılır, **kullanıcı basar**. Temiz değilse ENGEL + fark listesi.
8. **Bildirim:** Telegram'a "Kairos artık Y makinesinde — https://y.<ağ>.ts.net/#/botlar/hucum".
9. **Kılavuz** "Görevleri iki makinede bir kez kurun": PusulaBot, PusulaGuncelle, PusulaYedek, PusulaBekci için `schtasks /create …` komutları tek satırlık adımlar olarak, kopyala düğmesiyle. Kod bunları çalıştırmaz.

**Nöbet kuralı (taşımada ve 5. bölümde):** açılışta `acilisBaglan`'dan önce `nobetDenetle(bot)` çalışır.
- Erişilebilir her eşten `GET /api/makine/nobet/:k` alınır.
- Herhangi bir eşte nöbet benimkinden büyükse → bot başlamaz, kayıt `devredildi` olur, Telegram'a haber gider.
- Hiç eş kayıtlı değilse → bugünkü davranış.
- Eşler kayıtlı ama hiçbirine ulaşılamıyorsa → **bot başlamaz**, "eşlere ulaşılamadı — elle Başlat" (kapalı-başarısız).
- **İkinci savunma:** eski makine yine de başlarsa, borsa mutabakatı kendi defterinde olmayan pozisyon/emir farkını ENGEL ile yakalar (mevcut davranış).

### 4.5 B1 — Makineler panosu
- `GET /api/makine/pano` (yerel/telefon/geliştirme): makineler × {ad, rol, yönetici rozeti, son görülme, sürüm/protokol, botlar (mod, çalışıyor, nöbet), güncelleme durumu, disk, kopya yaşı (4. faz), Tailscale adresi}. Eşlerin verisi `GET /api/makine/kimlik` ile toplanır, 60 sn önbellek.
- Panel: **Ayarlar › Makineler** (`ayarlar.js` sekmesine `makineler` eklenir, rota `ayarlar/makineler`). Düğmeler: Eşle, Yönetici yap, Jetonu yenile, Kaldır, bot satırında Taşı (4. fazda Devral).
- Botlar sayfası: başka makinedeki bot kartı **o makineden okunur** (evOkuma deseni, makine jetonuyla) ve "Y makinesinde" rozeti taşır. Yazma düğmeleri o makinenin adresine bağlantı olur (doğrudan uzaktan emir yok).

### 4.6 B3 — Kademeli güncelleme (f4)
`lib/guncelleme.calistir`'a yeni adım **`kademe`**, birleştirmeden önce: `ops.kademe({ hedef })` → `{ izin, neden }`. Saf kural, `lib/makine/kademe.js`:
- Ben bot çalıştırmayan bir sunucu makinesiysem → izin (önce ben).
- Bot çalıştırıyorsam:
  - (a) Bot çalıştırmayan sunucu makinelerinden en az biri `hedef` sha'yı kurmuş ve `kararli` (8 dk; mevcut `kararlilikBekle`) olmalı. Hiç öyle makine yoksa izin ver ve gerekçeye yaz (tek makine = bugünkü davranış).
  - (b) `sira`'da benden önceki bot çalıştıran makineler `hedef`'i kurup kararlı olmuş olmalı. **Ulaşılamayan makine engellemez**, ama rapora yazılır.
- `izin=false` → durum `kademe-bekliyor`.
  - Sunucu 5 dk'da bir `ops.kademe`'yi yeniden dener; açılınca `guncelleyiciBaslat([])`.
  - Onaylı kurulumlar da aynı kapıdan geçer.
- Uç: `GET /api/makine/guncelleme` (makine kademesi) → `{ sha, durum, kurulduZaman, kararli }`.
- Geliştirme bilgisayarı (`gelistirmeMi`) bu sırada yer almaz.

### 4.7 C3-uyum — Sürüm uyum testi
- `lib/makine/protokol.js`: `MAKINE_PROTOKOL = 1`. Her makine yanıtında `{ protokol, surum }` döner.
- **Uyum kuralı:**
  - Okuma uçları protokol farkı ≤ 1 iken çalışır (bilinmeyen alan yok sayılır).
  - Taşıma, devralma ve kopya **aynı protokol** ister; değilse "önce iki makineyi aynı sürüme güncelleyin".
- **Testler:**
  - `scripts/surum-uyum-selftest.js` (zincirde): her makine ucunun yanıt şeması `scripts/fixtures/makine-protokol-v1/*.json`. Şu anki kod v1 (ve sonra v(N−1)) fikstürlerini ayrıştırabilmeli; yanıtları şemaya uymalı.
  - `scripts/iki-makine-e2e.js` (zincirde, sahte borsa): aynı koddan iki sunucu, iki veri kökü (`PUSULA_VERI`), iki port → eşleme → yönetici seçimi → kâğıt bot taşıma → nöbet → mutabakat → Başlat.
  - `scripts/surum-uyum-gercek.js` (zincir dışı, sürüm öncesi elle): önceki etiketin `git archive`'ı geçici klasöre (`kuruDeneme.libAc` deseni, `NODE_PATH`) açılır; eski + yeni sunucu nabız ve okuma alışverişi yapar.

### 4.8 Dosyalar
- **Yeni:**
  - `lib/makine/{kimlik,eslesme,yonetici,kademe,protokol,botPaketi,istemci}.js` (istemci: makine jetonlu fetch, `redirect:'error'`, zaman aşımı)
  - `lib/makine/api.js` (router)
  - `public/js/pages/makineler.js`
  - testler: `scripts/makine-selftest.js`, `scripts/iki-makine-e2e.js`, `scripts/surum-uyum-selftest.js`
- **Değişen:**
  - `lib/guvenlik.js` (makine kademesi)
  - `lib/evOkuma.js` (eş başına okuma)
  - `server.js` / `lib/sunucu/botYonetimi.js` (nöbet denetimi, yönetici kararı → TelegramYoklayici)
  - `lib/guncelleme.js` (kademe adımı, `ADIMLAR`'a satır) + `scripts/guncelle.js`
  - `lib/bildirimUreticileri.js` (makine nabzı makine kimliğiyle; 73.5'te "Faz 3 için makine adına göre harita" notu var)
  - `lib/veriTurleri.js`, `lib/tasima.js` (bot paketiyle ortak doğrulama)
  - `public/js/pages/{ayarlar,botlar}.js`, kılavuz (`yedek-tasima.md`, `ayarlar.md`, yeni `makineler.md`)

### 4.9 Riskler ve kanıt
- **Aynı hesabı iki makinenin yönetmesi** (en büyük risk). Kanıt: e2e'de eski makine yeniden açılınca botun başlamadığı; eşlere ulaşılamayan açılışta başlamadığı; elle başlatılırsa mutabakatın ENGEL koyduğu sınanır.
- **Telegram 409:** iki makinenin birden dinlediği an olabilir (geçiş anı). S05 bunu uyarı olarak gösteriyor, zararsız; karar fonksiyonunda 2 dk gecikmeli bırakma.
- **Canlı anahtarın IP kısıtı:** hedef makinenin dış IP'si farklıysa canlı bağlanamaz. Taşıma ekranı uyarır; canlı zaten 2027'de.
- **Demo kabul:** Kairos demo 2026-12-09'a kadar **taşınmaz** (uç 409 "demo kabul süresince taşınmaz"). Önerim bu; kullanıcı onaylamalı.
- **Güncelleme:** kademe kapısı hiç açılmazsa güncelleme takılır. Kapı 24 saatten uzun kapalı kalırsa Telegram uyarısı.

### 4.10 Bölme, büyüklük, bağımlılık
- **3a (L):** makine kimliği, eşleme, makine kademesi, nabız, B1 pano (salt okuma), C3-uyum fikstür testi. **YAPILDI — 75.2** (CLAUDE.md "Panel 75.2"). Uygulamada iki sapma: (1) jeton yönü — her makine KENDİSİNE gelecek jetonu üretir ve yalnız özetini saklar (§4.2 metnindeki yön karışıktı); (2) makine kademesinin okuması EV_YOLU'nun bot/sağlık alt kümesi (kişisel finans okumaları makineye kapalı — "telefonda tutarları gizle" kuralı yalnız telefonu tanıyor). Botlar sayfasındaki "Y makinesinde" kartı (evOkuma eş başına okuma) 3c'ye kaldı.
- **3b (L):** yönetici seçimi + 30 dk geçici devralma, B3 kademe kapısı. **YAPILDI — 75.3** (CLAUDE.md "Panel 75.3"). Sapmalar: (1) yönetici kaydı ve Telegram durumu ayrı `yonetici-bildir` ucu yerine mevcut nabız özetinde yayılır, `GET /api/makine/guncelleme` yerine kademe kapısı eşlerin nabız özetini (`commit`, `guncelleme.sha`, `baslangic`) kullanır — makine kademesine yeni uç eklenmedi; (2) yedek sırası `sira` (her makinede yerel) yerine kimlik sırası (her makinede aynı); (3) "2 dk gecikmeli bırakma" yerine bölünmüş beyin kuralı: geçici dinleyen ilk 409'da hemen bırakır, 30 dk → 4 sa geri çekilir (yönetici bırakmaz); (4) seçim yoksa varsayılan yönetici = dinleyebilen sunucular arasında en küçük kimlik; (5) aday = Telegram'ı kurulu sunucu; (6) sessiz eş uyarısı (30 dk, tek uyarı + tek bilgi) eklendi — kullanıcı kararı bekleyen öneri olarak uygulandı.
- **3c (L–XL):** taşıma + nöbet + iki makine e2e + kılavuz. **İki sürüme bölündü. 3c-1 YAPILDI — 75.5** (CLAUDE.md "Panel 75.5"): taşıma akışı, nöbet, Makineler › taşıma kartı, `scripts/bot-tasima-selftest.js` + `scripts/bot-tasima-e2e.js` (iki gerçek sunucu, ağ kalkanlı). Sapmalar: (1) makine kademesine yalnız iki uç — `POST /api/makine/tasima/hazirlik` (hedef ön denetimi; RED'de kaynakta hiçbir şey değişmez) ve `/al` (paket); `bot-al/onay` ve `nobet-bildir` YOK — taşımanın tamamlanma noktası hedefte KAYIT yazımı, kaynak sonucu yanıttan ya da (belirsizse) hedefin nabız özetinden (`botlar[].nobet/makine/tasima`) öğrenir; nöbet sorgusu `GET /api/makine/nobet/:k` yerine mevcut `GET /api/makine/kimlik`; (2) taşıma ucu `/api/botlar/:k/tasi` yerine `POST /api/makine/tasi { bot, hedef, onay: 'TAŞI' }` (yalnız yerel + yerel PIN; başka panelden iletme yok); (3) hedefte mutabakat yanıttan SONRA (yanıt kısa kalsın — belirsizlik penceresi daralsın); (4) Kairos: demo modunda YA DA `hucum-demo` dizini doluyken (kâğıtta da) 2026-12-09'a kadar taşınmaz; açılış nöbeti Kairos demo'ya yalnız haber (§0.2; yalnız Kairos — öbür demo botlar kurala uyar); (5) nöbet açılış kuralı yalnız SUNUCU eşleri sayar (geliştirme bilgisayarı bot çalıştırmaz); (6) kâğıt botta sır taşınmaz (sağlık adresi hedefte yeniden girilir); hedefte var olan farklı anahtarın üzerine yazılmaz (RED); (7) Görev Zamanlayıcı kılavuz adımları bu sürümde yazılmadı (mevcut Kurulum bölümü). **3c-2 YAPILDI — 75.9** (CLAUDE.md "Panel 75.9"): Botlar › Özet "Başka makinelerdeki botlar" kartı + Telegram /menu › Makineler yönetici bilgisi + (kullanıcı onaylı ek) haftalık karnede eşlerin botları. Sapmalar: (1) kart o makineden evOkuma ile okunmaz — B1 panosunun nabız özetinden (`GET /api/makine/pano`, eşe istek yok; lib/evOkuma.js dokunulmadı); (2) yazma düğmesi yok, "o makinede aç ↗" bağlantısı; (3) karne için makine kademesine TEK salt okuma uç `GET /api/makine/karne` (yalnız o makinenin botlarının yüzde satırları — eşin `/api/bindirme/:ad/grafik` ucu 256 KB yanıt tavanını aşabilir ve tutar taşır).
- **Bağımlılık:** A1 (kayıt, `makine`/`nobet` alanları) ve C1 (bot blokları modülde; nöbet kancası `botYonetimi`'ne).

### 4.11 Açık kararlar
1. **Kairos demo taşıması 2026-12-09'a kadar kapalı mı?** **Önerim:** evet (hesap, dizin ve ölçüm sürekliliği).
2. **Taşınan hesap anahtarının şifresi.** **Önerim:** mevcut yedek şifresi (`yedek-sifre.json`). İki makinede aynı olmalı; eşleme sırasında hedefte yoksa sorulur.
3. **Eşlere ulaşılamayan açılışta bot başlamasın** (kapalı-başarısız). Bu, tek makinedeki bugünkü otomatik açılıştan farklı ve yalnız eş kayıtlıyken geçerli. **Önerim:** evet. Bunun yerine "30 dk sonra yeniden dene, sonra Telegram ile sor" seçeneği de var.

---

## 5. 4. faz — Saat başı karşılıklı kopya, nöbet, devralma, D1 geri dönüş tatbikatı

### 5.1 Karşılıklı kopya (d3, B4)
- **Çekme modeli:** her sunucu makinesi saatte bir (ve eşin günlük çalışmasından sonra, olay geldiğinde) eşinden kopya çeker.
  - Bot çalıştırmayan makine de çeker.
  - Geliştirme bilgisayarı **çekmez** (sır taşınmasın; isteğe bağlı açılabilir).
- **Uçlar** (makine kademesi):
  - `GET /api/makine/kopya/manifest` → `{ makine, zaman, dosyalar: { yol: { boyut, sha256, mtimeMs } } }`. Kapsam: `live/` bot dizinleri + `live/botlar/` + `ayarlar.json` + `bildirim-ayar.json` + `live/hesap-islemleri.jsonl`.
  - `GET /api/makine/kopya/paket?yollar=…` → yalnız değişenlerin tar.gz akışı. Mantık 73.4 `yedek.artimliYedekle` ile aynı (boyut + mtime → sha → `.yaziliyor` → yeniden oku → ad değiştir).
  - `GET /api/makine/kopya/gizli` → secrets'tan **yalnız** eşin botlarına bağlı hesap kayıtları + sağlık adresleri. Gövde `paket.sifrele(JSON, yedekŞifresi)` ile şifreli (AES-256-GCM, scrypt; Node yerleşik; PowerShell yok).
- **Yerleşim:** `<veri>/es-kopya/<makineKimlik>/{veri/…, gizli.enc, manifest.json, son.json}`. TABLO satırı `es-kopya` → **MAKINE** (pakete ve yedeğe girmez; zaten başka makinenin verisi).
- **Bütünlük:**
  - Her çekme sonunda manifestle sha karşılaştırılır.
  - Yarım kalan çekme eski kopyayı bozmaz (tmp + rename).
  - Kopya 2 saatten eskiyse öz denetimde yeni `kopya` denetimi uyarı verir (grup sunucu, haber).

### 5.2 Devralma (d1, d2)
- **Koşul:** eş makinenin son nabzı ≥ 30 dk önce **ve** son kopya var.
- `POST /api/botlar/:k/devral { pin, onay:'DEVRAL' }` (yerel; telefon 403). **Kendiliğinden asla.**
- **Adımlar:**
  1. Kopya yaşı ve içeriği ekranda gösterilir ("son kopya 37 dk önce, 03:31 günlük çalışmasından sonra").
  2. `nobet = max(bilinen) + 1`.
  3. Kopya `<veri>/live/…`'ya yerleştirilir. Var olan dizinler `onceki-<zaman>`'a gider.
  4. `gizli.enc` çözülür, secrets'a yazılır.
  5. Kayıt `makine = ben`, `nobet` güncellenir.
  6. `tasima-bekliyor` ile bot kendiliğinden başlamaz.
  7. `bagla()` + `mutabakat()`.
  8. Ulaşılabilen bütün eşlere `POST /api/makine/nobet-bildir`.
  9. Telegram'a "Kairos Y'de devralındı; X açılınca o botu başlatmayacak".
- **Devralma mutabakatı:** son kopya ile borsa arasında ≤ 1 saatlik fark olabilir (DCA dolumu, TP, felaket stopu yeniden çapası). Borsada olup defterde olmayan **bizim önekli** (`ag-`) emirler bugün "çözülemeyen" sayılır.
  - Yürütücüye isteğe bağlı `mutabakat({ sahiplen: true })` eklenir: `ag-` önekli bilinmeyen açık emirleri BİLİNİYOR diye deftere alır, dolmuşları işler, raporlar. Yalnız devralma ucundan ve kullanıcının ekranda gördüğü listeyi onaylamasıyla çağrılır.
  - Canlı kod değişikliği → onaylı. Kanıt: `hata-matrisi`, `live-selftest` değişmeden geçmeli; yeni sahte borsa senaryosu: 1 saat eski defter + borsada 2 yeni DCA emri + 1 dolum → sahiplen → mutabakat temiz, çift emir yok.
- **Nöbet:** §4.4'teki açılış kuralı aynen. Eski makine geri gelince daha büyük nöbet numarasını görür, botu başlatmaz, panelde "bu bot Y'ye devredildi — buradaki kopya eski (salt okuma)" gösterir.

### 5.3 D1 — Geri dönüş tatbikatı (d4)
- `lib/tatbikat/geriDonus.js`: ayda bir (ayın ilk pazarı, 11:00 TR; karar penceresi dışında). Araştırma kopyasında çalışmaz.
- **Adımlar:**
  1. `fs.mkdtempSync(os.tmpdir()/pusula-tatbikat-)`.
  2. Kaynak: bu makinenin **son günlük yedeği** (lib/yedek.js manifestiyle) ve varsa her eşin `es-kopya`'sı.
  3. Geçici veri köküne aç; manifest sha'larını doğrula.
  4. Her bot için `kuruDeneme.calistir` deseni: `scripts/kuru-deneme.js` ayrı süreçte, `KALKAN_KODU` ağ kalkanı, `kuruOrtam` (sırsız). Kâğıt botlarda karar, demo/canlıda yükleme.
  5. Beklenen sonuçlar: bozuk dosya yok, ENGEL yok, kâğıt botta karar özeti canlı botun bugünkü kuru özetiyle **aynı** (`karsilastir` → `ayni`).
  6. `gizli.enc` yedek şifresiyle çözülebiliyor mu (içerik açılmaz, yalnız GCM doğrulaması).
  7. Süre ölçülür, geçici klasör silinir.
- **Sonuç:** `<veri>/tatbikat/sonuclar.jsonl` (KISISEL, yalnız eklenir) + Telegram (bildirim türü `tatbikat`, yeni katalog satırı).
- `POST /api/tatbikat/geri-donus` (yerel) şimdi çalıştırır.

### 5.4 Dosyalar
- **Yeni:**
  - `lib/makine/kopya.js` (çekici + sunucu tarafı)
  - `lib/makine/devralma.js`
  - `lib/tatbikat/geriDonus.js`
  - testler: `scripts/es-kopya-selftest.js`, `scripts/devralma-selftest.js` (sahte borsa + iki veri kökü), `scripts/geri-donus-selftest.js`
- **Değişen:**
  - `lib/live/yurutucu.js` (`sahiplen` seçeneği)
  - `lib/makine/api.js`, `lib/guvenlik.js` (`MAKINE_IZINLI`'ye kopya uçları)
  - `lib/ozDenetim.js` (`kopya` denetimi)
  - `lib/bildirimMerkezi.js` (`tatbikat` türü)
  - `lib/veriTurleri.js` (`es-kopya` MAKINE, `tatbikat` KISISEL)
  - `lib/yedek.js` (`KRITIK_DIZIN`'e `tatbikat`)
  - panel Makineler (kopya yaşı, Devral), kılavuz

### 5.5 Riskler
- **Sırların başka makinede durması.** Önlem: şifreli dosya yalnız devralmada açılır. **Sınır:** yedek şifresi aynı makinede düz dosyada duruyor (70.0'dan beri sırlar düz), bu yüzden koruma diskteki kopyanın dışarı (USB/bulut) sızmasına karşıdır. Kılavuza yazılır.
- **Kopya boyutu/bant:** live dizinleri MB düzeyinde; ileriye kayıt **dahil değil**.
- **Devralma sonrası eski makinenin açılması:** nöbet kuralı + mutabakat ENGEL; e2e'de sınanır.

### 5.6 Bölme, büyüklük, bağımlılık
- **4a (L):** kopya + `kopya` denetimi + pano kopya yaşı.
- **4b (L):** devralma + sahiplen + nöbet bildirimi.
- **4c (M):** D1 tatbikatı.
- **Bağımlılık:** 3. faz (eşleme, makine kademesi, nöbet).

### 5.7 Açık kararlar
1. **Geliştirme bilgisayarı da kopya çeksin mi?** **Önerim:** hayır. Sır taşımaz; araştırma kopyası sunucuyu zaten canlı okuyor.
2. **Sahiplen'de dolmuş ama defterde olmayan emirler** listeyle onaya mı sunulsun, kendiliğinden mi işlensin? **Önerim:** liste + onay. Kullanıcı devralma ekranında görür.

---

## 6. A3 — Bütün hesapların toplam riski

### 6.1 Ölçüm (r1: ilk 2 hafta yalnız izleme + uyarı)
- `lib/toplamRisk.js` (saf):
  - **Girdiler:** her botun özeti. Yerel botlar için `bindirmeler[k].y.hesap()` + `bot.ozet()` (pozisyonlar, mark, özsermaye, kol/BTC payı, felaket stopu fiyatları). Eşlerin botları `GET /api/makine/risk` ile (makine kademesi; eş yoksa yalnız yerel).
  - **Çıktı:**
    - bot başına: `{ ozsermaye, brutNominal, netNominal, netBtc, kaldirac = brut/ozs, marjOrani, felaketKayip (stoplar tetiklenirse ≈ kayıp) }`.
    - toplam: `{ ozsermaye, brutKaldirac, netBtcPay, tekSembolPay (en büyük sembol / toplam), tekHesapPay, felaketKayipPay }`.
    - kipe göre `{ esik, asim[] }`.
- **Kayıt:** `<veri>/live/toplam-risk.jsonl`, saatte bir, yalnız eklenir (live KİŞİSEL, yedekte var).
- **Ayar:** `config.toplamRisk = { kip: 'izleme', baslangic, esikler: null, onay: null }`.
  - İzleme kipinde öneri eşikleri yalnız uyarı içindir: brüt kaldıraç > 4, net BTC payı > %120, tek sembol > %35, felaket kaybı > %25.
  - 2 hafta sonra panel 14 günlük p50/p95/maks gösterir; kullanıcı eşikleri onaylar: `POST /api/toplam-risk/esikler { esikler, pin, onay }` → `kip: 'sinir'`.

### 6.2 Sınır kapısı (r2: yürütücüde)
- `CanliYurutucu` kurucusuna isteğe bağlı `ayar.riskKapisiFn({ symbol, side, nominal, netOnce, netSonra, mark })` → `{ engel } | null`. **Senkron**, önbellekten okur.
- `_kapilar` içinde `!e.reduceOnly` bloğunda, sembol tavanı hesaplandıktan hemen sonra: `if (sonra > |net|·mark && riskKapisiFn) { … }`.
  - Yalnız **pozisyonu büyüten** emir durdurulur.
  - Azaltanlar (`reduceOnly` ya da `sonra ≤ |net|`) ve stoplar serbest. `KorumaEmri` zaten `createOrder` + `closePosition` ile yürütücü kapısından geçmiyor, `acilIstekleri` muaf. Emir freni (`_frenKapisi`) ile aynı ruh.
- **BTC spot ayağı** (`spotEmir`, `cokluVarlik`) yürütücü kapısından geçmiyor → `BindirmeBot`'a isteğe bağlı `ayar.riskKapisiFn`: `wHedef > sonW` ise ve kapı engel diyorsa artış yapılmaz (K1 "BTC artırılmaz" kuralının aynısı), satış serbest.
- **Önbellek:** server her 5 dk'da bir ve her emir öncesi en çok 60 sn eski toplamla çalışır. Eş verisi 6 saatten eskiyse eşin son bilinen değerinin **en kötüsü** kullanılır + uyarı.
- **İzleme kipinde** `riskKapisiFn` hiç verilmez → davranış birebir.

### 6.3 Uçlar
- `GET /api/toplam-risk` (yerel/telefon/geliştirme): anlık değerler + 14 günlük dağılım + kip.
- `POST /api/toplam-risk/esikler` (yerel, PIN). `POST /api/toplam-risk/kip` (yerel, PIN; `sinir` → `izleme` her zaman serbest).
- `GET /api/makine/risk` (makine kademesi).
- Panel: ana sayfa "Toplam risk" satırı + Sağlık kartı. Öz denetime `toplam-risk` denetimi (haber).

### 6.4 Riskler ve kanıt
- **Kairos demo:** `sinir` kipi 2026-12-10'dan önce demo bota uygulanmaz (`dokunulmaz`); yalnız haber.
- **Kanıt:**
  - Kapı verilmeyen yürütücüde `hata-matrisi`, `live-selftest`, `canli-saglamlik`, `bindirme` değişmeden geçer.
  - Yeni test: engel diyen kapıyla büyüten emir RED değil "Emir gönderilmedi" olur, azaltan ve reduceOnly geçer, `korumaEmri` stop kurar, BTC ayağı satış yapar, alış yapmaz.
  - Kuru deneme "ayni".
- **Yanlış eşik botu kilitleyebilir:** kip anında `izleme`'ye dönebilir; engel olunca Telegram (anahtar başına 6 sa kısıt).

### 6.5 Bölme, büyüklük, bağımlılık
- **6a (M):** ölçüm + kayıt + panel + uyarı.
- **6b (M, onaylı):** kapı. Ayrı sürüm ve **ancak 2 hafta + kullanıcı onayından sonra** açılır; kod önceden gelebilir, kip `izleme`.
- **Bağımlılık:** A1 (bot listesi). Çok makine için 3. faz; yoksa yalnız yerel.

### 6.6 Açık kararlar
1. **İzleme kipi öneri eşikleri** (yukarıdaki 4 değer): kullanıcı 2 hafta sonra gerçek değerlere bakıp onaylayacak; o güne kadar yalnız uyarı.
2. **Eş verisi bayatsa davranış.** **Önerim:** son bilinen en kötü değer (tutucu) + uyarı.

---

## 7. A2 + 5. faz — Ortak borsa arayüzü, OKX bağdaştırıcısı, borsa başına hata matrisi, demo bot

### 7.1 Bugün Binance'e özgü olan noktalar (canlı kod)
- `binanceIstemci.kur`: `binanceusdm`, `enableDemoTrading`.
- `anahtarIzinleri`: `sapiGetAccountApiRestrictions`.
- `veriAyir`: veri prod Binance'ten.
- Yürütücü:
  - `p.contracts` = baz miktar varsayımı,
  - clientOrderId `ag-<bot>-<gün>-<sayaç>` (tireli),
  - `fetchPositionMode`, `hedged` / `positionSide`,
  - `onKontrol` `PERCENT_PRICE` (`info.filters`).
- `KorumaEmri`: `STOP_MARKET` + `closePosition`, `algoOrder`.
- `KalkanBot`: `fapiPrivateV2GetPositionRisk`, `setMarginMode`/`setLeverage` (çapraz ×20).
- `marjIzleme`, öz denetim zorla kapanış (`fapiPrivateGetForceOrders`), funding (`fapiPrivateGetIncome`).
- `cokluVarlik` (`sapiPostAssetTransfer`), `hesapIslemleri` (sapi depozit/çekim geçmişi).

### 7.2 Ortak arayüz: `lib/live/borsalar/`
- `index.js`: `{ binance, okx }` kayıt defteri; `al(kimlik)`.
- Her bağdaştırıcı:
```
{ kimlik, ad, hazir: bool,
  kur({ ortam: 'demo'|'canli', anahtar: { apiKey, apiSecret, parola? } }) → ccxt nesnesi (+ veri ayrımı),
  izinler(b) → { cekme, vadeli, spot, aktarim, ipKisit } | null,
  emirKimligi: { uret(bot, sayac, zaman), bizimMi(id), desen },
  miktar: { bazdan(market, q), baza(market, kontrat) },
  filtreler(market) → { adim, tick, minNominal, piyasaMax, fiyatBandi: {yukari, asagi} | null },
  pozisyonModu(b), kaldiracHazirla(b, symbol, { kaldirac, marj: 'capraz' }),
  korumaEmri: { koy(b, symbol, side, tetik, { tam, miktar }), oku(b, symbol), iptal(b, id) },
  gelir(b, { tur: 'funding', bas, bit }), zorlaKapanislar(b, bas),
  hataSinifi(e) → 'RED'|'BELIRSIZ'|'HIZ'|'SAAT'|'BULUNAMADI' }
```
- **`binance.js`:** bugünkü çağrıların **aynısını** sarar (kimlik dönüşümü). Yürütücü `ayar.borsa` alır, varsayılan `binance`.

### 7.3 OKX bağdaştırıcısı (`okx.js`, ccxt.okx; yeni paket yok)

| Konu | OKX'te durum |
|---|---|
| Demo ortamı | `setSandboxMode(true)` (ccxt `x-simulated-trading: 1` ekler) |
| Anahtar | `parola` (passphrase) zorunlu; Anahtarlar zaten istiyor (`hesapDogrula`) |
| clOrdId | yalnız harf/rakam, ≤ 32 karakter. Biçim `ag<bot><yyyymmdd><sayac6>` (tiresiz); `bizimMi` = `^ag[a-z0-9]` + uzunluk. Binance biçimi değişmez |
| Miktar | `BTC-USDT-SWAP` sözleşmesi 0,01 BTC (`ctVal`); ccxt `amount` = kontrat. Bağdaştırıcı bütün yürütücü çağrılarında baz ↔ kontrat çevirir; pozisyon okumada `contracts × contractSize` |
| Hesap kipi | tek para birimi marjı + `net_mode`; bağlanırken okunur, uymuyorsa **bağlanmaz** (kipi kendiliğinden değiştirmez) |
| Emir | `tdMode: 'cross'` parametresi; kaldıraç sembol başına `setLeverage(20, sym, { mgnMode: 'cross' })` |
| Koruma emri | algo emri `ordType: 'conditional'`, `slTriggerPx`, tam pozisyonda `closeFraction: '1'` ve `reduceOnly` |
| İzinler | `GET /api/v5/users/subaccount/apikey` alt hesapta yok; `account/config` `perm` alanı (`read_only,trade,withdraw`) → `withdraw` varsa **red** (`okxApi.js` zaten aynı denetimi yapıyor) |
| Hata kodları (A katmanı) | HTTP 200 + `code ≠ '0'` ya da `data[].sCode`. 51008/51004 bakiye → RED · 50011/50061 hız → HIZ · 50001/50013 hizmet → BELIRSIZ · 50102 zaman → SAAT · 51603 emir yok → BULUNAMADI · 51000 parametre → RED. Eşleme ccxt'nin `okx` istisna tablosundan **ölçülür ve sabitlenir** (`hata-matrisi` A katmanı gibi) |
| Fiyat bandı | `fiyatBandi` OKX'in `instruments` limit fiyat kuralından ya da `null` (ön kontrol atlar, borsa reddeder) |

### 7.4 Hata matrisi her borsa için (x3)
- `lib/live/sahteBorsa.js` → `sahteBorsalar/{binance,okx}.js`. Ortak durum makinesi (emir defteri, pozisyon, saat), borsaya özgü cevap biçimi ve kimlik kuralı.
- `scripts/hata-matrisi-selftest.js` parametrelenir: `BORSALAR.filter(b => b.hazir || b.sinaniyor)` üzerinde A (ham cevap → ccxt sınıfı → `hataSinifi`), B (HTTP uçtan uca sahte sunucu), C (metot katmanı), D (senaryolar) aynen.
- **Kapı:** bağdaştırıcıda `hazir: false` iken bot kaydı o borsaya bağlanamaz (`/hesap` 400). `hazir: true` yalnız matris o borsa için tam geçen commit'te yazılır; test `hazir:true` bağdaştırıcıyı matrise zorunlu sokar. Geçmezse zincir kırılır, sürüm gitmez → **"geçmeyen borsa demoya bile açılmaz"** kodla güvenceye alınır.
- **Ayrıca:** `live-selftest`, `canli-saglamlik`, `koruma-emri`, `piyasa-dilim` testleri bağdaştırıcı parametresiyle iki kez koşar.

### 7.5 Demo bot (x2)
- Yeni şablon örneği: `kimlik: 'okxdemo'` (kullanıcı adlandırır), `sablon: 'kairos'`, `strateji: 'hucum'`, `borsa: 'okx'`.
- a6 gereği kâğıtta başlar. Kâğıt borsa OKX pazar kurallarıyla (`KagitBorsa` + OKX `markets`) çalışır.
- **Karar verisi Binance'ten** (bugünkü demo gibi `veriAyir`: mum/evren prod Binance anahtarsız). Gölgeyle aynı veri; fark yalnız uygulamayı ölçer.
- Evren: Binance PIT evreni ∩ OKX'te işlem gören USDT swap'lar. OKX'te olmayan sembolde hedef 0 ve raporda "OKX'te yok".
- Kullanıcı OKX demo hesabını Anahtarlar'a ekler (`borsa okx`, `tur demo`), bota bağlar, demoya geçirir. **Kairos/Tao'ya dokunulmaz.**

### 7.6 Dosyalar
- **Yeni:**
  - `lib/live/borsalar/{index,binance,okx}.js`
  - `lib/live/sahteBorsalar/okx.js`
  - `scripts/borsa-arayuz-selftest.js`
- **Değişen:**
  - `lib/live/{yurutucu,korumaEmri,kalkanBot,marjIzleme,emirKimligi,onKontrol,kagitBorsa,binanceIstemci}.js`
  - `scripts/hata-matrisi-selftest.js` ve ilgili testler
  - `lib/anahtarSinama.js` (OKX sınaması zaten salt okuma)
  - `lib/botKayit.js` (`borsa` alanı)
  - `server.js` / `botYonetimi` (`bagla` bağdaştırıcıdan)

### 7.7 Riskler ve kanıt
- **En riskli parça:** Binance yolunda tek bayt davranış farkı. Kanıt:
  - 7a sürümünde **yalnız** Binance bağdaştırıcısı + arayüz; bütün canlı testler, kuru deneme "ayni", `canli-yeniden-oynat --gun 120` aynı.
  - Ek olarak `sahteBorsa` çağrı izi (metot + argüman listesi) eski ve yeni kodda birebir kaydedilip karşılaştırılır (`scripts/borsa-cagri-izi-selftest.js`).
- **OKX kontrat çevirisi:** en olası hata, 100 kat büyük emir. Bu yüzden emir/pozisyon tavanları baz miktar ve USDT nominal üzerinden kalır; OKX sahte borsasında `ctVal` 0,01 ile sınanır. Ön kontrol "nominal > tavan" zaten durdurur.
- **Bybit:** aynı kalıp, x1 gereği sonra.

### 7.8 Bölme, büyüklük, bağımlılık
- **7a (L, onaylı):** arayüz + Binance bağdaştırıcısı, davranış aynı.
- **7b (L):** OKX bağdaştırıcısı + sahte OKX + matris, `hazir: false`; demo hesap sınaması salt okuma.
- **7c (M):** matris tam geçince `hazir: true` + demo bot şablonu + panel.
- **Bağımlılık:** A1 (kayıt, hesap bağlama), C1 (bagla modülde). Hesap kesicisi, öz denetim bağdaştırıcıya göre (zorla kapanış/funding OKX karşılıkları).

### 7.9 Açık karar
- **OKX demo botun evreni.** **Önerim:** Binance PIT evreni ∩ OKX (sınanmış kural, gölgeyle aynı). Seçenek: OKX'in kendi hacim evreni, ama bu sınanmamış bir varyant olur (a3'e aykırı).

---

## 8. Son grup

### 8.1 B2 — Olay akışı (s1, 1 yıl)
- **Biçim:** `<veri>/olaylar/<YYYY-MM>.jsonl` (yeni TABLO satırı KİŞİSEL, yedekte `KRITIK_DIZIN`'e eklenir). Satır: `{ z, makine, tur: 'emir'|'uyari'|'baslat'|'durdur'|'ayar'|'guncelleme'|'tasima'|'devralma'|'tatbikat', bot?, ozet, ayrinti?, kaynak, kimlik (sha 12) }`.
- **Yazanlar** (her biri tek satırlık kanca):
  - `db.addLog` sarmalayıcısı değil, **açık çağrılar**: yürütücü dolumları `kaydet` (botYonetimi'nde `kaydet` sarılır; canlı kod değişmez), `portfoyBildirici.gonder` (isletim değişmez; server tarafı sarmalar), bot başlat/durdur uçları, C2 ayar değişikliği kaydı, guncelleme durum geçişleri, taşıma ve devralma.
- **Saklama:** ay dosyaları; 13 aydan eskisi silinir (yalnız bu klasör).
- **Uçlar:**
  - `GET /api/olaylar?bas&bit&tur&bot&makine` (yerel/telefon/geliştirme): yerel + eşler (`GET /api/makine/olaylar`, makine kademesi) zaman sırasıyla birleşik, sayfalı.
  - Panel: Sistem › Olay akışı (`public/js/pages/olaylar.js`, süzgeçler).
- **Büyüklük:** M. **Bağımlılık:** C2 (ayar kaydı), 3. faz (eşler; yoksa yalnız yerel).

### 8.2 A4 — Onaylı alt hesaplar arası aktarım (s2)
- **Hedef paylar:** `config.sermayeDagitimi = { hedefler: { <bot>: pay }, bant }`. Sapma önerisi `lib/sermayeDagitimi.js` (saf): toplam özsermaye × pay − mevcut → aktarım önerileri (en az sayıda).
- **Aktarım anahtarı:**
  - Anahtarlar'da yeni hesap türü `tur: 'aktarim'` (ana hesap, ayrı anahtar).
  - **Sınama zorunlu:** `cekme === true` → kayıt reddedilir ve her aktarımdan önce yeniden okunur (Binance `sapiGetAccountApiRestrictions.enableWithdrawals`, OKX `perm` içinde `withdraw`).
  - Gereken aktarım izninin borsadaki adı uygulama anında borsa belgesinden doğrulanır; tasarım genel tutulur.
- **İzinli hedefler:** yalnız Anahtarlar'da kayıtlı, aynı kullanıcının ana/alt hesapları (alt hesap e-postası/kimliği listesi). Liste dışı hedef koddan reddedilir.
- **Aktarım ucu:** `POST /api/sermaye/aktar { kaynak, hedef, tutar, pin, onay:'AKTAR' }`.
  - Kademe yerel; telefon ve geliştirme 403.
  - **Tavan:** tek aktarım ≤ `config.sermayeDagitimi.tekTavan`, günlük ≤ `gunlukTavan`.
  - Aktarım sırasında ilgili botlar durdurulmuş olmalı ya da karar penceresi dışında olunmalı.
  - Akış: defter-önce kayıt `<veri>/live/aktarimlar.jsonl` (`BEKLIYOR` → `TAMAM`/`BELIRSIZ`; belirsizde borsadan sorgu, körlemesine tekrar yok; yürütücü ilkesi) → başarıda iki botun `sermayeDegisikligi` / `sermaye-akisi` kaydı.
- **Gerçek para kuralı:** demo hesapta alt hesap aktarımı yok (Binance demo'da sapi yok). Bu yüzden 5. faza kadar yalnız **sahte borsa** + kâğıt botlarda "sanal aktarım" çalışır. Gerçek aktarım kapısı (`config.sermayeDagitimi.gercekAcik`) **kapalı** gelir; açılması kullanıcının ayrı ve yazılı kararıdır.
- **Panel:** Botlar › Sermaye dağıtımı (hedef paylar, sapma, öneri, onayla).
- **Testler:** `scripts/sermaye-aktarim-selftest.js`. Çekme izni açık → red, liste dışı hedef → red, tavan, belirsiz cevap → sorgu, çift aktarım yok.
- **Büyüklük:** L. **Bağımlılık:** A1, A2 (OKX alt hesap aktarımı için).
- **Açık karar:** gerçek aktarım kapısı ne zaman açılır? **Önerim:** gerçek para kapısıyla (2027-01-05 sonrası, G1–G9) birlikte, ayrı onayla.

### 8.3 D2 — Haftalık karne (s3)
- `lib/karne.js` (saf) birleştirir:
  - bot haftalık getirileri (`/api/bindirme/:ad/grafik` eğrisi, RAPOR'un yaptığı gibi 127.0.0.1'den),
  - BTC haftalık getirisi (market.db ya da Binance günlük),
  - sağlık (`ozDenetim` anlık özeti: kırmızı/sarı sayısı),
  - bekleyen işler (anasayfa `yapilacaklar` mantığının sunucu kopyası `lib/yapilacaklar.js`; panel aynı uçtan okumaya geçebilir),
  - gölge özeti (`lib/golgeOzet.js` satırları aynen).
- **Gönderim:** `lib/bildirimUreticileri.js` `golge` üreticisi (pazartesi ≥ 09:00 TR, ISO hafta başına bir) **karneyi** gönderir: tek mesaj, yeni katalog türü `karne`.
  - Göç: kullanıcının `golge` tür ayarı (`acik`, `kanal`, `sessiz`) ilk okumada `karne`'ye kopyalanır; `golge` türü gizli kalır (eski ayar kaybolmaz).
- **Önizleme:** Bildirimler sayfasında `karne` önizlemesi.
- **Büyüklük:** M. **Bağımlılık:** A1 (bot listesi), B2 isteğe bağlı.

### 8.4 D3 — Pusula içi tatbikat (s4)
**Otomatik aylık** (`lib/tatbikat/otomatik.js`, ayın ilk pazarı 11:30, D1'den sonra):
- **Kapsam:** kâğıt ve demo botlar. **`hucum` demo 2026-12-10'a kadar hariç** (`dokunulmaz`).
- **Tatbikatlar:**
  1. mutabakat provası (salt okuma),
  2. felaket stopu varlık denetimi (`koruma.denetle` salt okuma; kâğıtta atlanır),
  3. acil durdurma denemesi (yalnız demo botta, mevcut `acilDene` ucu; kâğıtta kâğıt borsa kopyasında),
  4. veri kapısı enjeksiyonu (bozuk mumla bot **kopyasında** kuru çalışma → güvenli kip / hata bekleniyor),
  5. D1 geri dönüş.
- **Sonuç:** `tatbikat/sonuclar.jsonl` + Telegram (`tatbikat` türü).

**Elle provalar için tatbikat sihirbazı** (`lib/tatbikat/sihirbaz.js` + `public/js/pages/tatbikat.js`, rota Sistem › Tatbikat):
- **Kalıcı durum makinesi:** `<veri>/tatbikat/sihirbaz.json`. Pusula yeniden açılınca kaldığı adımdan sürer; prova 2 ve 4 bunu gerektiriyor.
- **Prova tanımları** `demoKabulEsikleri.PROVALAR` ile aynı numaralar ve ölçütler (1 felaket stopu, 2 çökme/yeniden başlatma, 3 internet, 4 kapalı bilgisayar, 5 acil durdurma — 63. günden sonra kuralı uygulanır, 6 mutabakat). Her prova = adımlar (yönerge metni) + beklenen + **otomatik doğrulayıcı**:

| Prova | Kullanıcı ne yapar | Sihirbaz neyi doğrular |
|---|---|---|
| 1 | borsada en küçük felaket stopunu elle iptal eder | `korumaEmri` denetiminin stopu yeniden kurmasını bekler (saatlik denetim; "şimdi denetle" düğmesi), süreyi ve Telegram bildirimini doğrular |
| 2 | "Pusula'yı durdur" kısayolunu kullanır, 1 dk sonra açar | açılışta `acilislar.jsonl` + `son-kapanis.json`; bot yeniden bağlandı mı, mutabakat temiz mi, süre. **Sihirbaz süreç kapatmaz** |
| 3 | interneti keser, 10 dk sonra açar | öz denetim `internet` kesinti olayı, botun durması, geri gelince mutabakat |
| 4 | bilgisayarı karar saatini kaçıracak kadar kapalı tutar | açılışta `telafiGecmisi` kaydı + "kaçırılan gün" bildirimi |
| 5 | — | mevcut `acil-dene` akışı |
| 6 | — | mutabakat |

- **Prova günlüğü:** sonuç ilgili bot dizinindeki `prova-gunlugu.json`'a **mevcut biçimle** eklenir: `{ no, bas, bit, adimlar, gozlenen, sure, hukum: 'geçti'|'geçmedi' }`. `demoKabulRapor.provaYukle` aynen okur; `bas` başlangıçta, `bit` doğrulamada yazılır. Böylece prova aralığı ölçümden doğru hariç tutulur.
  - Kairos demo provaları kullanıcının işidir ve kabulün parçasıdır; sihirbaz bunlar için **açıktır**. Otomatik tatbikat Kairos'u kapsamaz.
  - Dosya `kalici.yaz` ile yazılır; var olan satırlar korunur.
- **Sonuç raporu:** sihirbaz sonunda tek sayfa (adımlar, süreler, doğrulamalar) + Telegram.
- **Uçlar:**
  - `GET /api/tatbikat` (yerel/telefon/geliştirme).
  - `POST /api/tatbikat/{otomatik,baslat,adim,iptal}` (yerel; `baslat` `{ prova, bot }`, prova 5 ve demo bot için PIN).
- **Büyüklük:** L. **Bağımlılık:** D1 (4c), A1.

### 8.5 Son grup bölme önerisi
B2 (M) → D2 (M) → D3a otomatik (M) → D3b sihirbaz (L) → A4 (L; gerçek kapı kapalı).

---

## 9. Sıra, bağımlılık ve sürüm özeti

| Sıra | İş | Sürüm parçaları | Büyüklük | Önceki koşul | Bot kodu (onaylı) |
|---|---|---|---|---|---|
| 1 | D4 | 1 (ya da 2) | M | 73.7 kartı | evet (kanca) |
| 2 | A1 + 2. faz | 2a · 2b · 2c (+ çift yazım kaldırma) | L + M + M | 73.0 | 2a evet |
| 3 | C1 | a · b · c (+ adım 0) | XL | A1-2a | hayır (yer değişimi; c onaylı) |
| 4 | 3. faz | 3a · 3b · 3c | L · L · L–XL | A1, C1 | 3c evet (nöbet açılışı) |
| 5 | 4. faz | 4a · 4b · 4c | L · L · M | 3. faz | 4b evet (sahiplen) |
| 6 | A3 | 6a · 6b | M · M | A1 (+3. faz) | 6b evet |
| 7 | A2 + 5. faz | 7a · 7b · 7c | L · L · M | A1, C1 | evet |
| 8 | B2 · D2 · D3 · A4 | 5 sürüm | M–L | yukarıdakiler | A4 hayır (gerçek kapı kapalı) |

**Her sürümde kanıt seti:**
- `npm test`.
- Kuru deneme (canlı kod değiştiyse güncelleyici zaten yapar; tasarımda ayrıca elle kayda geçer).
- Bot kodu değişen sürümlerde: `canli-yeniden-oynat --gun 120` önce/sonra karşılaştırması + `bindirme`/`hata-matrisi`/`live`/`canli-saglamlik`/`demo-kabul` testleri.

## 10. Kullanıcıya sorulacak açık kararlar (önerilerimle)

| # | Karar | Önerim |
|---|---|---|
| 1 | D4 ilk kip | 7 gün izleme. Kâğıt botta baştan etkin olabilir. Demo Kairos 2026-12-09'a kadar yalnız haber |
| 2 | D4 ikinci kaynak | Binance spot (kuru deneme ağ kalkanıyla uyumlu) |
| 3 | Yeni kâğıt bot PIN istesin mi | Hayır, onay yeter. PIN hesap/mod/sermaye artışında |
| 4 | Kairos tipi yeni botun gölge kıyası | ENGEL `hucum.C0`'a göre; küçük sermayede `hucumS` gölgesi bilgi olarak |
| 5 | Kairos demo 2026-12-09'a kadar taşınmasın/devralınmasın | Evet |
| 6 | Taşıma ve kopyada sırları şifreleyen anahtar | Mevcut yedek şifresi (iki makinede aynı) |
| 7 | Eşlere ulaşılamayan açılışta bot başlasın mı | Hayır; elle Başlat + Telegram |
| 8 | Geliştirme bilgisayarı kopya çeksin mi | Hayır |
| 9 | Devralmada borsadaki bizim önekli emirlerin sahiplenilmesi | Liste + onay |
| 10 | A3 eş verisi bayatsa | Son bilinen en kötü değer + uyarı |
| 11 | OKX demo botun evreni | Binance PIT evreni ∩ OKX |
| 12 | A4 gerçek aktarım kapısı | Gerçek para kapısıyla (2027-01-05 sonrası) ayrı onayla |

### Critical Files for Implementation
- `C:\Pusula-Gelistirme\pusula\server.js` (bot tanımı 660–957, `bindirmeAyar`/`bindirmeKur`/`acilisBaglan`, uçlar 1828–2275, güncelleme 958–1040, C1 haritasının kaynağı)
- `C:\Pusula-Gelistirme\pusula\lib\live\bindirmeBot.js` (`STRATEJILER[ad]` bağı, `_calistir` veri kapısı, `guvenliKipKoy`/`_ertele`)
- `C:\Pusula-Gelistirme\pusula\lib\live\yurutucu.js` (`_kapilar` risk kapısı yeri, `mutabakat` sahiplen, borsa bağdaştırıcısı)
- `C:\Pusula-Gelistirme\pusula\lib\guvenlik.js` (kademeler, `GELISTIRME_YAZMA`, yeni makine kademesi)
- `C:\Pusula-Gelistirme\pusula\lib\kuruDeneme.js` + `C:\Pusula-Gelistirme\pusula\scripts\kuru-deneme.js` (davranış aynılığının kanıtı, `--strateji`, D1 tatbikat altyapısı)
- Ayrıca: `C:\Pusula-Gelistirme\pusula\lib\anahtarlar.js`, `C:\Pusula-Gelistirme\pusula\lib\tasima.js`, `C:\Pusula-Gelistirme\pusula\lib\paket.js`, `C:\Pusula-Gelistirme\pusula\lib\guncelleme.js`, `C:\Pusula-Gelistirme\pusula\lib\ozDenetim.js`, `C:\Pusula-Gelistirme\pusula\lib\veriTurleri.js`, `C:\Pusula-Gelistirme\pusula\lib\ileri\demoKabulRapor.js`, `C:\Pusula-Gelistirme\pusula\public\js\pages\botlar.js`, `C:\Pusula-Gelistirme\pusula\PLAN-MAKINE-HESAP-BOT.md`
---
## 11. Açık kararların uygulanışı (ana oturum, 2026-10-24 gece)
Kullanıcı "tüm kararları plan aşamasında alalım, gece sen yönet" dedi; §10'daki 12 açık karar için **önerilen seçenekler uygulanır** ve sabah raporunda kullanıcıya bildirilir (değiştirmek isterse geri alınır). Planda iki "C3" var: g1'deki C3 = yapay zekâ haber okuma; §4'teki = **C3-uyum** (sürüm uyum testi).
