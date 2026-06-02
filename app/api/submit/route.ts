import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { AdvisorSubmission, PAGE_TYPE_LABELS } from '@/lib/emailTemplate';

export const runtime = 'nodejs';

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

async function findExistingLandingPageTask(onboardingProjectId: string): Promise<boolean> {
  const data = await wrikeFetch(`/folders/${onboardingProjectId}/tasks?title=Savvy+Landing+Page`);
  const tasks: Array<{ title: string }> = data.data ?? [];
  return tasks.some((t) => t.title.trim().toLowerCase() === 'savvy landing page');
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
  const data = await wrikeFetch(`/contacts?fields=[]`);
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

  // Check if a form already exists for this advisor
  const existing = await hubspotFetch(`/marketing/v3/forms?limit=100`);
  const forms: Array<{ id: string; name: string; portalId?: number }> = existing.results ?? [];
  const match = forms.find(
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

const COMPLIANCE_AVOID = [
  'always','highest','revolutionary','amazing','industry leading','safest','attractive returns',
  'innovative','special','award winning','investment gurus','state of the art','best','largest',
  'superior','conservative','leading','time-tested','cutting edge','lucrative','top advisers',
  'dynamic','major','top of the line','enviable','maximum','unbiased','exceptional','never',
  'unique','expert','no risk','unlimited','extensive','outstanding','unmatched','free',
  'peace of mind','unparalleled','guarantee','premier','we treat you like family',
  'help you sleep at night','proven','world class','expertise','smarter','conflict free',
  'no conflict','firm',
];

async function generateWebpageDraft(
  s: AdvisorSubmission,
  hubspotFormId: string,
  hubspotEmbedCode: string,
  calendlyUrl?: string,
  calendlyEmbedCode?: string,
  advisorEmail?: string
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;

  // Build the data table section (always included regardless of AI key)
  const DISCLOSURE = 'Neither Savvy Wealth, nor Savvy Advisors compensates directly for testimonials or endorsements provided herein, by advisers. However advisors may have an indirect financial incentive to provide testimonials.';
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const dataTable = [
    '<b>━━━ ADVISOR DATA TABLE ━━━</b>',
    `<b>Full Name (displayed):</b> ${s.fullName}`,
    `<b>Location (City, State abbr.):</b> ${s.cityAndState}`,
    `<b>Location (Full State):</b> [to be confirmed]`,
    `<b>Years of Experience:</b> ${s.yearsOfExperience}`,
    `<b>Certifications / Designations:</b> ${s.designations || '—'}`,
    s.dbaName ? `<b>DBA Name:</b> ${s.dbaName}` : null,
    `<b>E-mail:</b> ${advisorEmail || '[to be filled]'}`,
    `<b>LinkedIn:</b> ${s.linkedIn}`,
    `<b>Phone #:</b> [to be filled]`,
    `<b>Advisor's Team:</b> [to be filled]`,
    `<b>HubSpot Form ID:</b> ${hubspotFormId}`,
    `<b>HubSpot Embed Code:</b><br><pre>${esc(hubspotEmbedCode)}</pre>`,
    calendlyUrl ? `<b>Calendly Scheduling URL:</b> ${calendlyUrl}` : '<b>Calendly:</b> <i>No 30-min call event found — set up manually</i>',
    calendlyEmbedCode ? `<b>Calendly Embed Code:</b><br><pre>${esc(calendlyEmbedCode)}</pre>` : null,
    `<b>Advisor Quote:</b> [to be filled — "How [Name] works with clients"]`,
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

  const templateGuidance = isMulti && isDba
    ? `This is a multi-advisor team page with DBA branding (like "Benda & Co." or "Colorado Wealth Group"). The DBA name is "${s.dbaName}". Include a [LOGO PLACEHOLDER] note in the Our Team section. Generate content for this advisor's individual section. The "Our Team" intro paragraph should reference the team brand and advisor's role, with a note that other team members' sections will be added separately.`
    : isMulti
    ? `This is a multi-advisor team page under Savvy branding. Generate content for this advisor's individual section. The "Our Team" intro paragraph should reference the team's shared mission, with a note that the other team member's section will be added separately.`
    : isDba
    ? `This is a solo advisor page with their own DBA brand. The DBA name is "${s.dbaName}". Reference the DBA brand naturally where appropriate (e.g., "At ${s.dbaName}, we believe...").`
    : `This is a solo advisor page under Savvy branding.`;

  const complianceNote = `NEVER use these words or phrases (compliance restricted): ${COMPLIANCE_AVOID.join(', ')}. Instead use natural alternatives.`;

  const prompt = `You are writing a financial advisor webpage draft for Savvy Advisors. Generate polished, natural-sounding copy based on the survey responses below.

PAGE TYPE: ${pageTypeLabel}
${templateGuidance}

ADVISOR SURVEY RESPONSES:
- Full Name: ${s.fullName}
- Location: ${s.cityAndState}
- LinkedIn: ${s.linkedIn}
- Years of Experience: ${s.yearsOfExperience}
- Financial Topics: ${s.financialTopics.join(', ')}
- Designations: ${s.designations || 'none listed'}
- Current Bio: ${s.currentBio}
- How they became an advisor: ${s.howBecameAdvisor}
- Types of clients: ${s.clientTypes}
- Areas of expertise: ${s.areasOfExpertise}
- Strategies used: ${s.strategies}
- Unique approach: ${s.uniqueApproach}
- Favorite part of working with clients: ${s.favoritePartWorking}
- What they like about Savvy: ${s.likesAboutSavvy}

WRITING RULES:
- Fix spelling and grammar; keep the advisor's own voice and meaning
- Write naturally — do NOT make it sound AI-generated or overly polished
- Do NOT use em-dashes (—). Use commas, periods, or rewrite the sentence instead
- Do NOT add information that wasn't in the survey responses
- ${complianceNote}
- If an answer is very brief, form it into a clean short paragraph using only what was written

HOW CAN I HELP? SECTION:
Choose exactly 4 options from the list below that best match the advisor's financial topics, expertise, and client types. Copy the option text VERBATIM — do not change a single word.

Available options:
${HOW_CAN_I_HELP_OPTIONS}

OUTPUT FORMAT — Generate each section with these exact headers (use plain text headers, no markdown):

HERO SECTION INTRO
[2-3 sentence intro written in first person. Warm, direct, conversational. Based on the bio and survey answers. For DBA pages, reference the brand name naturally.]

HOW CAN I HELP?
[List the 4 chosen options, each on its own block with Title, Subtitle, Description exactly as written in the options list]
${isMulti ? `
OUR TEAM
[${isDba
  ? `Opening paragraph (2-3 sentences) introducing the ${s.dbaName} team — their shared mission, values, and what sets the team apart. Reference the DBA brand name naturally. End with: "[LOGO PLACEHOLDER — ${s.dbaName} team logo]". Then add a note: "[TEAM MEMBER SECTION: ${s.fullName}]" followed by their individual bio below. Close with a note: "[ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED]".`
  : `Opening paragraph (2-3 sentences) introducing the team under Savvy branding — their shared mission and what they collectively bring to clients. Then add a note: "[TEAM MEMBER SECTION: ${s.fullName}]" followed by their individual bio below. Close with a note: "[ADDITIONAL TEAM MEMBER SECTIONS TO BE ADDED]".`
}]
` : ''}
GET TO KNOW ${s.fullName.toUpperCase()}
[3-4 paragraph bio in third person. Covers career background, areas of focus, what drives them, and a personal detail if mentioned. Natural, warm tone. Use the bio + how they became an advisor answers as source material.]

FAQ

1. How did you become a financial advisor?
[Polished version of their answer — their words, cleaned up]

2. What types of clients do you work with?
[Polished version of their answer]

3. What areas of expertise do you have?
[Polished version of their answer]

4. What types of strategies do you usually help clients with?
[Polished version of their answer]

5. Is there a unique approach that sets you apart?
[Polished version of their answer]

6. What is your favorite part about working with clients?
[Polished version of their answer]

7. Working with Savvy
[Polished version of their answer]`;

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
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

  const drawField = (label: string, value: string, highlight = false) => {
    const lines = wrapText(value || '—', regular, 8, contentWidth - 130);
    const blockH = lines.length * 12 + 8;
    checkY(blockH + 4);
    if (highlight) page.drawRectangle({ x: margin, y: y - blockH + 8, width: contentWidth, height: blockH, color: vanilla });
    page.drawText(label + ':', { x: margin + 8, y: y, size: 8, font: bold, color: gray });
    lines.forEach((line, i) => {
      page.drawText(line, { x: margin + 140, y: y - i * 12, size: 8, font: regular, color: black });
    });
    y -= blockH;
  };

  const drawFaq = (num: string, question: string, answer: string) => {
    const qLines = wrapText(`${num}. ${question}`, bold, 8.5, contentWidth - 16);
    const aLines = wrapText(answer || '—', regular, 8, contentWidth - 16);
    const needed = (qLines.length + aLines.length) * 13 + 16;
    checkY(needed);
    y -= 8;
    qLines.forEach((line, i) => {
      page.drawText(line, { x: margin + 8, y: y - i * 13, size: 8.5, font: bold, color: gold });
    });
    y -= qLines.length * 13 + 4;
    aLines.forEach((line, i) => {
      page.drawText(line, { x: margin + 8, y: y - i * 13, size: 8, font: regular, color: black });
    });
    y -= aLines.length * 13;
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
  checkY(bioLines.length * 12 + 8);
  y -= 6;
  bioLines.forEach((line, i) => {
    page.drawText(line, { x: margin + 8, y: y - i * 12, size: 8, font: regular, color: black });
  });
  y -= bioLines.length * 12;

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
      const needed = lines.length * 11 + 6;
      checkY(needed);
      y -= 4;
      lines.forEach((line, i) => {
        page.drawText(line, { x: margin + 8, y: y - i * 11, size: 7.5, font: regular, color: black });
      });
      y -= needed;
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

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    let financialTopics: string[] = [];
    const topicsRaw = formData.get('financialTopics');
    if (topicsRaw && typeof topicsRaw === 'string') {
      try { financialTopics = JSON.parse(topicsRaw); } catch { financialTopics = [topicsRaw]; }
    }

    const advisorEmail = String(formData.get('email') || '');

    const submission: AdvisorSubmission = {
      pageType: (String(formData.get('pageType') || 'solo_savvy')) as AdvisorSubmission['pageType'],
      fullName: String(formData.get('fullName') || ''),
      cityAndState: String(formData.get('cityAndState') || ''),
      linkedIn: String(formData.get('linkedIn') || ''),
      yearsOfExperience: String(formData.get('yearsOfExperience') || ''),
      financialTopics,
      howBecameAdvisor: String(formData.get('howBecameAdvisor') || ''),
      clientTypes: String(formData.get('clientTypes') || ''),
      areasOfExpertise: String(formData.get('areasOfExpertise') || ''),
      strategies: String(formData.get('strategies') || ''),
      uniqueApproach: String(formData.get('uniqueApproach') || ''),
      favoritePartWorking: String(formData.get('favoritePartWorking') || ''),
      likesAboutSavvy: String(formData.get('likesAboutSavvy') || ''),
      designations: String(formData.get('designations') || ''),
      currentBio: String(formData.get('currentBio') || ''),
      dbaName: String(formData.get('dbaName') || ''),
    };

    // Clean up FAQ text with AI, then run remaining calls in parallel
    const cleaned = await cleanSubmission(submission);

    const [hubspot, calendly, folderId, assigneeId, dueDate] = await Promise.all([
      createHubSpotForm(submission.fullName),
      getCalendlyEmbed(submission.fullName),
      findAdvisorFolder(submission.fullName),
      findContactId('Gonzalo Silva Corcelet'),
      Promise.resolve(formatDate(addBusinessDays(new Date(), 3))),
    ]);

    if (!folderId) {
      return NextResponse.json(
        { error: `No Wrike folder found for advisor "${submission.fullName}". Please ensure the folder exists before submitting.` },
        { status: 404 }
      );
    }

    const onboardingId = await findOnboardingProject(folderId);
    if (!onboardingId) {
      return NextResponse.json(
        { error: `No "Onboarding" project found in the folder for "${submission.fullName}".` },
        { status: 404 }
      );
    }

    // Block duplicate submissions (bypass with _test=true)
    const isTest = formData.get('_test') === 'true';
    const alreadyExists = !isTest && await findExistingLandingPageTask(onboardingId);
    if (alreadyExists) {
      return NextResponse.json(
        { error: `A "Savvy Landing Page" task already exists for "${submission.fullName}". This form can only be submitted once.` },
        { status: 409 }
      );
    }

    // Generate AI webpage draft and create task
    const description = await generateWebpageDraft(cleaned, hubspot.formId, hubspot.embedCode, calendly?.schedulingUrl, calendly?.embedCode, advisorEmail);
    const taskData = await wrikeFetch(`/folders/${onboardingId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Savvy Landing Page',
        description,
        responsibles: assigneeId ? [assigneeId] : [],
        dates: { due: dueDate },
      }),
    });

    // Generate PDF, attach files, and send Slack notification in parallel
    const taskId = taskData?.data?.[0]?.id;
    const wrikeTaskUrl = taskId
      ? `https://www.wrike.com/open.htm?id=${taskId}`
      : null;

    await Promise.all([
      // PDF + photo attachments
      taskId
        ? (async () => {
            const pdfBuffer = await generateAdvisorPdf(cleaned, hubspot.formId, hubspot.embedCode, calendly?.schedulingUrl, calendly?.embedCode, description);
            const pdfFilename = `${cleaned.fullName.replace(/\s+/g, '_')}_Landing_Page_Brief.pdf`;
            const photoFile = formData.get('photo') as File | null;
            await Promise.all([
              attachPdfToWrikeTask(taskId, pdfBuffer, pdfFilename),
              photoFile
                ? (async () => {
                    const photoBuffer = Buffer.from(await photoFile.arrayBuffer());
                    const photoFilename = photoFile.name || `${cleaned.fullName.replace(/\s+/g, '_')}_headshot.jpg`;
                    await attachFileToWrikeTask(taskId, photoBuffer, photoFilename, photoFile.type || 'image/jpeg');
                  })()
                : Promise.resolve(),
            ]);
          })()
        : Promise.resolve(),

      // Slack notification
      (async () => {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) return;
        const pageTypeLabel = PAGE_TYPE_LABELS[cleaned.pageType];
        const topics = cleaned.financialTopics.slice(0, 3).join(', ') + (cleaned.financialTopics.length > 3 ? '…' : '');
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `:tada: *New advisor intake form submitted!*`,
                },
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Advisor*\n${cleaned.fullName}` },
                  { type: 'mrkdwn', text: `*Location*\n${cleaned.cityAndState}` },
                  { type: 'mrkdwn', text: `*Page Type*\n${pageTypeLabel}` },
                  { type: 'mrkdwn', text: `*Topics*\n${topics}` },
                ],
              },
              ...(wrikeTaskUrl ? [{
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Wrike Task*\n<${wrikeTaskUrl}|View Landing Page Brief>`,
                },
              }] : []),
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Submitted via Savvy Advisor Intake Form` }],
              },
            ],
          }),
        });
      })(),
    ]);

    return NextResponse.json({ success: true, hubspotFormId: hubspot.formId });
  } catch (err: unknown) {
    console.error('Submission error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
