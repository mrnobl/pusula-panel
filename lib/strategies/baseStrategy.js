/**
 * Abstract Base Strategy Class
 */
class BaseStrategy {
  constructor(name, config) {
    this.name = name;
    this.config = config;
  }

  updateConfig(config) {
    this.config = config;
  }

  /**
   * Evaluates market data and returns trade signals
   * @param {Array} ohlcv - Candlestick array
   * @param {Object} ticker - Current live ticker
   * @param {Array} positions - Active paper/live positions
   * @returns {Object|null} Signal { action: 'BUY' | 'SELL' | 'HOLD', reason: String }
   */
  evaluate(ohlcv, ticker, positions) {
    throw new Error('evaluate() method must be implemented by strategy subclass');
  }
}

module.exports = BaseStrategy;
