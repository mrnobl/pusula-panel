/**
 * MERDİVEN PLANLAYICI (`PLAN-GRID-DCA.md` §4.3, F4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bir plan, "şu fiyata çapalanmış şu basamaklar" demektir:
 *
 *   {
 *     referans        planın çapalandığı fiyat
 *     yon             'long' | 'short' | 'iki'
 *     seviyeler: [{ id, yon, fiyat, tutar, qty, tp, gecerlilik }]
 *     gecerlilik      plan hangi koşulda iptal olur
 *   }
 *
 * DCA ve grid arasındaki fark **tek bir profil dosyası**dır. Planlayıcı
 * ikisini de aynı şekilde kurar, aynı şekilde emre çevirir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `gecerlilik` NEDEN YENİ VE NEDEN KRİTİK
 * ═══════════════════════════════════════════════════════════════════════════
 * Bugünkü DCA merdiveni kurulduktan sonra HİÇBİR koşulda değişmiyor:
 * `dcaBotStrategy.evaluate` emirleri bir kez masaya koyar ve yalnızca deal
 * kapanınca `cancelAll` der. Grid'de ise merkez kaymalı, yapı bozulunca
 * plan iptal olabilmeli. Bu alan olmadan "kayan grid" yazılamaz.
 *
 * Alan ŞİMDİ ekleniyor ama DCA için `{ tur: 'sabit' }` — yani bugünkü
 * davranışın adı kondu, davranış değişmedi. Grid profili gelince ikinci bir
 * tür eklenecek, planlayıcıya dokunulmayacak.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KORUNAN TUHAFLIK: FİYAT YUVARLANIR, MİKTAR YUVARLANMAZ
 * ═══════════════════════════════════════════════════════════════════════════
 * `dcaBotStrategy` basamak fiyatını `+seviye.toFixed(8)` ile yuvarlıyor ama
 * miktarı YUVARLANMAMIŞ `seviye`ye bölüyor. Yani `limitPrice × qty` ile
 * planlanan tutar birbirini tam tutmuyor — 8. haneden sonra.
 *
 * Bu tutarsızlık burada DÜZELTİLMEDİ. F4'ün bitti ölçütü "DCA profili
 * bugünkü `dca_bot`'un emirlerini BİREBİR üretir"; yuvarlamayı hizaya
 * sokmak tam olarak bu ölçütü ihlal ederdi. Düzeltilecekse ayrı bir adımda,
 * ölçülerek ve bilerek yapılmalı — refactor'ün içine gizlenerek değil.
 */

const PROFILLER = Object.create(null);

/** Profil kaydı. Ad çakışması sessizce ezmez — iki profil aynı adı alamaz. */
function profilKaydet(ad, profil) {
  if (PROFILLER[ad]) throw new Error(`Merdiven profili zaten kayıtlı: '${ad}'`);
  PROFILLER[ad] = profil;
}

/**
 * Merdiveni kurar.
 *
 * @param {string} profilAdi  'dca' | 'grid'
 * @param {object} girdi      profile özel parametreler + { referans, yon, sermaye }
 * @returns {object} plan
 */
function merdivenKur(profilAdi, girdi = {}) {
  const profil = PROFILLER[profilAdi];
  if (!profil) {
    // Bilinmeyen profil sessizce 'dca'ya düşmez — F2'deki kaynak kuralıyla
    // aynı sebep: strateji istediği merdivenle çalıştığını sanır.
    throw new Error(`Bilinmeyen merdiven profili: '${profilAdi}' (geçerli: ${Object.keys(PROFILLER).join(', ')})`);
  }

  const referans = girdi.referans;
  if (!(Number.isFinite(referans) && referans > 0)) {
    return { referans: null, yon: girdi.yon || 'long', profil: profilAdi, seviyeler: [], gecerlilik: { tur: 'gecersiz' } };
  }

  const plan = profil.kur(girdi);
  plan.profil = profilAdi;
  plan.referans = referans;
  return plan;
}

/**
 * Planı motorun emir defterine verilecek biçime çevirir.
 *
 * Çıktı ALANLARI VE SIRASI `dcaBotStrategy`nin ürettiğiyle birebir aynı
 * olmak zorunda: motor bu nesneleri doğrudan alıyor ve fazladan bir alan
 * emir defterinde sessizce taşınırdı.
 */
function planEmirleri(plan) {
  if (!plan || !Array.isArray(plan.seviyeler)) return [];
  return plan.seviyeler.map(s => ({
    id: s.id,
    side: s.yon,
    limitPrice: s.fiyat,
    qty: s.qty
  }));
}

module.exports = { merdivenKur, planEmirleri, profilKaydet, PROFILLER };
