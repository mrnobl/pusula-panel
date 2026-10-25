/**
 * SİSTEM › TATBİKATLAR — D3 (TASARIM-MAKINE-HESAP-BOT §8.4; PLAN-MAKINE-HESAP-BOT D3 "Claude ihtiyacı kalmasın") `AG.pages.tatbikat`
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/tatbikat (lib/tatbikat): prova listesi + her bot için önkoşullar, süren tatbikat (adımlar, Pusula'nın doğrulamaları, önerilen
 * hüküm), Kairos demo kabul provalarının durumu, 4c geri dönüş tatbikatı, aylık otomatik denetim, geçmiş. Yazma: POST /api/tatbikat/{baslat,adim,kaydet,iptal,otomatik,geri-donus}
 * (yalnız bu bilgisayardan; kaydet yerel PIN — api katmanı sorar). Sihirbaz emir vermez, botu başlatmaz/durdurmaz, programı kapatmaz:
 * adımları kullanıcı yapar, Pusula kayıtlardan doğrular. Süren tatbikat varken sayfa 30 sn'de bir yenilenir.
 * 76.7: geliştirme bilgisayarında GET sunucudan okunur (yanıtta evKaynak) → sunucunun tatbikat durumu salt okuma gösterilir.
 */
(function (global) {
  'use strict';
  const AG = global.AG;
  const doc = global.document;
  const el = (...a) => AG.dom.el(...a);
  const doldur = (...a) => AG.dom.doldur(...a);
  const bul = (id) => (doc && doc.getElementById ? doc.getElementById(id) : null);
  const bildir = (m, t) => { try { AG.bildirim.bildir(m, t); } catch (e) { /* test */ } };

  let veri = null;
  let secili = {};        // prova → seçili bot
  let sembol = '';
  let zamanlayici = null;
  let mesgul = false;

  const DURUM = { gecti: ['geçti', 'pos'], kaldi: ['kaldı', 'neg'], bekliyor: ['bekleniyor', 'warn'], bilgi: ['bilgi', ''], uyari: ['uyarı', 'warn'], atlandi: ['atlandı', ''] };
  /** Saf: doğrulama durumu → { metin, ton }. */
  function durumRozet(d) { const x = DURUM[d] || [String(d || '—'), '']; return { metin: x[0], ton: x[1] }; }
  /** Saf: ms → "25.10 14:03". */
  function zaman(ms) {
    const d = new Date(ms);
    if (!ms || !Number.isFinite(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /** Saf: kalan süre metni. */
  function kalanMetni(ms) {
    if (ms == null) return '—';
    if (ms <= 0) return 'süre doldu';
    const dk = Math.round(ms / 60000);
    if (dk < 120) return `${dk} dk kaldı`;
    const sa = Math.round(ms / 3600000);
    return sa < 48 ? `${sa} sa kaldı` : `${Math.round(sa / 24)} gün kaldı`;
  }
  /** Saf: hüküm önerilenden farklıysa (ya da öneri yoksa) açıklama zorunlu. */
  function aciklamaGerekli(etkin, hukum) { return !etkin || etkin.onerilen !== hukum; }
  /** Saf: bir provanın bu bot için uygunluğu → { tamam, eksikler[] }. */
  function uygunluk(p, bot) {
    const u = p && p.uygunluk ? p.uygunluk[bot] : null;
    if (!u) return { tamam: false, eksikler: ['bot bulunamadı'], onkosul: [] };
    return { tamam: !!u.tamam, eksikler: (u.onkosul || []).filter(x => x.zorunlu && !x.tamam).map(x => `${x.ad}: ${x.metin}`), onkosul: u.onkosul || [], provaGunlugu: !!u.provaGunlugu };
  }
  /** Saf: provaya uyan botlar (hesap türüne göre). */
  function uyanBotlar(v, p) { return ((v && v.botlar) || []).filter(b => (p.modlar || []).includes(b.mod)); }
  const modAd = (m) => ({ demo: 'demo', kagit: 'kâğıt', canli: 'canlı hesap' }[m] || m || '');
  const rozet = (metin, ton) => el('span', { class: `p-rozet${ton ? ' p-rozet-' + ton : ''}`, text: metin });

  async function islem(f, basari) {
    if (mesgul) return;
    mesgul = true;
    let r;
    try { r = await f(); } catch (e) { r = { success: false, error: e.message }; }
    mesgul = false;
    if (!r || !r.success) { bildir((r && r.error) || 'sunucu yanıt vermedi', 'hata'); await yukle(); return null; }
    if (basari) bildir(basari, 'ok');
    await yukle();
    return r;
  }

  function onkosulListesi(l) {
    return el('ul', { class: 'tb-liste' }, (l || []).map(x => el('li', { class: x.tamam ? 'tb-tamam' : (x.zorunlu ? 'tb-eksik' : 'tb-uyari') }, [
      rozet(x.tamam ? 'tamam' : x.zorunlu ? 'eksik' : 'dikkat', x.tamam ? 'pos' : x.zorunlu ? 'neg' : 'warn'), el('span', { text: ` ${x.ad} — ${x.metin}` })])));
  }

  async function kaydet(hukum) {
    const e = veri && veri.etkin;
    if (!e) return;
    let not = '';
    if (aciklamaGerekli(e, hukum)) {
      const c = await AG.onayla({ baslik: `Sonucu "${hukum}" olarak kaydet`, metin: e.onerilen ? `Pusula'nın önerisi "${e.onerilen}". Farklı hüküm için nedenini kısaca yazın.` : 'Doğrulama henüz bitmedi. Şimdi kaydetmek için nedenini kısaca yazın.',
        onay: 'Kaydet', alanlar: [{ ad: 'not', etiket: 'Açıklama (en az 10 harf)', dogrula: (s) => s.trim().length >= 10 }] });
      if (!c) return;
      not = c.not;
    } else {
      const ok = await AG.onayla({ baslik: `Sonucu "${hukum}" olarak kaydet`, metin: e.provaGunlugu ? 'Sonuç demo kabul prova günlüğüne eklenir (PIN istenir). Kayıt silinmez.' : 'Sonuç tatbikat geçmişine yazılır.', onay: 'Kaydet' });
      if (!ok) return;
    }
    await islem(() => AG.api.tatbikat.kaydet(hukum, not), 'Tatbikat sonucu kaydedildi');
  }
  async function iptal() {
    const ok = await AG.onayla({ baslik: 'Tatbikatı iptal et', metin: 'Tatbikat prova günlüğüne YAZILMADAN kapanır. Borsada bir şeyi değiştirdiyseniz (ör. stop iptal ettiyseniz) önce yerine geldiğinden emin olun; gerekirse "geçmedi" olarak kaydedin.', onay: 'İptal et', iptal: 'Vazgeç', tehlikeli: true });
    if (ok) await islem(() => AG.api.tatbikat.iptal(''), 'Tatbikat iptal edildi');
  }

  function etkinKart(e) {
    const adimlar = e.adimlar || [];
    const aktif = adimlar.find(a => a.id === e.aktifAdim) || null;
    const parcalar = [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `Süren tatbikat: ${e.ad}` }), el('span', { class: 'df-soluk', text: `${e.botAd} (${modAd(e.mod)}) · başladı ${zaman(e.bas)} · ${kalanMetni(e.kalanMs)}` })]),
      el('p', { class: 'hint', text: e.amac }),
      el('ol', { class: 'tb-adimlar', id: 'tbAdimlar' }, adimlar.map(a => el('li', { class: a.yapildi ? 'tb-tamam' : a.id === e.aktifAdim ? 'tb-aktif' : '' }, [
        el('strong', { text: a.baslik }), a.yapildi ? el('span', { class: 'df-soluk', text: ` · ${zaman(a.yapildi)}` }) : a.atlandi ? el('span', { class: 'df-soluk', text: ' · atlandı (tatbikat önceki sürümde başlamıştı)' }) : null,
        a.id === e.aktifAdim ? el('div', { class: 'tb-adim-metin' }, (a.metin || []).map(m => el('p', { text: m }))) : null,
      ]))),
    ];
    if (aktif && aktif.tur === 'kullanici') {
      const sembolSec = aktif.sembolSor ? (() => {
        const s = el('select', { id: 'selTbSembol', class: 'form-control', onchange: (x) => { sembol = x.target.value; } },
          [el('option', { value: '', text: 'Sembol seçin (isteğe bağlı)' }), ...((e.stopSembolleri || []).map(x => el('option', { value: x, text: String(x).split(':')[0] })))]);
        s.value = sembol;
        return el('label', { class: 'form-group gl-alan' }, [el('span', { text: 'Hangi sembolün stopunu iptal ettiniz?' }), s]);
      })() : null;
      parcalar.push(el('div', { class: 'gl-suzgec mt-3' }, [sembolSec,
        el('button', { type: 'button', class: 'btn btn-primary', id: 'btnTbAdim', disabled: veri.arastirma || null, onclick: () => islem(() => AG.api.tatbikat.adim(aktif.id, aktif.sembolSor ? sembol : null)) }, [el('span', { text: aktif.dugme || 'Yaptım' })])]));
    }
    if (e.gozlemde || (e.dogrulamalar || []).length) {
      parcalar.push(el('h4', { class: 'mt-3', text: 'Pusula\'nın doğrulamaları' }));
      parcalar.push((e.dogrulamalar || []).length ? AG.tablo.kutulu({ id: 'tblTbDogrulama', sinif: 'p-tablo', basliklar: ['Doğrulama', 'Durum', 'Ayrıntı'],
        satirlar: e.dogrulamalar.map(d => { const r = durumRozet(d.durum); return el('tr', null, [el('td', { text: `${d.ad}${d.zorunlu ? '' : ' (bilgi)'}` }), el('td', null, [rozet(r.metin, r.ton)]), el('td', { class: 'df-soluk', text: d.metin })]); }) }, 'p-tablo-kap')
        : el('p', { class: 'hint', text: 'Pusula kayıtları bekliyor…' }));
      parcalar.push(el('p', { class: 'mt-3', id: 'tbOneri', text: e.onerilen ? `Pusula'nın önerisi: ${e.onerilen.toUpperCase()}${e.zamanAsimi ? ' (süre doldu)' : ''}${e.provaGunlugu ? ' — kaydedince demo kabul prova günlüğüne eklenir.' : ''}` : 'Doğrulama sürüyor — sonuç gelince öneri burada çıkar. Bu sayfayı kapatabilirsiniz.' }));
      parcalar.push(el('div', { class: 'gl-suzgec mt-3' }, [
        el('button', { type: 'button', class: `btn ${e.onerilen === 'geçti' ? 'btn-primary' : 'btn-secondary'}`, id: 'btnTbGecti', disabled: veri.arastirma || null, onclick: () => kaydet('geçti') }, [el('span', { text: 'Geçti olarak kaydet' })]),
        el('button', { type: 'button', class: `btn ${e.onerilen === 'geçmedi' ? 'btn-danger' : 'btn-secondary'}`, id: 'btnTbGecmedi', disabled: veri.arastirma || null, onclick: () => kaydet('geçmedi') }, [el('span', { text: 'Geçmedi olarak kaydet' })]),
      ]));
    }
    parcalar.push(el('div', { class: 'mt-3' }, [el('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'btnTbIptal', disabled: veri.arastirma || null, onclick: iptal }, [el('span', { text: 'Tatbikatı iptal et' })])]));
    return el('section', { class: 'p-kart mb-4', id: 'tbEtkin' }, parcalar);
  }

  function demoKart(dk) {
    if (!dk) return null;
    return el('section', { class: 'p-kart mb-4', id: 'tbDemo' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `${dk.adGorunen} demo kabulü — provalar` }), el('span', { class: 'df-soluk', text: Number.isFinite(dk.gun) ? `${dk.gun}. gün` : '' })]),
      el('p', { class: 'hint', text: 'Demo kabulünün zorunlu provaları. Sihirbazla yaptığınız provanın sonucu prova günlüğüne kendiliğinden eklenir (biçim aynı; demo kabul raporu okur).' }),
      el('ul', { class: 'tb-liste' }, dk.provalar.map(p => el('li', null, [
        rozet(p.yapildi ? (p.hukum || 'yapıldı') : 'yapılmadı', p.hukum === 'geçti' ? 'pos' : p.hukum === 'geçmedi' ? 'neg' : 'warn'),
        el('span', { text: ` ${p.no}. ${p.ad}${p.zorunlu ? '' : ' (isteğe bağlı)'}${p.sonra ? ` — ${p.sonra}. günden sonra` : ''}${!p.yapildi && p.ertelenen ? ' · sihirbazda hazır' : ''}` })]))),
    ]);
  }

  function provaKart(p) {
    const botlar = uyanBotlar(veri, p);
    const b = secili[p.kimlik] && botlar.some(x => x.ad === secili[p.kimlik]) ? secili[p.kimlik] : (botlar.find(x => x.ad === 'hucum') || botlar[0] || {}).ad;
    const u = b ? uygunluk(p, b) : { tamam: false, eksikler: ['bu provaya uyan bot yok'], onkosul: [] };
    const sec = el('select', { id: `selTbBot-${p.kimlik}`, class: 'form-control', onchange: (x) => { secili[p.kimlik] = x.target.value; ciz(); } },
      botlar.map(x => el('option', { value: x.ad, text: `${x.adGorunen} (${modAd(x.mod)})` })));
    if (b) sec.value = b;
    const engel = veri.arastirma ? 'Bu bilgisayar araştırma kopyası — tatbikatı sunucunun panelinden yapın.' : veri.etkin ? 'Süren tatbikat bitmeden yenisi başlamaz.' : !u.tamam ? 'Önkoşullar sağlanınca başlatılabilir.' : null;
    return el('section', { class: 'p-kart mb-4 tb-prova', 'data-prova': p.kimlik }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: `${p.no}. ${p.ad}` }),
        el('span', { class: 'df-soluk', text: [p.demoNo ? `demo kabul provası ${p.demoNo}${p.olcut ? ` (${p.olcut})` : ''}` : 'demo kabulünün parçası değil', p.istegeBagli ? 'isteğe bağlı' : null].filter(Boolean).join(' · ') })]),
      el('p', { class: 'hint', text: p.amac }),
      botlar.length ? el('label', { class: 'form-group gl-alan' }, [el('span', { text: 'Bot' }), sec]) : el('p', { class: 'hint', text: `Bu prova ${p.modlar.map(modAd).join(' / ')} hesaptaki botta yapılır — uyan bot yok.` }),
      u.onkosul.length ? onkosulListesi(u.onkosul) : null,
      u.provaGunlugu ? el('p', { class: 'df-soluk', text: 'Sonuç bu botun demo kabul prova günlüğüne eklenir.' }) : null,
      el('div', { class: 'gl-suzgec mt-3' }, [
        el('button', { type: 'button', class: 'btn btn-primary', id: `btnTbBaslat-${p.kimlik}`, disabled: (engel || !b) ? true : null,
          onclick: () => islem(() => AG.api.tatbikat.baslat(p.kimlik, b), 'Tatbikat başladı') }, [el('span', { text: 'Tatbikatı başlat' })]),
        engel ? el('span', { class: 'df-soluk', text: engel }) : null]),
    ]);
  }

  function otomatikKart(o) {
    if (!o) return null;
    return el('section', { class: 'p-kart mb-4', id: 'tbOtomatik' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Aylık otomatik denetim' }),
        el('span', { class: 'df-soluk', text: o.kapali ? 'kapalı' : `sonraki: ${zaman(o.sonraki)}` })]),
      el('p', { class: 'hint', text: 'Ayın ilk pazarı 11:30: kâğıt ve demo botlarda son mutabakat, felaket stopu denetimi, son acil deneme kayıtları ve veri kapısının bozuk mumu reddetmesi denetlenir. Yalnız okuma — emir yok, acil durdurma denenmez. Kairos demo kabulü bitene kadar kapsam dışı.' }),
      el('p', { text: o.son ? `Son çalışma ${zaman(o.son)}: ${o.sayilar ? `${o.sayilar.gecti} geçti · ${o.sayilar.uyari} uyarı · ${o.sayilar.kaldi} kaldı` : o.hukum || ''}` : 'Henüz çalışmadı.' }),
      el('button', { type: 'button', class: 'btn btn-secondary', id: 'btnTbOtomatik', disabled: veri.arastirma || null, onclick: () => islem(() => AG.api.tatbikat.otomatik(), 'Otomatik denetim çalıştı') }, [el('span', { text: 'Şimdi çalıştır' })]),
    ]);
  }

  /** Saf: geri dönüş tatbikatının son özeti → satırlar [{ metin, ton }] (anahtar / yol yok — yalnız sayılar ve sorun metinleri). */
  function geriDonusOzeti(g) {
    if (!g) return [];
    if (g.suruyor) return [{ metin: `Sürüyor (${zaman(g.suruyor.bas)}'dan beri): ${g.suruyor.adim || 'başlıyor'}`, ton: 'warn' }];
    const o = g.son;
    if (!o) return [{ metin: 'Henüz çalışmadı.', ton: '' }];
    const s = o.sayilar || {};
    const l = [{ metin: `Son çalışma ${zaman(o.son)}: ${o.hukum} — ${s.gecti || 0} geçti · ${s.uyari || 0} uyarı · ${s.kaldi || 0} kaldı · süre ${o.sure || '—'} · ${o.botSayisi || 0} bot${o.esSayisi ? ` · ${o.esSayisi} eş kopyası` : ''}`, ton: o.hukum === 'geçmedi' ? 'neg' : s.uyari ? 'warn' : 'pos' }];
    for (const x of o.sorunlar || []) l.push({ metin: `✗ ${x}`, ton: 'neg' });
    return l;
  }

  function geriDonusKart(g) {
    if (!g) return null;
    const satir = geriDonusOzeti(g);
    return el('section', { class: 'p-kart mb-4', id: 'tbGeriDonus' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Geri dönüş tatbikatı' }),
        el('span', { class: 'df-soluk', text: g.kapali ? 'kapalı' : `sonraki: ${zaman(g.sonraki)}` })]),
      el('p', { class: 'hint', text: 'Ayın ilk pazarı 11:00: "bu makine bozulsa bot geri gelir mi?" Pusula son günlük yedeği ve eş makinelerin kopyasını SHA-256 ile doğrular, şifreli anahtar dosyasının yedek şifresiyle açılabildiğini yalnız bellekte sınar, her botu geçici bir klasöre geri yükleyip emir göndermeden kuru çalıştırır, sonra klasörü siler. Hiçbir bot başlatılmaz, gerçek bot dosyalarına dokunulmaz. Kairos demo kabulü bitene kadar ve canlı hesap kapsam dışı.' }),
      el('ul', { class: 'tb-liste' }, satir.map(x => el('li', null, [rozet(x.ton === 'pos' ? 'geçti' : x.ton === 'neg' ? 'sorun' : x.ton === 'warn' ? 'dikkat' : 'bilgi', x.ton), el('span', { text: ` ${x.metin}` })]))),
      el('button', { type: 'button', class: 'btn btn-secondary', id: 'btnTbGeriDonus', disabled: veri.arastirma || g.suruyor || null, onclick: () => islem(() => AG.api.tatbikat.geriDonus(), 'Geri dönüş tatbikatı başladı — birkaç dakika sürer') }, [el('span', { text: 'Şimdi çalıştır' })]),
    ]);
  }

  function gecmisKart(l) {
    return el('section', { class: 'p-kart mb-4', id: 'tbGecmis' }, [
      el('div', { class: 'p-kart-bas' }, [el('h3', { class: 'p-kart-baslik', text: 'Geçmiş' })]),
      l && l.length ? AG.tablo.kutulu({ id: 'tblTbGecmis', sinif: 'p-tablo', basliklar: ['Zaman', 'Tatbikat', 'Bot', 'Sonuç', 'Ayrıntı'],
        satirlar: l.map(x => {
          const oto = x.tur === 'otomatik' || x.tur === 'geri-donus';
          const h = oto ? x.hukum : x.iptal ? 'iptal' : x.hukum;
          return el('tr', null, [el('td', { class: 'sayi', text: zaman(x.z) }), el('td', { text: x.tur === 'geri-donus' ? 'Geri dönüş tatbikatı' : oto ? 'Aylık otomatik denetim' : x.ad }),
            el('td', { class: 'df-soluk', text: oto ? '—' : (AG.botAd && AG.botAd.ad ? AG.botAd.ad(x.bot) : x.bot) || x.bot || '—' }),
            el('td', null, [rozet(h || '—', h === 'geçti' ? 'pos' : h === 'geçmedi' ? 'neg' : '')]),
            el('td', { class: 'df-soluk', text: oto ? `${(x.sayilar || {}).gecti || 0} geçti · ${(x.sayilar || {}).uyari || 0} uyarı · ${(x.sayilar || {}).kaldi || 0} kaldı` : [x.sure ? `süre ${x.sure}` : null, x.provaGunlugu ? 'prova günlüğüne yazıldı' : null, x.not || null].filter(Boolean).join(' · ') })]);
        }) }, 'p-tablo-kap') : el('div', { class: 'p-bos' }, [el('p', { class: 'p-bos-metin', text: 'Henüz tatbikat yapılmadı.' })]),
    ]);
  }

  function ciz() {
    const k = bul('tatbikatKok');
    if (!k || !veri) return;
    doldur(k, [
      veri.sunucudan ? el('p', { class: 'hint mb-4', id: 'tbSunucudan', text: `Bu bilgisayar araştırma kopyası: aşağıda sunucunun tatbikat durumu görünür (salt okuma — tatbikatı sunucunun panelinden yapın).${veri.sunucudan.eski ? ` Sunucuya şu an ulaşılamadı; son okunan durum (${zaman(veri.sunucudan.zaman)}).` : ''}` })
        : veri.arastirma ? el('p', { class: 'hint mb-4', text: 'Bu bilgisayar araştırma kopyası: botlar sunucuda çalışır, tatbikatlar sunucunun panelinden yapılır.' }) : null,
      veri.etkin ? etkinKart(veri.etkin) : null,
      demoKart(veri.demoKabul),
      ...(veri.provalar || []).map(provaKart),
      geriDonusKart(veri.geriDonus),
      otomatikKart(veri.otomatik),
      gecmisKart(veri.gecmis),
    ]);
    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
  }

  async function yukle() {
    const k = bul('tatbikatKok');
    if (!k) return;
    let r;
    try { r = await AG.api.tatbikat.durum(); } catch (e) { r = { success: false, error: e.message }; }
    if (!r || !r.success) { doldur(k, [AG.bildirim.hataKutusu((r && r.error) || 'sunucu yanıt vermedi', { baslik: 'Tatbikatlar okunamadı', yeniden: yukle })]); return; }
    veri = r;
    // 76.7: geliştirme bilgisayarında yanıt sunucudan gelir (lib/evOkuma EV_YOLU) — salt okuma: düğmeler kapalı
    if (r.evKaynak) { veri.sunucudan = r.evKaynak; veri.arastirma = true; }
    ciz();
    if (zamanlayici) { global.clearTimeout(zamanlayici); zamanlayici = null; }
    if (veri.etkin || (veri.geriDonus && veri.geriDonus.suruyor)) zamanlayici = global.setTimeout(() => { if (bul('tatbikatKok') && doc && doc.querySelector && doc.querySelector('#tab-tatbikat.active')) yukle(); }, 30000);
  }

  if (doc && doc.addEventListener) doc.addEventListener('ag:rota', (e) => { if (e.detail && e.detail.bolum === 'tab-tatbikat') yukle(); });

  AG.pages = AG.pages || {};
  AG.pages.tatbikat = { yukle, durumRozet, zaman, kalanMetni, aciklamaGerekli, uygunluk, uyanBotlar, geriDonusOzeti, _durum: { veriAyarla: (v) => { veri = v; } }, _ciz: { ciz } };
  if (typeof module !== 'undefined' && module.exports) module.exports = AG.pages.tatbikat;
})(typeof window !== 'undefined' ? window : globalThis);
