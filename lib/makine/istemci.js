'use strict';
/**
 * MAKİNE İSTEMCİSİ (75.2, 3a — TASARIM-MAKINE-HESAP-BOT §4.8) — eşe giden TEK istek yolu.
 *   · Yalnız KAYITLI eş adresine (Tailscale `https://<ad>.<ağ>.ts.net`) ya da eşleme sırasında kullanıcının yazdığı adrese gider.
 *     Eş yoksa hiçbir dış istek yapılmaz (çağıran sorumlu; bu modül adres uydurmaz).
 *   · `redirect: 'error'` (jeton başka kökene gitmesin), zaman aşımı (varsayılan 10 sn), yanıt en çok 256 KB, yalnız JSON.
 *   · Başlıklar: x-pusula-makine (benim kimliğim) + x-pusula-makine-jeton (o eş için giden jeton). Eşleme isteği jetonsuz gider.
 * Kod komut satırı açmaz; ağ yalnız Node yerleşik fetch.
 */
const MAKINE_BASLIK = 'x-pusula-makine';
const MAKINE_JETON_BASLIK = 'x-pusula-makine-jeton';
const ZAMAN_ASIMI_MS = 10000;
const YANIT_TAVAN = 256 * 1024;

class MakineIstekHatasi extends Error {
  constructor(m, durum = null, govde = null) { super(m); this.name = 'MakineIstekHatasi'; this.durum = durum; this.govde = govde; }
}

/**
 * @param adres  'https://x.y.ts.net' (normalleşmiş; sonda / yok)
 * @param yol    '/api/makine/…'
 * @param o      { method, govde, ben (kimlik), jeton, zamanAsimiMs, fetchFn }
 * @returns {Promise<{ durum, govde }>} 2xx dışı da döner (çağıran karar verir); ağ / biçim hatasında MakineIstekHatasi.
 */
async function istek(adres, yol, o = {}) {
  const fetchFn = o.fetchFn || ((...a) => fetch(...a));
  let url;
  try { url = new URL(yol, `${adres}/`); } catch { throw new MakineIstekHatasi('eş adresi geçersiz'); }
  if (url.origin !== new URL(adres).origin) throw new MakineIstekHatasi('istek eşin kökeni dışına çıkıyor');
  const basliklar = { accept: 'application/json' };
  if (o.govde !== undefined) basliklar['content-type'] = 'application/json';
  if (o.ben) basliklar[MAKINE_BASLIK] = o.ben;
  if (o.jeton) basliklar[MAKINE_JETON_BASLIK] = o.jeton;
  const sure = o.zamanAsimiMs || ZAMAN_ASIMI_MS;
  let r;
  try {
    r = await fetchFn(url.href, { method: o.method || 'GET', headers: basliklar, body: o.govde === undefined ? undefined : JSON.stringify(o.govde), redirect: 'error', signal: AbortSignal.timeout(sure) });
  } catch (e) {
    throw new MakineIstekHatasi(e && e.name === 'TimeoutError' ? `eş ${sure / 1000} sn içinde yanıt vermedi (kapalı ya da Tailscale bağlı değil)` : `eşe ulaşılamadı: ${(e && e.cause && e.cause.code) || (e && e.message) || e}`);
  }
  const uzunluk = Number((r.headers && r.headers.get && r.headers.get('content-length')) || 0);
  if (uzunluk > YANIT_TAVAN) { try { r.body && r.body.cancel && r.body.cancel(); } catch { /* */ } throw new MakineIstekHatasi(`eşin yanıtı çok büyük (${uzunluk} bayt)`, r.status); }
  const metin = await r.text();
  if (metin.length > YANIT_TAVAN) throw new MakineIstekHatasi(`eşin yanıtı çok büyük (${metin.length} bayt)`, r.status);
  const tur = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  if (r.status >= 300 && r.status < 400) throw new MakineIstekHatasi(`eş yönlendirme döndü (${r.status}) — izlenmedi`, r.status);
  if (!/json/.test(tur)) throw new MakineIstekHatasi(`eşten beklenmeyen yanıt (${r.status}${tur ? `, ${tur.split(';')[0]}` : ''}) — adres Pusula paneli mi?`, r.status);
  let govde;
  try { govde = JSON.parse(metin); } catch { throw new MakineIstekHatasi(`eşin yanıtı JSON değil (${r.status})`, r.status); }
  return { durum: r.status, govde };
}

module.exports = { istek, MakineIstekHatasi, MAKINE_BASLIK, MAKINE_JETON_BASLIK, ZAMAN_ASIMI_MS, YANIT_TAVAN };
