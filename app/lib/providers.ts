import { ethers } from 'ethers';

export const runtime = 'nodejs';

const jsonHeaders = { accept: 'application/json', 'content-type': 'application/json' };
const COINGECKO = 'https://api.coingecko.com/api/v3';
const BINANCE = 'https://api.binance.com/api/v3';
const SODEX_PUBLIC = 'https://mainnet-gw.sodex.com/api/v1';
const SODEX_ALT = 'https://mainnet-gw.sodex.dev/api/v1';
const SODEX_PERPS = 'https://mainnet-gw.sodex.dev/api/v1/perps';

export type LiveSource = 'SoDEX' | 'SoSoValue' | 'CoinGecko' | 'Binance' | 'Unavailable';
export type Coin = {
  id: string; symbol: string; name: string; image?: string;
  current_price?: number | null; market_cap?: number | null; market_cap_rank?: number | null; total_volume?: number | null;
  price_change_percentage_1h_in_currency?: number | null; price_change_percentage_24h?: number | null;
  price_change_percentage_24h_in_currency?: number | null; price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price?: number[] }; source?: LiveSource;
};

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store', headers: { ...jsonHeaders, ...(init?.headers || {}) } });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data, url };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: error?.message || 'network_error' }, url };
  } finally { clearTimeout(timeout); }
}


function toSodexPerpSymbol(symbol: string) {
  const s = String(symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.endsWith('USDT')) return `${s.replace('USDT','')}-USD`;
  if (s.endsWith('USDC')) return `${s.replace('USDC','')}-USD`;
  if (s.includes('-')) return s;
  return `${s}-USD`;
}

async function sodexGet(endpoint: string, timeoutMs = 9000) {
  const headers: Record<string, string> = {};
  if (process.env.SODEX_API_KEY_NAME) headers['X-API-Key'] = process.env.SODEX_API_KEY_NAME;
  return fetchJson(`${SODEX_PERPS}${endpoint}`, { headers }, timeoutMs);
}

function canonicalOrderPayload(data: any) {
  const ord = data.orders?.[0];
  if (!ord) return JSON.stringify(data);
  const orderItemStr = `{"clOrdID":"${ord.clOrdID}","modifier":${ord.modifier},"side":${ord.side},"type":${ord.type},"timeInForce":${ord.timeInForce},"price":"${ord.price}","quantity":"${ord.quantity}","reduceOnly":${ord.reduceOnly},"positionSide":${ord.positionSide}}`;
  return `{"accountID":${data.accountID},"symbolID":${data.symbolID},"orders":[${orderItemStr}]}`;
}

async function signSodexPayload(method: 'POST' | 'DELETE', paramsStr: string) {
  const privateKey = process.env.SODEX_API_PRIVATE_KEY || process.env.SODEX_PRIVATE_KEY || process.env.SODEX_WALLET_PRIVATE_KEY;
  if (!privateKey) throw new Error('Missing SoDEX private key in server environment');
  const nonce = Date.now();
  const actionType = method === 'DELETE' ? 'cancelOrder' : 'newOrder';
  const payloadStr = `{"type":"${actionType}","params":${paramsStr}}`;
  const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(payloadStr));
  const wallet = new ethers.Wallet(privateKey);
  const domain = { name: 'futures', version: '1', chainId: 286623, verifyingContract: '0x0000000000000000000000000000000000000000' };
  const types = { ExchangeAction: [{ name: 'payloadHash', type: 'bytes32' }, { name: 'nonce', type: 'uint64' }] };
  const signature = await wallet.signTypedData(domain, types, { payloadHash, nonce: BigInt(nonce) });
  let sig = signature.slice(2);
  const r = sig.slice(0, 64), ss = sig.slice(64, 128);
  let vInt = parseInt(sig.slice(128, 130), 16);
  if (vInt >= 27) vInt -= 27;
  const finalSig = '0x01' + r + ss + vInt.toString(16).padStart(2, '0');
  return { nonce, signature: finalSig };
}

async function sodexSignedRequest(method: 'POST' | 'DELETE', endpoint: string, paramsStr: string) {
  const apiKey = process.env.SODEX_API_KEY_NAME;
  if (!apiKey) throw new Error('Missing SODEX_API_KEY_NAME');
  const signed = await signSodexPayload(method, paramsStr);
  const res = await fetch(`${SODEX_PERPS}${endpoint}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Nonce': String(signed.nonce),
      'X-API-Sign': signed.signature,
    },
    body: paramsStr,
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`SoDEX HTTP ${res.status}`);
  return data?.data ?? data;
}

export async function getSodexPerpsMarket(symbol = 'BTCUSDT') {
  const perp = toSodexPerpSymbol(symbol);
  const [mark, depth, trades] = await Promise.all([
    sodexGet(`/markets/mark-prices?symbol=${encodeURIComponent(perp)}`, 7000),
    sodexGet(`/markets/${encodeURIComponent(perp)}/orderbook?limit=50`, 7000),
    sodexGet(`/markets/${encodeURIComponent(perp)}/trades?limit=80`, 7000),
  ]);
  const markData = mark.data?.data || mark.data;
  const depthData = depth.data?.data || depth.data;
  const tradeData = trades.data?.data || trades.data;
  const bids = (depthData?.bids || []).map((b:any)=>Array.isArray(b)?{price:Number(b[0]),amount:Number(b[1]),total:Number(b[0])*Number(b[1])}:{price:Number(b.price),amount:Number(b.size||b.quantity||b.amount),total:Number(b.price)*Number(b.size||b.quantity||b.amount)}).filter((x:any)=>Number.isFinite(x.price));
  const asks = (depthData?.asks || []).map((a:any)=>Array.isArray(a)?{price:Number(a[0]),amount:Number(a[1]),total:Number(a[0])*Number(a[1])}:{price:Number(a.price),amount:Number(a.size||a.quantity||a.amount),total:Number(a.price)*Number(a.size||a.quantity||a.amount)}).filter((x:any)=>Number.isFinite(x.price));
  const arr = Array.isArray(tradeData) ? tradeData : (tradeData?.trades || []);
  const mappedTrades = arr.map((t:any,i:number)=>({ id:t.id ?? i, price:Number(t.price), qty:Number(t.size||t.quantity||t.qty||0), time:Number(t.timestamp||t.time||Date.now()), isBuyerMaker:String(t.side||t.type||'').toLowerCase() !== 'buy' })).filter((x:any)=>Number.isFinite(x.price));
  const price = Array.isArray(markData) ? Number(markData[0]?.markPrice || markData[0]?.price) : Number(markData?.markPrice || markData?.price);
  return { ok: mark.ok || depth.ok || trades.ok, source: (mark.ok || depth.ok || trades.ok) ? 'SoDEX' as LiveSource : 'Unavailable' as LiveSource, symbol: perp, markPrice: Number.isFinite(price) ? price : null, bids, asks, trades: mappedTrades };
}

export async function getSodexPerpsAccount(symbol = 'BTCUSDT') {
  const publicKey = process.env.SODEX_PUBLIC_KEY;
  if (!publicKey) return { source: 'Unavailable' as LiveSource, account: null, balances: [], orders: [], positions: [], reason: 'SODEX_PUBLIC_KEY missing' };
  const perp = toSodexPerpSymbol(symbol);
  const [state, balances, orders, positions] = await Promise.all([
    sodexGet(`/accounts/${encodeURIComponent(publicKey)}/state`, 7000),
    sodexGet(`/accounts/${encodeURIComponent(publicKey)}/balances`, 7000),
    sodexGet(`/accounts/${encodeURIComponent(publicKey)}/orders?symbol=${encodeURIComponent(perp)}`, 7000),
    sodexGet(`/accounts/${encodeURIComponent(publicKey)}/positions?symbol=${encodeURIComponent(perp)}`, 7000),
  ]);
  const unwrap = (r:any)=> r.data?.data ?? r.data ?? null;
  const bal = unwrap(balances); const ord = unwrap(orders); const pos = unwrap(positions);
  return {
    source: (state.ok || balances.ok || orders.ok || positions.ok) ? 'SoDEX' as LiveSource : 'Unavailable' as LiveSource,
    account: unwrap(state),
    balances: Array.isArray(bal) ? bal : (bal?.balances || []),
    orders: Array.isArray(ord) ? ord : (ord?.orders || []),
    positions: Array.isArray(pos) ? pos : (pos?.positions || []),
  };
}

async function getSodexAccountId() {
  const publicKey = process.env.SODEX_PUBLIC_KEY;
  if (!publicKey) return 0;
  const state = await sodexGet(`/accounts/${encodeURIComponent(publicKey)}/state`, 7000);
  const data = state.data?.data ?? state.data;
  return Number(data?.aid || data?.data?.aid || 0);
}

async function getSodexSymbolId(symbol: string) {
  const perp = toSodexPerpSymbol(symbol);
  const r = await sodexGet('/markets/symbols', 7000);
  const data = r.data?.data ?? r.data;
  const arr = Array.isArray(data) ? data : (data?.data || data?.symbols || []);
  const item = arr.find((s:any)=>s.symbol === perp || s.name === perp || s.id === perp || s.symbol === symbol);
  return Number(item?.id ?? item?.symbolID ?? 1);
}

export async function getCoinGeckoCoins(page = 1, perPage = 250) {
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  const result = await fetchJson(url, undefined, 14000);
  if (!result.ok || !Array.isArray(result.data)) return { source: 'Unavailable' as LiveSource, coins: [], error: result.data };
  return { source: 'CoinGecko' as LiveSource, coins: result.data.map((c: any) => ({ ...c, source: 'CoinGecko' })) as Coin[] };
}

export async function getCoinGeckoGlobal() {
  const result = await fetchJson(`${COINGECKO}/global`, undefined, 9000);
  if (!result.ok) return { source: 'Unavailable' as LiveSource, global: null, error: result.data };
  return { source: 'CoinGecko' as LiveSource, global: result.data?.data || null };
}

export async function getBinanceTickers(symbols = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','AAVEUSDT','UNIUSDT','SUIUSDT']) {
  const results = await Promise.all(symbols.map(async (symbol) => {
    const r = await fetchJson(`${BINANCE}/ticker/24hr?symbol=${symbol}`, undefined, 9000);
    if (!r.ok) return null;
    const base = symbol.replace('USDT','');
    return { id: base.toLowerCase(), symbol: base, name: base, current_price: Number(r.data.lastPrice), price_change_percentage_24h: Number(r.data.priceChangePercent), total_volume: Number(r.data.quoteVolume), source: 'Binance' as LiveSource };
  }));
  return { source: 'Binance' as LiveSource, coins: results.filter(Boolean) as Coin[] };
}

export async function getBinanceDepth(symbol = 'BTCUSDT', limit = 50) {
  const r = await fetchJson(`${BINANCE}/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, undefined, 9000);
  if (!r.ok) return { source: 'Unavailable' as LiveSource, bids: [], asks: [], error: r.data };
  return { source: 'Binance' as LiveSource, lastUpdateId: r.data.lastUpdateId, bids: (r.data.bids || []).map((x:any[])=>({ price:Number(x[0]), amount:Number(x[1]), total:Number(x[0])*Number(x[1]) })), asks: (r.data.asks || []).map((x:any[])=>({ price:Number(x[0]), amount:Number(x[1]), total:Number(x[0])*Number(x[1]) })) };
}

export async function getBinanceTrades(symbol = 'BTCUSDT', limit = 60) {
  const r = await fetchJson(`${BINANCE}/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, undefined, 9000);
  if (!r.ok) return { source: 'Unavailable' as LiveSource, trades: [], error: r.data };
  return { source: 'Binance' as LiveSource, trades: (r.data || []).map((t:any)=>({ id:t.id, price:Number(t.price), qty:Number(t.qty), time:t.time, isBuyerMaker:t.isBuyerMaker })) };
}

export async function getBinanceKlines(symbol = 'BTCUSDT', interval = '5m', limit = 160) {
  const r = await fetchJson(`${BINANCE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`, undefined, 9000);
  if (!r.ok || !Array.isArray(r.data)) return { source: 'Unavailable' as LiveSource, candles: [], error: r.data };
  return { source: 'Binance' as LiveSource, candles: r.data.map((x: any[]) => ({ time: x[0], open: Number(x[1]), high: Number(x[2]), low: Number(x[3]), close: Number(x[4]), volume: Number(x[5]) })) };
}

export async function getBinanceTicker(symbol = 'BTCUSDT') {
  const r = await fetchJson(`${BINANCE}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, undefined, 9000);
  if (!r.ok) return { source: 'Unavailable' as LiveSource, ticker: null, error: r.data };
  return { source: 'Binance' as LiveSource, ticker: { symbol, price:Number(r.data.lastPrice), high:Number(r.data.highPrice), low:Number(r.data.lowPrice), volume:Number(r.data.quoteVolume), change:Number(r.data.priceChangePercent), count:Number(r.data.count), weightedAvg:Number(r.data.weightedAvgPrice) } };
}

export async function getSoDEXMarkets() {
  const endpoints = [`${SODEX_PUBLIC}/spot/markets/tickers`, `${SODEX_ALT}/spot/markets/tickers`, 'https://sodex.com/api/v1/spot/markets/tickers'];
  for (const url of endpoints) {
    const r = await fetchJson(url, { headers: process.env.SODEX_API_KEY_NAME ? { 'X-API-Key': process.env.SODEX_API_KEY_NAME } : {} }, 9000);
    const data = r.data?.data || r.data?.result || r.data;
    if (r.ok && (Array.isArray(data) || data?.tickers || data?.markets)) return { source: 'SoDEX' as LiveSource, data, endpoint: url };
  }
  return { source: 'Unavailable' as LiveSource, data: null };
}

export async function getSoDEXAccount() {
  const publicKey = process.env.SODEX_PUBLIC_KEY;
  if (!publicKey) return { source: 'Unavailable' as LiveSource, account: null, reason: 'SODEX_PUBLIC_KEY missing' };
  const endpoints = [`${SODEX_PUBLIC}/account?publicKey=${encodeURIComponent(publicKey)}`, `${SODEX_ALT}/account?publicKey=${encodeURIComponent(publicKey)}`, `${SODEX_PUBLIC}/accounts/${encodeURIComponent(publicKey)}`, `${SODEX_ALT}/accounts/${encodeURIComponent(publicKey)}`];
  for (const url of endpoints) {
    const r = await fetchJson(url, { headers: process.env.SODEX_API_KEY_NAME ? { 'X-API-Key': process.env.SODEX_API_KEY_NAME } : {} }, 9000);
    if (r.ok && r.data) return { source: 'SoDEX' as LiveSource, account: r.data, endpoint: url };
  }
  return { source: 'Unavailable' as LiveSource, account: null };
}

export async function getSoSoValueNews(limit = 20) {
  const key = process.env.SOSOVALUE_API_KEY;
  if (!key) return { source: 'Unavailable' as LiveSource, news: [], reason: 'SOSOVALUE_API_KEY missing' };
  const urls = [`https://openapi.sosovalue.com/openapi/v1/news?limit=${limit}`, `https://openapi.sosovalue.com/openapi/v1/news/list?limit=${limit}`, `https://openapi.sosovalue.com/openapi/v1/news/research?limit=${limit}`];
  for (const url of urls) {
    const r = await fetchJson(url, { headers: { 'x-soso-api-key': key } }, 10000);
    const raw = r.data?.data || r.data?.result || r.data?.list || r.data;
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.list) ? raw.list : Array.isArray(raw?.items) ? raw.items : [];
    if (r.ok && arr.length) return { source: 'SoSoValue' as LiveSource, news: arr.slice(0, limit), endpoint: url };
  }
  return { source: 'Unavailable' as LiveSource, news: [] };
}

export async function getLiveMarket() {
  const [coins1, coins2, global, sodex, news] = await Promise.all([getCoinGeckoCoins(1, 250), getCoinGeckoCoins(2, 250), getCoinGeckoGlobal(), getSoDEXMarkets(), getSoSoValueNews(24)]);
  let coins = [...coins1.coins, ...coins2.coins];
  const sourceChain: LiveSource[] = [];
  if (coins.length) sourceChain.push('CoinGecko');
  if (!coins.length) {
    const bin = await getBinanceTickers();
    coins = bin.coins;
    if (coins.length) sourceChain.push('Binance');
  }
  if (sodex.source === 'SoDEX') sourceChain.unshift('SoDEX');
  if (news.source === 'SoSoValue') sourceChain.push('SoSoValue');
  return { ok: true, updatedAt: new Date().toISOString(), sources: sourceChain.length ? sourceChain : ['Unavailable'], coins, global: global.global, sodex: sodex.data, news: news.news };
}

export async function getTradeTerminal(symbol = 'BTCUSDT', interval = '5m') {
  const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi,'').toUpperCase() || 'BTCUSDT';
  const [ticker, depth, trades, klines, sodex, sodexPerps, perpsAccount] = await Promise.all([
    getBinanceTicker(cleanSymbol),
    getBinanceDepth(cleanSymbol, 50),
    getBinanceTrades(cleanSymbol, 80),
    getBinanceKlines(cleanSymbol, interval, 180),
    getSoDEXMarkets(),
    getSodexPerpsMarket(cleanSymbol),
    getSodexPerpsAccount(cleanSymbol),
  ]);
  const sources: LiveSource[] = [];
  if (sodex.source === 'SoDEX' || sodexPerps.source === 'SoDEX' || perpsAccount.source === 'SoDEX') sources.push('SoDEX');
  if (ticker.source === 'Binance' || depth.source === 'Binance' || trades.source === 'Binance' || klines.source === 'Binance') sources.push('Binance');
  const orderBook = sodexPerps.bids?.length || sodexPerps.asks?.length
    ? { bids: sodexPerps.bids, asks: sodexPerps.asks, source: 'SoDEX' as LiveSource }
    : { bids: depth.bids, asks: depth.asks, source: depth.source };
  const recentTrades = sodexPerps.trades?.length ? sodexPerps.trades : trades.trades;
  const livePrice = sodexPerps.markPrice || ticker.ticker?.price || null;
  return {
    ok:true,
    updatedAt:new Date().toISOString(),
    symbol: cleanSymbol,
    perpsSymbol: sodexPerps.symbol,
    sources: sources.length ? sources : ['Unavailable'],
    ticker: ticker.ticker ? { ...ticker.ticker, price: livePrice, sodexMarkPrice: sodexPerps.markPrice } : { symbol: cleanSymbol, price: livePrice },
    orderBook,
    trades: recentTrades,
    candles: klines.candles,
    sodex: { spotMarkets: sodex.data, perps: sodexPerps, account: perpsAccount },
    account: perpsAccount.account || perpsAccount.balances?.length || perpsAccount.orders?.length || perpsAccount.positions?.length
      ? { connected:true, account: perpsAccount.account, balances: perpsAccount.balances, orders: perpsAccount.orders, positions: perpsAccount.positions }
      : { connected:false, reason: (perpsAccount as any).reason || 'SoDEX account unavailable' }
  };
}

export function deriveSignals(coins: Coin[]) {
  return coins.slice(0, 150).map((c) => {
    const p24 = Number(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0);
    const p7 = Number(c.price_change_percentage_7d_in_currency ?? 0);
    const vol = Number(c.total_volume ?? 0); const cap = Number(c.market_cap ?? 0);
    const liquidity = cap > 0 ? Math.min(100, Math.round((vol / cap) * 1000)) : null;
    const momentum = Math.max(0, Math.min(100, Math.round(50 + p24 * 3 + p7)));
    const risk = cap > 0 ? Math.max(1, Math.min(100, Math.round(100 - Math.log10(cap) * 7 + Math.abs(p24) * 2))) : null;
    const conviction = Math.round([momentum, liquidity ?? 50, risk ? 100 - risk : 50].reduce((a,b)=>a+b,0)/3);
    return { id:c.id, symbol:c.symbol, name:c.name, image:c.image, price:c.current_price, source:c.source, momentum, liquidity, risk, conviction, change24h:p24, volume:vol, marketCap:cap };
  });
}

export async function buildAIAnswer(question: string, context: any) {
  const apiKey = process.env.AI_API_KEY || process.env.CHAINOPERA_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = (process.env.AI_BASE_URL || 'https://router.chainopera.ai/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'Qwen3-32B';

  if (!apiKey) {
    return {
      ok: false,
      answer: 'AI router is unavailable. Add AI_API_KEY in Vercel Environment Variables. Optional aliases supported: CHAINOPERA_API_KEY or OPENAI_API_KEY.',
      provider: 'ChainOpera OpenAI-compatible router',
      model,
    };
  }

  const system = 'You are QuyNhon AI, a SoSoValue research and SoDEX trading copilot. Use only the live context supplied by the server. Do not invent prices, balances, news, positions, or order status. If data is missing, say unavailable. Always include risk notes and whether the answer is research-only or execution-related.';
  const user = `Live context JSON:
${JSON.stringify(context).slice(0, 22000)}

User request:
${question}

Return a concise useful answer with sections: Summary, Market Evidence, SoDEX Execution Context, Risks, Next Action.`;

  const r = await fetchJson(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stream: false,
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 900,
      temperature: 0.5,
      top_p: 0.7,
    }),
  }, 30000);

  if (!r.ok) {
    return {
      ok: false,
      answer: 'AI router request failed. Check AI_API_KEY, AI_BASE_URL, and AI_MODEL in Vercel Environment Variables.',
      provider: 'ChainOpera OpenAI-compatible router',
      model,
      error: r.data,
    };
  }

  const answer = r.data?.choices?.[0]?.message?.content || r.data?.output_text || 'No answer returned by AI router.';
  return { ok: true, answer, provider: 'ChainOpera OpenAI-compatible router', model };
}


function normalizeAddress(value: any) {
  return String(value || '').trim().toLowerCase();
}

export function getExecutionSecurity(body: any = {}) {
  const liveTradingEnabled = process.env.ENABLE_LIVE_TRADING === 'true';
  const adminSecretSet = Boolean(process.env.ADMIN_SECRET);
  const adminWalletSet = Boolean(process.env.ADMIN_WALLET);
  const secretOk = adminSecretSet && String(body.adminSecret || body.executionSecret || '') === String(process.env.ADMIN_SECRET);
  const walletOk = adminWalletSet && normalizeAddress(body.connectedWallet || body.wallet || body.adminWallet) === normalizeAddress(process.env.ADMIN_WALLET);
  const hasServerKeys = Boolean(process.env.SODEX_API_KEY_NAME && (process.env.SODEX_API_PRIVATE_KEY || process.env.SODEX_PRIVATE_KEY || process.env.SODEX_WALLET_PRIVATE_KEY));
  const maxNotional = Number(process.env.MAX_ORDER_NOTIONAL_USD || 0);
  return {
    liveTradingEnabled,
    adminSecretSet,
    adminWalletSet,
    secretOk,
    walletOk,
    hasServerKeys,
    maxNotional: Number.isFinite(maxNotional) && maxNotional > 0 ? maxNotional : null,
    liveAuthorized: liveTradingEnabled && secretOk && walletOk && hasServerKeys,
  };
}

export function assertAutomationSecret(reqSecret: string | null | undefined) {
  const automationSecret = process.env.AUTOMATION_SECRET || process.env.ADMIN_SECRET;
  if (!automationSecret) return { ok: false, reason: 'AUTOMATION_SECRET or ADMIN_SECRET is not configured.' };
  if (String(reqSecret || '') !== String(automationSecret)) return { ok: false, reason: 'Automation secret is invalid.' };
  return { ok: true };
}

export async function createExecutionPreview(body: any) {
  const product = body.product === 'futures' ? 'futures' : 'spot';
  const side = product === 'futures'
    ? (body.side === 'short' || body.side === 'sell' ? 'short' : 'long')
    : (body.side === 'sell' ? 'sell' : 'buy');
  const safe = {
    market: String(body.market || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g,''),
    sodexMarket: toSodexPerpSymbol(body.market || 'BTCUSDT'),
    product,
    side,
    orderType: ['market','limit','stop','twap'].includes(body.orderType) ? body.orderType : 'market',
    marginMode: body.marginMode === 'isolated' ? 'isolated' : 'cross',
    leverage: Math.max(1, Math.min(100, Number(body.leverage || 1))),
    amount: Number(body.amount || 0),
    price: body.price ? Number(body.price) : null,
    takeProfit: body.takeProfit ? Number(body.takeProfit) : null,
    stopLoss: body.stopLoss ? Number(body.stopLoss) : null,
    reduceOnly: Boolean(body.reduceOnly),
    timeInForce: body.timeInForce === 'post_only' ? 4 : body.timeInForce === 'ioc' ? 3 : 1,
    schedule: body.schedule || 'manual',
    frequency: body.frequency || null,
    spotAutoClose: body.spotAutoClose === 'random' ? 'random_1_3m' : 'off',
    spotCloseMin: Math.max(1, Number(body.spotCloseMin || 1)),
    spotCloseMax: Math.max(1, Number(body.spotCloseMax || 3)),
    futuresAutoClose: body.futuresAutoClose === 'time' ? 'time_close' : 'off',
    futuresCloseMinutes: Math.max(1, Math.min(240, Number(body.futuresCloseMinutes || 15))),
    futuresCloseMode: body.futuresCloseMode === 'time_only' ? 'time_only' : 'time_or_tp_sl',
    timestamp: new Date().toISOString()
  };
  const valid = Boolean(safe.market && safe.amount > 0);
  const security = getExecutionSecurity(body);
  const estimatedNotional = safe.amount * Number(safe.price || 0);
  const sizeAllowed = !security.maxNotional || !estimatedNotional || estimatedNotional <= security.maxNotional;
  const preview: any = {
    ok: valid,
    mode: security.liveTradingEnabled ? 'live-enabled-requires-admin-unlock' : 'preview-only',
    canSubmitLive: security.liveAuthorized && valid && sizeAllowed,
    preview: safe,
    security: {
      liveTradingEnabled: security.liveTradingEnabled,
      adminSecretRequired: security.adminSecretSet,
      adminWalletRequired: security.adminWalletSet,
      secretUnlocked: security.secretOk,
      walletWhitelisted: security.walletOk,
      serverKeysConfigured: security.hasServerKeys,
      maxNotionalUsd: security.maxNotional,
      liveAuthorized: security.liveAuthorized && sizeAllowed,
    },
    warnings: [],
    secretExposure: 'No private key, signature, nonce, admin secret or payload hash is returned to the browser.'
  };
  if (!valid) preview.warnings.push('Enter a valid market and amount before submitting.');
  if (!security.liveTradingEnabled) preview.warnings.push('Live trading disabled by server. This generated a server-side order preview only.');
  if (security.liveTradingEnabled && !security.secretOk) preview.warnings.push('Live trading requires ADMIN_SECRET unlock.');
  if (security.liveTradingEnabled && !security.walletOk) preview.warnings.push('Live trading requires connected wallet to match ADMIN_WALLET.');
  if (!security.hasServerKeys) preview.warnings.push('SoDEX server execution keys are not fully configured.');
  if (!sizeAllowed) preview.warnings.push(`Order exceeds MAX_ORDER_NOTIONAL_USD (${security.maxNotional}).`);
  const maxLev = Number(process.env.MAX_LEVERAGE || 0);
  if (product === 'futures' && maxLev > 0 && safe.leverage > maxLev) { preview.ok = false; preview.canSubmitLive = false; preview.security.liveAuthorized = false; preview.warnings.push(`Leverage exceeds MAX_LEVERAGE (${maxLev}x).`); }
  if (product === 'futures' && safe.leverage > 10) preview.warnings.push('High leverage selected. Confirm liquidation risk and reduce size.');
  if (safe.orderType === 'market') preview.warnings.push('Market order may experience slippage. Use limit/post-only for maker execution.');
  if (product === 'futures' && safe.futuresAutoClose === 'time_close') {
    preview.autoClosePlan = {
      enabled: true,
      product: 'futures',
      delayWindow: `${safe.futuresCloseMinutes} minutes`,
      closeSide: safe.side === 'short' ? 'long' : 'short',
      reduceOnly: true,
      takeProfit: safe.takeProfit,
      stopLoss: safe.stopLoss,
      mode: safe.futuresCloseMode,
      note: 'The browser scheduler submits a reduce-only opposite-side close order after the configured time. Serverless cron can also run previews when AUTO_TRADE_CONFIG is configured.'
    };
    preview.warnings.push('Futures auto-close is enabled. Keep the terminal open for browser scheduling, or configure external automation for guaranteed execution.');
  }
  if (product === 'spot' && safe.spotAutoClose === 'random_1_3m') {
    preview.autoClosePlan = {
      enabled: true,
      delayWindow: `${safe.spotCloseMin}-${safe.spotCloseMax} minutes`,
      closeSide: safe.side === 'sell' ? 'buy' : 'sell',
      note: 'Browser scheduler will submit the opposite-side close order after a random delay. Serverless functions cannot sleep for 1-3 minutes without an external queue.'
    };
    preview.warnings.push('Spot auto-close is enabled. Keep the terminal open or configure an external scheduler for guaranteed execution.');
  }
  return preview;
}

export async function executeSodexOrder(body: any) {
  const preview = await createExecutionPreview(body);
  if (!preview.canSubmitLive) return { ...preview, submitted: false };
  const accountID = await getSodexAccountId();
  const symbolID = await getSodexSymbolId(preview.preview.market);
  if (!accountID || !symbolID) return { ...preview, submitted: false, error: 'SoDEX accountID or symbolID unavailable' };
  const terminal = await getTradeTerminal(preview.preview.market, '5m');
  const mark = Number(terminal.ticker?.price || 0);
  const price = preview.preview.price || mark;
  if (!price || !Number.isFinite(price)) return { ...preview, submitted: false, error: 'No live price available for order construction' };
  const quantity = preview.preview.amount < 0.001 ? preview.preview.amount.toFixed(6) : preview.preview.amount.toFixed(4);
  const ord = {
    clOrdID: `qn-${Date.now()}-${Math.floor(Math.random()*10000)}`,
    modifier: preview.preview.product === 'futures' ? (preview.preview.marginMode === 'isolated' ? 2 : 1) : 1,
    side: preview.preview.side === 'sell' || preview.preview.side === 'short' ? 2 : 1,
    type: 1,
    timeInForce: preview.preview.timeInForce,
    price: preview.preview.orderType === 'market' ? String(Math.round(price)) : String(preview.preview.price),
    quantity,
    reduceOnly: preview.preview.reduceOnly,
    positionSide: preview.preview.side === 'short' ? 2 : 1,
  };
  const data = { accountID, symbolID, orders: [ord] };
  const paramsStr = canonicalOrderPayload(data);
  const result = await sodexSignedRequest('POST', '/trade/orders', paramsStr);
  return { ok: true, submitted: true, mode: 'live-submitted', orderId: result?.[0]?.orderId || result?.orderID || ord.clOrdID, market: preview.preview.sodexMarket, side: preview.preview.side, product: preview.preview.product, secretExposure: 'No secret returned.' };
}
