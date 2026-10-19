# Kurulum denetimi {#kurulum-denetimi}

## Ne işe yarar {#ne-ise-yarar}

**Sistem › Kurulum denetimi**, Pusula'nın bu bilgisayara doğru kurulup kurulmadığını tek sayfada gösterir. Her satır bir ışık: yeşil tamam, sarı uyarı, kırmızı eksik, gri bilgi (bu kurulum türünde beklenmez).

| Grup | Neye bakar |
|---|---|
| Program | sürüm, kurulum işareti (`PUSULA-KURULUM.json` — kurulum türü, kurulum tarihi), Node.js, paketler, panel portu |
| Veri | veri klasörü ve tür alt klasörleri; panel / telefon jetonu |
| Güncelleme | Git ve dağıtım deposu (uzak depo, son kayıt, değiştirilmiş dosya) |
| Görevler | her zamanlanmış görev: kurulu mu, bu klasörü mü gösteriyor, son çalışması ve sonucu; masaüstü + Başlat menüsü kısayolu |
| Bilgisayar | uyku ayarı (prize bağlıyken); taşınabilir Node / Git kullanıcı PATH'inde mi |

Sayfa **yalnız gösterir**: açtığında hiçbir şeyi değiştirmez. Kırmızı satırda **Onar** düğmesi o adımı yeniden kurar (aynı iş: `npm run kur -- --adim <adım>`). Onar yalnız bu bilgisayardaki panelden çalışır; telefondan sayfa salt okunurdur.

## Ne zaman kullanılır {#ne-zaman}

- Kurulum programından sonra bir şey eksik kaldıysa (ör. internet yokken güncelleme deposu kurulamadı).
- Bot gece kapandı ve yeniden açılmadıysa: bekçi görevi kurulu mu, son çalışması ne zaman?
- Bilgisayarı taşıdıktan / klasörü değiştirdikten sonra görevlerin doğru klasörü gösterdiğini görmek için.

Kurulum programından önceki (elle yapılmış) kurulumlarda da çalışır; orada da yalnız gösterir. Geliştirme bilgisayarında görevler bilerek kurulmaz (gri).

## Ekran {#ekran}

![Sistem › Kurulum denetimi](ekran:kurulum-denetimi-1400)

## Uyarılar ve ne yapmalı {#uyarilar}

- **Görev "başka bir klasörü gösteriyor"**: Pusula klasörü taşınmış ya da eski bir kurulumun görevi duruyor. **Onar** görevi bu klasör için yeniden kurar (aynı görev adı; eskisinin yerine geçer).
- **Görev "sonuç kodu …"**: son çalışma hata verdi. Ayrıntı ilgili günlükte (veri klasöründe `makine\*-gorev.log`); çoğu zaman bir sonraki çalışmada düzelir.
- **Git ve uzak depo kırmızı**: güncelleme deposu kurulamadı (kurulum sırasında internet yoktu ya da depoya erişilemedi). İnternet varken **Onar**.
- **Uyku sarı**: bilgisayar prize bağlıyken de uykuya geçiyor; uykudayken botlar çalışmaz. **Onar** "hiçbir zaman" yapar; bu bilgisayarda izin yoksa Ayarlar › Sistem › Güç'ten elle değiştirin.
- **Kısayol yok**: **Onar** masaüstüne ve Başlat menüsüne "Pusula" ile "Pusula'yı durdur" kısayollarını yeniden koyar.
- Onar bir adımı tamamlayamazsa ne olduğunu söyler; hiçbir şeyi yarım bırakmaz ve verine dokunmaz.
