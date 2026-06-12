import { NextRequest, NextResponse } from 'next/server';
import { assertAutomationSecret, createExecutionPreview, executeSodexOrder } from '../../lib/providers';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action === 'execute' ? 'execute' : 'preview';
  try {
    const result = action === 'execute' ? await executeSodexOrder({ ...body, automation: true }) : await createExecutionPreview({ ...body, automation: true });
    return NextResponse.json({ ok: true, automation: true, action, result, secretExposure: 'No private key, signature, nonce or payload hash is returned.' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, automation: true, error: error?.message || 'automation_failed', secretExposure: 'No secret returned.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const reqSecret = req.nextUrl.searchParams.get('secret') || req.headers.get('x-automation-secret');
  const auth = assertAutomationSecret(reqSecret);
  if (!auth.ok) return NextResponse.json({ ok:false, automation:true, error:auth.reason }, { status: 401 });
  const raw = process.env.AUTO_TRADE_CONFIG;
  if (!raw) return NextResponse.json({ ok: false, automation: false, reason: 'AUTO_TRADE_CONFIG not set. Use UI scheduler or configure Vercel Cron env.' });
  try {
    const config = JSON.parse(raw);
    const shouldExecute = config.action === 'execute' && process.env.ENABLE_LIVE_TRADING === 'true';
    const result = shouldExecute ? await executeSodexOrder({ ...config, automation: true }) : await createExecutionPreview({ ...config, automation: true });
    return NextResponse.json({ ok: true, automation: true, mode: shouldExecute ? 'live' : 'preview', result, secretExposure: 'No secret returned.' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, automation: true, error: error?.message || 'bad_AUTO_TRADE_CONFIG' }, { status: 500 });
  }
}
