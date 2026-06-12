import { NextRequest, NextResponse } from 'next/server';
import { getCoinGeckoCoins } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest){ const p=Number(req.nextUrl.searchParams.get('page')||1); const per=Number(req.nextUrl.searchParams.get('perPage')||250); return NextResponse.json(await getCoinGeckoCoins(p, per)); }
