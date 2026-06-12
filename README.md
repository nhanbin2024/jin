# QuyNhon AI — SoDEX Trading Operating System

A live-only crypto trading web app for SoDEX buildathon workflows.

## Core modules
- Spot Trading terminal: live chart, order book, market trades, order ticket.
- Futures-style terminal: leverage slider, cross/isolated mode, TP/SL and server preview.
- Automation Center: timed scan / preview / live-mode schedule config.
- Coin Universe: hundreds of live coins and real icons from CoinGecko.
- SoSoValue Research Desk: live news/research feed and AI report generation through an OpenAI-compatible AI router.
- Signal Engine: momentum, liquidity, risk and conviction scores from live market data.
- Portfolio OS: locked until a real wallet is connected.

## Live-only rule
The UI does not render fake prices, fake wallets, fake portfolio balances or fake news. If a provider does not return data, the UI displays unavailable states.

## Vercel Environment Variables
```env
SOSOVALUE_API_KEY=
SODEX_API_KEY_NAME=
SODEX_PUBLIC_KEY=
SODEX_API_PRIVATE_KEY=
SODEX_PRIVATE_KEY=
SODEX_WALLET_PRIVATE_KEY=
AI_API_KEY=
AI_BASE_URL=https://router.chainopera.ai/v1
AI_MODEL=AI router-2.0-flash
AI_MAX_TOKENS=512
AI_TEMPERATURE=0.5
AI_TOP_P=0.7
# Optional fallback only if using Google AI router direct
AI_API_KEY=
AI_BASE_URL=https://router.chainopera.ai/v1
AI_MODEL=AI router-2.0-flash
NEXT_PUBLIC_APP_URL=
ENABLE_LIVE_TRADING=false
```

Keep private keys only in Vercel Environment Variables. Never push `.env` to GitHub.

## Deploy
```bash
npm install --legacy-peer-deps --registry=https://registry.npmjs.org/
npm run build
```

## Trade execution and automation

This build contains two execution paths:

1. **Manual trade ticket** in the Trade Terminal: Spot/Futures selector, buy/sell or long/short, volume, leverage, TP/SL, time-in-force, preview and execute buttons.
2. **Automation Center**: browser scheduler runs while the terminal page is open. It can auto-preview or auto-submit to the server execution route if `ENABLE_LIVE_TRADING=true`.

Server-side scheduled automation is also available through `/api/automation`. Configure `AUTO_TRADE_CONFIG` in Vercel and the included Vercel Cron will call it hourly. Live submission still requires `ENABLE_LIVE_TRADING=true` and valid SoDEX server-side keys.

Private keys, signatures, nonces, and payload hashes are never returned to the browser.

## Spot Auto-Close 1-3 Minutes

The Trade Ticket includes a **Spot Auto Close** switch. When enabled, any Spot entry creates an opposite-side close task after a randomized delay between the configured min/max minutes, default 1-3 minutes.

Safety model:
- Paper Mode is default.
- Live close orders require `ENABLE_LIVE_TRADING=true` and Live Trading armed in the UI.
- Private keys stay server-side in Vercel Environment Variables.
- Browser-based 1-3 minute timing requires the terminal tab to remain open. For guaranteed background execution, connect an external queue/database or run a Vercel Cron strategy using `AUTO_TRADE_CONFIG`.


## Live Trading Security

Live execution requires all conditions at the same time:

1. `ENABLE_LIVE_TRADING=true` in Vercel.
2. `ADMIN_SECRET` entered in the terminal UI.
3. Connected wallet equals `ADMIN_WALLET`.
4. SoDEX server credentials are configured.

If one condition fails, the app returns preview/paper mode only. The server never returns private keys, signatures, nonces, admin secret, or payload hashes to the browser.

For scheduled automation, set `AUTOMATION_SECRET` and update `vercel.json` cron path to `/api/automation?secret=<your-secret>`. Keep `ENABLE_LIVE_TRADING=false` for public demos unless you are actively supervising.

## Futures Auto-Close and Risk Guard

This version adds the missing futures workflow:

- Futures Auto Close ON/OFF in the Trade Ticket.
- Close-after-minutes field for a reduce-only opposite-side close order.
- TP/SL values are included in the server preview risk plan.
- `MAX_LEVERAGE` blocks live execution above your configured leverage cap.
- `MAX_ORDER_NOTIONAL_USD` blocks live execution above your configured notional cap.

Recommended Vercel safety values for a public buildathon demo:

```env
ENABLE_LIVE_TRADING=false
MAX_ORDER_NOTIONAL_USD=50
MAX_LEVERAGE=3
```

For supervised private live testing only:

```env
ENABLE_LIVE_TRADING=true
ADMIN_SECRET=<long-secret>
ADMIN_WALLET=<your-wallet-address>
MAX_ORDER_NOTIONAL_USD=50
MAX_LEVERAGE=3
```
