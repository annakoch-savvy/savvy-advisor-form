import { NextResponse } from 'next/server';

// Temporary test endpoint — remove after Slack notification is verified
export async function GET() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: ':tada: *New advisor intake form submitted!*' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Advisor*\nAmy Batta' },
            { type: 'mrkdwn', text: '*Location*\nDallas, TX' },
            { type: 'mrkdwn', text: '*Page Type*\nSolo Advisor (Savvy Brand)' },
            { type: 'mrkdwn', text: '*Topics*\nRetirement Planning, Tax Optimization' },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Wrike Task*\n<https://www.wrike.com|View Landing Page Brief>' },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'Submitted via Savvy Advisor Intake Form' }],
        },
      ],
    }),
  });

  const text = await res.text();
  return NextResponse.json({ status: res.status, response: text });
}
