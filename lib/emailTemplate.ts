import { parseCityState } from './states';

export type PageType = 'solo_savvy' | 'solo_dba' | 'multi_savvy' | 'multi_dba';

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  solo_savvy: 'Solo Advisor (Savvy Brand)',
  solo_dba: 'Solo Advisor (DBA Brand)',
  multi_savvy: 'Multi-Advisor Team (Savvy Brand)',
  multi_dba: 'Multi-Advisor Team (DBA Brand)',
};

export interface AdvisorSubmission {
  pageType: PageType;
  fullName: string;
  cityAndState: string;
  linkedIn: string;
  yearsOfExperience: string;
  financialTopics: string[];
  howBecameAdvisor: string;
  clientTypes: string;
  areasOfExpertise: string;
  strategies: string;
  uniqueApproach: string;
  favoritePartWorking: string;
  likesAboutSavvy: string;
  designations: string;
  currentBio: string;
  dbaName: string;
}

const DISCLOSURE =
  'Neither Savvy Wealth, nor Savvy Advisors compensates directly for testimonials or endorsements provided herein, by advisers. However advisors may have an indirect financial incentive to provide testimonials.';

function row(label: string, value: string, highlight = false): string {
  const bg = highlight ? 'background-color:#FFF8F1;' : 'background-color:#ffffff;';
  return `
    <tr style="${bg}">
      <td style="padding:10px 16px;font-weight:600;color:#000000;width:220px;vertical-align:top;border-bottom:1px solid #e5e7eb;">${label}</td>
      <td style="padding:10px 16px;color:#374151;vertical-align:top;border-bottom:1px solid #e5e7eb;">${value || '<em style="color:#9ca3af;">[To be filled]</em>'}</td>
    </tr>`;
}

function sectionHeader(title: string): string {
  return `
    <tr>
      <td colspan="2" style="background-color:#175242;color:#ffffff;font-weight:700;font-size:14px;padding:10px 16px;letter-spacing:0.05em;text-transform:uppercase;">${title}</td>
    </tr>`;
}

function faqRow(q: string, a: string): string {
  return `
    <tr>
      <td colspan="2" style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
        <div style="font-weight:600;color:#000000;margin-bottom:6px;">${q}</div>
        <div style="color:#374151;white-space:pre-wrap;">${escapeHtml(a)}</div>
      </td>
    </tr>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildEmailHtml(data: AdvisorSubmission): string {
  const { city, stateAbbr, stateFull } = parseCityState(data.cityAndState);

  const topicsHtml = data.financialTopics
    .map((t) => `<li style="margin-bottom:4px;">${escapeHtml(t)}</li>`)
    .join('');

  const pageTypeLabel = PAGE_TYPE_LABELS[data.pageType] ?? data.pageType;

  const dbaSection = data.dbaName
    ? `${sectionHeader('DBA Details')}${row('DBA Name', escapeHtml(data.dbaName), true)}`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Advisor Submission: ${escapeHtml(data.fullName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#FFF8F1;font-family:'DM Sans',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8F1;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color:#000000;padding:28px 32px;">
              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Savvy</div>
              <div style="font-size:13px;color:#8E7E57;margin-top:4px;font-style:italic;">Forging the future of wealth management.</div>
              <div style="margin-top:16px;font-size:20px;color:#ffffff;font-weight:600;">New Advisor Submission</div>
              <div style="font-size:14px;color:#9ca3af;margin-top:4px;">${escapeHtml(data.fullName)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">

                ${sectionHeader('Advisor Profile')}
                ${row('Page Type', escapeHtml(pageTypeLabel), true)}
                ${row('Full Name (display)', escapeHtml(data.fullName))}
                ${row('Location (City, State)', `${escapeHtml(city)}, ${escapeHtml(stateAbbr)}`, true)}
                ${row('Location (Full State)', escapeHtml(stateFull))}
                ${row('Years of Experience', escapeHtml(data.yearsOfExperience), true)}
                ${row('Certifications / Designations', escapeHtml(data.designations))}
                ${row('E-mail', '', true)}
                ${row('LinkedIn', `<a href="${escapeHtml(data.linkedIn)}" style="color:#8E7E57;">${escapeHtml(data.linkedIn)}</a>`)}
                ${row('Phone #', '', true)}
                ${row('DBA Name', data.dbaName ? escapeHtml(data.dbaName) : '—')}
                ${row('HubSpot Code', '', true)}
                ${row('Calendly Code', '')}
                ${row('Advisor Quote', '', true)}
                ${row('Disclosures', DISCLOSURE)}

                ${sectionHeader('Page Content')}
                <tr>
                  <td style="padding:10px 16px;font-weight:600;color:#000000;width:220px;vertical-align:top;border-bottom:1px solid #e5e7eb;background-color:#FFF8F1;">Hero Section Intro / Bio</td>
                  <td style="padding:10px 16px;color:#374151;vertical-align:top;border-bottom:1px solid #e5e7eb;background-color:#FFF8F1;white-space:pre-wrap;">${escapeHtml(data.currentBio)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-weight:600;color:#000000;width:220px;vertical-align:top;border-bottom:1px solid #e5e7eb;">How Can I Help?<br/><em style="font-weight:400;font-size:12px;color:#6b7280;">(Financial Topics)</em></td>
                  <td style="padding:10px 16px;color:#374151;vertical-align:top;border-bottom:1px solid #e5e7eb;">
                    <ul style="margin:0;padding-left:20px;">${topicsHtml}</ul>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-weight:600;color:#000000;width:220px;vertical-align:top;border-bottom:1px solid #e5e7eb;background-color:#FFF8F1;">Get to Know ${escapeHtml(data.fullName.split(' ')[0])}<br/><em style="font-weight:400;font-size:12px;color:#6b7280;">(Areas of Expertise)</em></td>
                  <td style="padding:10px 16px;color:#374151;vertical-align:top;border-bottom:1px solid #e5e7eb;background-color:#FFF8F1;white-space:pre-wrap;">${escapeHtml(data.areasOfExpertise)}</td>
                </tr>

                ${sectionHeader('FAQ Answers')}
                ${faqRow('1. How did you become a financial advisor?', data.howBecameAdvisor)}
                ${faqRow('2. What types of clients do you work with?', data.clientTypes)}
                ${faqRow('3. What areas of expertise do you have?', data.areasOfExpertise)}
                ${faqRow('4. What types of strategies do you usually help clients with?', data.strategies)}
                ${faqRow('5. Is there a unique approach that sets you apart?', data.uniqueApproach)}
                ${faqRow('6. What is your favorite part about working with clients?', data.favoritePartWorking)}
                ${faqRow('7. What do you like about working with Savvy?', data.likesAboutSavvy)}

                ${dbaSection}

                <!-- Footer -->
                <tr>
                  <td colspan="2" style="background-color:#000000;padding:20px 24px;text-align:center;">
                    <div style="color:#9ca3af;font-size:12px;">Submitted via Savvy Advisor Intake Form</div>
                    <div style="color:#8E7E57;font-size:12px;margin-top:4px;font-style:italic;">Forging the future of wealth management.</div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
