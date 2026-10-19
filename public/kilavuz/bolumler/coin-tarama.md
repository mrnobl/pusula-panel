# Coin tarama {#coin-tarama}

## Ne işe yarar {#ne-ise-yarar}

İzleme listesindeki her coin için **her gün** borsa fiyatı, 24 saatlik hacim, DEX likiditesi, holder sayısı, ilk 10 cüzdanın payı, sözleşme yetkileri (mint, sahip, kara liste, vergi), paralı tanıtım ve alan adının kayıt tarihini kaydeder. Kayıt **yalnız eklenir**: batan ya da kaybolan token da kayıtta kalır. Kaynaklar ücretsiz ve anahtarsızdır (GoPlus, RugCheck, DexScreener, RDAP, borsalar).

Alım/satım yapmaz, botları etkilemez.

Bu ekran **sizin seçtiğiniz** coinleri izler. Yüzlerce coini kendiliğinden tarayan otomatik liste için: [Dikkat listesi](#/kilavuz/dikkat-listesi).

## Ne zaman kullanılır {#ne-zaman}

- Arkadaşınızın listesindeki coinlerde "şuna bak" işaretlerini görmek için.
- Bir coinin zincir üstü durumunun zamanla nasıl değiştiğini izlemek için.

## Ekran {#ekran}

![Coin tarama](ekran:coin-tarama-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| İzlenen coin | İzleme listesindeki coin sayısı |
| Kırmızı bayraklı coin | En az bir bayrağı olan coin (yok sayılanlar hariç) |
| Son başarılı tarama | Kaç saat önce; otomatik aralık 20 saat |
| Kaynak durumu | "hepsi yanıt verdi" / kısmi / hata |
| Coin tablosu | Ağ, fiyat, 24 s hacim, likidite, holder, ilk 10 (ham / ayıklanmış), kırmızı bayrak, kaynak sayısı |
| Ayrıntı | Bayrakların nedeni, kaynakların durumu, son taramalar |

## Kırmızı bayraklar {#bayraklar}

Kırmızı bayrak **"şuna bak"** demektir; alım/satım sinyali ya da puan DEĞİLDİR. Örnekler: likidite düştü, ilk 10 payı oynadı, büyük bir cüzdan payını bıraktı, holder azaldı, LP kilidi bitiyor, yeni token basılabiliyor (mint), kara liste yetkisi, paralı reklam, alan adı token'dan hemen önce alınmış, fiyat/hacim kayboldu. Eşikler başlangıç değeridir; birkaç ay kayıt birikince isabetine bakılıp ayarlanacak.

**Alan adı bayrağı (61.1):** alan adı token'ın ilk DEX çiftinden **önce ve en çok 30 gün önce** kaydedildiyse kırmızı bayrak çıkar (site token için aceleyle açılmış olabilir). Alan adı token'dan **sonra** alındıysa bu olağandır (çoğu proje önce token, sonra site açar) — bayrak çıkmaz; **Ayrıntı**'daki "Alan adı" satırında yalnız bilgi olarak "token'dan 12 gün sonra alınmış (olağan; bayrak değil)" yazar. Eşik Tarama ayarları'ndan değiştirilebilir.

**Kaynak hatası balonu:** bir kaynak hata verirse ("istek sınırına takıldı (429) — bir sonraki taramada yeniden denenir") sağ alttaki balon yalnız Coin tarama ve Veri ekranında çıkar; başka ekranda yalnız menüdeki sayı rozeti artar.

Büyük projelerde anlamsız bulduğunuz bayrağı (ör. "mint yetkisi") coin başına kapatabilirsiniz: [Tarama ayarları](#/kilavuz/tarama-ayarlari).

## Adım adım: taramayı elle çalıştırmak {#elle}

1. **Şimdi tara** düğmesine basın. İlerleme çubuğu görünür (15 coin ~1 dakika).
2. Bitince tablo yenilenir; bir coinin **Ayrıntı** düğmesiyle bayrak nedenlerini okuyun.

Taramayı hatırlamanız gerekmez: Ana sayfa, Coin tarama ya da Listeler açılınca son tarama 20 saatten eskiyse kendiliğinden başlar; panel açılmasa da sunucu günde bir tarar.

## Uyarılar ve ne yapmalı {#uyarilar}

| Uyarı | Ne yapmalı |
|---|---|
| Tarama 36 saati geçti | Sunucu açık mı; **Şimdi tara** |
| Kaynak erişilemiyor / kısmi veri | Genelde geçicidir; bir sonraki tarama düzeltir |
| Yeni kırmızı bayrak | **Ayrıntı**dan nedenini okuyun |
| Liste zinciri bozuk | [Listeler](#/kilavuz/listeler/zincir) |

Uyarılar panelde bildirim, menüde kırmızı sayı (Araştırma / telefonda Diğer) ve Ana sayfa yapılacaklarında görünür. Telegram'a da gitsin isterseniz Tarama ayarları → Telegram.

> **Not:** Asıl kayıt sunucuda birikmelidir (`data/tarama/`, git dışı). Komut satırı: `npm run tarama -- --durum`.
