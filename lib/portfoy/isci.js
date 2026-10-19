/**
 * PORTFÖY LABORATUVARI — İŞ PARÇACIĞI (lib/isler.js isciCalistir ile; api.js başlatır).
 * workerData: { tur: 'simule' | 'varyasyon', tanim, ops }  → mesajlar: ilerleme / sonuc / hata (lib/backtest/isci.js ile aynı sözleşme)
 */
const { parentPort, workerData } = require('worker_threads');
const M = require('./motor');

const ilerleme = (oran, asama) => parentPort.postMessage({ tur: 'ilerleme', oran, asama });
try {
  const { tur, tanim, ops = {} } = workerData;
  let sonuc;
  if (tur === 'simule') sonuc = M.simule(tanim, { ...ops, ilerleme });
  else if (tur === 'varyasyon') sonuc = M.varyasyon(tanim, { ...ops, ilerleme });
  else throw new Error('bilinmeyen iş: ' + tur);
  parentPort.postMessage({ tur: 'sonuc', sonuc });
} catch (e) {
  parentPort.postMessage({ tur: 'hata', mesaj: e.message });
}
