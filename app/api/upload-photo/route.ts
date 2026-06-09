import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;
    const email = String(formData.get('email') || '').trim();

    if (!photo || !email) {
      return NextResponse.json({ error: 'Photo and email required' }, { status: 400 });
    }

    // Validate type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json({ error: 'Invalid photo type. Must be JPG, PNG, WebP, or GIF.' }, { status: 400 });
    }

    const buffer = Buffer.from(await photo.arrayBuffer());

    // Validate size (max 10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Photo too large. Maximum 10MB.' }, { status: 400 });
    }

    const safeEmail = email.replace(/[@.]/g, '_');
    const safeFilename = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const photoPath = `${safeEmail}/${Date.now()}_${safeFilename}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('advisor-photos')
      .upload(photoPath, buffer, { contentType: photo.type, upsert: true });

    if (uploadError) {
      console.error('Photo upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Also update the draft record in Supabase if one exists
    await supabaseAdmin
      .from('advisor_submissions')
      .update({ photo_url: photoPath })
      .eq('email', email)
      .eq('status', 'draft');

    return NextResponse.json({ photoPath });
  } catch (err) {
    console.error('Upload photo error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
