import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'Path required' }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage
    .from('advisor-photos')
    .createSignedUrl(path, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'Failed to generate URL' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
