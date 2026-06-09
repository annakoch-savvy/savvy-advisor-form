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
    // Search by Personal Email Address OR Savvy Email
    const formula = encodeURIComponent(
      `OR(LOWER({Personal Email Address})="${email}", LOWER({Savvy Email})="${email}")`
    );
    const fields = [
      'Advisor Name', 'Personal Email Address', 'Savvy Email',
      'Personal Phone Number', 'City', 'State', 'Designations',
      'Areas of Specialization', 'Professional Bio', 'Brand Name',
      'Start Date', 'AUM', 'Team Type',
    ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    const data = await airtableFetch(
      `${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=${formula}&${fields}&maxRecords=1`
    );

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
