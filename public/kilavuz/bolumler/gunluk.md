# Günlükler {#gunluk}

## Ne işe yarar {#ne-ise-yarar}

"Panel ne yaptı, ne zaman bir şey ters gitti?" Botların, veri kaynaklarının, araştırma işlerinin ve sunucunun yazdığı her olay tek yerde, tek biçimde: **zaman · seviye · kaynak · ne oldu**. Kayıtlar 30 gün saklanır, sonra kendiliğinden silinir. Sayfa yalnız okur.

Geliştirme bilgisayarında (sunucu bağlantısı kuruluysa) sayfa **sunucunun** günlüğünü gösterir.

## Ne zaman kullanılır {#ne-zaman}

- Ana sayfadaki Sistem kartı "Son 24 saatte N hata" dediğinde.
- Bir bildirim geldiğinde öncesinde ne olduğunu görmek için.
- Bir veri kaynağının ne sıklıkla düştüğünü ya da bir botun gün içinde ne yaptığını takip etmek için.

## Ekran {#ekran}

![Sistem › Günlükler](ekran:gunluk-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Son 24 saat · hata | Kırmızı sayı; altında hatanın en çok geldiği kaynaklar. 0 ise "sorun yok" |
| Son 24 saat · uyarı | Sarı sayı; altında en çok uyarı veren kaynaklar |
| Son 24 saat · olay | Bütün satırlar; altında kaçı işlem, kaçı bilgi |
| Sunucu açık | Panelin bu açılıştan beri ne kadar süredir çalıştığı |
| Seviye | **hata** · **uyarı** · **işlem** (botun alımı/satımı) · **başarı** · **bilgi**. "Uyarı ve üstü" hata ve uyarıları birlikte gösterir |
| Kaynak | Olayı yazan bölüm: Botlar, Borsa, Veri, Coin tarama, Araştırma, Portföy, İleri test, Telegram, Güncelleme, Yedek, Kâğıt test, Sunucu, Sistem. Bot adı geçiyorsa yanında yazar (ör. "Botlar · Kalkan") |
| Zaman | Son 24 saat · 3 gün · 7 gün · 30 gün |
| Ara | Mesajın içinde arar (Türkçe harf duyarsız) |
| Dışa aktar (CSV) | Seçili süzgeçle en çok 5 000 satır; Excel'de açılır (`;` ayraçlı) |

Kaynak ve bot, mesajın içeriğinden kendiliğinden çıkarılır; hata satırları kırmızı zeminle görünür. Bir süzgece 500'den fazla satır uyarsa ilk 500'ü gösterilir ve "süzgeci daraltın" yazar.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Hata satırı:** mesaj ne olduğunu ve çoğu zaman ne yapılacağını söyler. Bot ya da borsa hatası tekrarlıyorsa [Botlar](#/kilavuz/botlar) ekranına bakın; veri hatası genelde kendiliğinden düzelir ([Veri](#/kilavuz/veri)).
- Günlük yazılamasa bile (disk dolu gibi) botlar çalışmaya devam eder; yalnız bu sayfa eksik kalır.
- Kayıtlar `data/gunluk/` altında gün başına bir dosyadır (git dışı); 30 günden eskisi silinir.
