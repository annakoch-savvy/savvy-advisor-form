import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const AIRTABLE_BASE = 'appe9fIxKmK0p57vj';
const AIRTABLE_TABLE = 'tblPJhoOwOwctvCHE'; // Advisor CRM

async function airtableFetch(path: string) {
  const token = process.env.AIRTABLE_API_KEY;
  if (!token) throw new Error('AIRTABLE_API_KEY not set');
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Airtable error ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase();
  if (!email) return NextResponse.json({ advisor: null });

  try {
    const fields = [
      'Advisor Name', 'Personal Email Address', 'Savvy Email',
      'Personal Phone Number', 'City', 'State', 'Designations',
      'Areas of Specialization', 'Professional Bio', 'Brand Name',
      'LinkedIn', 'Start Date', 'Team Type',
    ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    // Try 1: match by stored email fields
    const emailFormula = encodeURIComponent(
      `OR(LOWER(TRIM({Personal Email Address}))="${email}", LOWER(TRIM({Savvy Email}))="${email}")`
    );
    let data = await airtableFetch(
      `${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=${emailFormula}&${fields}&maxRecords=1`
    );

    // Try 2: if Savvy email (@savvyadvisors.com), derive name and search by Advisor Name
    if (!data.records?.length && email.endsWith('@savvyadvisors.com')) {
      const namePart = email.replace('@savvyadvisors.com', ''); // e.g. "rahul.sarin"
      const nameParts = namePart.split('.');
      const firstName = nameParts[0] || '';
      const lastName = nameParts[nameParts.length - 1] || '';
      if (firstName && lastName && firstName !== lastName) {
        const nameFormula = encodeURIComponent(
          `AND(FIND(LOWER("${firstName}"), LOWER({Advisor Name}))>0, FIND(LOWER("${lastName}"), LOWER({Advisor Name}))>0)`
        );
        data = await airtableFetch(
          `${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=${nameFormula}&${fields}&maxRecords=1`
        );
      }
    }

    const record = data.records?.[0];
    if (!record) return NextResponse.json({ advisor: null });

    const f = record.fields;
    const nameParts = (f['Advisor Name'] || '').trim().split(' ');
    const cityState = [f['City'], f['State']].filter(Boolean).join(', ');

    // Map AUM to years of experience heuristic from Start Date
    let yearsExp = '';
    if (f['Start Date']) {
      const years = new Date().getFullYear() - new Date(f['Start Date']).getFullYear();
      yearsExp = years > 0 ? String(years) : '';
    }

    return NextResponse.json({
      advisor: {
        firstName: nameParts[0] || '',
        middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '',
        lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
        phone: f['Personal Phone Number'] || '',
        cityAndState: cityState,
        firmName: f['Brand Name'] || '',
        designations: Array.isArray(f['Designations']) ? f['Designations'].join(', ') : (f['Designations'] || ''),
        currentBio: f['Professional Bio'] || '',
        yearsOfExperience: yearsExp,
        linkedIn: f['LinkedIn'] || '',
        // Provide as context — advisor can edit
        _airtableSource: true,
        _advisorName: f['Advisor Name'] || '',
      },
    });
  } catch (err) {
    console.error('Airtable lookup error:', err);
    return NextResponse.json({ advisor: null });
  }
}
