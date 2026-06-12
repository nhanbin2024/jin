import { NextRequest, NextResponse } from 'next/server';
import { getTradeTerminal } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest){
  const symbol = req.nextUrl.searchParams.get('symbol') || 'BTCUSDT';
  const interval = req.nextUrl.searchParams.get('interval') || '5m';
  return NextResponse.json(await getTradeTerminal(symbol, interval));
}
