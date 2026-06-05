import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function notifySlack(payload: {
  fullName: string;
  email: string;
  pageType: string;
  topics: string[];
  submissionId: string;
  isUpdate?: boolean;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: payload.isUpdate
              ? `:pencil2: *Advisor submission updated — processing started*`
              : `:tada: *New advisor intake form submitted — processing started*`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Advisor*\n${payload.fullName}` },
            { type: 'mrkdwn', text: `*Email*\n${payload.email}` },
            { type: 'mrkdwn', text: `*Page Type*\n${payload.pageType}` },
            { type: 'mrkdwn', text: `*Topics*\n${payload.topics.slice(0, 3).join(', ')}${payload.topics.length > 3 ? '…' : ''}` },
          ],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Wrike task and HubSpot form are being created. You'll get a follow-up message when done.` }],
        },
      ],
    }),
  });
}

async function notifySlackError(error: string, context: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: *Submission failed*\n*Context:* ${context}\n*Error:* ${error}`,
          },
        },
      ],
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Parse financial topics
    let financialTopics: string[] = [];
    const topicsRaw = formData.get('financialTopics');
    if (topicsRaw && typeof topicsRaw === 'string') {
      try { financialTopics = JSON.parse(topicsRaw); } catch { financialTopics = [topicsRaw]; }
    }

    const email = String(formData.get('email') || '').trim();
    const fullName = String(formData.get('fullName') || '').trim();

    if (!email || !fullName) {
      return NextResponse.json({ error: 'Email and full name are required.' }, { status: 400 });
    }

    // Check for existing submission by email
    const { data: existing } = await supabaseAdmin
      .from('advisor_submissions')
      .select('id, status')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Upload photo to Supabase Storage if provided
    let photoUrl: string | null = null;
    const photoFile = formData.get('photo') as File | null;
    if (photoFile) {
      const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
      const photoPath = `${email.replace('@', '_').replace('.', '_')}/${Date.now()}_${photoFile.name}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('advisor-photos')
        .upload(photoPath, photoBuffer, { contentType: photoFile.type || 'image/jpeg', upsert: true });

      if (!uploadError) {
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from('advisor-photos')
          .getPublicUrl(photoPath);
        photoUrl = publicUrl;
      }
    }

    const submissionData = {
      email,
      full_name: fullName,
      phone: String(formData.get('phone') || ''),
      city_and_state: String(formData.get('cityAndState') || ''),
      linkedin: String(formData.get('linkedIn') || ''),
      years_of_experience: String(formData.get('yearsOfExperience') || ''),
      page_type: String(formData.get('pageType') || 'solo_savvy'),
      firm_name: String(formData.get('firmName') || '') || String(formData.get('dbaName') || ''),
      financial_topics: financialTopics,
      current_bio: String(formData.get('currentBio') || ''),
      how_became_advisor: String(formData.get('howBecameAdvisor') || ''),
      client_types: String(formData.get('clientTypes') || ''),
      areas_of_expertise: String(formData.get('areasOfExpertise') || ''),
      strategies: String(formData.get('strategies') || ''),
      unique_approach: String(formData.get('uniqueApproach') || ''),
      favorite_part_working: String(formData.get('favoritePartWorking') || ''),
      likes_about_savvy: String(formData.get('likesAboutSavvy') || ''),
      designations: String(formData.get('designations') || ''),
      ...(photoUrl && { photo_url: photoUrl }),
      status: 'pending',
    };

    let submissionId: string;
    let isUpdate = false;

    if (existing) {
      // Update existing submission
      const { data: updated, error } = await supabaseAdmin
        .from('advisor_submissions')
        .update({ ...submissionData, processed_at: null, wrike_task_id: null, error_message: null })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error || !updated) throw new Error(`Failed to update submission: ${error?.message}`);
      submissionId = updated.id;
      isUpdate = true;
    } else {
      // New submission
      const { data: inserted, error } = await supabaseAdmin
        .from('advisor_submissions')
        .insert(submissionData)
        .select('id')
        .single();

      if (error || !inserted) throw new Error(`Failed to save submission: ${error?.message}`);
      submissionId = inserted.id;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://savvy-advisor-form-delta.vercel.app';

    // Notify Slack (non-blocking)
    notifySlack({
      fullName,
      email,
      pageType: submissionData.page_type,
      topics: financialTopics,
      submissionId,
      isUpdate,
    }).catch((e) => console.error('Slack notification failed:', e));

    // Auto-trigger processing in background (separate serverless invocation)
    fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: submissionId }),
    }).catch((e) => console.error('Process trigger failed:', e));

    return NextResponse.json({ success: true, id: submissionId, updated: isUpdate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Submission error:', message);
    notifySlackError(message, 'Form submission').catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
