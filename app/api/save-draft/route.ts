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
      blog_post: body.blogPost || '',
      anything_else: body.anythingElse || '',
      status: 'draft',
    };

    // Check if any record already exists for this email
    const { data: existing } = await supabaseAdmin
      .from('advisor_submissions')
      .select('id, status')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Don't overwrite a submitted/complete record with a draft
    if (existing && existing.status !== 'draft') {
      return NextResponse.json({ skipped: true, reason: 'submission_exists' });
    }

    // Core draft fields — always safe to save
    const coreDraft = {
      email: draft.email,
      full_name: draft.full_name,
      phone: draft.phone,
      city_and_state: draft.city_and_state,
      years_of_experience: draft.years_of_experience,
      page_type: draft.page_type,
      firm_name: draft.firm_name,
      financial_topics: draft.financial_topics,
      current_bio: draft.current_bio,
      how_became_advisor: draft.how_became_advisor,
      client_types: draft.client_types,
      areas_of_expertise: draft.areas_of_expertise,
      strategies: draft.strategies,
      unique_approach: draft.unique_approach,
      favorite_part_working: draft.favorite_part_working,
      likes_about_savvy: draft.likes_about_savvy,
      designations: draft.designations,
      status: 'draft' as const,
    };

    const tryUpsert = async (data: Record<string, unknown>, id?: string) => {
      if (id) {
        const { error } = await supabaseAdmin.from('advisor_submissions').update(data).eq('id', id);
        if (error?.message?.includes('column') || error?.message?.includes('schema')) {
          // Extended columns missing — retry with core only
          const { error: e2 } = await supabaseAdmin.from('advisor_submissions').update(coreDraft).eq('id', id);
          if (e2) throw new Error(e2.message);
        } else if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from('advisor_submissions').insert(data);
        if (error?.message?.includes('column') || error?.message?.includes('schema')) {
          // Extended columns missing — retry with core only
          const { error: e2 } = await supabaseAdmin.from('advisor_submissions').insert(coreDraft);
          if (e2) throw new Error(e2.message);
        } else if (error) throw new Error(error.message);
      }
    };

    if (existing) {
      await tryUpsert(draft, existing.id);
    } else {
      await tryUpsert(draft);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save draft error:', err);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
