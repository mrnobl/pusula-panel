/**
 * EMİR KİMLİĞİ (clientOrderId) — idempotency'nin temeli.
 *
 * Binance `newClientOrderId` alanı en çok 36 karakter, `^[.A-Z:/a-z0-9_-]{1,36}$`.
 * Biçim: `ag-<bot>-<gün>-<sayaç>` — örn. `ag-dc-20261006-000042`.
 *
 * Neden kalıcı sayaç: zaman aşımına uğrayan bir emir AYNI kimlikle sorgulanır
 * ve gerekirse aynı kimlikle yeniden denenir. Kimlik rastgele üretilseydi
 * "gitti mi gitmedi mi" sorusu cevapsız kalır, ikinci deneme çift emir açardı.
 * `ag-` öneki bizim emirlerimizi borsadaki yabancı (elle verilmiş) emirlerden
 * ayırır — iptal ve mutabakat YALNIZ öneki taşıyan emirlere dokunur.
 */
const ONEK = 'ag';
const DESEN = /^[.A-Za-z:/0-9_-]{1,36}$/;

function gunEtiketi(zaman = Date.now()) {
  return new Date(zaman).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * @param {string} bot  kısa bot etiketi (harf/rakam, ≤ 8)
 * @param {number} sayac kalıcı artan sayı
 */
function uret(bot, sayac, zaman) {
  if (!/^[a-z0-9]{1,8}$/.test(bot)) throw new Error(`bot etiketi geçersiz: ${bot}`);
  if (!Number.isInteger(sayac) || sayac < 0) throw new Error(`sayaç geçersiz: ${sayac}`);
  const id = `${ONEK}-${bot}-${gunEtiketi(zaman)}-${String(sayac).padStart(6, '0')}`;
  if (!DESEN.test(id)) throw new Error(`clientOrderId Binance kuralına uymuyor: ${id}`);
  return id;
}

function bizimMi(id) {
  return typeof id === 'string' && id.startsWith(`${ONEK}-`);
}

module.exports = { uret, bizimMi, ONEK, DESEN };
