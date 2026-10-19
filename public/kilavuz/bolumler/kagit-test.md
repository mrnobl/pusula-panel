# Kâğıt test {#kagit-test}

> **Not:** Kâğıt test **Arşiv › Kâğıt test**'te; eski `#/arastirma/kagit` adresi buraya açılır. 66.0'dan beri **kâğıt test hesabı** (sanal hesabın pozisyonları, emirleri, geçmişi) da bu sayfada — eskiden Arşiv › Genel'deydi.

## Ne işe yarar {#ne-ise-yarar}

Stratejileri **canlı fiyatlarla, sanal (kâğıt) hesapta** çalıştırıp gözlemlemek. Borsaya emir gitmez. Hücum/Denge botlarından ayrıdır; onlar Botlar ekranındadır.

## Ne zaman kullanılır {#ne-zaman}

Backtestte umut veren bir stratejinin canlı veride nasıl davrandığını izlemek için (Pine betikleri dahil).

## Ekran {#ekran}

![Kâğıt test](ekran:kagit-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Kâğıt test hesabı kartları | Hesap değeri · Kapanan işlemlerin K/Z · Açık pozisyon · Çalışan kâğıt bot · Risk durumu |
| Kâğıt test hesabı (panel) | Bot hesabıyla aynı panel: bakiye, açık pozisyonlar, bekleyen emirler, geçmiş işlemler; kâğıt pozisyonda **Kapat** (onay ister, araştırma modunda kilitli) |
| Strateji / zaman dilimi | Başlatılacak kâğıt botun stratejisi |
| Semboller | Bot her işaretli sembolde ayrı çalışır; **＋ Ekle** ile yeni sembol |
| Çalışan botlar | Durdurma düğmeleriyle birlikte |
| Bakiye geçmişi · Varlıklar · Günlük | Kâğıt hesabın kayıtları (CSV) |
| Kâğıt hesap bakiyesi | Bakiyeyi ayarla / para ekle / çek |
| Kâğıt hesabı sıfırla | Bütün kâğıt geçmişini siler (onaylı) |

## Adım adım: kâğıt botu başlatmak {#baslat}

1. Strateji ve zaman dilimini seçin (ya da Stratejiler ekranında **Kâğıt testte dene**).
2. Sembolleri işaretleyin.
3. **Kâğıt botları başlat**.
4. Kartları ve **Çalışan botlar** tablosunu izleyin; risk kuralları [Kâğıt test riski](#/kilavuz/kagit-risk) ekranından.
5. Durdurmak için **Tümünü durdur** ya da satırdaki durdur düğmesi.

## Uyarılar ve ne yapmalı {#uyarilar}

- **Risk durumu kırmızı / "acil fren"**: kâğıt hesabın düşüş freni devreye girdi; başlıktaki **Kâğıt test acil frenini sıfırla** ile (onaylı) sıfırlanır.
- Araştırma modunda başlat/durdur düğmeleri kilitlidir.

> **Tehlike:** **Kâğıt geçmişi sil ve hesabı sıfırla** geri alınamaz.
