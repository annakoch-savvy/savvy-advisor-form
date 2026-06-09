import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ draft: null });

  const { data } = await supabaseAdmin
    .from('advisor_submissions')
    .select('*')
    .eq('email', email)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return NextResponse.json({ draft: null });

  // Map snake_case back to camelCase for the form
  return NextResponse.json({
    draft: {
      email: data.email,
      firstName: (data.full_name || '').split(' ')[0] || '',
      middleName: '',
      lastName: (data.full_name || '').split(' ').slice(1).join(' ') || '',
      phone: data.phone || '',
      cityAndState: data.city_and_state || '',
      yearsOfExperience: data.years_of_experience || '',
      pageType: data.page_type || 'solo_savvy',
      firmName: data.firm_name || '',
      financialTopics: data.financial_topics || [],
      currentBio: data.current_bio || '',
      howBecameAdvisor: data.how_became_advisor || '',
      clientTypes: data.client_types || '',
      areasOfExpertise: data.areas_of_expertise || '',
      strategies: data.strategies || '',
      uniqueApproach: data.unique_approach || '',
      favoritePartWorking: data.favorite_part_working || '',
      likesAboutSavvy: data.likes_about_savvy || '',
      designations: data.designations || '',
      title: data.title || '',
      blogPost: data.blog_post || '',
      anythingElse: data.anything_else || '',
      savedAt: data.updated_at || data.created_at,
    },
  });
}
