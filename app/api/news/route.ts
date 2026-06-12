import { NextResponse } from 'next/server';
import { getSoSoValueNews } from '../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(){ return NextResponse.json(await getSoSoValueNews(40)); }
