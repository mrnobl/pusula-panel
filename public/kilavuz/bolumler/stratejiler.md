# Stratejiler {#stratejiler}

## Ne işe yarar {#ne-ise-yarar}

Kullanılan ve aday stratejilerin listesi; her birinin kuralları, parametreleri ve ölçüm sonucu. Araştırma'nın **Strateji testi** grubundadır (Stratejiler · Backtest). Araştırma üç gruptur: **Strateji testi**, **Portföy laboratuvarı**, **Coin tarama** (62.9).

## Ne zaman kullanılır {#ne-zaman}

- "Bu strateji ne yapıyor, ölçüldü mü?" sorusu için.
- Bir stratejiyi backtestte denemeye başlamak için.

## Ekran {#ekran}

![Stratejiler](ekran:stratejiler-1400)

## Alanlar {#alanlar}

| Alan | Anlamı |
|---|---|
| Gruplar | **Çalışan botlar** (Kairos, Tao) · **Adaylar** (karar bekleyen) · katlı **Geçti, kullanılmıyor** (ölçütleri geçmiş ama bot olarak çalışmayan: DCA Botu, Donchian topluluğu, Clenow, Connors RSI). Elenenler listede yok: [Arşiv › Eski stratejiler](#/kilavuz/arsiv) |
| Durum rozeti | **Geçti** (ölçütleri geçti) · **Beklet** (karar bekliyor) · **Elendi** |
| Kaynak rozeti | Makale · Kitap · Kendi tasarım · Pine |
| Kurallar | Stratejinin giriş/çıkış kuralları, sade dille |
| Parametreler | Varsayılan ayarlar |
| Ölçüm | Ön-kayıtlı ölçümün özeti ve hükmü |

## Adım adım: bir stratejiyi denemek {#denemek}

1. Soldaki listeden stratejiyi seçin.
2. **Kurallar** ve **Ölçüm** sekmelerini okuyun.
3. **Backtest'te aç** → Backtest ekranı bu stratejiyle açılır ([Backtest](#/kilavuz/backtest)).
Kâğıt test ve Pine betikleri 62.9'da Arşiv'e taşındı ([Kâğıt test](#/kilavuz/kagit-test), [Pine](#/kilavuz/pine)).

## Uyarılar ve ne yapmalı {#uyarilar}

> **Not:** "Geçti" bir stratejinin gelecekte kazanacağı anlamına gelmez; yalnız önceden yazılmış ölçütleri geçmiş veride (ve varsa saklı veride) geçtiği anlamına gelir. Canlı karar için [İleri test](#/kilavuz/ileri-test) sonuçlarına bakın.

Elenen stratejiler silinmez (Arşiv › Eski stratejiler); backtestte kıyas için **Backtest › Gelişmiş › "Arşivdeki (elenen) stratejileri de göster"**.
