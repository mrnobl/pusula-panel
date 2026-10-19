# Coin tarama ve liste kaydı — kısa kullanım (sürüm 60.3)

İki şey var, ikisi de **Araştırma** menüsünde. Hiçbiri alım/satım yapmaz, botları etkilemez.

## 1. Coin tarama — günlük zincir üstü kayıt

**Ne yapar:** İzleme listesindeki her coin için her gün borsa fiyatı, 24 saatlik hacim, DEX likiditesi, holder sayısı, ilk 10
cüzdanın payı, sözleşme yetkileri (mint, sahip, kara liste, vergi), DexScreener'da paralı tanıtım ve alan adının kayıt tarihini
kaydeder. Kaynaklar ücretsiz ve anahtarsız: GoPlus, RugCheck (Solana), DexScreener, RDAP, Binance/Bybit/OKX/Gate.

**Kendiliğinden çalışır:** Panelde Ana sayfa, Coin tarama ya da Listeler açılınca son tarama 20 saatten eskiyse arka planda
tarar (ilerleme çubuğu görünür). Panel açılmasa da sunucu günde bir tarar. Elle: **Şimdi tara**.

**Kayıt silinmez:** Yalnız eklenir. Batan ya da kaybolan bir token da kayıtta kalır ("veri yok" diye). Listeden çıkardığınız
coinin geçmişi de durur.

**Kırmızı bayrak = "şuna bak", alım/satım sinyali DEĞİL.** Örnekler: likidite düştü, ilk 10 payı oynadı, bir büyük cüzdan payını
bıraktı, holder azaldı, LP kilidi bitiyor, yeni token basılabiliyor, paralı reklam var, alan adı token'dan hemen önce alınmış,
fiyat/hacim kayboldu. Eşikler başlangıç değeridir; birkaç ay kayıt birikince isabetine bakıp ayarlarız.

**Ayrıntı:** Tablodaki **Ayrıntı** düğmesi: bayrakların nedeni, kaynakların durumu, son taramalar.

## 2. Tarama ayarları

- **İzleme listesi:** Coin ekle / Düzelt / Çıkar. Yanlış eşleşen sözleşme, ağ ya da borsa sembolünü buradan düzeltin; bir coinde
  anlamsız bulduğunuz bayrağı "yok sayılacak bayraklar"dan kapatın (ör. büyük projelerde "mint yetkisi").
- **Kaynaklar:** aç/kapa. CoinGecko ve GeckoTerminal kapalı gelir (koşulları verinin saklanmasını yasaklıyor).
- **Eşikler, otomatik aralık (20 saat), gecikme uyarısı (36 saat), Telegram** (kapalı gelir).
- Her elle değişiklik **denetim kaydına** yazılır (kim, ne zaman, eski → yeni).

## 3. Listeler — arkadaşın listelerinin tarih damgalı kaydı

1. **Yeni liste gir:** tarih (bugün), kaynak ("arkadaş"), not; her coin için **seçildi** ya da **elendi** (elenenleri de girin —
   seçimin işe yarayıp yaramadığı ancak böyle ölçülür). Toplu ekle kutusuna her satıra bir sembol yazabilirsiniz
   (`MET`, `-NES` ya da `NES elendi`; isterseniz ağ ve sözleşme: `CLANKER base 0x…`).
2. **Listeyi kaydet:** o anki fiyatlar, BTC ve piyasa otomatik kayda eklenir.
3. **Kayıt değiştirilemez.** Her kayıt bir öncekinin özetini taşır; biri sonradan değiştirilirse üstteki gösterge "zincir BOZUK"
   der. Hata yaptıysanız **Düzeltme ekle**: eski kayıt silinmez, düzeltme yeni kayıt olarak eklenir.
4. **Değerlendir:** listenin tarihinden bugüne seçilenler vs elenenler, BTC ve piyasa medyanı. Geçmiş bir gün için piyasa
   kıyası yoksa **Piyasa kıyasını hesapla** (bir kez, ~10 dk). Sonuç betimleyicidir; tek liste şansla da iyi görünebilir.
5. **Kalıcı tarih damgası:** kayıtlar `kayitlar/listeler/` klasörüne de yazılır. Git'e işlemek sizde:
   `git add kayitlar/listeler && git commit -m "liste kaydı" && git push`. Listeleri tek bilgisayardan (evdeki) girin.

İlk kayıt Temmuz listesidir: **geriye dönük girildi (2026-10-08), tarihi doğrulanamıyor**, elenenler bilinmiyor.

## Uyarılar

Kaynak erişilemezse, veri kısmi gelirse, yeni bir kırmızı bayrak çıkarsa, liste zinciri bozulursa ya da tarama 36 saati geçerse:
panelde bildirim, menüde kırmızı sayı (Araştırma / telefonda Diğer) ve Ana sayfa yapılacaklarda satır. Telegram'a da gitsin
isterseniz Tarama ayarları → Telegram.

## Komut satırı

`npm run tarama` (gerekiyorsa tarar) · `npm run tarama -- --zorla` · `npm run tarama -- --durum` · testler `npm run test:tarama`.
