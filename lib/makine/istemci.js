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
 * @param o      { method, govde, ben (kimlik), jeton, zamanAsimiMs, fetchFn, ham, basliklar, ikili, yanitTavan }
 * @returns {Promise<{ durum, govde }>} 2xx dışı da döner (çağıran karar verir); ağ / biçim hatasında MakineIstekHatasi.
 */
async function istek(adres, yol, o = {}) {
  const fetchFn = o.fetchFn || ((...a) => fetch(...a));
  let url;
  try { url = new URL(yol, `${adres}/`); } catch { throw new MakineIstekHatasi('eş adresi geçersiz'); }
  if (url.origin !== new URL(adres).origin) throw new MakineIstekHatasi('istek eşin kökeni dışına çıkıyor');
  const basliklar = { accept: o.ikili ? 'application/octet-stream, application/json' : 'application/json' };
  // 75.5 (3c): `ham` (Buffer) — bot taşıma paketi (application/octet-stream); ek başlıklar yalnız x-pusula-* (ör. paketin SHA-256'sı)
  const ham = Buffer.isBuffer(o.ham) ? o.ham : null;
  if (ham) basliklar['content-type'] = 'application/octet-stream';
  else if (o.govde !== undefined) basliklar['content-type'] = 'application/json';
  for (const [k, v] of Object.entries(o.basliklar || {})) if (/^x-pusula-[a-z0-9-]{1,40}$/.test(k) && k !== MAKINE_BASLIK && k !== MAKINE_JETON_BASLIK) basliklar[k] = String(v).slice(0, 200);
  if (o.ben) basliklar[MAKINE_BASLIK] = o.ben;
  if (o.jeton) basliklar[MAKINE_JETON_BASLIK] = o.jeton;
  const sure = o.zamanAsimiMs || ZAMAN_ASIMI_MS;
  let r;
  try {
    r = await fetchFn(url.href, { method: o.method || 'GET', headers: basliklar, body: ham || (o.govde === undefined ? undefined : JSON.stringify(o.govde)), redirect: 'error', signal: AbortSignal.timeout(sure) });
  } catch (e) {
    throw new MakineIstekHatasi(e && e.name === 'TimeoutError' ? `eş ${sure / 1000} sn içinde yanıt vermedi (kapalı ya da Tailscale bağlı değil)` : `eşe ulaşılamadı: ${(e && e.cause && e.cause.code) || (e && e.message) || e}`);
  }
  // 4. faz (4a): `yanitTavan` — kopya manifesti / şifreli kopya paketi için çağıran daha büyük sınır verebilir (varsayılan 256 KB).
  const tavan = Number.isFinite(o.yanitTavan) && o.yanitTavan > 0 ? o.yanitTavan : YANIT_TAVAN;
  const uzunluk = Number((r.headers && r.headers.get && r.headers.get('content-length')) || 0);
  if (uzunluk > tavan) { try { r.body && r.body.cancel && r.body.cancel(); } catch { /* */ } throw new MakineIstekHatasi(`eşin yanıtı çok büyük (${uzunluk} bayt)`, r.status); }
  const tur = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  if (r.status >= 300 && r.status < 400) throw new MakineIstekHatasi(`eş yönlendirme döndü (${r.status}) — izlenmedi`, r.status);
  // 4. faz (4a): `ikili` — 2xx application/octet-stream yanıt Buffer olarak döner (+ yalnız x-pusula-* başlıkları); hata yanıtı yine JSON.
  if (o.ikili && r.status >= 200 && r.status < 300 && /application\/octet-stream/.test(tur)) {
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > tavan) throw new MakineIstekHatasi(`eşin yanıtı çok büyük (${buf.length} bayt)`, r.status);
    const bas = {};
    try { r.headers.forEach((v, k) => { if (/^x-pusula-[a-z0-9-]{1,40}$/.test(k)) bas[k] = String(v).slice(0, 4096); }); } catch { /* başlık yok */ }
    return { durum: r.status, govde: buf, basliklar: bas };
  }
  const metin = await r.text();
  if (metin.length > tavan) throw new MakineIstekHatasi(`eşin yanıtı çok büyük (${metin.length} bayt)`, r.status);
  if (!/json/.test(tur)) throw new MakineIstekHatasi(`eşten beklenmeyen yanıt (${r.status}${tur ? `, ${tur.split(';')[0]}` : ''}) — adres Pusula paneli mi?`, r.status);
  let govde;
  try { govde = JSON.parse(metin); } catch { throw new MakineIstekHatasi(`eşin yanıtı JSON değil (${r.status})`, r.status); }
  return { durum: r.status, govde };
}

module.exports = { istek, MakineIstekHatasi, MAKINE_BASLIK, MAKINE_JETON_BASLIK, ZAMAN_ASIMI_MS, YANIT_TAVAN };
