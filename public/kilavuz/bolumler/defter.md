# Araştırma defteri {#defter}

> **Not:** Araştırma defteri **Araştırma › Araştırma defteri**'nde (yeni panel; bir ara Arşiv'deydi, eski `#/arsiv/defter` adresi buraya açılır). Defterin kısa özeti — toplam, kabul/red sayıları, hükmü yaklaşanlar — [Araştırma › Özet](#/kilavuz/arastirma-ozet)'te.

## Ne işe yarar {#ne-ise-yarar}

Projede denenen her **ön kayıtlı** kural ve hipotezin tek kaydı. Her deneme bir **numara** alır; bu sayı çoklu karşılaştırma düzeltmesinde (DSR'deki N) kullanılır. Kayıt `kayitlar/denemeler.jsonl` dosyasındadır; bir satır tek bir denemeyi ya da ardışık bir numara aralığını (ör. 740–759, 20 deneme) anlatır: aile, hipotez, plan dosyası, ön kayıt ve sonuç commit'i, holdout açıldı mı, durum, sonuç, "neden kapandı" ve hüküm tarihi.

Numaralar **çakışamaz** ve **boşluk bırakılamaz**; ayrılıp kullanılmayan numaralar **BOŞ** durumuyla kaydedilir. Panel bunu her açılışta denetler.

## Ne zaman kullanılır {#ne-zaman}

- Yeni bir deneme başlamadan önce: **sonraki boş numarayı** görmek (ya da komut satırında `npm run defter:sonraki`).
- "Bunu daha önce denemiş miydik?" sorusu için: arama kutusu.
- Gölge izlemedeki ya da açık denemelerin **hüküm tarihini** takip etmek için.

## Ekran {#ekran}

![Sayaçlar, hükmü yaklaşanlar, aileler](ekran:defter-1400)

![Kayıtlar: arama, süzgeç, tablo](ekran:defter-kayit-1400)

![Bir kaydın hikâyesi](ekran:defter-hikaye-1400)

![Telefon](ekran:defter-390)

## Okumak {#okumak}

1. **Sayaçlar:** toplam deneme (BOŞ olmayan en yüksek numara; sonda önceden ayrılmış boş aralık varsa ayrıca yazılır) ve yedi durumun her biri için numara sayısı. Bir aralık kaydı uzunluğu kadar sayılır; durum kartlarının toplamı tüm numaraların sayısıdır. **Sonraki boş** numara ayrılmış boş aralığın sonrasıdır; ayrılmış aralıktan numara kullanılacaksa o BOŞ satırı dosyada bölünür. Durum kartına tıklamak tabloyu o duruma süzer.
2. **Hükmü yaklaşanlar:** GÖLGE ve AÇIK kayıtlar hüküm tarihine göre sıralı; **kalan gün** 30'un altına inince sarı, geçince kırmızı.
3. **Aileler:** her ailenin numara adedi. Düğmeye tıklayınca tablo o aileye süzülür; bir daha tıklayınca süzgeç kalkar.
4. **Kayıtlar:** arama kutusu başlık, hipotez, sonuç, neden ve plan içinde arar (Türkçe harf duyarsız); bir sayı yazarsanız o numarayı kapsayan kayıt gelir. Sütun başlığına tıklayarak sıralayın (telefonda "Sırala" seçicisi). Tablo ilk **50 kaydı** gösterir; altta **Daha fazla göster (+50)** ve **Tümünü göster** düğmeleri vardır. Arama ve süzgeçler her zaman defterin tamamında çalışır; süzgeç değişince tablo yeniden ilk 50 kayıttan başlar.
5. **Tablo** her kaydı tek satırda sade anlatır: **Ne denendi** (başlık, numara ve kod öneki atılmış) · **Ne çıktı** (sonucun başı, kısaltmalar açılmış) · durum · tarih. Bütün sütunlar sola yaslıdır.
6. Satıra ya da **Aç** düğmesine tıklayınca altta kaydın **hikâyesi** açılır: dört adım yan yana (telefonda alt alta) — **1 · Ne denendi**, **2 · Neyle kıyaslandı** (kıyas ve hiç bakılmamış dönemde sınanıp sınanmadığı), **3 · Ne çıktı**, **4 · Sonuç ve ders** (kabul / ret, neden; gölge ve açık kayıtta hüküm günü ve kalan gün). Altında **Nerede** satırı: plan belgesi, o belgede anılan betikler ve commit'ler.
7. Hikâye kayıttaki metinden **kendiliğinden** üretilir (dosyaya yazılmaz): kısaltmalar açılır — P → geliştirme dönemi, hol / holdout → hiç bakılmamış dönem, DD / MaxDD → en derin düşüş, CAGR → yıllık getiri, Holm → çoklu deneme düzeltmesi, ✗ → sınırı aştı. Ölçüt kodları (K-A4 gibi) plan belgesindeki adıyla kalır. Kayıttaki metnin aslı **Teknik ayrıntı** katında, etiket solda değer yanında; commit'ler kısa hash (tam hâli üzerine gelince), panel git çalıştırmaz.

| Durum | Anlamı |
|---|---|
| RED | Ölçüldü, kabul ölçütünü geçmedi |
| KABUL | Ölçüldü, ölçütlerin hepsini geçti |
| GÖLGE | İleriye dönük gölge izlemede; hüküm tarihi bekleniyor |
| AÇIK | Ön kaydı yapıldı, ölçüm sürüyor |
| BOŞ | Numara ayrıldı, kullanılmadı |
| BELGESİZ | Eski deneme; ön kaydı ya da sonucu bulunamadı. Defterde artık BELGESİZ kayıt yok: 464–469, 492–499, 553 ve 636–639 hiçbir belgede geçmediği için 2026-10-11'de BOŞ'a çevrildi |
| BİLGİ | Karar kuralı değil, yalnız bilgi göstergesi |

## Adım adım: yeni deneme kaydı {#yeni-kayit}

1. **Yeni kayıt ekle** bölümünü açın; ilk ve son numara **sonraki boş numarayla** dolu gelir.
2. Aile kimliği (küçük harf ve tire, ör. `funding-oi`; listeden mevcut aile seçilebilir), aile adı, başlık ve **hipotezi** yazın. Hipotez ölçümden ÖNCE yazılır.
3. Plan dosyası (`PLAN-X.md`), durum (yeni deneme için genellikle **AÇIK**), holdout ve gerekiyorsa hüküm tarihi.
4. **Deftere ekle** → onaylayın. Kayıt dosyaya eklenir; ardından CLAUDE.md'deki "Güncel" sayısını da güncelleyin ve dosyayı git'e işleyin.

> **Uyarı:** Kayıt panelden düzeltilemez ve silinemez. Yanlış bir kayıt, dosyada elle (git ile izlenerek) düzeltilir; sonra `npm run defter:denetle` çalıştırın.

> **İpucu:** Form yalnız sunucuda görünür. Telefondan defter yalnız okunur.

## Uyarılar ve ne yapmalı {#uyarilar}

| Uyarı (kırmızı bant) | Ne yapmalı |
|---|---|
| ÇAKIŞIYOR | İki kayıt aynı numarayı kullanıyor; dosyada birini düzeltin |
| BOŞLUK | Bir numara aralığı hiçbir kayıtta yok; kullanılmadıysa "BOS" kaydı ekleyin |
| geçersiz JSON satırı | Dosyada bozuk satır var; düzeltilene kadar yeni kayıt eklenemez |
| alan yok / geçersiz | Satırdaki alan eksik ya da durum/holdout/tarih biçimi yanlış |
| dosya yok | Defter henüz aktarılmadı (`kayitlar/denemeler.jsonl`) |
