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

  // Smart name splitting: "Anna T. Koch" → first="Anna", middle="T.", last="Koch"
  // Single initial (1-2 chars ending in .) in middle position = middle name
  const nameParts = (data.full_name || '').trim().split(/\s+/).filter(Boolean);
  let firstName = '', middleName = '', lastName = '';
  if (nameParts.length === 1) {
    firstName = nameParts[0];
  } else if (nameParts.length === 2) {
    firstName = nameParts[0];
    lastName = nameParts[1];
  } else if (nameParts.length >= 3) {
    firstName = nameParts[0];
    const possibleMiddle = nameParts[1];
    // Middle initial: 1-2 chars, optionally ending with period
    const isInitial = /^[A-Za-z]{1,2}\.?$/.test(possibleMiddle);
    if (isInitial) {
      middleName = possibleMiddle;
      lastName = nameParts.slice(2).join(' ');
    } else {
      // Multi-word last name with no middle: "Mary Jane Watson"
      middleName = '';
      lastName = nameParts.slice(1).join(' ');
    }
  }

  // Map snake_case back to camelCase for the form
  return NextResponse.json({
    draft: {
      email: data.email,
      firstName,
      middleName,
      lastName,
      phone: data.phone || '',
      cityAndState: data.city_and_state || '',
      linkedIn: data.linkedin || data.linked_in || '',
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
      photoPath: data.photo_url || '',
      savedAt: data.updated_at || data.created_at,
    },
  });
}
