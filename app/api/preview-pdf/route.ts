import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PAGE_TYPE_LABELS } from '@/lib/emailTemplate';

export const runtime = 'nodejs';
export const maxDuration = 30;

function wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || '').replace(/\n/g, ' \n ').split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word === '\n') { lines.push(current.trim()); current = ''; continue; }
    const test = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current.trim()); current = word;
    } else current = test;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    let financialTopics: string[] = [];
    const topicsRaw = formData.get('financialTopics');
    if (topicsRaw && typeof topicsRaw === 'string') {
      try { financialTopics = JSON.parse(topicsRaw); } catch { financialTopics = [topicsRaw]; }
    }

    const data = {
      fullName:           String(formData.get('fullName') || ''),
      email:              String(formData.get('email') || ''),
      cityAndState:       String(formData.get('cityAndState') || ''),
      linkedIn:           String(formData.get('linkedIn') || ''),
      yearsOfExperience:  String(formData.get('yearsOfExperience') || ''),
      pageType:           String(formData.get('pageType') || 'solo_savvy'),
      firmName:           String(formData.get('firmName') || ''),
      designations:       String(formData.get('designations') || ''),
      financialTopics,
      currentBio:         String(formData.get('currentBio') || ''),
      howBecameAdvisor:   String(formData.get('howBecameAdvisor') || ''),
      clientTypes:        String(formData.get('clientTypes') || ''),
      areasOfExpertise:   String(formData.get('areasOfExpertise') || ''),
      strategies:         String(formData.get('strategies') || ''),
      uniqueApproach:     String(formData.get('uniqueApproach') || ''),
      favoritePartWorking:String(formData.get('favoritePartWorking') || ''),
      likesAboutSavvy:    String(formData.get('likesAboutSavvy') || ''),
    };

    const pdfDoc = await PDFDocument.create();
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pageWidth  = 612;
    const pageHeight = 792;
    const margin     = 50;
    const contentWidth = pageWidth - margin * 2;
    const gold  = rgb(0.557, 0.494, 0.341);
    const green = rgb(0.090, 0.322, 0.259);
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const gray  = rgb(0.4, 0.4, 0.4);
    const cream = rgb(0.96, 0.94, 0.91);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const addPage = () => { page = pdfDoc.addPage([pageWidth, pageHeight]); y = pageHeight - margin; };
    const checkY  = (needed: number) => { if (y < margin + needed) addPage(); };

    const drawLine = (text: string, x: number, size: number, font: import('pdf-lib').PDFFont, color: import('pdf-lib').RGB, lineH: number) => {
      checkY(lineH + 2);
      page.drawText(text, { x, y, size, font, color });
      y -= lineH;
    };

    const drawSection = (title: string) => {
      checkY(30);
      y -= 8;
      page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 18, color: green });
      page.drawText(title.toUpperCase(), { x: margin + 8, y: y + 1, size: 8, font: bold, color: white });
      y -= 20;
    };

    const drawField = (label: string, value: string) => {
      if (!value.trim()) return;
      checkY(16);
      page.drawText(label + ':', { x: margin + 8, y, size: 7.5, font: bold, color: gray });
      const lines = wrapText(value, regular, 8, contentWidth - 130);
      lines.forEach((line) => {
        checkY(12);
        page.drawText(line, { x: margin + 140, y, size: 8, font: regular, color: black });
        y -= 12;
      });
      y -= 2;
    };

    const drawFaq = (q: string, answer: string) => {
      if (!answer.trim()) return;
      const qLines = wrapText(q, bold, 8.5, contentWidth - 16);
      y -= 8;
      qLines.forEach((line) => drawLine(line, margin + 8, 8.5, bold, gold, 13));
      y -= 3;
      wrapText(answer, regular, 8, contentWidth - 16).forEach((line) => drawLine(line, margin + 8, 8, regular, black, 12));
    };

    // ── Header ──────────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: pageHeight - 65, width: pageWidth, height: 65, color: black });
    page.drawText('Savvy', { x: margin, y: pageHeight - 32, size: 20, font: bold, color: white });
    page.drawText('Forging the future of wealth management.', { x: margin, y: pageHeight - 48, size: 8, font: regular, color: gold });
    page.drawText('Advisor Profile', { x: 370, y: pageHeight - 36, size: 13, font: bold, color: white });
    y = pageHeight - 80;

    // ── Profile ──────────────────────────────────────────────────────────────────
    drawSection('Advisor Profile');
    drawField('Name', data.fullName);
    drawField('Email', data.email);
    drawField('Location', data.cityAndState);
    drawField('LinkedIn', data.linkedIn);
    drawField('Experience', data.yearsOfExperience + ' years');
    drawField('Designations', data.designations);
    drawField('Page Type', PAGE_TYPE_LABELS[data.pageType as keyof typeof PAGE_TYPE_LABELS] || data.pageType);
    if (data.firmName) drawField('Firm / Brand', data.firmName);
    drawField('Topics', data.financialTopics.join(', '));

    // ── Bio ──────────────────────────────────────────────────────────────────────
    drawSection('Bio');
    y -= 4;
    wrapText(data.currentBio, regular, 8, contentWidth - 16).forEach((line) => drawLine(line, margin + 8, 8, regular, black, 12));

    // ── FAQ ──────────────────────────────────────────────────────────────────────
    drawSection('FAQ Answers');
    drawFaq('How did you become a financial advisor?', data.howBecameAdvisor);
    drawFaq('What types of clients do you work with?', data.clientTypes);
    drawFaq('What areas of expertise do you have?', data.areasOfExpertise);
    drawFaq('What strategies do you usually help clients with?', data.strategies);
    drawFaq('Is there a unique approach that sets you apart?', data.uniqueApproach);
    drawFaq('What is your favorite part about working with clients?', data.favoritePartWorking);
    drawFaq('What do you like about working with Savvy?', data.likesAboutSavvy);

    // ── Footer on each page ──────────────────────────────────────────────────────
    pdfDoc.getPages().forEach((p) => {
      p.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 28, color: cream });
      p.drawText('Savvy Advisor Intake Form — Responses', { x: margin, y: 9, size: 7, font: regular, color: gray });
    });

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.fullName.replace(/\s+/g, '_')}_Advisor_Profile.pdf"`,
      },
    });
  } catch (err) {
    console.error('Preview PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
