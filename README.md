# makefun-btc-race

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/JackEasons/makefun-btc-race/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/JackEasons/makefun-btc-race/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

TrendGuard — a long-only cbBTC trend bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It waits for a real leg (60-bar return over +0.5% with the 12-bar EMA above the 48-bar EMA and the close above the 120-bar EMA), goes all-in, and rides it with a 2.5% trailing stop; otherwise it stays in cash. A full round trip costs about 26 bps in fees, slippage and impact, so the bot trades rarely: one trade on the kit's dev window. Deterministic, standard library only, no network, no clock.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 (newline-delimited JSON on stdin/stdout). Grade it on the kit's dev window with the make.fun kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=gbg9q3ye&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
