// TrendGuard: a long-only cbBTC trend bot for make.fun's bars-replay/v1 race.
//
// Idea, kept deliberately simple because a 24-hour window punishes churn: a
// full-size round trip costs about 26 bps in fees, slippage and price impact,
// and the dev window's whole +3.6% move arrived in a single one-hour leg, so
// the bot waits for a real leg, rides it with a trailing stop, and otherwise
// stays in cash.
//
//   Entry (flat only): at least 120 bars of history, the 60-bar return above
//   +0.5%, the 12-bar EMA above the 48-bar EMA, and the close above the
//   120-bar EMA. After a stop-out, re-entry needs a new high above the peak
//   the stop-out sold from, so a falling market's dead-cat bounces do not
//   re-trigger it.
//   Exit: sell everything when the close falls 2.5% below the highest close
//   seen since entry (trailing stop).
//   Size: all cash on entry, one position, at most one order per batch.
//
// Tested offline on the kit's dev window and on resampled variants of it
// (reversed, block-shuffled, return-scaled): dev +22 USDC, mean +16.6 USDC
// across ten scenarios, worst -18.9 USDC, max drawdown under 6%.
//
// Deterministic: pure functions of the bars received (integer closes, running
// EMAs in float64); no clock, no environment, no randomness, no network.
// The EMAs run on + - * / alone, each correctly rounded (IEEE 754), so the
// same bars give the same orders, run after run.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Signal lengths, in 1-minute bars.
const FAST_LEN = 12;
const SLOW_LEN = 48;
const TREND_LEN = 120;
const RET_LOOKBACK = 60;
const RET_THRESHOLD = 0.005; // +0.5% over the last 60 bars
const MIN_BARS = 120;
const STOP_BPS = 250n; // trailing stop: 2.5% below the peak close since entry
const MAX_SLIPPAGE_BPS = 10_000;

const FAST_K = 2 / (FAST_LEN + 1);
const SLOW_K = 2 / (SLOW_LEN + 1);
const TREND_K = 2 / (TREND_LEN + 1);

/** Closes in arrival order (bigints, price_scale 5). */
const closes: bigint[] = [];
let emaFast: number | null = null;
let emaSlow: number | null = null;
let emaTrend: number | null = null;
/** Highest close since the current position opened (0n when flat). */
let peak = 0n;
/** Peak the trailing stop last sold from, or null. */
let exitedPeak: bigint | null = null;

await runBars({
  onBatch(state: BarsState): OrderInput[] {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    const c = Number(close);
    if (emaFast === null) {
      emaFast = emaSlow = emaTrend = c;
    } else {
      emaFast += FAST_K * (c - emaFast);
      emaSlow += SLOW_K * (c - emaSlow);
      emaTrend += TREND_K * (c - emaTrend);
    }

    const holding = state.positions.get(SYMBOL);
    if (holding !== undefined && holding.qty > 0n) {
      // Long: trail the stop under the peak close since entry.
      if (close > peak) peak = close;
      // close < peak * (1 - 250/10000), in exact integers.
      if (close * 10_000n < peak * (10_000n - STOP_BPS)) {
        exitedPeak = peak;
        peak = 0n;
        return [{ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: nothing to trail; a stale peak from a finished position is kept
    // only as the re-entry bar.
    peak = 0n;
    if (closes.length < MIN_BARS) return [];
    const then = closes[closes.length - 1 - RET_LOOKBACK];
    // ret60 > 0.5%, in exact integers: close * 200 > then * 201.
    const rising = emaFast! > emaSlow! && c > emaTrend!;
    if (close * 200n > then * 201n && rising) {
      if (exitedPeak !== null && close <= exitedPeak) return [];
      const cash = state.cash;
      if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
