import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const draft = {
      email,
      full_name: body.fullName || '',
      phone: body.phone || '',
      city_and_state: body.cityAndState || '',
      linkedin: body.linkedIn || '',
      years_of_experience: body.yearsOfExperience || '',
      page_type: body.pageType || 'solo_savvy',
      firm_name: body.firmName || '',
      financial_topics: body.financialTopics || [],
      current_bio: body.currentBio || '',
      how_became_advisor: body.howBecameAdvisor || '',
      client_types: body.clientTypes || '',
      areas_of_expertise: body.areasOfExpertise || '',
      strategies: body.strategies || '',
      unique_approach: body.uniqueApproach || '',
      favorite_part_working: body.favoritePartWorking || '',
      likes_about_savvy: body.likesAboutSavvy || '',
      designations: body.designations || '',
      title: body.title || '',
      aum: body.aum || '',
      households: body.households || '',
      blog_post: body.blogPost || '',
      anything_else: body.anythingElse || '',
      status: 'draft',
    };

    // Check if a non-draft (submitted) record already exists for this email
    const { data: existing } = await supabaseAdmin
      .from('advisor_submissions')
      .select('id, status')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Don't overwrite a submitted record with a draft
    if (existing && existing.status !== 'draft') {
      return NextResponse.json({ skipped: true, reason: 'submission_exists' });
    }

    if (existing) {
      // Update existing draft
      await supabaseAdmin
        .from('advisor_submissions')
        .update(draft)
        .eq('id', existing.id);
    } else {
      // Insert new draft
      await supabaseAdmin
        .from('advisor_submissions')
        .insert(draft);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save draft error:', err);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
