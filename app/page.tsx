'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  Activity, Bell, Bot, Briefcase, CalendarClock, ChevronRight, CircleDollarSign,
  Database, Gauge, Globe2, History, KeyRound, Layers3, LineChart, Lock,
  Newspaper, Play, RefreshCw, Search, Shield, Sparkles, TimerReset, Wallet, Zap
} from 'lucide-react';

type Coin = { id:string; symbol:string; name:string; image?:string; current_price?:number; market_cap?:number; market_cap_rank?:number; total_volume?:number; price_change_percentage_24h?:number; price_change_percentage_1h_in_currency?:number; price_change_percentage_7d_in_currency?:number; sparkline_in_7d?:{price?:number[]}; source?:string };
type Trade = { id:number; price:number; qty:number; time:number; isBuyerMaker:boolean };
type Candle = { time:number; open:number; high:number; low:number; close:number; volume:number };
type TradeTerminal = { ok:boolean; updatedAt:string; symbol:string; sources:string[]; ticker:any; orderBook:{bids:any[]; asks:any[]; source:string}; trades:Trade[]; candles:Candle[]; sodex:any; account:any };
type Live = { ok:boolean; updatedAt:string; sources:string[]; coins:Coin[]; global:any; news:any[]; sodex:any };

const nav = [
  { group:'DASHBOARD', items:[
    { id:'overview', label:'Overview', icon:Activity },
    { id:'market', label:'Market Pulse', icon:Globe2 },
    { id:'news', label:'News Feed', icon:Newspaper },
  ]},
  { group:'RESEARCH (SoSoValue)', items:[
    { id:'research', label:'Market Intelligence', icon:Bot },
    { id:'reports', label:'AI Reports', icon:Sparkles },
    { id:'signals', label:'Signals Engine', icon:Gauge },
  ]},
  { group:'TRADE (SoDEX)', items:[
    { id:'spot', label:'Spot Trading', icon:CircleDollarSign },
    { id:'futures', label:'Futures Trading', icon:Zap },
    { id:'orders', label:'Orders & Positions', icon:Briefcase },
    { id:'automation', label:'Automation', icon:CalendarClock },
  ]},
  { group:'SYSTEM', items:[
    { id:'api', label:'API Health', icon:Database },
    { id:'security', label:'Security', icon:Shield },
  ]},
];

const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','SUIUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','AAVEUSDT','UNIUSDT'];
const intervals = ['1m','5m','15m','1h','4h','1d'];

function money(n:any, compact=true){ if(n===null||n===undefined||Number.isNaN(Number(n))) return 'Unavailable'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:Number(n)>100?2:6}).format(Number(n)); }
function num(n:any){ if(n===null||n===undefined||Number.isNaN(Number(n))) return 'Unavailable'; return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(Number(n)); }
function pct(n:any){ if(n===null||n===undefined||Number.isNaN(Number(n))) return '—'; const x=Number(n); return `${x>=0?'+':''}${x.toFixed(2)}%`; }
function baseSymbol(symbol:string){ return symbol.replace('USDT','').replace('USDC',''); }
function liveLabel(){ return 'SoDEX + SoSoValue live context'; }

export default function Page(){
  const [active,setActive] = useState('futures');
  const [query,setQuery] = useState('');
  const [symbol,setSymbol] = useState('BTCUSDT');
  const [interval,setIntervalState] = useState('15m');
  const [live,setLive] = useState<Live|null>(null);
  const [terminal,setTerminal] = useState<TradeTerminal|null>(null);
  const [health,setHealth] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [wallet,setWallet] = useState<string|null>(null);
  const [paperMode,setPaperMode] = useState(true);
  const [adminSecret,setAdminSecret] = useState('');
  const [order,setOrder] = useState({ product:'futures', side:'long', orderType:'market', marginMode:'isolated', amount:'', price:'', leverage:10, takeProfit:'', stopLoss:'', timeInForce:'ioc', schedule:'off', frequency:'15m', maxNotional:'', riskGuard:'on', spotAutoClose:'off', spotCloseMin:'1', spotCloseMax:'3', futuresAutoClose:'off', futuresCloseMinutes:'15', futuresCloseMode:'time_or_tp_sl' });
  const [execResult,setExecResult] = useState<any>(null);
  const [executing,setExecuting] = useState(false);
  const [autoOn,setAutoOn] = useState(false);
  const [autoLog,setAutoLog] = useState<any[]>([]);
  const [pendingSpotCloses,setPendingSpotCloses] = useState<any[]>([]);
  const [pendingFuturesCloses,setPendingFuturesCloses] = useState<any[]>([]);
  const [aiQ,setAiQ] = useState('Analyze this BTC setup using live SoDEX order book and SoSoValue research context.');
  const [aiA,setAiA] = useState('');
  const [asking,setAsking] = useState(false);

  const serverLiveTrading = Boolean(health?.configured?.liveTrading);
  const coins = live?.coins || [];
  const news = live?.news || [];
  const signals = useMemo(()=>coins.slice(0,160).map(c=>{
    const p = Number(c.price_change_percentage_24h || 0);
    const vol = Number(c.total_volume || 0);
    const cap = Number(c.market_cap || 0);
    const liquidity = cap ? Math.min(100, Math.round((vol/cap)*1100)) : 50;
    const momentum = Math.max(0, Math.min(100, Math.round(52 + p*4)));
    const risk = cap ? Math.max(1, Math.min(100, Math.round(100 - Math.log10(cap)*7 + Math.abs(p)*2))) : 55;
    const conviction = Math.round((momentum + liquidity + (100-risk))/3);
    return {...c, momentum, liquidity, risk, conviction};
  }).sort((a:any,b:any)=>b.conviction-a.conviction),[coins]);
  const filteredCoins = useMemo(()=>coins.filter(c=>(c.symbol+c.name+c.id).toLowerCase().includes(query.toLowerCase())).slice(0,300),[coins,query]);

  async function load(){
    setLoading(true);
    try{
      const [l,t,h] = await Promise.all([
        fetch('/api/live',{cache:'no-store'}).then(r=>r.json()),
        fetch(`/api/trade?symbol=${symbol}&interval=${interval}`,{cache:'no-store'}).then(r=>r.json()),
        fetch('/api/health',{cache:'no-store'}).then(r=>r.json())
      ]);
      setLive(l); setTerminal(t); setHealth(h);
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[symbol,interval]);
  useEffect(()=>{ setOrder(o=>({...o, product: active==='spot'?'spot':active==='futures'?'futures':o.product })); },[active]);
  useEffect(()=>{ if(!autoOn || order.schedule==='off') return; const ms:any={ '1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000 }; const id=setInterval(()=>runAutomation(), ms[order.frequency]||900000); return ()=>clearInterval(id); },[autoOn,order.schedule,order.frequency,order.product,order.side,order.amount,order.price,order.leverage,symbol,paperMode,serverLiveTrading]);

  async function connect(){
    const eth=(window as any).ethereum;
    if(!eth){ alert('Install MetaMask, Rabby or OKX Wallet to connect.'); return; }
    const acc=await eth.request({method:'eth_requestAccounts'});
    setWallet(acc?.[0] || null);
  }
  async function ask(){
    setAsking(true); setAiA('');
    try{
      const context={terminal, topCoins:coins.slice(0,40), news:news.slice(0,12), signals:signals.slice(0,15)};
      const r=await fetch('/api/copilot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:aiQ, context})});
      const j=await r.json(); setAiA(j.answer || JSON.stringify(j,null,2));
    }catch(e:any){ setAiA(e.message || 'AI request failed'); } finally { setAsking(false); }
  }
  async function preview(){
    const r=await fetch('/api/execution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...order,market:symbol,action:'preview',adminSecret,connectedWallet:wallet})});
    setExecResult(await r.json());
  }
  function scheduleSpotAutoClose(openOrder:any, source:'manual'|'automation'='manual'){
    if(order.product !== 'spot' || order.spotAutoClose !== 'random') return;
    const min = Math.max(1, Number(order.spotCloseMin || 1));
    const max = Math.max(min, Number(order.spotCloseMax || 3));
    const delayMs = Math.round((min * 60 + Math.random() * ((max - min) * 60)) * 1000);
    const closeSide = order.side === 'sell' ? 'buy' : 'sell';
    const task = {
      id: `spot-close-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      dueAt: Date.now() + delayMs,
      delaySeconds: Math.round(delayMs/1000),
      market: symbol,
      side: closeSide,
      amount: order.amount,
      source,
      status: 'scheduled'
    };
    setPendingSpotCloses(x=>[task,...x].slice(0,8));
    window.setTimeout(async()=>{
      const liveIntent = !paperMode && serverLiveTrading && order.schedule === 'live';
      const closePayload = { ...order, market:symbol, product:'spot', side:closeSide, action:liveIntent?'execute':'preview', reduceOnly:true, spotAutoClose:'off', note:'auto-close generated 1-3 minutes after spot entry' };
      const r = await fetch('/api/execution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...closePayload,adminSecret,connectedWallet:wallet})});
      const j = await r.json();
      setPendingSpotCloses(x=>x.map(y=>y.id===task.id?{...y,status:'closed', result:j}:y));
      setAutoLog(x=>[{time:new Date().toLocaleTimeString(), mode:liveIntent?'live spot close':'paper spot close', result:j},...x].slice(0,10));
    }, delayMs);
  }


  function scheduleFuturesAutoClose(openOrder:any, source:'manual'|'automation'='manual'){
    if(order.product !== 'futures' || order.futuresAutoClose !== 'time') return;
    const minutes = Math.max(1, Math.min(240, Number(order.futuresCloseMinutes || 15)));
    const delayMs = Math.round(minutes * 60 * 1000);
    const closeSide = order.side === 'short' ? 'long' : 'short';
    const task = {
      id: `futures-close-${Date.now()}-${Math.floor(Math.random()*9999)}`,
      dueAt: Date.now() + delayMs,
      delaySeconds: Math.round(delayMs/1000),
      market: symbol,
      side: closeSide,
      amount: order.amount,
      source,
      status: 'scheduled',
      reduceOnly: true
    };
    setPendingFuturesCloses(x=>[task,...x].slice(0,8));
    window.setTimeout(async()=>{
      const liveIntent = !paperMode && serverLiveTrading && order.schedule === 'live';
      const closePayload = { ...order, market:symbol, product:'futures', side:closeSide, action:liveIntent?'execute':'preview', reduceOnly:true, futuresAutoClose:'off', note:'time-based futures auto-close generated by QuyNhon AI risk engine' };
      try{
        const r = await fetch('/api/execution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...closePayload,adminSecret,connectedWallet:wallet})});
        const j = await r.json();
        setPendingFuturesCloses(x=>x.map(item=>item.id===task.id?{...item,status:'closed',result:j}:item));
        setAutoLog(x=>[{time:new Date().toLocaleTimeString(), mode:liveIntent?'live futures auto-close':'paper futures auto-close', result:j},...x].slice(0,10));
      }catch(e:any){
        setPendingFuturesCloses(x=>x.map(item=>item.id===task.id?{...item,status:'failed',error:e?.message}:item));
      }
    }, delayMs);
  }

  async function execute(){
    const liveIntent = !paperMode && serverLiveTrading;
    if(liveIntent && !confirm('Live Trading is enabled. Submit this order to SoDEX now?')) return;
    setExecuting(true);
    try{
      const r=await fetch('/api/execution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...order,market:symbol,action:liveIntent?'execute':'preview',adminSecret,connectedWallet:wallet})});
      const j = await r.json();
      setExecResult(j);
      scheduleSpotAutoClose(j, 'manual');
      scheduleFuturesAutoClose(j, 'manual');
    } finally { setExecuting(false); }
  }
  async function runAutomation(){
    const liveIntent = !paperMode && serverLiveTrading && order.schedule==='live';
    const r=await fetch('/api/automation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...order,market:symbol,action:liveIntent?'execute':'preview',adminSecret,connectedWallet:wallet})});
    const j=await r.json(); setExecResult(j); setAutoLog(x=>[{time:new Date().toLocaleTimeString(), mode:liveIntent?'live':'paper', result:j},...x].slice(0,10));
    scheduleSpotAutoClose(j, 'automation');
    scheduleFuturesAutoClose(j, 'automation');
  }

  if(loading) return <div className="min-h-screen bg-[#05070d] grid place-items-center text-white"><div className="text-center"><div className="h-20 w-20 mx-auto rounded-full border-4 border-cyan-400/20 border-t-cyan-300 animate-spin"/><h1 className="mt-6 text-3xl font-black">Launching QuyNhon AI Trading OS</h1><p className="text-slate-400 mt-2">Loading SoDEX terminal, SoSoValue research and live market context.</p></div></div>;

  return <main className="min-h-screen bg-[#05070d] grid-bg text-slate-100 overflow-x-hidden">
    <aside className="fixed inset-y-0 left-0 w-[250px] bg-[#070b15]/95 border-r border-slate-800 p-4 overflow-y-auto z-30">
      <div className="flex items-center gap-3 mb-7"><div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-600 grid place-items-center shadow-3d text-2xl">◆</div><div><h1 className="text-2xl font-black">QuyNhon AI</h1><p className="text-xs text-cyan-100/60">AI Finance OS</p></div></div>
      {nav.map(section=><section key={section.group} className="mb-5"><p className="text-[11px] uppercase text-violet-300/80 mb-2 tracking-widest">{section.group}</p>{section.items.map((m:any)=>{const I=m.icon; return <button key={m.id} onClick={()=>setActive(m.id)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 transition text-left ${active===m.id?'bg-violet-600/60 glow':'hover:bg-slate-800/70'}`}><I size={16}/><span className="font-semibold text-sm">{m.label}</span></button>})}</section>)}
      <div className="glass rounded-2xl p-4 mt-4"><b className="flex gap-2 items-center"><Wallet size={17}/>{wallet?'Wallet Connected':'No Wallet Connected'}</b><p className="text-xs text-slate-400 mt-2 break-all">{wallet || 'Connect wallet to unlock SoDEX account-linked panels.'}</p></div>
      <div className="mt-8 text-xs text-slate-500">QuyNhon AI OS v4.0<br/>Powered by SoSoValue + SoDEX</div>
    </aside>

    <section className="pl-[250px] min-h-screen">
      <header className="sticky top-0 z-20 bg-[#050b16]/92 backdrop-blur-xl border-b border-slate-800">
        <div className="h-[72px] px-5 flex items-center gap-4">
          <div className="flex-1 relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-2xl bg-[#091122] border border-slate-800 py-3 pl-12 pr-4 outline-none focus:border-violet-500" placeholder="Search coins, modules, markets..."/></div>
          <div className="hidden xl:flex items-center gap-2 text-sm"><span>Powered by</span><b className="text-violet-300">SoSoValue Research</b><span>×</span><b className="text-cyan-300">SoDEX Trading API</b></div>
          <div className="pill rounded-2xl px-4 py-2 text-sm"><span className="live-dot mr-2"/>API Status</div>
          <button onClick={load} className="pill rounded-2xl px-4 py-3"><RefreshCw size={18}/></button>
          <button onClick={connect} className="pill rounded-2xl px-4 py-3 font-bold">{wallet?`${wallet.slice(0,6)}...${wallet.slice(-4)}`:'Connect Wallet'}</button>
        </div>
        <Ticker coins={coins} symbol={symbol} setSymbol={setSymbol}/>
      </header>

      <div className="p-5">
        {(active==='spot'||active==='futures'||active==='overview') && <TradingLayout active={active} terminal={terminal} coins={coins} news={news} signals={signals} symbol={symbol} setSymbol={setSymbol} interval={interval} setIntervalState={setIntervalState} order={order} setOrder={setOrder} paperMode={paperMode} setPaperMode={setPaperMode} serverLiveTrading={serverLiveTrading} preview={preview} execute={execute} executing={executing} execResult={execResult} pendingSpotCloses={pendingSpotCloses} pendingFuturesCloses={pendingFuturesCloses} adminSecret={adminSecret} setAdminSecret={setAdminSecret} wallet={wallet}/>} 
        {active==='market' && <MarketPulse coins={filteredCoins.length?filteredCoins:coins} signals={signals}/>} 
        {active==='news' && <NewsFeed news={news}/>} 
        {active==='research' && <MarketIntelligence coins={coins} news={news} terminal={terminal} signals={signals}/>} 
        {active==='reports' && <AIReports aiQ={aiQ} setAiQ={setAiQ} ask={ask} asking={asking} aiA={aiA} news={news} signals={signals}/>} 
        {active==='signals' && <SignalEngine signals={signals}/>} 
        {active==='orders' && <OrdersPositions terminal={terminal} execResult={execResult} pendingSpotCloses={pendingSpotCloses} pendingFuturesCloses={pendingFuturesCloses} adminSecret={adminSecret} setAdminSecret={setAdminSecret} wallet={wallet}/>} 
        {active==='portfolio' && <Portfolio wallet={wallet} terminal={terminal}/>} 
        {active==='automation' && <Automation order={order} setOrder={setOrder} autoOn={autoOn} setAutoOn={setAutoOn} runAutomation={runAutomation} autoLog={autoLog} paperMode={paperMode} serverLiveTrading={serverLiveTrading}/>} 
        {active==='api' && <ApiHealth health={health}/>} 
        {active==='security' && <SecurityPanel serverLiveTrading={serverLiveTrading}/>} 
      </div>
    </section>
  </main>;
}

function Ticker({coins,symbol,setSymbol}:any){
  const top = ['BTC','ETH','SOL','BNB','SUI','XRP'].map(s=>coins.find((c:Coin)=>c.symbol?.toUpperCase()===s)).filter(Boolean);
  return <div className="h-[54px] px-5 border-t border-slate-900 overflow-x-auto flex gap-3 items-center">{top.map((c:Coin)=><button key={c.id} onClick={()=>setSymbol(`${c.symbol.toUpperCase()}USDT`)} className={`min-w-[190px] rounded-xl px-4 py-2 text-left bg-slate-900/70 border ${symbol.startsWith(c.symbol.toUpperCase())?'border-violet-500':'border-slate-800'}`}><div className="flex items-center gap-2"><img src={c.image||''} className="h-7 w-7 rounded-full"/><b>{c.symbol.toUpperCase()}USDT</b><span className={Number(c.price_change_percentage_24h)>=0?'ml-auto text-emerald-300':'ml-auto text-rose-300'}>{pct(c.price_change_percentage_24h)}</span></div><p className="text-xs text-slate-400">24h Vol {money(c.total_volume)}</p></button>)}</div>;
}
function Card({children,className=''}:any){ return <div className={`glass rounded-2xl p-4 ${className}`}>{children}</div>; }
function Empty({title,text}:any){ return <div className="no-data rounded-2xl p-8 text-center"><h3 className="text-xl font-black text-white">{title}</h3><p className="mt-2 text-slate-400">{text}</p></div>; }
function MiniChart({data,height=330}:any){ const d=(data||[]).map((x:Candle)=>({...x, label:new Date(x.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})})); if(!d.length) return <Empty title="No live candles" text="Provider did not return chart data."/>; return <ResponsiveContainer width="100%" height={height}><ComposedChart data={d}><CartesianGrid stroke="#18233b"/><XAxis dataKey="label" stroke="#71809f" minTickGap={28}/><YAxis stroke="#71809f" domain={['auto','auto']}/><Tooltip contentStyle={{background:'#091122',border:'1px solid #283b65'}}/><Area type="monotone" dataKey="close" stroke="#20e0a4" fill="#0f766e55" strokeWidth={2}/><Bar dataKey="volume" fill="#334155" yAxisId="vol" opacity={0.35}/><YAxis yAxisId="vol" hide/></ComposedChart></ResponsiveContainer>; }
function TradingLayout(props:any){ const {active,terminal,coins,news,signals,symbol,setSymbol,interval,setIntervalState,order,setOrder,paperMode,setPaperMode,serverLiveTrading,preview,execute,executing,execResult,pendingSpotCloses,pendingFuturesCloses,adminSecret,setAdminSecret,wallet}=props; const base=baseSymbol(symbol); const mid=Number(terminal?.ticker?.price||0); return <div className="grid grid-cols-12 gap-4">
  <div className="col-span-12 flex flex-wrap gap-3 items-center"><div><h2 className="text-3xl font-black text-gradient">{symbol} {order.product==='futures'?'Perpetual':'Spot'} <span className="text-emerald-300 text-2xl">{money(mid,false)}</span></h2><p className="text-sm text-slate-400">{liveLabel()} · Updated {terminal?.updatedAt?new Date(terminal.updatedAt).toLocaleTimeString():'Unavailable'}</p></div><select value={symbol} onChange={e=>setSymbol(e.target.value)} className="input !w-[170px] !mb-0 ml-auto">{symbols.map(s=><option key={s}>{s}</option>)}</select>{intervals.map(i=><button key={i} onClick={()=>setIntervalState(i)} className={`rounded-xl px-3 py-2 text-sm ${interval===i?'bg-violet-600':'pill'}`}>{i}</button>)}</div>
  <Card className="col-span-12 xl:col-span-7 min-h-[470px]"><div className="flex justify-between mb-3"><h3 className="text-xl font-black flex gap-2"><LineChart/>Live Chart</h3><div className="flex gap-3 text-sm"><span>High {money(terminal?.ticker?.high,false)}</span><span>Low {money(terminal?.ticker?.low,false)}</span><span className={Number(terminal?.ticker?.change)>=0?'text-emerald-300':'text-rose-300'}>{pct(terminal?.ticker?.change)}</span></div></div><MiniChart data={terminal?.candles} height={395}/></Card>
  <Card className="col-span-12 xl:col-span-2"><h3 className="text-xl font-black mb-3">Order Book</h3><Book asks={(terminal?.orderBook?.asks||[]).slice(0,12).reverse()} bids={(terminal?.orderBook?.bids||[]).slice(0,12)} mid={mid}/></Card>
  <TradeTicket className="col-span-12 xl:col-span-3" order={order} setOrder={setOrder} base={base} mid={mid} paperMode={paperMode} setPaperMode={setPaperMode} serverLiveTrading={serverLiveTrading} preview={preview} execute={execute} executing={executing} execResult={execResult} pendingSpotCloses={pendingSpotCloses} pendingFuturesCloses={pendingFuturesCloses} adminSecret={adminSecret} setAdminSecret={setAdminSecret} wallet={wallet}/>
  <Card className="col-span-12 xl:col-span-4"><h3 className="text-xl font-black mb-3">Positions</h3><Positions data={terminal?.account?.positions}/></Card>
  <Card className="col-span-12 xl:col-span-3"><h3 className="text-xl font-black mb-3">AI Signals</h3>{signals.slice(0,5).map((s:any)=><SignalRow key={s.id} s={s}/>)}</Card>
  <Card className="col-span-12 xl:col-span-2"><h3 className="text-xl font-black mb-3">Market Trades</h3><Trades data={(terminal?.trades||[]).slice(0,12)}/></Card>
  <Card className="col-span-12 xl:col-span-3"><h3 className="text-xl font-black mb-3">Account Summary</h3><AccountSummary account={terminal?.account}/></Card>
  <Card className="col-span-12"><h3 className="text-xl font-black mb-3">SoSoValue News & Insights</h3><div className="grid md:grid-cols-4 gap-4">{news.length?news.slice(0,4).map((n:any,i:number)=><div key={i} className="pill rounded-2xl p-4"><span className="text-xs text-cyan-300">RESEARCH</span><h4 className="font-black mt-2">{n.title||n.newsTitle||n.content||'Live research item'}</h4><p className="text-xs text-slate-400 mt-2">SoSoValue live feed</p></div>):<Empty title="No live news" text="SoSoValue returned no news items."/>}</div></Card>
 </div> }
function Book({asks,bids,mid}:any){ return <div className="text-sm"><div className="grid grid-cols-3 text-xs text-slate-500 mb-2"><span>Price</span><span className="text-right">Size</span><span className="text-right">Total</span></div>{asks.map((r:any,i:number)=><BookRow key={'a'+i} r={r} ask/>)}<div className="py-3 text-emerald-300 text-2xl font-black">{money(mid,false)} ↑</div>{bids.map((r:any,i:number)=><BookRow key={'b'+i} r={r}/>)}</div> }
function BookRow({r,ask}:any){ return <div className="grid grid-cols-3 py-1 border-b border-slate-900"><span className={ask?'text-rose-300':'text-emerald-300'}>{Number(r.price).toLocaleString()}</span><span className="text-right">{num(r.amount)}</span><span className="text-right text-slate-300">{num(r.total)}</span></div> }
function TradeTicket({className,order,setOrder,base,mid,paperMode,setPaperMode,serverLiveTrading,preview,execute,executing,execResult,pendingSpotCloses,pendingFuturesCloses,adminSecret,setAdminSecret,wallet}:any){ const product=order.product; return <Card className={`${className} sticky top-[140px] self-start`}><div className="flex justify-between items-center"><h3 className="text-xl font-black">Trade Ticket</h3><Shield size={18}/></div><div className="mt-4 rounded-2xl bg-slate-950/70 p-2 flex items-center gap-2"><button onClick={()=>setPaperMode(true)} className={`flex-1 rounded-xl py-2 font-bold ${paperMode?'bg-violet-600':'bg-transparent'}`}>Paper Mode</button><button onClick={()=>{if(serverLiveTrading)setPaperMode(false)}} className={`flex-1 rounded-xl py-2 font-bold ${!paperMode?'bg-emerald-600':'bg-transparent opacity-70'}`}>Live Trading</button></div>{!serverLiveTrading && <p className="mt-2 text-xs text-amber-300">Live trading locked by server ENV.</p>}<div className="grid grid-cols-2 gap-2 mt-4"><button onClick={()=>setOrder({...order,product:'spot',side:'buy',leverage:1})} className={`rounded-xl py-2 ${product==='spot'?'bg-cyan-700':'pill'}`}>Spot</button><button onClick={()=>setOrder({...order,product:'futures',side:'long'})} className={`rounded-xl py-2 ${product==='futures'?'bg-violet-700':'pill'}`}>Futures</button></div><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>setOrder({...order,side:product==='futures'?'long':'buy'})} className="rounded-xl bg-emerald-600 py-3 font-black">{product==='futures'?'Long':'Buy'}</button><button onClick={()=>setOrder({...order,side:product==='futures'?'short':'sell'})} className="rounded-xl bg-slate-950 border border-slate-700 py-3 font-black">{product==='futures'?'Short':'Sell'}</button></div><label className="label">Order Type</label><select value={order.orderType} onChange={e=>setOrder({...order,orderType:e.target.value})} className="input"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="twap">TWAP</option></select><label className="label">Size</label><div className="relative"><input value={order.amount} onChange={e=>setOrder({...order,amount:e.target.value})} className="input pr-16" placeholder="0.00"/><span className="absolute right-4 top-3 text-slate-400">{base}</span></div><div className="grid grid-cols-4 gap-2 mb-3">{['25%','50%','75%','100%'].map(x=><button key={x} className="pill rounded-xl py-2 text-xs">{x}</button>)}</div>{order.orderType!=='market'&&<><label className="label">Limit Price</label><input value={order.price} onChange={e=>setOrder({...order,price:e.target.value})} className="input" placeholder={String(mid||'')}/></>}{product==='spot'&&<div className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-3"><div className="flex items-center justify-between gap-3"><div><b>Spot Auto Close</b><p className="text-xs text-slate-400">Randomly closes the spot position after 1–3 minutes. Uses opposite side and the same size.</p></div><button onClick={()=>setOrder({...order,spotAutoClose:order.spotAutoClose==='random'?'off':'random'})} className={`rounded-xl px-3 py-2 text-xs font-black ${order.spotAutoClose==='random'?'bg-cyan-600':'bg-slate-800'}`}>{order.spotAutoClose==='random'?'ON':'OFF'}</button></div>{order.spotAutoClose==='random'&&<div className="grid grid-cols-2 gap-2 mt-3"><input value={order.spotCloseMin} onChange={e=>setOrder({...order,spotCloseMin:e.target.value})} className="input" placeholder="Min minutes"/><input value={order.spotCloseMax} onChange={e=>setOrder({...order,spotCloseMax:e.target.value})} className="input" placeholder="Max minutes"/></div>}</div>}{product==='futures'&&<><label className="label">Leverage {order.leverage}x</label><input type="range" min="1" max="100" value={order.leverage} onChange={e=>setOrder({...order,leverage:Number(e.target.value)})} className="w-full accent-violet-500"/><div className="grid grid-cols-2 gap-2 mt-3"><select value={order.marginMode} onChange={e=>setOrder({...order,marginMode:e.target.value})} className="input"><option value="isolated">Isolated</option><option value="cross">Cross</option></select><select value={order.timeInForce} onChange={e=>setOrder({...order,timeInForce:e.target.value})} className="input"><option value="ioc">IOC</option><option value="post_only">Post Only</option><option value="gtc">GTC</option></select></div><div className="mt-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3"><div className="flex items-center justify-between gap-3"><div><b>Futures Auto Close</b><p className="text-xs text-slate-400">Close the position with a reduce-only opposite order after a fixed time. TP/SL values are included in the risk plan.</p></div><button onClick={()=>setOrder({...order,futuresAutoClose:order.futuresAutoClose==='time'?'off':'time'})} className={`rounded-xl px-3 py-2 text-xs font-black ${order.futuresAutoClose==='time'?'bg-violet-600':'bg-slate-800'}`}>{order.futuresAutoClose==='time'?'ON':'OFF'}</button></div>{order.futuresAutoClose==='time'&&<div className="grid grid-cols-2 gap-2 mt-3"><input value={order.futuresCloseMinutes} onChange={e=>setOrder({...order,futuresCloseMinutes:e.target.value})} className="input" placeholder="Close after minutes"/><select value={order.futuresCloseMode} onChange={e=>setOrder({...order,futuresCloseMode:e.target.value})} className="input"><option value="time_or_tp_sl">Time + TP/SL guard</option><option value="time_only">Time only</option></select></div>}</div></>}<label className="label">TP / Take Profit</label><input value={order.takeProfit} onChange={e=>setOrder({...order,takeProfit:e.target.value})} className="input" placeholder="optional"/><label className="label">SL / Stop Loss</label><input value={order.stopLoss} onChange={e=>setOrder({...order,stopLoss:e.target.value})} className="input" placeholder="optional"/><label className="label">Admin Unlock</label><input type="password" value={adminSecret} onChange={e=>setAdminSecret(e.target.value)} className="input" placeholder="ADMIN_SECRET for live trading" autoComplete="off"/><p className="mt-1 text-[11px] text-slate-400">Live requires: server ENABLE_LIVE_TRADING=true + ADMIN_SECRET + connected ADMIN_WALLET. Connected: {wallet?`${wallet.slice(0,6)}...${wallet.slice(-4)}`:'none'}</p><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={preview} className="rounded-2xl bg-violet-600 py-3 font-black">Preview</button><button onClick={execute} disabled={executing} className="rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 py-3 font-black">{executing?'Submitting...':'Execute'}</button></div><div className="mt-4 no-data rounded-2xl p-3 text-xs">{paperMode?'Paper Mode is active. No real funds will be used.':serverLiveTrading?'Live Trading armed. Confirm carefully.':'Live mode unavailable.'}</div>{pendingSpotCloses?.length>0&&<div className="mt-3 no-data rounded-2xl p-3 text-xs"><b>Pending Spot Auto Close</b>{pendingSpotCloses.map((x:any)=><div key={x.id} className="mt-2 flex justify-between gap-2"><span>{x.market} {x.side} {x.amount}</span><span className={x.status==='closed'?'text-emerald-300':'text-cyan-300'}>{x.status==='closed'?'closed':`in ${x.delaySeconds}s`}</span></div>)}</div>}{pendingFuturesCloses?.length>0&&<div className="mt-3 no-data rounded-2xl p-3 text-xs"><b>Pending Futures Auto Close</b>{pendingFuturesCloses.map((x:any)=><div key={x.id} className="mt-2 flex justify-between gap-2"><span>{x.market} {x.side} {x.amount} reduce-only</span><span className={x.status==='closed'?'text-emerald-300':x.status==='failed'?'text-rose-300':'text-violet-300'}>{x.status==='closed'?'closed':x.status==='failed'?'failed':`in ${x.delaySeconds}s`}</span></div>)}</div>}{execResult&&<pre className="mt-3 no-data rounded-2xl p-3 text-[11px] max-h-52 overflow-auto">{JSON.stringify(execResult,null,2)}</pre>}</Card> }
function Positions({data}:any){ const arr=Array.isArray(data)?data:[]; if(!arr.length) return <Empty title="No live positions" text="SoDEX account returned no position data."/>; return <div>{arr.slice(0,6).map((p:any,i:number)=><div key={i} className="grid grid-cols-5 py-2 border-b border-slate-800 text-sm"><b>{p.symbol||p.market||'Position'}</b><span>{num(p.size||p.quantity)}</span><span>{money(p.entryPrice||p.entry_price,false)}</span><span>{money(p.markPrice||p.mark_price,false)}</span><span className="text-emerald-300">{money(p.pnl||p.unrealizedPnl,false)}</span></div>)}</div> }
function Trades({data}:any){ if(!data?.length) return <Empty title="No trades" text="No live trades returned."/>; return <div className="max-h-[300px] overflow-auto">{data.map((t:Trade)=><div key={t.id} className="grid grid-cols-3 text-sm py-1 border-b border-slate-900"><span className={t.isBuyerMaker?'text-rose-300':'text-emerald-300'}>{money(t.price,false)}</span><span className="text-right">{num(t.qty)}</span><span className="text-right text-slate-500">{new Date(t.time).toLocaleTimeString()}</span></div>)}</div> }
function SignalRow({s}:any){ return <div className="flex items-center gap-3 py-2 border-b border-slate-800"><img src={s.image||''} className="h-8 w-8 rounded-full"/><div className="flex-1"><b>{s.symbol?.toUpperCase()}</b><p className="text-xs text-slate-400">Momentum {s.momentum ?? '—'} · Risk {s.risk ?? '—'}</p></div><span className="h-9 w-9 rounded-full bg-emerald-500/20 text-emerald-300 grid place-items-center text-sm font-black">{s.conviction}</span></div> }
function AccountSummary({account}:any){ const balances=account?.balances||[]; return <div><MetricTiny label="Connection" value={account?.source==='SoDEX'?'SoDEX connected':'Unavailable'}/><MetricTiny label="Balances" value={Array.isArray(balances)?balances.length:'—'}/><MetricTiny label="Positions" value={Array.isArray(account?.positions)?account.positions.length:'—'}/><MetricTiny label="Open Orders" value={Array.isArray(account?.orders)?account.orders.length:'—'}/></div> }
function MetricTiny({label,value}:any){ return <div className="flex justify-between py-2 border-b border-slate-800"><span className="text-slate-400">{label}</span><b>{value}</b></div> }
function Metric({label,value}:any){ return <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-3 mb-3"><p className="text-xs uppercase tracking-widest text-slate-400">{label}</p><b className="text-lg text-cyan-100">{value}</b></div> }
function MarketPulse({coins,signals}:any){ return <div className="grid grid-cols-12 gap-4"><CoinTable coins={coins} title="Coin Universe · Real Icons"/><Card className="col-span-12"><h3 className="text-xl font-black mb-4">Momentum Heatmap</h3><div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">{signals.slice(0,32).map((s:any)=><div key={s.id} className="holo-card rounded-2xl p-3"><img src={s.image||''} className="h-7 w-7 rounded-full"/><b>{s.symbol?.toUpperCase()}</b><p className={Number(s.price_change_percentage_24h)>=0?'text-emerald-300':'text-rose-300'}>{pct(s.price_change_percentage_24h)}</p></div>)}</div></Card></div> }
function CoinTable({coins,title}:any){ return <Card className="col-span-12"><div className="flex justify-between mb-4"><h3 className="text-xl font-black">{title}</h3><span className="pill rounded-full px-3 py-1 text-sm">{coins.length} assets</span></div><div className="max-h-[650px] overflow-auto"><table className="w-full text-sm"><thead className="text-slate-400 sticky top-0 bg-[#0a1120]"><tr><th className="p-3 text-left">Asset</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">24h</th><th className="p-3 text-right">Volume</th><th className="p-3 text-right">Market Cap</th></tr></thead><tbody>{coins.map((c:Coin)=><tr key={c.id} className="border-t border-slate-800 hover:bg-slate-800/40"><td className="p-3"><div className="flex gap-3 items-center"><img src={c.image||''} className="h-8 w-8 rounded-full"/><div><b>{c.symbol?.toUpperCase()}</b><p className="text-xs text-slate-400">{c.name}</p></div></div></td><td className="p-3 text-right font-bold">{money(c.current_price,false)}</td><td className={`p-3 text-right ${Number(c.price_change_percentage_24h)>=0?'text-emerald-300':'text-rose-300'}`}>{pct(c.price_change_percentage_24h)}</td><td className="p-3 text-right">{money(c.total_volume)}</td><td className="p-3 text-right">{money(c.market_cap)}</td></tr>)}</tbody></table></div></Card> }
function NewsFeed({news}:any){ return <Card><h3 className="text-xl font-black mb-4">SoSoValue News Feed</h3>{news.length?news.map((n:any,i:number)=><div key={i} className="py-4 border-b border-slate-800"><span className="text-xs text-violet-300">LIVE RESEARCH</span><h4 className="font-black text-lg">{n.title||n.newsTitle||n.content||'Live research item'}</h4><p className="text-sm text-slate-400 mt-1">SoSoValue</p></div>):<Empty title="No live news" text="SoSoValue returned no current feed."/>}</Card> }
function MarketIntelligence({coins,news,terminal,signals}:any){
  const top = (coins||[]).slice(0,8);
  const gainers = [...(coins||[])].sort((a:any,b:any)=>Number(b.price_change_percentage_24h||0)-Number(a.price_change_percentage_24h||0)).slice(0,8);
  const losers = [...(coins||[])].sort((a:any,b:any)=>Number(a.price_change_percentage_24h||0)-Number(b.price_change_percentage_24h||0)).slice(0,8);
  const bids = terminal?.orderBook?.bids || [];
  const asks = terminal?.orderBook?.asks || [];
  const bidLiquidity = bids.slice(0,15).reduce((a:number,b:any)=>a+Number(b.total||0),0);
  const askLiquidity = asks.slice(0,15).reduce((a:number,b:any)=>a+Number(b.total||0),0);
  const imbalance = bidLiquidity+askLiquidity>0 ? ((bidLiquidity-askLiquidity)/(bidLiquidity+askLiquidity))*100 : null;
  return <div className="grid grid-cols-12 gap-4">
    <Card className="col-span-12 xl:col-span-3"><h3 className="text-xl font-black mb-3">Market Pulse</h3><Metric label="Assets Loaded" value={String((coins||[]).length)}/><Metric label="Top Signal" value={signals?.[0]?.symbol?.toUpperCase() || 'Unavailable'}/><Metric label="Order Book Bias" value={imbalance===null?'Unavailable':`${imbalance>=0?'Bid':'Ask'} ${Math.abs(imbalance).toFixed(1)}%`}/><Metric label="Live News" value={String((news||[]).length)}/></Card>
    <Card className="col-span-12 xl:col-span-5"><h3 className="text-xl font-black mb-3">Top Market Assets</h3>{top.map((c:any)=><div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-800"><div className="flex items-center gap-3"><img src={c.image||''} className="h-8 w-8 rounded-full"/><div><b>{c.symbol?.toUpperCase()}</b><p className="text-xs text-slate-400">{c.name}</p></div></div><div className="text-right"><b>{money(c.current_price,false)}</b><p className={Number(c.price_change_percentage_24h)>=0?'text-emerald-300':'text-rose-300'}>{pct(c.price_change_percentage_24h)}</p></div></div>)}</Card>
    <Card className="col-span-12 xl:col-span-4"><h3 className="text-xl font-black mb-3">SoSoValue Research Stream</h3>{news?.length?news.slice(0,6).map((n:any,i:number)=><div key={i} className="py-3 border-b border-slate-800"><span className="text-xs text-violet-300">LIVE RESEARCH</span><h4 className="font-black">{n.title||n.newsTitle||n.content||'Live research item'}</h4></div>):<Empty title="No live research" text="SoSoValue returned no feed for this request."/>}</Card>
    <Card className="col-span-12 xl:col-span-6"><h3 className="text-xl font-black mb-3">Top Gainers</h3>{gainers.map((c:any)=><SignalRow key={c.id} s={{...c, conviction: Math.round(50+Number(c.price_change_percentage_24h||0)*2), change24h:c.price_change_percentage_24h}} />)}</Card>
    <Card className="col-span-12 xl:col-span-6"><h3 className="text-xl font-black mb-3">Risk Watchlist</h3>{losers.map((c:any)=><SignalRow key={c.id} s={{...c, conviction: Math.round(50+Math.abs(Number(c.price_change_percentage_24h||0))*2), change24h:c.price_change_percentage_24h}} />)}</Card>
  </div>
}
function AIReports({aiQ,setAiQ,ask,asking,aiA,news,signals}:any){ return <div className="grid grid-cols-12 gap-4"><Card className="col-span-12 xl:col-span-5"><h3 className="text-xl font-black mb-3">AI Report Generator</h3><p className="text-sm text-slate-400 mb-3">Generates a report using live SoSoValue research, SoDEX order book context, market signals and your prompt.</p><select className="input mb-3" onChange={e=>setAiQ(e.target.value)}><option value="Analyze this BTC setup using live SoDEX order book and SoSoValue research context.">BTC Trade Setup</option><option value="Create a daily market summary using live SoSoValue news and top market movers.">Daily Market Summary</option><option value="Review current futures risk using live liquidity, momentum and order book context.">Futures Risk Review</option><option value="Summarize SoSoValue news and extract actionable market catalysts.">SoSoValue News Summary</option></select><textarea value={aiQ} onChange={e=>setAiQ(e.target.value)} className="input h-36"/><button onClick={ask} className="rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-3 font-black">{asking?'Analyzing live context...':'Generate AI Report'}</button><pre className="no-data rounded-2xl p-4 mt-4 whitespace-pre-wrap max-h-[480px] overflow-auto">{aiA||'AI router receives live market, order book, signals and SoSoValue context only.'}</pre></Card><Card className="col-span-12 xl:col-span-7"><h3 className="text-xl font-black mb-3">Report Context</h3><div className="grid md:grid-cols-3 gap-3 mb-4"><Metric label="Research Items" value={String(news?.length||0)}/><Metric label="Signal Candidates" value={String(signals?.length||0)}/><Metric label="AI Provider" value="ChainOpera Router"/></div><h4 className="font-black text-violet-200 mb-2">Latest SoSoValue Headlines</h4>{news?.slice(0,7).map((n:any,i:number)=><div key={i} className="py-3 border-b border-slate-800"><h4 className="font-black">{n.title||n.newsTitle||n.content||'Live research item'}</h4><p className="text-sm text-slate-400">SoSoValue</p></div>)}</Card></div> }
function SignalEngine({signals}:any){ return <div className="grid grid-cols-12 gap-4"><Card className="col-span-12 xl:col-span-4"><h3 className="text-xl font-black mb-3">Conviction Ranking</h3>{signals.slice(0,24).map((s:any)=><SignalRow key={s.id} s={s}/>)}</Card><Card className="col-span-12 xl:col-span-8"><ResponsiveContainer height={620}><BarChart data={signals.slice(0,40)}><XAxis dataKey="symbol"/><YAxis/><Tooltip contentStyle={{background:'#091122',border:'1px solid #263759'}}/><Bar dataKey="momentum" fill="#22c55e"/><Bar dataKey="liquidity" fill="#06b6d4"/><Bar dataKey="risk" fill="#8b5cf6"/></BarChart></ResponsiveContainer></Card></div> }
function OrdersPositions({terminal,execResult}:any){ return <div className="grid grid-cols-12 gap-4"><Card className="col-span-12 xl:col-span-6"><h3 className="text-xl font-black mb-3">Positions</h3><Positions data={terminal?.account?.positions}/></Card><Card className="col-span-12 xl:col-span-6"><h3 className="text-xl font-black mb-3">Open Orders</h3><Positions data={terminal?.account?.orders}/></Card><Card className="col-span-12"><h3 className="text-xl font-black mb-3">Latest Execution Response</h3><pre className="no-data rounded-2xl p-4 whitespace-pre-wrap">{JSON.stringify(execResult||{status:'No execution preview yet'},null,2)}</pre></Card></div> }
function Portfolio({wallet,terminal}:any){ if(!wallet) return <Empty title="Connect wallet" text="No portfolio or account details are shown until a real wallet is connected."/>; return <div className="grid grid-cols-12 gap-4"><Card className="col-span-12"><h3 className="text-xl font-black">Connected Wallet</h3><p className="break-all text-cyan-200 mt-2">{wallet}</p></Card><Card className="col-span-12"><h3 className="text-xl font-black mb-3">SoDEX Account</h3><pre className="no-data rounded-2xl p-4 max-h-[500px] overflow-auto">{JSON.stringify(terminal?.account||{},null,2)}</pre></Card></div> }
function Automation({order,setOrder,autoOn,setAutoOn,runAutomation,autoLog,paperMode,serverLiveTrading}:any){ return <Card><h3 className="text-2xl font-black flex gap-2"><CalendarClock/>Automation Center</h3><p className="text-slate-400 mt-2">Run scheduled server previews from the browser; live execution requires Vercel ENV and Live Mode.</p><div className="grid md:grid-cols-6 gap-3 mt-5"><select value={order.schedule} onChange={e=>setOrder({...order,schedule:e.target.value})} className="input"><option value="off">Manual only</option><option value="preview">Auto Preview</option><option value="live">Auto Live if enabled</option></select><select value={order.frequency} onChange={e=>setOrder({...order,frequency:e.target.value})} className="input"><option>1m</option><option>5m</option><option>15m</option><option>1h</option><option>4h</option></select><input value={order.maxNotional} onChange={e=>setOrder({...order,maxNotional:e.target.value})} className="input" placeholder="Max notional"/><select value={order.spotAutoClose} onChange={e=>setOrder({...order,spotAutoClose:e.target.value})} className="input"><option value="off">No spot close</option><option value="random">Spot close 1-3m</option></select><select value={order.futuresAutoClose} onChange={e=>setOrder({...order,futuresAutoClose:e.target.value})} className="input"><option value="off">No futures close</option><option value="time">Futures time close</option></select><button onClick={()=>setAutoOn(!autoOn)} className={`rounded-2xl px-4 font-bold ${autoOn?'bg-rose-600':'bg-emerald-600'}`}>{autoOn?'Stop Auto':'Start Auto'}</button><button onClick={runAutomation} className="rounded-2xl bg-slate-800 px-4 font-bold">Run Now</button><div className="pill rounded-2xl p-3 text-sm">{paperMode?'Paper':'Live'} · {serverLiveTrading?'Server live enabled':'Server live locked'}</div></div><div className="mt-5 grid md:grid-cols-2 gap-3">{autoLog.map((x:any,i:number)=><pre key={i} className="no-data rounded-2xl p-3 text-[11px] max-h-52 overflow-auto">{x.time} · {x.mode}\n{JSON.stringify(x.result,null,2).slice(0,900)}</pre>)}</div></Card> }
function ApiHealth({health}:any){ return <Card><h3 className="text-xl font-black mb-3">API Health</h3><pre className="no-data rounded-2xl p-5 whitespace-pre-wrap">{JSON.stringify(health||{status:'loading'},null,2)}</pre></Card> }
function SecurityPanel({serverLiveTrading}:any){ return <div className="grid md:grid-cols-3 gap-4"><Card><KeyRound/><h3 className="text-xl font-black mt-3">Private Keys</h3><p className="text-slate-400 mt-2">Keys stay in Vercel Environment Variables and are never returned to browser responses.</p></Card><Card><Lock/><h3 className="text-xl font-black mt-3">Execution Gate</h3><p className="text-slate-400 mt-2">Live execution status: <b className={serverLiveTrading?'text-emerald-300':'text-amber-300'}>{serverLiveTrading?'enabled':'locked'}</b>.</p></Card><Card><TimerReset/><h3 className="text-xl font-black mt-3">Automation Guard</h3><p className="text-slate-400 mt-2">Automation calls the same execution route and defaults to previews for safe demos.</p></Card></div> }
