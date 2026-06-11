import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { AdvisorSubmission, PAGE_TYPE_LABELS } from '@/lib/emailTemplate';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const WRIKE_API = 'https://www.wrike.com/api/v4';
const HUBSPOT_API = 'https://api.hubapi.com';
const HUBSPOT_TEMPLATE_FORM_ID = '850777b0-86af-41de-9e73-a7f84a6b440d';
const CALENDLY_API = 'https://api.calendly.com';

// ── Wrike helpers ─────────────────────────────────────────────────────────────

async function wrikeFetch(path: string, options: RequestInit = {}) {
  const token = process.env.WRIKE_API_TOKEN;
  if (!token) throw new Error('WRIKE_API_TOKEN environment variable is not set.');
  const res = await fetch(`${WRIKE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wrike API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function findAdvisorFolder(advisorName: string): Promise<string | null> {
  const data = await wrikeFetch(`/folders?title=${encodeURIComponent(advisorName)}&project=false`);
  const folders: Array<{ id: string; title: string }> = data.data ?? [];
  const match = folders.find(
    (f) => f.title.trim().toLowerCase() === advisorName.trim().toLowerCase()
  );
  return match?.id ?? null;
}

async function findOnboardingProject(advisorFolderId: string): Promise<string | null> {
  const data = await wrikeFetch(`/folders/${advisorFolderId}/folders?project=true`);
  const projects: Array<{ id: string; title: string }> = data.data ?? [];
  const match = projects.find(
    (p) => p.title.trim().toLowerCase() === 'onboarding'
  );
  return match?.id ?? null;
}

async function findContactId(name: string): Promise<string | null> {
  const envId = process.env.WRIKE_ASSIGNEE_CONTACT_ID;
  if (envId) return envId;
  const data = await wrikeFetch('/contacts?fields=[]');
  const contacts: Array<{ id: string; firstName: string; lastName: string }> = data.data ?? [];
  const lower = name.trim().toLowerCase();
  const match = contacts.find(
    (c) => `${c.firstName} ${c.lastName}`.toLowerCase() === lower
  );
  return match?.id ?? null;
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ── AI text cleanup ───────────────────────────────────────────────────────────

async function cleanText(text: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text.trim()) return text;

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are editing an advisor's answer for their financial advisor profile page.
Rules:
- Fix spelling and grammar only
- Keep the advisor's exact words, tone, and meaning
- Do NOT add any new information, facts, or embellishments
- If the answer is very short or lacks substance, form it into one clean short paragraph using only what was written — do not invent details
- Return only the cleaned text, no commentary

Text to clean:
${text}`,
    }],
  });

  return (msg.content[0] as { text: string }).text.trim();
}

async function cleanSubmission(s: AdvisorSubmission): Promise<AdvisorSubmission> {
  const [
    currentBio,
    howBecameAdvisor,
    clientTypes,
    areasOfExpertise,
    strategies,
    uniqueApproach,
    favoritePartWorking,
    likesAboutSavvy,
    designations,
  ] = await Promise.all([
    cleanText(s.currentBio),
    cleanText(s.howBecameAdvisor),
    cleanText(s.clientTypes),
    cleanText(s.areasOfExpertise),
    cleanText(s.strategies),
    cleanText(s.uniqueApproach),
    cleanText(s.favoritePartWorking),
    cleanText(s.likesAboutSavvy),
    cleanText(s.designations),
  ]);

  return {
    ...s,
    currentBio,
    howBecameAdvisor,
    clientTypes,
    areasOfExpertise,
    strategies,
    uniqueApproach,
    favoritePartWorking,
    likesAboutSavvy,
    designations,
  };
}

// ── HubSpot helpers ───────────────────────────────────────────────────────────

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error('HUBSPOT_API_KEY environment variable is not set.');
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function createHubSpotForm(advisorName: string): Promise<{ formId: string; embedCode: string; existed: boolean }> {
  const firstName = advisorName.split(' ')[0];
  const expectedName = `${advisorName} - Calendly Routing`;

  // Check if a form already exists for this advisor (paginated)
  let allForms: Array<{ id: string; name: string; portalId?: number }> = [];
  let after: string | undefined;
  do {
    const url = `/marketing/v3/forms?limit=100${after ? '&after=' + after : ''}`;
    const page = await hubspotFetch(url);
    allForms = allForms.concat(page.results ?? []);
    after = page.paging?.next?.after;
  } while (after);
  const match = allForms.find(
    (f) => f.name.trim().toLowerCase() === expectedName.trim().toLowerCase()
  );
  if (match) {
    const portalId = String(match.portalId ?? await getPortalId());
    const embedCode = `<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>\n<script>\n  hbspt.forms.create({\n    region: "na1",\n    portalId: "${portalId}",\n    formId: "${match.id}"\n  });\n</script>`;
    return { formId: match.id, embedCode, existed: true };
  }

  // Clone the template form using v2 API
  const cloned = await hubspotFetch(`/forms/v2/forms/${HUBSPOT_TEMPLATE_FORM_ID}/clone`, {
    method: 'POST',
    body: JSON.stringify({ name: `${advisorName} - Calendly Routing` }),
  });

  const formId: string = cloned.guid;
  const portalId: string = String(cloned.portalId);

  // Update the submit button text
  await hubspotFetch(`/forms/v2/forms/${formId}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...cloned,
      submitText: `Meet with ${firstName}`,
    }),
  });

  const embedCode = `<script charset="utf-8" type="text/javascript" src="//js.hsforms.net/forms/embed/v2.js"></script>
<script>
  hbspt.forms.create({
    region: "na1",
    portalId: "${portalId}",
    formId: "${formId}"
  });
</script>`;

  return { formId, embedCode, existed: false };
}

async function getPortalId(): Promise<string> {
  const data = await hubspotFetch('/account-info/v3/details');
  return String(data.portalId ?? '');
}

// ── Webpage draft generation ──────────────────────────────────────────────────

const HOW_CAN_I_HELP_OPTIONS = `
Retirement Planning | DREAMS INTO ACTIONABLE PLANS | Transition into your golden years with confidence. Our goal is to see to it that you're prepared for the unpredictable. Let us turn your retirement dreams into actionable plans.

Financial Planning & Analysis | TAKE CONTROL OF YOUR FINANCIAL FUTURE | Personalized wealth management helps our clients protect their assets. We use a holistic approach to financial planning that integrates tax strategy, trust & estate planning, and risk management.

Environment, Social and Governance (ESG) Investing | ALIGN YOUR INVESTMENT CHOICES WITH YOUR VALUES | We help clients adopt investment strategies that align their investment choices with their socially responsible values. We enable you to prioritize investments in companies that have shown a commitment to enhancing their performance in these three key areas.

Small Business Tax | COMPREHENSIVE TAX PLANNING FOR SMALL BUSINESSES | Navigating the complex landscape of small business taxes can be daunting. We're here to act as your small business tax advisor, specialized in building comprehensive small business tax planning strategies. We work to minimize your tax exposure and provide tailored advice for your specific business model.

Structured Planning | GET THE MOST OUT OF YOUR SETTLEMENT | We excel in strategizing the allocation of lawsuit resources for plaintiffs and attorneys. There are significant tax advantages to leverage upon receiving awards. While fixed annuities are valuable, alternative options may better suit both attorneys and plaintiffs.

Tax Optimization | STRIVING TO MINIMIZE YOUR TAX BURDEN | We aim to take the ambiguity out of tax planning by utilizing tax-reducing strategies that encompass your overall tax liability. We do it by putting together a game plan that is specific to your needs.

Investment Management | STRATEGIC, DATA-DRIVEN INVESTING TO TARGET AMBITIOUS RESULTS | End-to-end investment management focused on tailoring portfolios to each client's specific circumstances and preferences. Our holistic approach will take into consideration all facets of your situation along with current economic data to optimize your portfolio's risk and return.

Estate & Trust Planning | PRESERVATION OF YOUR LEGACY | We specialize in making the often complex and emotionally charged process of trust and estate planning as seamless as possible ensuring the security and preservation of a client's legacy for future generations.

Alternatives Investing | DIVERSIFICATION AND INNOVATION IN PORTFOLIOS | We actively research alternative investment opportunities and monitor your portfolio investment holdings, bringing together actionable insights and forward-thinking risk assessments.

Succession Planning | ESTABLISH YOUR BUSINESS SUCCESSION PLAN | Building a successful business is an incredible feat, but what happens to your hard-earned legacy when you're ready to step down? We build strategic blueprints to help ensure the continued growth and success of your enterprise.

LGBTQIA Planning | PREPARE FOR THE FUTURE | Prepare for your family's future with the unknown by prioritizing estate planning, emphasizing trusts and medical directives to ensure your wishes are honored.

Budget and Debt Management | HELPING ACHIEVE FINANCIAL STABILITY | Effective debt management involves implementing strategies to handle financial obligations responsibly, improving credit scores, and helping to achieve financial stability. We help you be proactive which helps lead to long-term financial success.

Employer-Sponsored Plans | SUPPORT COMPANIES AND EMPLOYEES | With streamlined plan management, our goal is to provide an exceptional experience for business owners and participants. Serving as a 3(38) Investment Fiduciary, Savvy assumes full responsibility for the selection and oversight of funds and model portfolios, thereby mitigating plan liability risks for the plan sponsor.

Real Estate Investment Planning | UNDERSTAND YOUR OPTIONS | We excel in assisting real estate investors with mapping out their financial futures, whether by developing exit strategies for property sales, facilitating pre-purchase property evaluations, or revealing hidden opportunities.

Risk Management | MANAGING YOUR RISK | Identify and address potential risks to help protect your assets in an ever-changing market landscape.

Income Planning | UNDERSTAND YOUR INCOME STREAMS | Understand your income with an annual plan showing where cash flow is generated, and why. This weaves together Restricted Stock Units (RSU) flows, stock option exercises, long-term capital gains, Roth Conversions, etc.

Legacy & Charitable Planning | MINIMIZING YOUR TAX BURDEN | Whether it's transferring assets to kids or grandkids, or maximizing your charitable donations, we have the experience with complex strategies surrounding wealth transfer.

Personal Direct Indexing | GREATER CUSTOMIZATION FOR YOUR PORTFOLIO | Build your own personalized index portfolio based on your unique values with direct ownership of individual stocks. This allows for greater customization and effective tax loss harvesting.

Investing for Women | FACE YOUR UNIQUE CHALLENGES | Empower women by breaking down the barriers they face in managing their finances, and help them take control of their financial futures.

Late-Stage College Planning | MAXIMIZE YOUR FINANCIAL RESOURCES | We guide clients through the intricate financial aid process, helping them navigate its many challenges. By empowering families to make well-informed decisions when choosing colleges, we help them maximize their financial resources while attempting to avoid the burden of excessive student debt.

Executive Compensation Planning | STRATEGIC PLANNING OF YOUR FINANCIAL AND NON-FINANCIAL COMPENSATION | We are here to guide you through your compensation negotiation, helping you secure a package that aligns with both your short-term needs and long-term goals.

Equity Compensation | STRATEGIC PLANNING FOR EQUITY COMPENSATION | We help clients make informed decisions around stock options, RSUs, ESPPs, and other equity awards. Our approach integrates tax planning, diversification strategies, and long-term wealth planning to help you manage concentration risk and align your equity compensation with your broader financial goals.
`.trim();

// Compliance buzzword replacements (from Compliance Buzzwords.pdf)
const COMPLIANCE_REPLACEMENTS: Record<string, string> = {
  'always': 'often',
  'highest': 'one of the top',
  'revolutionary': 'forward-looking',
  'amazing': '[do not use]',
  'industry leading': 'one of the top',
  'safest': 'what we believe to be safe',
  'attractive returns': '[do not discuss returns]',
  'innovative': 'thoughtful',
  'special': 'different, significant',
  'state of the art': 'well-researched, carefully planned',
  'best': 'one of the best',
  'largest': 'one of the biggest',
  'superior': 'one of the top',
  'conservative': 'stable, steady',
  'leading': 'one of the leading',
  'time-tested': 'with a history of',
  'cutting edge': 'compelling',
  'lucrative': 'worthwhile, advantageous',
  'dynamic': 'compelling, powerful',
  'major': 'significant',
  'top of the line': '[do not use]',
  'enviable': '[do not use]',
  'maximum': '[do not use]',
  'unbiased': 'transparent',
  'exceptional': 'noteworthy',
  'never': 'rarely',
  'unique': 'different',
  'expert': 'a level of experience',
  'expertise': 'experience',
  'no risk': '[do not use]',
  'unlimited': '[do not use]',
  'extensive': 'wide-ranging',
  'outstanding': 'white glove',
  'unmatched': '[do not use]',
  'free': 'complimentary',
  'peace of mind': 'help to alleviate concerns, knowing you have a plan',
  'unparalleled': '[do not use]',
  'guarantee': '[do not use]',
  'premier': 'white-glove',
  'we treat you like family': 'white glove, high-touch service model',
  'help you sleep at night': 'help to alleviate concerns, knowing you have a plan',
  'proven': 'carefully researched',
  'world class': 'white glove, high-touch service model',
  'smarter': '[do not use]',
  'conflict free': '[do not use]',
  'no conflict': '[do not use]',
  'firm': 'business, company, or practice',
};

const COMPLIANCE_AVOID = Object.keys(COMPLIANCE_REPLACEMENTS);

async function generateWebpageDraft(
  s: AdvisorSubmission,
  hubspotFormId: string,
  hubspotEmbedCode: string,
  calendlyUrl?: string,
  calendlyEmbedCode?: string,
  advisorEmail?: string,
  phone?: string,
  linkedIn?: string,
  title?: string
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;

  // Build the data table section (always included regardless of AI key)
  const DISCLOSURE = 'Neither Savvy Wealth, nor Savvy Advisors compensates directly for testimonials or endorsements provided herein, by advisers. However advisors may have an indirect financial incentive to provide testimonials.';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const dataTable = [
    '<b>━━━ ADVISOR DATA TABLE ━━━</b>',
    `<b>Full Name (displayed):</b> ${s.fullName}`,
    title ? `<b>Title / Role:</b> ${title}` : null,
    `<b>Location (City, State abbr.):</b> ${s.cityAndState}`,
    `<b>Years of Experience:</b> ${s.yearsOfExperience}`,
    s.designations ? `<b>Certifications / Designations:</b> ${s.designations}` : null,
    s.dbaName ? `<b>DBA Name:</b> ${s.dbaName}` : null,
    advisorEmail ? `<b>E-mail:</b> ${advisorEmail}` : null,
    phone ? `<b>Phone #:</b> ${phone}` : null,
    linkedIn ? `<b>LinkedIn:</b> ${linkedIn}` : null,
    s.uniqueApproach ? `<b>Advisor Quote:</b> "${s.uniqueApproach}"` : null,
    `<b>HubSpot Form ID:</b> ${hubspotFormId}`,
    `<b>HubSpot Embed Code:</b><br><pre>${esc(hubspotEmbedCode)}</pre>`,
    calendlyUrl ? `<b>Calendly Scheduling URL:</b> ${calendlyUrl}` : '<b>Calendly:</b> <i>No 30-min call event found — set up manually</i>',
    calendlyEmbedCode ? `<b>Calendly Embed Code:</b><br><pre>${esc(calendlyEmbedCode)}</pre>` : null,
    `<b>Disclosures:</b> ${DISCLOSURE}`,
  ].filter(Boolean).join('<br>');

  if (!key) {
    // Fallback: structured raw data without AI polish
    const rawContent = [
      dataTable,
      '',
      '<b>━━━ WEBPAGE DRAFT (Raw Survey Data — AI polish pending) ━━━</b>',
      '<i>Note: Add ANTHROPIC_API_KEY to Vercel environment variables to enable AI-generated webpage drafts.</i>',
      '',
      '<b>Page Type:</b> ' + PAGE_TYPE_LABELS[s.pageType],
      '<b>Financial Topics:</b> ' + s.financialTopics.join(', '),
      '',
      '<b>Hero Section / Bio:</b>',
      s.currentBio,
      '',
      '<b>How Can I Help? (select 4 from standard options based on topics above)</b>',
      '',
      '<b>Get to Know ' + s.fullName + '</b>',
      s.currentBio,
      '',
      '<b>FAQ</b>',
      '<b>1. How did you become a financial advisor?</b>',
      s.howBecameAdvisor,
      '',
      '<b>2. What types of clients do you work with?</b>',
      s.clientTypes,
      '',
      '<b>3. What areas of expertise do you have?</b>',
      s.areasOfExpertise,
      '',
      '<b>4. What types of strategies do you usually help clients with?</b>',
      s.strategies,
      '',
      '<b>5. Is there a unique approach that sets you apart?</b>',
      s.uniqueApproach,
      '',
      '<b>6. What is your favorite part about working with clients?</b>',
      s.favoritePartWorking,
      '',
      '<b>7. What do you like about working with Savvy?</b>',
      s.likesAboutSavvy,
    ].filter((l) => l !== null).join('<br>');
    return rawContent;
  }

  // AI-powered full webpage draft
  const pageTypeLabel = PAGE_TYPE_LABELS[s.pageType];
  const isDba = s.pageType === 'solo_dba' || s.pageType === 'multi_dba';
  const isMulti = s.pageType === 'multi_savvy' || s.pageType === 'multi_dba';
  const firstName = s.fullName.split(' ')[0];

  // Template guidance per page type — mirrors the GPT's reference documents
  const templateGuidance = isMulti && isDba
    ? `This is a team of advisors with DBA branding (reference: Chris Benda / Benda & Co. format). The DBA name is "${s.dbaName}". The output must include a [LOGO PLACEHOLDER] for the team logo. Generate content for this advisor's individual section within the team page. The "Our Team" section should introduce the ${s.dbaName} team as a whole (2-3 sentences), then include "[TEAM MEMBER SECTION: ${s.fullName}]" for this advisor's content, then "[ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED]".`
    : isMulti
    ? `This is a team of advisors under Savvy branding (reference: Cindy Alvarez and Janelle Van Meel format). Generate content for this advisor's individual section. The "Our Team" section should open with a paragraph about the team's shared mission and what they bring together, then include "[TEAM MEMBER SECTION: ${s.fullName}]" for this advisor, then "[ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED]".`
    : isDba
    ? `This is a solo advisor with their own DBA brand (reference: Steve Marcou solo format but with DBA branding). The DBA name is "${s.dbaName}". Reference the DBA brand naturally throughout (e.g., "At ${s.dbaName}...").`
    : `This is a solo advisor under Savvy branding (reference: Steve Marcou solo format).`;

  const complianceNote = `COMPLIANCE — Never use these restricted words. Use the replacements instead:
${Object.entries(COMPLIANCE_REPLACEMENTS).map(([bad, good]) => `  - "${bad}" → ${good}`).join('\n')}`;

  const prompt = `You are generating a draft advisor webpage for Savvy Advisors based on a submitted survey.

The output must begin with the filled-in data table, then the webpage copy sections exactly as shown in the template format below.

PAGE TYPE: ${pageTypeLabel}
${templateGuidance}

━━━ SURVEY RESPONSES ━━━
Email: ${advisorEmail || '[not provided]'}
Name: ${s.fullName}
City and State: ${s.cityAndState}
LinkedIn: ${linkedIn || '[not provided]'}
Years of Experience: ${s.yearsOfExperience}
Financial Topics: ${s.financialTopics.join(', ')}
Types of clients: ${s.clientTypes}
Areas of expertise: ${s.areasOfExpertise}
Strategies used: ${s.strategies}
Unique approach / advisor quote: ${s.uniqueApproach}
Favorite part of working with clients: ${s.favoritePartWorking}
What they like about Savvy: ${s.likesAboutSavvy}
Designations / organizations: ${s.designations || 'none listed'}
Current bio: ${s.currentBio}

━━━ WRITING RULES ━━━
- Keep the advisor's own voice, tone, and meaning — this should feel like THEM, not AI-generated
- Fix spelling and grammar only where needed
- Do NOT use em-dashes (—). Use commas, periods, or restructure the sentence
- Do NOT add information that was not in the survey — only use what was provided
- If an answer is brief, form it into one clean short paragraph using only what was written
- The writing should feel natural and conversational, not choppy
${complianceNote}

━━━ HOW CAN I HELP? SECTION ━━━
Choose exactly 4 options from the standard list below that best match the advisor's financial topics, expertise, and client types.
Copy the TITLE, SUBTITLE, and DESCRIPTION verbatim — do not change a single word.
Base your selection on keywords in the survey (financial topics, client types, expertise, strategies).

STANDARD OPTIONS (choose 4 verbatim):
${HOW_CAN_I_HELP_OPTIONS}

━━━ OUTPUT FORMAT ━━━
Use these exact section headers. No markdown formatting. Plain text headers only.

HERO SECTION INTRO
[Written in first person. 2-3 sentences. Warm, direct, conversational. Based on the bio and survey. For DBA pages, reference the brand name naturally. Avoid opening every sentence with "I". Reference specific client types and what the advisor is known for.]

HOW CAN I HELP?
[4 options chosen from the standard list above. Each on its own block:
Title
SUBTITLE
Description]
${isMulti ? `
OUR TEAM
[${isDba
  ? `2-3 sentence intro about the ${s.dbaName} team — their shared mission, values, and what they bring to clients together. Reference the DBA brand name naturally. Then: [LOGO PLACEHOLDER — ${s.dbaName} team logo]. Then: [TEAM MEMBER SECTION: ${s.fullName}] — followed by their individual bio. Then: [ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED].`
  : `2-3 sentence intro about the team under Savvy branding — their shared mission and what they bring together. Then: [TEAM MEMBER SECTION: ${s.fullName}] — followed by their individual bio. Then: [ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED].`
}]
` : ''}
GET TO KNOW ${s.fullName.toUpperCase()}
[3-4 paragraphs in third person. Cover: career background and how they got into advising, areas of focus and who they serve, their approach and what drives them, a personal detail if mentioned. Warm, natural tone. Source material: the bio + how they became an advisor answers. Do not make it a list — write in flowing paragraphs.]

FAQ

1. How did you become a financial advisor?
[Their answer, polished — their words cleaned up, not rewritten]

2. What types of clients do you work with?
[Their answer, polished]

3. What areas of expertise do you have?
[Their answer, polished]

4. What types of strategies do you usually help clients with?
[Their answer, polished]

5. Is there a unique approach that sets you apart?
[Their answer, polished]

6. What is your favorite part about working with clients?
[Their answer, polished]

7. Working with Savvy
[Their answer, polished]`;

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const draftText = (msg.content[0] as { text: string }).text.trim();

  // Convert plain text draft to HTML for Wrike
  const draftHtml = draftText
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Section headers
      if (
        trimmed === 'HERO SECTION INTRO' ||
        trimmed === 'HOW CAN I HELP?' ||
        trimmed.startsWith('GET TO KNOW ') ||
        trimmed === 'OUR TEAM' ||
        trimmed === 'FAQ'
      ) {
        return `<b>━━━ ${trimmed} ━━━</b>`;
      }
      // FAQ question lines
      if (/^\d\. /.test(trimmed)) {
        const [firstLine, ...rest] = trimmed.split('\n');
        return `<b>${firstLine}</b>${rest.length ? '<br>' + rest.join('<br>') : ''}`;
      }
      return trimmed.replace(/\n/g, '<br>');
    })
    .filter(Boolean)
    .join('<br><br>');

  return `${dataTable}<br><br><b>━━━ WEBPAGE DRAFT ━━━</b><br><br>${draftHtml}`;
}

// ── Calendly helpers ──────────────────────────────────────────────────────────

async function calendlyFetch(path: string) {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) throw new Error('CALENDLY_API_TOKEN environment variable is not set.');
  const res = await fetch(`${CALENDLY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendly API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function getCalendlyEmbed(advisorName: string): Promise<{ schedulingUrl: string; embedCode: string } | null> {
  try {
    // Get org URI
    const me = await calendlyFetch('/users/me');
    const orgUri: string = me.resource?.current_organization ?? '';

    // Page through members to find advisor by name
    let nextPage = `/organization_memberships?organization=${encodeURIComponent(orgUri)}&count=100`;
    let userUri: string | null = null;

    while (nextPage && !userUri) {
      const data = await calendlyFetch(nextPage.replace(CALENDLY_API, ''));
      const members: Array<{ user: { name: string; uri: string } }> = data.collection ?? [];
      const lower = advisorName.trim().toLowerCase();
      const match = members.find((m) => m.user.name.toLowerCase().includes(lower.split(' ')[0].toLowerCase()) && m.user.name.toLowerCase().includes(lower.split(' ').slice(-1)[0].toLowerCase()));
      if (match) userUri = match.user.uri;
      nextPage = data.pagination?.next_page ?? '';
    }

    if (!userUri) return null;

    // Find their 30-minute call event type
    const eventsData = await calendlyFetch(`/event_types?user=${encodeURIComponent(userUri)}&count=20`);
    const eventTypes: Array<{ name: string; duration: number; scheduling_url: string; active: boolean }> = eventsData.collection ?? [];
    const thirtyMin = eventTypes.find(
      (e) => e.active && e.duration === 30 && e.name.toLowerCase().includes('call')
    ) ?? eventTypes.find((e) => e.active && e.duration === 30);

    if (!thirtyMin) return null;

    const schedulingUrl = thirtyMin.scheduling_url;
    const embedCode = `<!-- Calendly inline widget -->
<div class="calendly-inline-widget" data-url="${schedulingUrl}" style="min-width:320px;height:700px;"></div>
<script type="text/javascript" src="https://assets.calendly.com/assets/external/widget.js" async></script>`;

    return { schedulingUrl, embedCode };
  } catch {
    return null;
  }
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function generateAdvisorPdf(s: AdvisorSubmission, hubspotFormId: string, hubspotEmbedCode: string, calendlyUrl?: string, calendlyEmbedCode?: string, wrikeDraftHtml?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const mono = await pdfDoc.embedFont(StandardFonts.Courier);

  const gold = rgb(0.557, 0.494, 0.341);
  const green = rgb(0.090, 0.322, 0.259);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const gray = rgb(0.33, 0.33, 0.33);
  const vanilla = rgb(1, 0.973, 0.945);

  const margin = 50;
  const pageWidth = 612;
  const pageHeight = 792;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const addPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const checkY = (needed: number) => {
    if (y < margin + needed) addPage();
  };

  // Draw header
  page.drawRectangle({ x: 0, y: pageHeight - 70, width: pageWidth, height: 70, color: black });
  page.drawText('Savvy', { x: margin, y: pageHeight - 35, size: 22, font: bold, color: white });
  page.drawText('Forging the future of wealth management.', { x: margin, y: pageHeight - 52, size: 8, font: regular, color: gold });
  page.drawText('Advisor Landing Page Brief', { x: 310, y: pageHeight - 38, size: 13, font: bold, color: white });
  y = pageHeight - 90;

  const drawSection = (title: string) => {
    checkY(30);
    y -= 10;
    page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 20, color: green });
    page.drawText(title.toUpperCase(), { x: margin + 8, y: y + 3, size: 9, font: bold, color: white });
    y -= 20;
  };

  const drawLine = (text: string, x: number, size: number, font: import('pdf-lib').PDFFont, color: import('pdf-lib').RGB, lineH: number) => {
    checkY(lineH + 4);
    page.drawText(text, { x, y, size, font, color });
    y -= lineH;
  };

  const drawField = (label: string, value: string, highlight = false) => {
    const lines = wrapText(value || '—', regular, 8, contentWidth - 130);
    checkY(20);
    if (highlight) page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: lines.length * 12 + 8, color: vanilla });
    page.drawText(label + ':', { x: margin + 8, y, size: 8, font: bold, color: gray });
    lines.forEach((line) => {
      checkY(12);
      page.drawText(line, { x: margin + 140, y, size: 8, font: regular, color: black });
      y -= 12;
    });
    y -= 4;
  };

  const drawFaq = (num: string, question: string, answer: string) => {
    const qLines = wrapText(`${num}. ${question}`, bold, 8.5, contentWidth - 16);
    const aLines = wrapText(answer || '—', regular, 8, contentWidth - 16);
    y -= 8;
    qLines.forEach((line) => drawLine(line, margin + 8, 8.5, bold, gold, 13));
    y -= 4;
    aLines.forEach((line) => drawLine(line, margin + 8, 8, regular, black, 13));
  };

  const drawCode = (code: string) => {
    const lines = code.split('\n');
    const needed = lines.length * 11 + 12;
    checkY(needed);
    page.drawRectangle({ x: margin, y: y - needed + 10, width: contentWidth, height: needed, color: rgb(0.95, 0.95, 0.95) });
    lines.forEach((line, i) => {
      page.drawText(line.slice(0, 90), { x: margin + 6, y: y - i * 11, size: 7, font: mono, color: rgb(0.1, 0.1, 0.1) });
    });
    y -= needed;
  };

  // Advisor Profile
  drawSection('Advisor Profile');
  drawField('Page Type', PAGE_TYPE_LABELS[s.pageType], true);
  if (s.dbaName) drawField('DBA Name', s.dbaName);
  drawField('Location', s.cityAndState, true);
  drawField('LinkedIn', s.linkedIn);
  drawField('Years of Experience', s.yearsOfExperience, true);
  drawField('Designations', s.designations);
  drawField('Financial Topics', s.financialTopics.join(', '), true);

  // HubSpot
  drawSection('HubSpot');
  drawField('Form ID', hubspotFormId, true);
  checkY(20);
  y -= 8;
  page.drawText('Embed Code:', { x: margin + 8, y, size: 8, font: bold, color: gray });
  y -= 14;
  drawCode(hubspotEmbedCode);

  // Calendly
  drawSection('Calendly');
  if (calendlyUrl) {
    drawField('Scheduling URL', calendlyUrl, true);
    if (calendlyEmbedCode) {
      checkY(20);
      y -= 8;
      page.drawText('Embed Code:', { x: margin + 8, y, size: 8, font: bold, color: gray });
      y -= 14;
      drawCode(calendlyEmbedCode);
    }
  } else {
    checkY(20);
    y -= 8;
    page.drawText('No 30-min call event type found — set up Calendly routing manually.', { x: margin + 8, y, size: 8, font: regular, color: rgb(0.6, 0.2, 0.2) });
    y -= 14;
  }

  // Bio
  drawSection('Bio');
  const bioLines = wrapText(s.currentBio || '—', regular, 8, contentWidth - 16);
  y -= 6;
  bioLines.forEach((line) => drawLine(line, margin + 8, 8, regular, black, 12));

  // FAQ
  drawSection('FAQ Answers');
  drawFaq('1', 'How did you become a financial advisor?', s.howBecameAdvisor);
  drawFaq('2', 'What types of clients do you work with?', s.clientTypes);
  drawFaq('3', 'What areas of expertise do you have?', s.areasOfExpertise);
  drawFaq('4', 'What types of strategies do you usually help clients with?', s.strategies);
  drawFaq('5', 'Is there a unique approach that sets you apart?', s.uniqueApproach);
  drawFaq('6', 'What is your favorite part about working with clients?', s.favoritePartWorking);
  drawFaq('7', 'What do you like about working with Savvy?', s.likesAboutSavvy);

  // Webpage Draft section (strip HTML tags for PDF rendering)
  if (wrikeDraftHtml) {
    const draftPlain = wrikeDraftHtml
      .replace(/<pre>([\s\S]*?)<\/pre>/gi, (_, code) => '\n' + code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') + '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b>(.*?)<\/b>/gi, '$1')
      .replace(/<i>(.*?)<\/i>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/━+/g, '');

    // Split into sections by the ━ markers we stripped
    const draftSections = draftPlain.split(/\n{3,}/);

    drawSection('Webpage Draft');
    for (const section of draftSections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      const lines = wrapText(trimmed, regular, 7.5, contentWidth - 16);
      y -= 4;
      lines.forEach((line) => drawLine(line, margin + 8, 7.5, regular, black, 11));
      y -= 4;
    }
  }

  // Footer on each page
  const pages = pdfDoc.getPages();
  pages.forEach((p) => {
    p.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 30, color: black });
    p.drawText('Submitted via Savvy Advisor Intake Form', { x: margin, y: 10, size: 7.5, font: regular, color: rgb(0.6, 0.6, 0.6) });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\n/g, ' \n ').split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word === '\n') { lines.push(current.trim()); current = ''; continue; }
    const test = current ? current + ' ' + word : word;
    const w = font.widthOfTextAtSize(test, size);
    if (w > maxWidth && current) { lines.push(current.trim()); current = word; }
    else current = test;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

async function attachFileToWrikeTask(taskId: string, fileBuffer: Buffer, filename: string, mimeType: string): Promise<void> {
  const token = process.env.WRIKE_API_TOKEN;
  if (!token) throw new Error('WRIKE_API_TOKEN environment variable is not set.');

  const fd = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  fd.append('file', blob, filename);

  const res = await fetch(`${WRIKE_API}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wrike attachment error ${res.status}: ${text}`);
  }
}

async function attachPdfToWrikeTask(taskId: string, pdfBuffer: Buffer, filename: string): Promise<void> {
  return attachFileToWrikeTask(taskId, pdfBuffer, filename, 'application/pdf');
}

// ── GET handler — one-click trigger page ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Processing...</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .box { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 400px; }
    h1 { color: #175242; margin-bottom: 8px; }
    p { color: #6b7280; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #175242; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 20px auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    <h1>Processing...</h1>
    <div class="spinner"></div>
    <p id="status">Starting background processing for submission <strong>${id}</strong>...</p>
  </div>
  <script>
    (async () => {
      const statusEl = document.getElementById('status');
      try {
        const res = await fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ${JSON.stringify(id)} }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          statusEl.textContent = 'Done! Wrike task created successfully.';
        } else {
          statusEl.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch (e) {
        statusEl.textContent = 'Network error: ' + e.message;
      }
    })();
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let submissionId: string | undefined;

  try {
    const body = await req.json();
    submissionId = body.id as string;

    if (!submissionId) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });
    }

    // Fetch submission from Supabase
    const { data: row, error: fetchError } = await supabaseAdmin
      .from('advisor_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: `Submission not found: ${fetchError?.message ?? 'no row'}` }, { status: 404 });
    }

    // Map snake_case DB fields → camelCase AdvisorSubmission
    const submission: AdvisorSubmission = {
      fullName: row.full_name ?? '',
      cityAndState: row.city_and_state ?? '',
      linkedIn: row.linked_in ?? row.linkedin ?? '',
      yearsOfExperience: row.years_of_experience ?? '',
      pageType: (row.page_type ?? 'solo_savvy') as AdvisorSubmission['pageType'],
      dbaName: row.firm_name ?? row.dba_name ?? '',
      financialTopics: Array.isArray(row.financial_topics) ? row.financial_topics : [],
      currentBio: row.current_bio ?? '',
      howBecameAdvisor: row.how_became_advisor ?? '',
      clientTypes: row.client_types ?? '',
      areasOfExpertise: row.areas_of_expertise ?? '',
      strategies: row.strategies ?? '',
      uniqueApproach: row.unique_approach ?? '',
      favoritePartWorking: row.favorite_part_working ?? '',
      likesAboutSavvy: row.likes_about_savvy ?? '',
      designations: row.designations ?? '',
    };

    const advisorEmail: string = row.email ?? '';
    const photoUrl: string | null = row.photo_url ?? null;

    // Step 1: Verify Wrike folder exists before expensive AI work
    const folderId = await findAdvisorFolder(submission.fullName);
    if (!folderId) {
      await supabaseAdmin.from('advisor_submissions').update({ status: 'failed', error_message: `No Wrike folder for "${submission.fullName}"` }).eq('id', submissionId);
      return NextResponse.json({ error: `No Wrike folder found for "${submission.fullName}"` }, { status: 404 });
    }
    const onboardingId = await findOnboardingProject(folderId);
    if (!onboardingId) {
      await supabaseAdmin.from('advisor_submissions').update({ status: 'failed', error_message: `No Onboarding project found` }).eq('id', submissionId);
      return NextResponse.json({ error: `No Onboarding project found` }, { status: 404 });
    }

    // Step 2: Run AI cleanup + other lookups in parallel
    const cleaned = await cleanSubmission(submission);
    const [hubspot, calendly, assigneeId, dueDate] = await Promise.all([
      createHubSpotForm(submission.fullName),
      getCalendlyEmbed(submission.fullName),
      findContactId('Gonzalo Silva Corcelet'),
      Promise.resolve(formatDate(addBusinessDays(new Date(), 3))),
    ]);

    // Generate AI webpage draft and create Wrike task
    const description = await generateWebpageDraft(
      cleaned, hubspot.formId, hubspot.embedCode,
      calendly?.schedulingUrl, calendly?.embedCode, advisorEmail,
      row.phone ?? '',
      row.linkedin ?? row.linked_in ?? cleaned.linkedIn ?? '',
      row.title ?? ''
    );
    const taskData = await wrikeFetch(`/folders/${onboardingId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Savvy Landing Page',
        description,
        responsibles: assigneeId ? [assigneeId] : [],
        dates: { due: dueDate },
      }),
    });

    const taskId: string | undefined = taskData?.data?.[0]?.id;
    const wrikeTaskUrl = taskId ? `https://www.wrike.com/open.htm?id=${taskId}` : null;

    // Generate PDF, attach files, and send Slack notification
    await Promise.all([
      taskId
        ? (async () => {
            const pdfBuffer = await generateAdvisorPdf(cleaned, hubspot.formId, hubspot.embedCode, calendly?.schedulingUrl, calendly?.embedCode, description);
            const pdfFilename = `${cleaned.fullName.replace(/\s+/g, '_')}_Landing_Page_Brief.pdf`;

            const attachments: Promise<void>[] = [attachPdfToWrikeTask(taskId, pdfBuffer, pdfFilename)];

            // If submission has a photo, generate a signed URL and attach to Wrike
            if (photoUrl) {
              attachments.push(
                (async () => {
                  // photo_url stores the storage path — generate a 60s signed URL
                  const { data: signedData, error: signErr } = await supabaseAdmin.storage
                    .from('advisor-photos')
                    .createSignedUrl(photoUrl, 60);
                  if (signErr || !signedData?.signedUrl) {
                    throw new Error(`Failed to generate signed URL for photo: ${signErr?.message}`);
                  }
                  const photoRes = await fetch(signedData.signedUrl);
                  if (!photoRes.ok) throw new Error(`Failed to download photo: ${photoRes.status}`);
                  const photoBuffer = Buffer.from(await photoRes.arrayBuffer());
                  const ext = photoUrl.split('.').pop()?.split('?')[0] ?? 'jpg';
                  const photoFilename = `${cleaned.fullName.replace(/\s+/g, '_')}_headshot.${ext}`;
                  const mimeType = photoRes.headers.get('content-type') ?? 'image/jpeg';
                  await attachFileToWrikeTask(taskId, photoBuffer, photoFilename, mimeType);
                })()
              );
            }

            await Promise.all(attachments);
          })()
        : Promise.resolve(),

      sendSlackNotification(cleaned, wrikeTaskUrl, true),
    ]);

    // Update Supabase record with success
    await supabaseAdmin.from('advisor_submissions').update({
      status: 'complete',
      processed_at: new Date().toISOString(),
      wrike_task_id: taskId ?? null,
    }).eq('id', submissionId);

    return NextResponse.json({ success: true, wrikeTaskId: taskId, hubspotFormId: hubspot.formId });
  } catch (err: unknown) {
    console.error('Process route error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';

    if (submissionId) {
      try {
        await supabaseAdmin.from('advisor_submissions').update({ status: 'failed', error_message: message }).eq('id', submissionId);
      } catch (updateErr) {
        console.error('Failed to update Supabase status:', updateErr);
      }
      // Best-effort Slack failure notification (no submission object available here)
      try {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `:x: *Process route failed* for submission \`${submissionId}\`\nError: ${message}`,
            }),
          });
        }
      } catch { /* ignore */ }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Slack helper ──────────────────────────────────────────────────────────────

async function sendSlackNotification(
  s: AdvisorSubmission,
  wrikeTaskUrl: string | null,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const pageTypeLabel = PAGE_TYPE_LABELS[s.pageType];
  const topics = s.financialTopics.slice(0, 3).join(', ') + (s.financialTopics.length > 3 ? '…' : '');

  if (success) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `:white_check_mark: *Advisor intake processed successfully!*` },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Advisor*\n${s.fullName}` },
              { type: 'mrkdwn', text: `*Location*\n${s.cityAndState}` },
              { type: 'mrkdwn', text: `*Page Type*\n${pageTypeLabel}` },
              { type: 'mrkdwn', text: `*Topics*\n${topics}` },
            ],
          },
          ...(wrikeTaskUrl ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Wrike Task*\n<${wrikeTaskUrl}|View Landing Page Brief>` },
          }] : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'Processed via Savvy Advisor Process Route' }],
          },
        ],
      }),
    });
  } else {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `:x: *Advisor intake processing failed*` },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Advisor*\n${s.fullName}` },
              { type: 'mrkdwn', text: `*Error*\n${errorMessage ?? 'Unknown error'}` },
            ],
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'Failed via Savvy Advisor Process Route' }],
          },
        ],
      }),
    });
  }
}
