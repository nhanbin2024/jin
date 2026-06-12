import { NextResponse } from 'next/server';
import { getCoinGeckoGlobal } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(){ return NextResponse.json(await getCoinGeckoGlobal()); }
