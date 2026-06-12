import { NextResponse } from 'next/server';
import { getSoDEXAccount } from '../../../lib/providers';
export const dynamic = 'force-dynamic';
export async function GET(){ return NextResponse.json(await getSoDEXAccount()); }
