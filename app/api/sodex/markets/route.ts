import { NextResponse } from 'next/server';
import { getSoDEXMarkets } from '../../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(){ return NextResponse.json(await getSoDEXMarkets()); }
