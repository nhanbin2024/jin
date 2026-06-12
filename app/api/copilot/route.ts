import { NextRequest, NextResponse } from 'next/server';
import { buildAIAnswer, deriveSignals, getLiveMarket } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest){ const body=await req.json().catch(()=>({})); const live=await getLiveMarket(); const context={ sources: live.sources, updatedAt: live.updatedAt, topCoins:(live.coins||[]).slice(0,30), signals: deriveSignals(live.coins||[]).slice(0,20), news:(live.news||[]).slice(0,10), global: live.global }; return NextResponse.json(await buildAIAnswer(body.question || 'Summarize the live market context.', context)); }
