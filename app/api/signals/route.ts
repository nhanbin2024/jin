import { NextResponse } from 'next/server';
import { deriveSignals, getLiveMarket } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(){ const live=await getLiveMarket(); return NextResponse.json({ ok:true, updatedAt: live.updatedAt, source: live.sources, signals: deriveSignals(live.coins||[]) }); }
