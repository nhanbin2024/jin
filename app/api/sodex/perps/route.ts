import { NextRequest, NextResponse } from 'next/server';
import { getSodexPerpsAccount, getSodexPerpsMarket } from '../../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest){
  const symbol = req.nextUrl.searchParams.get('symbol') || 'BTCUSDT';
  const [market, account] = await Promise.all([getSodexPerpsMarket(symbol), getSodexPerpsAccount(symbol)]);
  return NextResponse.json({ ok:true, updatedAt:new Date().toISOString(), market, account });
}
