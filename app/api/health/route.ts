import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET(){
  return NextResponse.json({
    ok:true,
    name:'QuyNhon AI',
    liveOnly:true,
    configured:{
      sosovalue:Boolean(process.env.SOSOVALUE_API_KEY),
      sodexKeyName:Boolean(process.env.SODEX_API_KEY_NAME),
      sodexPublicKey:Boolean(process.env.SODEX_PUBLIC_KEY),
      sodexApiPrivateKey:Boolean(process.env.SODEX_API_PRIVATE_KEY || process.env.SODEX_PRIVATE_KEY || process.env.SODEX_WALLET_PRIVATE_KEY),
      aiRouter:Boolean(process.env.AI_API_KEY || process.env.CHAINOPERA_API_KEY || process.env.OPENAI_API_KEY),
      aiBaseURL: process.env.AI_BASE_URL || 'https://router.chainopera.ai/v1',
      aiModel: process.env.AI_MODEL || 'Qwen3-32B',
      liveTrading:process.env.ENABLE_LIVE_TRADING === 'true'
    },
    timestamp:new Date().toISOString()
  });
}
