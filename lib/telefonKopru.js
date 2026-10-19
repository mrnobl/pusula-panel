/**
 * TELEFON KÖPRÜSÜ — çalışan bir Pusula sunucusunu yerel ağa jetonla açar (2026-10-08, sürüm 60.2).
 *
 * Neden ayrı bir köprü (ikinci sunucu değil): sunucuda canlı bot `127.0.0.1:3000`de
 * çalışıyor. Telefondan görmek için ikinci bir `server.js` başlatmak, aynı `data/` klasörüne iki
 * sürecin yazması demek (bot durumu, kâğıt motor, günlük) — biri ötekinin kaydını ezebilir. Canlı
 * sunucuyu `HOST=…` ile yeniden başlatmak da botu durdurup başlatmayı gerektirir. Köprü ikisini de
 * yapmaz: hiçbir dosyaya yazmaz, botu tanımaz; yalnız istekleri aktarır.
 *
 * Güvenlik kuralları sunucununkiyle AYNI ve aynı koddan (`lib/guvenlik.js`): yerel ağ adresinde
 * dinler → jeton zorunlu; Host/Origin denetimi; tarayıcıya giriş sayfası + oturum çerezi; WebSocket
 * aynı çerezle. Denetimden geçen istek arka sunucuya `Host: 127.0.0.1:<port>` ile, Origin varsa
 * `http://127.0.0.1:<port>` olarak aktarılır (arka sunucu yerel dinlemede yabancı Host'u reddeder);
 * oturum çerezi ve jeton başlığı arka sunucuya GİTMEZ.
 *
 * TELEFON KADEMESİ (60.5, PLAN-UYGULAMA-YOL-HARITASI.md §0 K2): köprü ağa açık dinlediği için her istek telefon
 * kademesindedir (lib/guvenlik.js): okuma serbest, yazma YALNIZ acil durdurma uçları — onlar da arka sunucuda acil
 * PIN + "DURDUR" ister (lib/acilPin.js). Eski `--tam` (tam erişim) kaldırıldı. Arka sunucu köprü isteğini
 * X-Forwarded-For yüzünden yine telefon kademesi sayar; bu yüzden köprü arkaya panel jetonunu `x-panel-token` ile
 * iletir (arka sunucu aynı jetonu aynı kaynaklardan okur — guvenlik.jetonBul). Kullanıcının çerezi arkaya gitmez.
 */
const http = require('http');
const net = require('net');
const guvenlikKur = require('./guvenlik');

const ATLA = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);

/** Oturum çerezini çerez başlığından çıkarır (boş kalırsa başlık silinir). */
function cerezAyikla(baslik) {
  if (!baslik) return '';
  return String(baslik).split(';').map(s => s.trim())
    .filter(s => s && !s.startsWith(guvenlikKur.OTURUM_CEREZI + '=')).join('; ');
}

function arkaBasliklar(req, hedefHost, upgrade, jeton) {
  const b = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const kk = k.toLowerCase();
    if (!upgrade && ATLA.has(kk)) continue;
    if (kk === 'host' || kk === 'origin' || kk === 'x-panel-token' || kk === 'cookie') continue;
    b[kk] = v;
  }
  b.host = hedefHost;
  if (req.headers.origin) b.origin = `http://${hedefHost}`;
  const c = cerezAyikla(req.headers.cookie);
  if (c) b.cookie = c;
  b['x-forwarded-for'] = (req.socket && req.socket.remoteAddress) || '';
  if (jeton) b['x-panel-token'] = jeton;
  return b;
}

/**
 * @param {object} o
 *   dinlenen   yerel ağ adresi (ör. 192.168.1.20) — geri dönüş adresi OLAMAZ (köprüye gerek yok)
 *   port       köprünün portu
 *   hedefPort  arka sunucunun 127.0.0.1 üzerindeki portu
 *   jeton      panel jetonu (≥ 24)
 *   izinliHostlar  ek izinli host adları
 * @returns {http.Server} henüz dinlemeyen sunucu
 */
function kopruKur(o) {
  if (guvenlikKur.geriDonusMu(o.dinlenen)) throw new Error('Köprü yerel ağ adresinde dinlemeli (127.0.0.1 için köprü gerekmez).');
  if (o.tam) throw new Error('Tam erişim (--tam) 60.5\'te kaldırıldı: telefondan yalnız izleme ve acil durdurma (PLAN-UYGULAMA-YOL-HARITASI.md §0).');
  const guv = guvenlikKur.kur({ dinlenen: o.dinlenen, jeton: o.jeton, izinliHostlar: o.izinliHostlar || [] });
  const hedefHost = `127.0.0.1:${o.hedefPort}`;

  const sunucu = http.createServer((req, res) => {
    // Telefon kademesi (okuma + acil) köprünün kendi ara katmanında; acil PIN'i arka sunucu denetler.
    guv.middleware(req, res, () => {
      const arka = http.request({
        host: '127.0.0.1', port: o.hedefPort, method: req.method, path: req.url,
        headers: arkaBasliklar(req, hedefHost, false, o.jeton)
      }, (ares) => {
        res.writeHead(ares.statusCode, ares.headers);
        ares.pipe(res);
      });
      arka.on('error', (e) => {
        if (res.headersSent) { res.destroy(); return; }
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: `Pusula sunucusuna (${hedefHost}) ulaşılamadı: ${e.message}` }));
      });
      req.pipe(arka);
    });
  });

  sunucu.on('upgrade', (req, soket, bas) => {
    const red = () => { try { soket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); } catch { /* kapalı */ } };
    if (!guv.wsDogrula({ origin: req.headers.origin, req })) return red();
    const arka = net.connect(o.hedefPort, '127.0.0.1', () => {
      const b = arkaBasliklar(req, hedefHost, true, o.jeton);
      let satir = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(b)) {
        for (const d of (Array.isArray(v) ? v : [v])) satir += `${k}: ${d}\r\n`;
      }
      arka.write(satir + '\r\n');
      if (bas && bas.length) arka.write(bas);
      soket.pipe(arka).pipe(soket);
    });
    const kapat = () => { soket.destroy(); arka.destroy(); };
    arka.on('error', kapat);
    soket.on('error', kapat);
  });

  sunucu.kademe = 'telefon';
  return sunucu;
}

module.exports = { kopruKur, cerezAyikla };
