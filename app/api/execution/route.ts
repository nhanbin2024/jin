import { NextRequest, NextResponse } from 'next/server';
import { createExecutionPreview, executeSodexOrder } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>({}));
  const action = body.action || 'preview';
  try {
    const result = action === 'execute' ? await executeSodexOrder(body) : await createExecutionPreview(body);
    return NextResponse.json(result);
  } catch (error:any) {
    return NextResponse.json({ ok:false, error:error?.message || 'execution_failed', secretExposure:'No secret returned.' }, { status: 500 });
  }
}
