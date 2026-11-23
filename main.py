"""TrendGuard: a long-only cbBTC trend bot for make.fun's bars-replay/v1 race.

Idea, kept deliberately simple because a 24-hour window punishes churn: a
full-size round trip costs about 26 bps in fees, slippage and price impact,
and the dev window's whole +3.6% move arrived in a single one-hour leg, so
the bot waits for a real leg, rides it with a trailing stop, and otherwise
stays in cash.

  Entry (flat only): at least 120 bars of history, the 60-bar return above
  +0.5%, the 12-bar EMA above the 48-bar EMA, and the close above the
  120-bar EMA. After a stop-out, re-entry needs a new high above the peak
  the stop-out sold from, so a falling market's dead-cat bounces do not
  re-trigger it.
  Exit: sell everything when the close falls 2.5% below the highest close
  seen since entry (trailing stop).
  Size: all cash on entry, one position, at most one order per batch.

Tested offline on the kit's dev window and on resampled variants of it
(reversed, block-shuffled, return-scaled): dev +22 USDC, mean +16.6 USDC
across ten scenarios, worst -18.9 USDC, max drawdown under 6%.

Deterministic: pure functions of the bars received (integer closes, running
EMAs); no clock, no environment, no randomness, no network, standard
library only (plus the kit's vendored shim under vendor/).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor"))

import makefun_bars

SYMBOL = "CBBTC"
# Signal lengths, in 1-minute bars.
FAST_LEN = 12
SLOW_LEN = 48
TREND_LEN = 120
RET_LOOKBACK = 60
RET_THRESHOLD = 0.005  # +0.5% over the last 60 bars
MIN_BARS = 120
STOP_BPS = 250  # trailing stop: 2.5% below the peak close since entry
MAX_SLIPPAGE_BPS = 10_000

_fast_k = 2.0 / (FAST_LEN + 1)
_slow_k = 2.0 / (SLOW_LEN + 1)
_trend_k = 2.0 / (TREND_LEN + 1)

_closes = []  # closes in arrival order (ints, price_scale 5)
_ema_fast = None
_ema_slow = None
_ema_trend = None
_peak = 0  # highest close since the current position opened (0 when flat)
_exited_peak = None  # peak the trailing stop last sold from, or None


def on_batch(state, batch):
    global _ema_fast, _ema_slow, _ema_trend, _peak, _exited_peak

    close = state.close(SYMBOL)
    if close is None:
        return []
    _closes.append(close)
    if _ema_fast is None:
        _ema_fast = _ema_slow = _ema_trend = float(close)
    else:
        _ema_fast = close * _fast_k + _ema_fast * (1.0 - _fast_k)
        _ema_slow = close * _slow_k + _ema_slow * (1.0 - _slow_k)
        _ema_trend = close * _trend_k + _ema_trend * (1.0 - _trend_k)

    holding = state.positions.get(SYMBOL)
    if holding is not None and holding.qty > 0:
        # Long: trail the stop under the peak close since entry.
        if close > _peak:
            _peak = close
        # close < peak * (1 - 250/10000), in exact integers.
        if close * 10_000 < _peak * (10_000 - STOP_BPS):
            _exited_peak = _peak
            _peak = 0
            return [{
                "side": "sell",
                "symbol": SYMBOL,
                "qty": holding.qty,
                "max_slippage_bps": MAX_SLIPPAGE_BPS,
            }]
        return []

    # Flat: nothing to trail; a stale peak from a finished position is kept
    # only as the re-entry bar.
    _peak = 0
    if len(_closes) < MIN_BARS:
        return []
    ret60 = _closes[-1] / _closes[-1 - RET_LOOKBACK] - 1.0
    rising = _ema_fast > _ema_slow and close > _ema_trend
    if ret60 > RET_THRESHOLD and rising:
        if _exited_peak is not None and close <= _exited_peak:
            return []
        cash = state.cash
        if cash < state.hello["fees"]["min_notional_quote_units"]:
            return []
        return [{
            "side": "buy",
            "symbol": SYMBOL,
            "notional_quote_units": cash,
            "max_slippage_bps": MAX_SLIPPAGE_BPS,
        }]
    return []


makefun_bars.run(on_batch)
