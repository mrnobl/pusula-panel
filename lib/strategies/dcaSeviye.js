/**
 * DCA + SEVİYE FİLTRESİ — PLAN-SEVIYE-KOMBO.md.
 *
 * `dca_bot`un TÜM davranışı aynen; yalnız YENİ DEAL başlatma koşulu
 * (`prepare` içinde hesaplanan `hazir.kosul` dizisi) seviye filtresiyle
 * "VE"lenir. Açık deal yönetimine dokunulmaz.
 *
 *   seviyeFiltresi: 'yok' | 'indirim' | 'temas'
 *     indirim : kapanış < önceki günün VWAP'ı (değerin altında alım)
 *     temas   : bar aralığı önceki günün POC ya da VWAP'ına değer VE kapanış
 *               o seviyenin üstünde (destek tuttu)
 */
const DcaBotStrategy = require('./dcaBotStrategy');
const { oncekiGunSeviyeleri } = require('./seviye');

class DcaSeviyeStrategy extends DcaBotStrategy {
  prepare(candles) {
    super.prepare(candles);
    const filtre = (this.config && this.config.seviyeFiltresi) || 'temas';
    if (!this.hazir || filtre === 'yok') return;
    const { vwap, poc } = oncekiGunSeviyeleri(candles);
    this.hazir.kosul = this.hazir.kosul.map((k, i) => {
      if (!k) return false;
      const c = candles[i], v = vwap[i], p = poc[i];
      if (v == null) return false;
      if (filtre === 'indirim') return c.close < v;
      const tutti = (L) => L != null && c.low <= L && L <= c.high && c.close > L;
      return tutti(p) || tutti(v);
    });
  }
}

DcaSeviyeStrategy.warmupBars = DcaBotStrategy.warmupBars;
DcaSeviyeStrategy.paramSchema = {
  seviyeFiltresi: { type: 'enum', values: ['temas', 'indirim', 'yok'], default: 'temas', label: 'Seviye filtresi', group: 'Seviye',
    description: 'indirim: yeni deal yalnız önceki günün VWAP\'ı altında · temas: önceki gün POC/VWAP\'a değip üstünde kapanınca · yok: düz DCA' },
  ...DcaBotStrategy.paramSchema
};

module.exports = DcaSeviyeStrategy;
