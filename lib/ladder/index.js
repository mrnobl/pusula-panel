/**
 * MERDİVEN KATMANI — tek giriş noktası (`PLAN-GRID-DCA.md` §4.3, F4)
 *
 * Profiller BU DOSYADA yükleniyor. `planner.js` kendisi hiçbir profil
 * tanımıyor: kayıt tek yönlü (profil → planlayıcı), yani yeni bir merdiven
 * eklemek planlayıcıya dokunmayı gerektirmiyor.
 */

const { merdivenKur, planEmirleri, profilKaydet, PROFILLER } = require('./planner');

require('./dcaProfile');
require('./gridProfile');

module.exports = {
  merdivenKur,
  planEmirleri,
  profilKaydet,
  PROFILLER,
  PROFIL_ADLARI: Object.keys(PROFILLER)
};
