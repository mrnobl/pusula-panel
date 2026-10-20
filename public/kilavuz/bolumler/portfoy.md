# Portföy {#portfoy}

## Ne işe yarar {#ne-ise-yarar}

Portföy, **kendi paranın** (aracı kurum, banka, kripto borsası) tek yeridir. Sol menüde **Portföy** dalının altında sekiz sayfa var; açık sayfa adres çubuğunda durur (ör. [Pano](#/portfoy/pano), [Hesaplar](#/portfoy/hesaplar)):

| Sayfa | Ne görürsün |
|---|---|
| **Pano** | Toplam değer, getiri, risk göstergeleri, portföy sağlığı, dağılım, kıyaslı grafik, aylık ısı haritası, düşüş — ve bu portföy için **yapman gerekenler** ([Pano](#/kilavuz/portfoy/pano)) |
| **Hesaplar** | Bilgi **girilir**: hangi hesap hangi portföyün, hesap kartları ve "+ işlem", hisse/hesap ekle, CSV içe aktarma, varlık düzeyinde hedef, gelişmiş ([Hesaplar](#/kilavuz/portfoyum/kayit)) |
| **Varlıklar** | Elindeki her şey tek tabloda: adet, maliyet, fiyat, değer, kâr/zarar, gerçekleşen, pay; nakit; kapanan pozisyonlar ([Varlıklar](#/kilavuz/portfoy/varliklar)) |
| **İşlem defteri** | Kaynak seçici: **Kripto / FX** (OKX, Binance, MetaTrader) · **Yatırım** (Hesaplar'a girdiğin işlemler) · **Bot** (botların işlem dökümü, CSV) ([İşlem defteri](#/kilavuz/islem-defterim)) |
| **Hedefim** | Paranın nasıl bölünmesini istediğin; olması gereken ↔ şu an; hangi hesapta ne alınıp satılacağı ([Hedefim](#/kilavuz/portfoy/hedefim)) |
| **Modeller** | Nasdaq Momentum 10 · BIST Momentum 10 · %50 QQQ + %50 Hücum — sayfanın üstündeki seçiciyle; her modelin **Bu ay** emir kartı ve sanal hesabı ([Modeller](#/kilavuz/model-portfoy)) |
| **Takvim ve akış** | Günlük kâr/zarar takvimi ve işlem / gelir / yaklaşan vade akışı ([Takvim](#/kilavuz/portfoy/takvim)) |
| **Rapor** | Risk ve getiri ölçütleri (portföy · QQQ · BTC), ay ay karne, kötü senaryolar, korelasyon ([Rapor](#/kilavuz/portfoyum-rapor)) |

**Toplam yalnız Pano'da yazar** (Ana sayfadaki Portföyüm kartı onun kısasıdır); öteki sayfalarda toplam şeridi yoktur.

> **Model sayfalarındaki rakamlar botun kendi sanal hesabındandır** (kâğıt hesap), kendi paran değil. Gerçek portföyün Pano, Hesaplar, Varlıklar ve Hedefim'de.

## Görünüm: portföy ve para birimi {#gorunum}

Bir Portföy sayfası açıkken üst çubukta iki seçici durur; seçim bütün Portföy sayfalarında geçerlidir ve bu tarayıcıda hatırlanır:

- **Portföy:** **Ben**, eklediğin öteki portföyler (ör. **Anıl**) ve **Tümü**. Her hesap tek bir portföye bağlıdır; başkasının hesabı senin toplamına, getirine, hedefine ve raporuna girmez. **Tümü** bütün portföylerin birleşimidir ve **yalnız okunur** (hedef girilmez; Pano'da portföy başına değer tablosu çıkar). **Hesaplar** yalnız seçili kişinin hesap kartlarını gösterir (Tümü: kişi başlıkları altında hepsi); **İşlem defteri › Yatırım** ve **Rapor**'daki hesap seçicisi de yalnız onun hesaplarını listeler. Hesabı portföye bağlamak: [Hesaplar › Portföyler](#/kilavuz/portfoyum/portfoyler).
- **Para:** **$** · **₺** · **Gizli**. Gizli bütün tutarları **•••** yapar (yüzdeler görünür) — ekran paylaşırken ya da yanında biri varken. Eski "Tutarları gizle" ve "$ USD / ₺ TL" düğmeleri kaldırıldı; tek yer burası.

> **Not:** Gizli yalnız bu tarayıcının görünümünü değiştirir, veriyi değil. Telefonda tutarların **sunucudan hiç gönderilmemesi** ayrı bir ayardır: Modeller › Ayarlar › "Tutarları telefonda gizle" ([Model sermayesi](#/kilavuz/tasarimci/sermaye)).

## Ne zaman kullanılır {#ne-zaman}

- Günlük / haftalık: **Pano**'ya bakmak — "ne kadar param var, bu yıl nasıl gitti, yapmam gereken bir şey var mı?"
- Bir işlem yaptığında (alış, satış, temettü, para yatırma): **Hesaplar** › ilgili hesabın "+ işlem" satırı.
- Ay sonunda: **Hedefim**'de sapmaya bakmak; modellerin emirlerini **Modeller** › Bu ay kartından uygulamak.
- Ay sonu karnesi ve "kötü bir günde ne olur?" için **Rapor**.

## Ekran {#ekran}

![Portföy › Pano (Portföy'ün açılış sayfası)](ekran:pano-1400)

Portföy menüsüne tıklayınca **Pano** açılır. Eski adresler yeni yere gider: `#/portfoy/portfoyum` → Pano, `#/portfoy/kayit` → Hesaplar, `#/portfoy/buay` ve `#/portfoy/modeller` → Modeller. Üst çubuktaki **?** açık sayfanın kılavuz başlığına gider.

## Pano {#pano}

Yukarıdan aşağıya:

1. **Gösterge şeridi:** **Toplam değer** (altında kapsamı: "dahil: … · dahil değil: …"), **Bu yıl · TWR** (aynı dönemde QQQ ve BTC), **Başlangıçtan** (ilk kayıt günü ve QQQ), **En derin düşüş** (şu an tepeden ne kadar aşağıda, en uzun düşüş), **Sharpe**, **Oynaklık · yıllık** (Sortino, Calmar). Getiri zaman ağırlıklıdır (TWR): para yatırmak ya da çekmek getiriyi değiştirmez. Sharpe ve oynaklık en az 30 günlük seri ister.
2. **Kripto borsaları satırı:** İşlem defteri'ndeki Binance ve OKX hesaplarının **bakiyesi** (salt okuma anahtarıyla okunur; saat ve **Yenile**). Bu bakiye **Ben** ve **Tümü** toplamına **dahildir**. Hesaplar'da "toplama dahil" bir kripto borsası hesabın da varsa aynı para iki kez sayılmasın diye **eklenmez** ve satır bunu söyler. Binance'te vadeli okunamadıysa "(yalnız spot)" yazar.
3. **Portföy sağlığı** (örümcek ağı) · **Dağılım** halkası (Sınıf / Hesap / Para; [ayrıntı](#/kilavuz/portfoy/dagilim)) · **Yapman gerekenler** (bu portföy için: hedef seçilmedi, hedeften sapma, boşta nakit, bayat hesap, eksik fiyat/kur, sahip önerisi — her satır ilgili sayfaya götürür).
4. **Değer · getiri — kıyasla:** **Getiri %** (100 tabanlı; çiplerle QQQ, BTC, TÜFE, BIST 30, TL mevduat, Dolar eklenir) ya da **Değer + yatırılan** (değer çizgisi ve net yatırılan para). Her çizginin ucunda **son değer** yazar ve grafiğin altında seçili her kıyasın **ne ölçtüğü** anlatılır ([kıyaslar](#/kilavuz/portfoy/kiyaslar)).
5. **Aylık getiri** ısı haritası (yıl × ay; hücrede yüzde, yarım aylar soluk, sonda **Yıl** sütunu) ve kazanan ay oranı, en iyi / en kötü ay; yanında **Düşüş ve toparlanma** şeridi: en derin düşüş, en uzun düşüş, toparlanma süresi, Ulcer endeksi.

Bot hesapları Pano'da yoktur (67.4): botların parası ayrı izlenir ve portföy toplamına katılmaz — [Botlar](#/kilavuz/botlar) sayfasında.

![Pano — kıyaslı grafik, aylık ısı haritası, düşüş](ekran:pano-grafik-1400)

### Dağılım: dilimler ve içindekiler {#dagilim}

Halkanın altında her dilim bir satırdır: renk işareti, ad, yüzde. Altındaki küçük satır o dilimde **hangi varlıkların** olduğunu ve her birinin **bütün portföy içindeki payını** yazar — ör. "Hisse %10,8" altında "PYPL %4,1 · ASTS %3,2 · …". Aynı hisse iki hesapta varsa tek kalem olarak toplanır; nakit dilimlerinde para birimleri yazar ("USD nakit %5,7"). **Sınıf**, **Hesap** ve **Para** görünümlerinin üçünde de böyledir. En çok 8 dilim çizilir: fazlası "Diğer (n)" diliminde toplanır ve onun altında dilim adları yazar. Bir dilimde 8'den çok varlık varsa sonu "+n daha" olur.

### Kıyaslar ne ölçüyor? {#kiyaslar}

Bütün çizgiler portföyün **ilk kayıt gününden** 100 tabanlıdır ve üst çubukta seçili birimdedir ($ ya da ₺). Çizginin ucundaki değer o günden bugünedir: bir çizgi iki katın üstündeyse grafik **kat** yazar (×4,16 = paranın 4,16 katı), değilse **yüzde** (+%31,6). Portföy çizgisi zaman ağırlıklıdır: para yatırmak ya da çekmek getiri sayılmaz.

| Kıyas | Ne ölçer |
|---|---|
| **TL mevduat** | TCMB'nin **1 aya kadar vadeli TL mevduat ortalama faizi** (EVDS MT01), **stopaj düşülmüş**; her ayın başında o günkü ortalama faizle **yeniden bağlanır**. Ara vermeden her ay ortalama faizi almak demektir — bir mevduatın alabileceğinin **üst sınırı**. |
| **BIST 30** | BIST 30 **fiyat** endeksi (XU030) — **temettü hariç**. |
| **QQQ** | Invesco QQQ **al-tut**; Yahoo **düzeltilmiş kapanışı** (adjclose): temettüler yeniden yatırılmış, bölünmeler düzeltilmiş. |
| **Dolar** | USD nakit, **faizsiz**: $ biriminde düz çizgi, ₺ biriminde yalnız kurun artışı. |
| **TÜFE** | TÜİK tüketici fiyat endeksi; **aylık**, her ayın değeri **ay sonuna** yazılır. Bunun üstü reel kazançtır. |
| **BTC** | Bitcoin **al-tut**; Binance günlük spot kapanışı. |

> **TL mevduat neden bu kadar yüksek?** ₺ biriminde, yıllık %40–50 dolayındaki TL faizi her ay bileşik işlediği için mevduat çizgisi dik yükselir (ör. 2023 başından bu yana ₺'de yaklaşık ×4). Bu bir hata değildir; aynı dönemde TÜFE'nin de ×3–4 arttığını, 
### Portföy sağlığı (0–100) {#saglik}

Altı eksen, her biri 0–100, **eşit ağırlık**; puan ölçülebilen eksenlerin ortalamasıdır:

| Eksen | 100 puan | 0 puan |
|---|---|---|
| **Getiri (kıyasa)** | QQQ'dan 20 yüzde puanı ya da daha fazla iyi | QQQ'dan 20 yüzde puanı ya da daha fazla kötü (eşitse 50) |
| **Düşük düşüş** | düşüş yok | en derin düşüş %40 ya da daha kötü |
| **Çeşitlilik** | yoğunlaşma (HHI) 0,15 ya da daha az | tek varlık |
| **Nakit verimi** | boşta (faizsiz) nakit yok | portföyün yarısı boşta nakit |
| **Düşük maliyet** | ücret yok | son 365 günün ücret + komisyonu portföyün %2'si ya da daha fazla |
| **Hedefe yakınlık** | hedefle birebir | toplam sapma 50 puan ya da daha fazla; **hedef seçilmediyse 0** |

Arada puan doğrusaldır. Veri yetmeyen eksen "—" yazar ve ortalamaya girmez.

## Varlıklar {#varliklar}

![Varlıklar — elde olanlar](ekran:varliklar-1400)

- **Elde olanlar** (süzgeç **Açık / Kapanmış / Hepsi**): varlık, hesap, adet, **ortalama maliyet** ve **fiyat** (varlığın kendi para biriminde), **değer** (seçili birimde), **K/Z** (ortalama maliyete göre, yüzdesiyle), **gerçekleşen** (satışların FIFO kârı), **pay**.
- **Nakit:** hesap ve para birimi başına tutar, değer, pay.
- **Kapanan pozisyonlar — gerçekleşen:** satıp kapattığın varlıkların kârı/zararı.

Düzeltme (adet, alış fiyatı) burada yapılmaz: [Hesaplar](#/kilavuz/portfoyum/kayit).

## Hedefim {#hedefim}

![Hedefim — hedefini seç, olması gereken ↔ şu an](ekran:hedefim-1400)

**Hedef**, paranın nasıl bölünmesini istediğindir — ör. "%50 endeks, %40 kripto, %10 nakit". Getiri hedefi değildir. Her portföyün **kendi hedefi** vardır (Ben ve Anıl ayrı); **Tümü** görünümünde hedef girilmez.

1. **Hedefini seç:** modelden hazır üç seçenek (**%50 QQQ + %50 Hücum**, **Nasdaq / BIST Momentum 10**, **Dengeli**), **Kendim gireyim** (sınıf yüzdeleri) ya da **Varlık varlık gireyim** (her hisse, fon ve nakit için ayrı yüzde; bu portföyde tutulanlar önce, elde olmayanlar "elde yok" notuyla). Toplam %100 olmalı → **Hedefi kaydet**. **Sapma bandı** (varsayılan ±5 puan) aynı formda değiştirilir. Hedef seçili kişinin portföyüne kaydedilir.
2. **Olması gereken ↔ şu an:** her sınıfın hedef ve gerçek payı, çubuk (dolgu: şu an, çizgi: hedef) ve **Ne yapmalı** ("al $…" / "azalt $…"). Bandın dışındaki satırlar renklidir ve Pano'daki "Yapman gerekenler"e düşer.
3. **Hangi hesapta ne yapılacak:** alım → en çok nakdi olan hesap; azaltma → o kalemi en çok tutan hesap. **Öneridir, emir gönderilmez.** Yaptıktan sonra işlemi [Hesaplar](#/kilavuz/portfoyum/kayit)'dan gir. Yeni para eklersen önce eksik kalanlara dağıt (satış gerekmez).

Hedef yalnız burada girilir (Hesaplar'da yalnız **Hedefi düzenle → Hedefim** bağlantısı var — [Hedef dağılım](#/kilavuz/portfoyum/hedef)). Modellerin hedefini Portföyüm'e almak için Modeller › Ayarlar › **Portföyüm hedefini güncelle** ([Model sermayesi](#/kilavuz/tasarimci/sermaye)).

## Para ekle ve dağılımı değiştir {#para-ekle}

![Para ekle ve dağılımı değiştir — kural, yapılacaklar, satışta elde kalacak adet](ekran:para-ekle-1400)

Hedefim'deki **Para ekle ve dağılımı değiştir** kartında **Planla →**. Portföye para ekleyeceksen ya da hisselerin payını değiştireceksen, hangi hisseden kaç adet alıp satacağını burada hesaplarsın. **Panel emir göndermez**; işlemi aracı kurumda (ör. Midas) sen yaparsın, sonra burada kaydedersin. Plan, üst çubukta seçili portföyün (Ben, ANIL …) **tek bir hesabında** yapılır; **Tümü** seçiliyken plan yapılamaz (işlemlerin hangi portföye yazılacağı belli değil). **← Hedefim** geri döner.

1. **Eklenecek para:** tutarı **₺** ya da **$** yaz (yalnız dağılım değişecekse 0). ABD hesabında TL tutar o günün USD/TRY kuruyla dolara çevrilir; aracı kurumun kuru farklıysa tutarı doğrudan **$** olarak yaz. Portföyün birden çok hesabı varsa **Hesap** seçicisi çıkar (varsayılan: hisseleri en büyük USD hesabı; ABD hissesi USD hesaba, BIST hissesi TL hesaba). Hesapta nakit varsa yazılır; **Hesaptaki nakdi de dağıt** işaretlenirse o nakit de plana girer (işaretsizken yalnız eklediğin para dağıtılır).
2. **Her hisse için kural:**
   - **Sabit %:** payı sen yazarsın (ör. JNJ %15). **%0 = hepsini sat.**
   - **Oranını koru:** sabitlerden kalan pay, bu hisseler arasında **bugünkü değerleri oranında** bölünür.
   - Her satırda şu anki pay, hedef pay, **al / sat** tutarı, işlem adedi ve **sonra elinde** kalacak adet. Satış satırı turuncu ve **"… kalmalı"** yazar. **≈ TL** sütunu tutarın TL karşılığı.
   - **Listede olmayan hisse:** sembolü yaz → **Bul** (fiyat Yahoo'dan). Yeni hisse yalnız **Sabit %** olabilir (bugün payı 0); **×** ile plandan çıkar.
3. **Özet şeridi:** bugünkü değer, para eklenince, sabit paylar · oranını koruyan ve **Durum**. Satış gerekiyorsa Durum turuncu olur ve satılacak hisseleri sayar; **sabit paylar %100'ü aşarsa** uyarı çıkar ve kaydetme kapanır.
4. **Yapılacaklar:** sırasıyla para yatırma, **Önce sat** kutusu ve **Al / Sonra al** listesi.
   - **Satışta en önemli satır:** "QQQ: 0,212 adet sat → **satıştan sonra elinde 0,278 adet kalmalı**". **Yanlış adet satarsan hesap şaşar** — satıştan sonra elinde tam yazan adet kalmalı. Farklı sattıysan kaydetmeden önce gerçek adedi yaz.
   - Alışta: "INTC: 2,056 adet al → alımdan sonra elinde 2,056 adet olacak".
   - **Kesirli adet** (Midas ABD hisselerinde var; TL hesapta kapalı başlar): kapalıyken tam adede aşağı yuvarlanır, artan para nakitte kalır.
   - Her satırın altında **gerçek adet ve fiyat** kutuları: işlemi yaptıktan sonra gerçekleşen değerleri yaz. Para yatırmada **Hesaba geçen tutar** (TL'den çevrildiyse kurumun verdiği dolar).
   - **Aldım, işlemleri kaydet:** para yatırma + satışlar + alışlar seçili hesaba **tek seferde** yazılır (ya hepsi ya hiçbiri; işlem tarihi değiştirilebilir, varsayılan bugün). Yeni hisse için varlık açılır ve fiyat geçmişi indirilir. Satış eldekini aşamaz; nakit eksiye düşecekse panel önce sorar. TL ile yatırılıp USD hesaba geçen paranın TL tutarı ve kuru kaydın notuna yazılır.
   - **Vazgeç:** planı temizler, **hiçbir şey yazmaz**. **Listeyi kopyala:** planı düz metin olarak panoya alır (satışta elde kalacak adet dahil).

![Telefonda: önce sat kutusu](ekran:para-ekle-390)

**Hesap nasıl yapılır:** M = eklenecek para, T0 = hisselerin bugünkü değeri, T = T0 + M. Sabit satırın hedefi kendi yüzdesi; "oranını koru" satırları kalan payı bugünkü değerleri oranında böler. al = hedef pay × T − bugünkü değer; eksiyse satış. Örnek: QQQ 0,49 · SPCX 0,42 · JNJ 0,31 · VOO 0,32 adet, INTC yeni; 60.000 TL (kur 49,5166 → $1.211,71), JNJ %15, INTC %10, diğerleri oranını korur → QQQ $444,48 · VOO $286,93 · JNJ $209,46 · INTC $192,46 · SPCX $78,38 alım, satış yok. "Oranını koru" satırları birlikte büyür ya da küçülür: sabit paylar büyüyüp kalan pay bugünkü değerlerinin altına düşerse hepsi satışa döner.

**Portföy botları ne tutuyor (sayfanın en altı):** **Nasdaq Momentum 10**, **BIST Momentum 10** ve **%50 QQQ + %50 Hücum** botlarının bugünkü listesi: sıra, hisse, durum (**Tutuyor** · **Girecek** · **Çıkacak** · **Yedek**), fiyat (bu ayın emir listesinde varsa), seçili portföyde var mı ve **+ Plana ekle** (Sabit %5 ile gelir; payı değiştirebilir ya da çıkarabilirsin). Eklenemiyorsa nedeni yazar: hesabın para birimi uymuyor (**TL hesap gerekir**), **Binance botunda** (Hücum yarısı plana eklenmez), **botta çıkacak — Sabit %0 ile sat**. Üstte son karar, sıradaki karar ve botun başladığından beri sonucu (QQQ ile kıyaslı). **Bu liste öneri değil; botun kuralının bugünkü sonucudur.**

## Takvim ve akış {#takvim}

![Takvim ve akış — günlük K/Z](ekran:takvim-1400)

- **Günlük K/Z takvimi:** her gün = günün değeri − dünkü değer − o günkü para girişi/çıkışı (para yatırmak kâr değildir). Yeşil kazanç, kırmızı kayıp; koyu ton 50 birimden büyük. Üstte ayın toplamı ve **‹ ›** ile ay değiştir. Fiyatsız günler boş.
- **Zaman çizelgesi** (süzgeç **Hepsi / İşlem / Gelir / Yaklaşan**): bu portföyün hesaplarındaki işlemler, temettü/faiz gelirleri (otomatik mevduat faizi "otomatik" yazar) ve dolmak üzere olan mevduat vadeleri.

## Laboratuvar (araştırma) {#sekmeler}

![Portföy laboratuvarı — Kurucu](ekran:portfoy-1400)

Portföy laboratuvarı gerçek hesabına dokunmayan bir **araştırma aracıdır**: **Araştırma › Portföy laboratuvarı** ile açılır ([#/arastirma/laboratuvar](#/arastirma/laboratuvar)); açık iç sekme adreste durur (ör. `#/arastirma/laboratuvar/kurucu`). Kurucu ve sonraki sekmelerin üstünde deneme sayacı ("Oturum: N deneme") ve **Veri durumu** özeti durur.

| Sekme | Ne yapılır |
|---|---|
| Kurucu | **Varlık portföyü kur**: varlık kataloğundan (endeks/ETF, hisse, TEFAS fonu, kripto, emtia, döviz, tahvil, botlar) varlık ekle, ağırlık ve dengeleme ayarlarını ver, **Simüle et**. Katalogda olmayan hisse: **Yahoo'da bul ve ekle** (aşağıda) |
| Sonuç | Getiri, oynaklık, en büyük düşüş, Sharpe; ana grafik (olası sıralamalar bandı, kriz dönemleri), stres dönemleri, ağırlık grafiği |
| Karşılaştır | Kayıtlı portföyleri yan yana. Altında katlı **Eski karar günlüğü (arşiv, salt okunur)** — eski kararların tanımı **Kurucuya yükle** ile geri gelir |
| **İleri araştırma ▾** → Strateji karışımı | Strateji kataloğu, strateji birleşimi kurucusu (dene + kaydet), risk özeti ([ayrıntı](#/kilavuz/tasarimci/ekran)). Model kartları ve karar takvimi burada değil: Modeller ve İleri test'te |
| **İleri araştırma ▾** → Varyasyon | Bir ayarı (ağırlık, bant, sıklık…) değiştirerek birçok adayı birlikte koşar; sonuçları sıralar |

Ana sekmeler **Kurucu · Sonuç · Karşılaştır**; **Strateji karışımı** ve **Varyasyon** sekme şeridindeki **İleri araştırma ▾** düğmesiyle açılan ikinci sırada. İkisi de silinmedi; deneme sayacı aynı sayar.

![Laboratuvar — ana sekmeler ve İleri araştırma](ekran:laboratuvar-ileri-1400)

> **Uyarı:** **Deneme sayacı** her simülasyonu sayar. Çok deneme yapıp en iyisini seçmek geçmişe uydurmadır; sonuçlar deneme sayısına göre düzeltilir (DSR). Sayacı sıfırlamak yalnız yeni ve bağımsız bir soruya başlarken yapılmalı.

## Adım adım: bir dağılımı geçmişte denemek {#tutarlari-girmek}

"Olsaydı planı" sekmesi 67.5'te kaldırıldı (eski adresi Kurucu'yu açar). Gerçek portföy için al/sat listesi [Hedefim](#/kilavuz/portfoy/hedefim) › **Para ekle ve dağılımı değiştir** planlayıcısındadır; o planın dağılımını geçmişte denemek için:

1. **Portföy › Hedefim › Planla**'da eklenecek parayı ve her hissenin kuralını (Sabit % / Oranını koru) yaz.
2. **3 · Yapılacaklar** kartında **Bu dağılımı geçmişte dene**'ye bas. Planın hedef payları (nakitte kalan pay diğerlerine dağıtılarak %100'e) **Araştırma › Portföy laboratuvarı › Kurucu**'ya elle ağırlık olarak aktarılır ve simüle edilir; sonuç **Sonuç** sekmesinde açılır.
3. Katalogda olmayan hisse önce Yahoo'dan indirilir. İndirilemezse simülasyon **yapılmaz** ve hangi hissenin indirilemediği yazar (uydurma veri yok). Laboratuvarda karşılığı olmayan varlık (elle girilen, altın) atlanır ve bildirimde yazar.

**Katalogda olmayan hisseyi Kurucu'ya eklemek:** varlık kataloğunun altındaki kutuya sembolü ya da şirket adını yaz (ör. `MSFT`, `THYAO`, `Tesla`) ve **Yahoo'da bul ve ekle**'ye bas: sembol Yahoo'da aranır (BIST için `.IS` kendiliğinden denenir), fiyat geçmişi indirilir ve varlık katalogda `yahoo:<KOD>` olarak Kurucu'ya eklenir. Geçmişi kısa varlıkta **"kısa: … yıl"** rozeti çıkar — simülasyon dönemi o varlığın başladığı güne kısalabilir.

> Simülasyon araştırmadır, **gerçek emir değildir**; Portföyüm kayıtlarına hiçbir şey yazılmaz. Telefonda bu düğmeler kilitlidir.

## Veri durumu {#veri-durumu}

Laboratuvar sekmelerinin üstündeki **Veri durumu** özeti hangi kaynakların güncel/bayat olduğunu söyler; **Bayatları güncelle** arka planda indirir. Ayrıntı: [Veri](#/kilavuz/veri).

## Telefonda {#telefonda}

![Pano telefonda](ekran:pano-390)

Telefonda göstergeler ve kartlar alt alta dizilir, tablolar kart olur. Kayıt düğmeleri (hedef kaydet, portföy ekle, hesap → portföy) telefonda kilitlidir; sunucu da reddeder.

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Tümü görünümündesin: yalnız okunur":** hedef ve kayıt için üst çubuktan bir portföy seç.
- **Sahip önerisi bandı** (bir hesabın başka bir portföye ait olabileceği uyarısı): Hesaplar › Portföyler kartında o hesabı doğru portföye bağla.
- **"… için hedef henüz seçilmedi":** Hedefim'de bir hedef seç; sağlık puanındaki "Hedefe yakınlık" o zamana kadar 0'dır.
- **"Kripto borsaları: bakiye okunamadı":** İşlem defteri › Kripto / FX'te borsa hesabının salt okuma anahtarına bak; o zaman toplam borsasız gösterilir.
- **Laboratuvar: "kısa: … yıl" rozeti:** varlığın geçmişi kısa; sonucu temkinli yorumla. **"veri X tarihine kadar; güncelleme sürüyor":** simülasyon eldeki veriyle koştu.

## Sık sorulanlar {#sss}

**Eski sekmeler nereye gitti?** "Portföyüm" → **Pano** (sayılar, grafik) ve **Varlıklar** (tablo); "Hesaplarım" / "Kayıt" → **Hesaplar**; Hesaplarım'daki işlem defteri → **İşlem defteri › Yatırım**; "İşlem defterim" → **İşlem defteri › Kripto / FX**; botların CSV dökümü → **İşlem defteri › Bot**; üç model sekmesi → **Modeller** (içeride seçici); "Tasarımcı" → **Araştırma › Portföy laboratuvarı › İleri araştırma › Strateji karışımı**; "Uygulama planı" / "Olsaydı planı" → kaldırıldı (67.5): gerçek plan **Hedefim › Planla**, geçmişte denemek **Bu dağılımı geçmişte dene**.

**Tutarları borsadan otomatik okuyamaz mı?** Hesaplar'a girilenler bilinçli olarak elle girilir. Kripto borsaların (Binance, OKX) bakiyesi ise İşlem defteri'ndeki salt okuma anahtarıyla Pano toplamına eklenir; bot hesapları ayrı satırdır.

**Nakit portföye dahil mi?** Evet, hesaplardaki nakit toplamın parçasıdır; boşta (faizsiz) nakit oranı Pano ve sağlık puanında ayrıca yazar.
a çevrildiğinde aradaki farkın küçüldüğünü grafikte birim değiştirerek görebilirsin.

Telefonda çizgi ucundaki yazılar sığmadığı için gizlenir; son değerler grafiğin altındaki adların yanında yazar. Aylık getiri tablosu telefonda yana kaydırılır.

![Aylık getiri telefonda yana kaydırılır](ekran:pano-isi-390)

### Portföy sağlığı (0–100) {#saglik}

Altı eksen, her biri 0–100, **eşit ağırlık**; puan ölçülebilen eksenlerin ortalamasıdır:

| Eksen | 100 puan | 0 puan |
|---|---|---|
| **Getiri (kıyasa)** | QQQ'dan 20 yüzde puanı ya da daha fazla iyi | QQQ'dan 20 yüzde puanı ya da daha fazla kötü (eşitse 50) |
| **Düşük düşüş** | düşüş yok | en derin düşüş %40 ya da daha kötü |
| **Çeşitlilik** | yoğunlaşma (HHI) 0,15 ya da daha az | tek varlık |
| **Nakit verimi** | boşta (faizsiz) nakit yok | portföyün yarısı boşta nakit |
| **Düşük maliyet** | ücret yok | son 365 günün ücret + komisyonu portföyün %2'si ya da daha fazla |
| **Hedefe yakınlık** | hedefle birebir | toplam sapma 50 puan ya da daha fazla; **hedef seçilmediyse 0** |

Arada puan doğrusaldır. Veri yetmeyen eksen "—" yazar ve ortalamaya girmez.

## Varlıklar {#varliklar}

![Varlıklar — elde olanlar](ekran:varliklar-1400)

- **Elde olanlar** (süzgeç **Açık / Kapanmış / Hepsi**): varlık, hesap, adet, **ortalama maliyet** ve **fiyat** (varlığın kendi para biriminde), **değer** (seçili birimde), **K/Z** (ortalama maliyete göre, yüzdesiyle), **gerçekleşen** (satışların FIFO kârı), **pay**.
- **Nakit:** hesap ve para birimi başına tutar, değer, pay.
- **Kapanan pozisyonlar — gerçekleşen:** satıp kapattığın varlıkların kârı/zararı.

Düzeltme (adet, alış fiyatı) burada yapılmaz: [Hesaplar](#/kilavuz/portfoyum/kayit).

## Hedefim {#hedefim}

![Hedefim — hedefini seç, olması gereken ↔ şu an](ekran:hedefim-1400)

**Hedef**, paranın nasıl bölünmesini istediğindir — ör. "%50 endeks, %40 kripto, %10 nakit". Getiri hedefi değildir. Her portföyün **kendi hedefi** vardır (Ben ve Anıl ayrı); **Tümü** görünümünde hedef girilmez.

1. **Hedefini seç:** modelden hazır üç seçenek (**%50 QQQ + %50 Hücum**, **Nasdaq / BIST Momentum 10**, **Dengeli**), **Kendim gireyim** (sınıf yüzdeleri) ya da **Varlık varlık gireyim** (her hisse, fon ve nakit için ayrı yüzde; bu portföyde tutulanlar önce, elde olmayanlar "elde yok" notuyla). Toplam %100 olmalı → **Hedefi kaydet**. **Sapma bandı** (varsayılan ±5 puan) aynı formda değiştirilir. Hedef seçili kişinin portföyüne kaydedilir.
2. **Olması gereken ↔ şu an:** her sınıfın hedef ve gerçek payı, çubuk (dolgu: şu an, çizgi: hedef) ve **Ne yapmalı** ("al $…" / "azalt $…"). Bandın dışındaki satırlar renklidir ve Pano'daki "Yapman gerekenler"e düşer.
3. **Hangi hesapta ne yapılacak:** alım → en çok nakdi olan hesap; azaltma → o kalemi en çok tutan hesap. **Öneridir, emir gönderilmez.** Yaptıktan sonra işlemi [Hesaplar](#/kilavuz/portfoyum/kayit)'dan gir. Yeni para eklersen önce eksik kalanlara dağıt (satış gerekmez).

Hedef yalnız burada girilir (Hesaplar'da yalnız **Hedefi düzenle → Hedefim** bağlantısı var — [Hedef dağılım](#/kilavuz/portfoyum/hedef)). Modellerin hedefini Portföyüm'e almak için Modeller › Ayarlar › **Portföyüm hedefini güncelle** ([Model sermayesi](#/kilavuz/tasarimci/sermaye)).

## Para ekle ve dağılımı değiştir {#para-ekle}

![Para ekle ve dağılımı değiştir — kural, yapılacaklar, satışta elde kalacak adet](ekran:para-ekle-1400)

Hedefim'deki **Para ekle ve dağılımı değiştir** kartında **Planla →**. Portföye para ekleyeceksen ya da hisselerin payını değiştireceksen, hangi hisseden kaç adet alıp satacağını burada hesaplarsın. **Panel emir göndermez**; işlemi aracı kurumda (ör. Midas) sen yaparsın, sonra burada kaydedersin. Plan, üst çubukta seçili portföyün (Ben, ANIL …) **tek bir hesabında** yapılır; **Tümü** seçiliyken plan yapılamaz (işlemlerin hangi portföye yazılacağı belli değil). **← Hedefim** geri döner.

1. **Eklenecek para:** tutarı **₺** ya da **$** yaz (yalnız dağılım değişecekse 0). ABD hesabında TL tutar o günün USD/TRY kuruyla dolara çevrilir; aracı kurumun kuru farklıysa tutarı doğrudan **$** olarak yaz. Portföyün birden çok hesabı varsa **Hesap** seçicisi çıkar (varsayılan: hisseleri en büyük USD hesabı; ABD hissesi USD hesaba, BIST hissesi TL hesaba). Hesapta nakit varsa yazılır; **Hesaptaki nakdi de dağıt** işaretlenirse o nakit de plana girer (işaretsizken yalnız eklediğin para dağıtılır).
2. **Her hisse için kural:**
   - **Sabit %:** payı sen yazarsın (ör. JNJ %15). **%0 = hepsini sat.**
   - **Oranını koru:** sabitlerden kalan pay, bu hisseler arasında **bugünkü değerleri oranında** bölünür.
   - Her satırda şu anki pay, hedef pay, **al / sat** tutarı, işlem adedi ve **sonra elinde** kalacak adet. Satış satırı turuncu ve **"… kalmalı"** yazar. **≈ TL** sütunu tutarın TL karşılığı.
   - **Listede olmayan hisse:** sembolü yaz → **Bul** (fiyat Yahoo'dan). Yeni hisse yalnız **Sabit %** olabilir (bugün payı 0); **×** ile plandan çıkar.
3. **Özet şeridi:** bugünkü değer, para eklenince, sabit paylar · oranını koruyan ve **Durum**. Satış gerekiyorsa Durum turuncu olur ve satılacak hisseleri sayar; **sabit paylar %100'ü aşarsa** uyarı çıkar ve kaydetme kapanır.
4. **Yapılacaklar:** sırasıyla para yatırma, **Önce sat** kutusu ve **Al / Sonra al** listesi.
   - **Satışta en önemli satır:** "QQQ: 0,212 adet sat → **satıştan sonra elinde 0,278 adet kalmalı**". **Yanlış adet satarsan hesap şaşar** — satıştan sonra elinde tam yazan adet kalmalı. Farklı sattıysan kaydetmeden önce gerçek adedi yaz.
   - Alışta: "INTC: 2,056 adet al → alımdan sonra elinde 2,056 adet olacak".
   - **Kesirli adet** (Midas ABD hisselerinde var; TL hesapta kapalı başlar): kapalıyken tam adede aşağı yuvarlanır, artan para nakitte kalır.
   - Her satırın altında **gerçek adet ve fiyat** kutuları: işlemi yaptıktan sonra gerçekleşen değerleri yaz. Para yatırmada **Hesaba geçen tutar** (TL'den çevrildiyse kurumun verdiği dolar).
   - **Aldım, işlemleri kaydet:** para yatırma + satışlar + alışlar seçili hesaba **tek seferde** yazılır (ya hepsi ya hiçbiri; işlem tarihi değiştirilebilir, varsayılan bugün). Yeni hisse için varlık açılır ve fiyat geçmişi indirilir. Satış eldekini aşamaz; nakit eksiye düşecekse panel önce sorar. TL ile yatırılıp USD hesaba geçen paranın TL tutarı ve kuru kaydın notuna yazılır.
   - **Vazgeç:** planı temizler, **hiçbir şey yazmaz**. **Listeyi kopyala:** planı düz metin olarak panoya alır (satışta elde kalacak adet dahil).

![Telefonda: önce sat kutusu](ekran:para-ekle-390)

**Hesap nasıl yapılır:** M = eklenecek para, T0 = hisselerin bugünkü değeri, T = T0 + M. Sabit satırın hedefi kendi yüzdesi; "oranını koru" satırları kalan payı bugünkü değerleri oranında böler. al = hedef pay × T − bugünkü değer; eksiyse satış. Örnek: QQQ 0,49 · SPCX 0,42 · JNJ 0,31 · VOO 0,32 adet, INTC yeni; 60.000 TL (kur 49,5166 → $1.211,71), JNJ %15, INTC %10, diğerleri oranını korur → QQQ $444,48 · VOO $286,93 · JNJ $209,46 · INTC $192,46 · SPCX $78,38 alım, satış yok. "Oranını koru" satırları birlikte büyür ya da küçülür: sabit paylar büyüyüp kalan pay bugünkü değerlerinin altına düşerse hepsi satışa döner.

**Portföy botları ne tutuyor (sayfanın en altı):** **Nasdaq Momentum 10**, **BIST Momentum 10** ve **%50 QQQ + %50 Hücum** botlarının bugünkü listesi: sıra, hisse, durum (**Tutuyor** · **Girecek** · **Çıkacak** · **Yedek**), fiyat (bu ayın emir listesinde varsa), seçili portföyde var mı ve **+ Plana ekle** (Sabit %5 ile gelir; payı değiştirebilir ya da çıkarabilirsin). Eklenemiyorsa nedeni yazar: hesabın para birimi uymuyor (**TL hesap gerekir**), **Binance botunda** (Hücum yarısı plana eklenmez), **botta çıkacak — Sabit %0 ile sat**. Üstte son karar, sıradaki karar ve botun başladığından beri sonucu (QQQ ile kıyaslı). **Bu liste öneri değil; botun kuralının bugünkü sonucudur.**

## Takvim ve akış {#takvim}

![Takvim ve akış — günlük K/Z](ekran:takvim-1400)

- **Günlük K/Z takvimi:** her gün = günün değeri − dünkü değer − o günkü para girişi/çıkışı (para yatırmak kâr değildir). Yeşil kazanç, kırmızı kayıp; koyu ton 50 birimden büyük. Üstte ayın toplamı ve **‹ ›** ile ay değiştir. Fiyatsız günler boş.
- **Zaman çizelgesi** (süzgeç **Hepsi / İşlem / Gelir / Yaklaşan**): bu portföyün hesaplarındaki işlemler, temettü/faiz gelirleri (otomatik mevduat faizi "otomatik" yazar) ve dolmak üzere olan mevduat vadeleri.

## Laboratuvar (araştırma) {#sekmeler}

![Portföy laboratuvarı — Kurucu](ekran:portfoy-1400)

Portföy laboratuvarı gerçek hesabına dokunmayan bir **araştırma aracıdır**: **Araştırma › Portföy laboratuvarı** ile açılır ([#/arastirma/laboratuvar](#/arastirma/laboratuvar)); açık iç sekme adreste durur (ör. `#/arastirma/laboratuvar/kurucu`). Kurucu ve sonraki sekmelerin üstünde deneme sayacı ("Oturum: N deneme") ve **Veri durumu** özeti durur.

| Sekme | Ne yapılır |
|---|---|
| Kurucu | **Varlık portföyü kur**: varlık kataloğundan (endeks/ETF, hisse, TEFAS fonu, kripto, emtia, döviz, tahvil, botlar) varlık ekle, ağırlık ve dengeleme ayarlarını ver, **Simüle et**. Katalogda olmayan hisse: **Yahoo'da bul ve ekle** (aşağıda) |
| Sonuç | Getiri, oynaklık, en büyük düşüş, Sharpe; ana grafik (olası sıralamalar bandı, kriz dönemleri), stres dönemleri, ağırlık grafiği |
| Karşılaştır | Kayıtlı portföyleri yan yana. Altında katlı **Eski karar günlüğü (arşiv, salt okunur)** — eski kararların tanımı **Kurucuya yükle** ile geri gelir |
| **İleri araştırma ▾** → Strateji karışımı | Strateji kataloğu, strateji birleşimi kurucusu (dene + kaydet), risk özeti ([ayrıntı](#/kilavuz/tasarimci/ekran)). Model kartları ve karar takvimi burada değil: Modeller ve İleri test'te |
| **İleri araştırma ▾** → Varyasyon | Bir ayarı (ağırlık, bant, sıklık…) değiştirerek birçok adayı birlikte koşar; sonuçları sıralar |

Ana sekmeler **Kurucu · Sonuç · Karşılaştır**; **Strateji karışımı** ve **Varyasyon** sekme şeridindeki **İleri araştırma ▾** düğmesiyle açılan ikinci sırada. İkisi de silinmedi; deneme sayacı aynı sayar.

![Laboratuvar — ana sekmeler ve İleri araştırma](ekran:laboratuvar-ileri-1400)

> **Uyarı:** **Deneme sayacı** her simülasyonu sayar. Çok deneme yapıp en iyisini seçmek geçmişe uydurmadır; sonuçlar deneme sayısına göre düzeltilir (DSR). Sayacı sıfırlamak yalnız yeni ve bağımsız bir soruya başlarken yapılmalı.

## Adım adım: bir dağılımı geçmişte denemek {#tutarlari-girmek}

"Olsaydı planı" sekmesi 67.5'te kaldırıldı (eski adresi Kurucu'yu açar). Gerçek portföy için al/sat listesi [Hedefim](#/kilavuz/portfoy/hedefim) › **Para ekle ve dağılımı değiştir** planlayıcısındadır; o planın dağılımını geçmişte denemek için:

1. **Portföy › Hedefim › Planla**'da eklenecek parayı ve her hissenin kuralını (Sabit % / Oranını koru) yaz.
2. **3 · Yapılacaklar** kartında **Bu dağılımı geçmişte dene**'ye bas. Planın hedef payları (nakitte kalan pay diğerlerine dağıtılarak %100'e) **Araştırma › Portföy laboratuvarı › Kurucu**'ya elle ağırlık olarak aktarılır ve simüle edilir; sonuç **Sonuç** sekmesinde açılır.
3. Katalogda olmayan hisse önce Yahoo'dan indirilir. İndirilemezse simülasyon **yapılmaz** ve hangi hissenin indirilemediği yazar (uydurma veri yok). Laboratuvarda karşılığı olmayan varlık (elle girilen, altın) atlanır ve bildirimde yazar.

**Katalogda olmayan hisseyi Kurucu'ya eklemek:** varlık kataloğunun altındaki kutuya sembolü ya da şirket adını yaz (ör. `MSFT`, `THYAO`, `Tesla`) ve **Yahoo'da bul ve ekle**'ye bas: sembol Yahoo'da aranır (BIST için `.IS` kendiliğinden denenir), fiyat geçmişi indirilir ve varlık katalogda `yahoo:<KOD>` olarak Kurucu'ya eklenir. Geçmişi kısa varlıkta **"kısa: … yıl"** rozeti çıkar — simülasyon dönemi o varlığın başladığı güne kısalabilir.

> Simülasyon araştırmadır, **gerçek emir değildir**; Portföyüm kayıtlarına hiçbir şey yazılmaz. Telefonda bu düğmeler kilitlidir.

## Veri durumu {#veri-durumu}

Laboratuvar sekmelerinin üstündeki **Veri durumu** özeti hangi kaynakların güncel/bayat olduğunu söyler; **Bayatları güncelle** arka planda indirir. Ayrıntı: [Veri](#/kilavuz/veri).

## Telefonda {#telefonda}

![Pano telefonda](ekran:pano-390)

Telefonda göstergeler ve kartlar alt alta dizilir, tablolar kart olur. Kayıt düğmeleri (hedef kaydet, portföy ekle, hesap → portföy) telefonda kilitlidir; sunucu da reddeder.

## Uyarılar ve ne yapmalı {#uyarilar}

- **"Tümü görünümündesin: yalnız okunur":** hedef ve kayıt için üst çubuktan bir portföy seç.
- **Sahip önerisi bandı** (bir hesabın başka bir portföye ait olabileceği uyarısı): Hesaplar › Portföyler kartında o hesabı doğru portföye bağla.
- **"… için hedef henüz seçilmedi":** Hedefim'de bir hedef seç; sağlık puanındaki "Hedefe yakınlık" o zamana kadar 0'dır.
- **"Kripto borsaları: bakiye okunamadı":** İşlem defteri › Kripto / FX'te borsa hesabının salt okuma anahtarına bak; o zaman toplam borsasız gösterilir.
- **Laboratuvar: "kısa: … yıl" rozeti:** varlığın geçmişi kısa; sonucu temkinli yorumla. **"veri X tarihine kadar; güncelleme sürüyor":** simülasyon eldeki veriyle koştu.

## Sık sorulanlar {#sss}

**Eski sekmeler nereye gitti?** "Portföyüm" → **Pano** (sayılar, grafik) ve **Varlıklar** (tablo); "Hesaplarım" / "Kayıt" → **Hesaplar**; Hesaplarım'daki işlem defteri → **İşlem defteri › Yatırım**; "İşlem defterim" → **İşlem defteri › Kripto / FX**; botların CSV dökümü → **İşlem defteri › Bot**; üç model sekmesi → **Modeller** (içeride seçici); "Tasarımcı" → **Araştırma › Portföy laboratuvarı › İleri araştırma › Strateji karışımı**; "Uygulama planı" / "Olsaydı planı" → kaldırıldı (67.5): gerçek plan **Hedefim › Planla**, geçmişte denemek **Bu dağılımı geçmişte dene**.

**Tutarları borsadan otomatik okuyamaz mı?** Hesaplar'a girilenler bilinçli olarak elle girilir. Kripto borsaların (Binance, OKX) bakiyesi ise İşlem defteri'ndeki salt okuma anahtarıyla Pano toplamına eklenir; bot hesapları ayrı satırdır.

**Nakit portföye dahil mi?** Evet, hesaplardaki nakit toplamın parçasıdır; boşta (faizsiz) nakit oranı Pano ve sağlık puanında ayrıca yazar.
