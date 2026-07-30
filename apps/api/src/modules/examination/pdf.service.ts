import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { adToBs } from 'bs-calendar';
import { loadPdfFonts, pickFont as pickPdfFont } from '../../common/pdf/pdf-fonts';

// Structural shape of the report card the PDF renders. Mirrors the object
// returned by ResultService.getReportCard() — kept as a local interface so
// PdfService stays a pure renderer with no runtime dependency on ResultService.
export interface ReportCardSubject {
  subjectName: string;
  fullMarks: number;
  marksObtained: number | null;
  theoryMarks?: number | null;
  practicalMarks?: number | null;
  percentage: number | null;
  grade: string | null;
  isPassed: boolean;
  isAbsent: boolean;
}
export interface ReportCardTerm {
  examType: { id: string; name: string; weightPercent: number; orderIndex: number };
  percentage: number;
  grade: string | null;
  gpa: number | null;
  rankInSection: number | null;
  rankInClass: number | null;
  isPassed: boolean;
  status: string;
  subjects: ReportCardSubject[];
}
export interface ReportCardData {
  student: {
    id: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    className: string;
    sectionName: string;
    academicYear: string;
  };
  examResults: ReportCardTerm[];
  annualResult: {
    weightedPercentage: number;
    finalGrade: string | null;
    finalGpa: number | null;
    division: string;
    isPassed: boolean;
  };
}

const PRIMARY = '#0B6B43'; // Aaramva brand green
const MUTED = '#6b7280';
const BORDER = '#d1d5db';

@Injectable()
export class PdfService {
  // Shared embedded fonts + script detection — see common/pdf/pdf-fonts.ts.
  private readonly fonts = loadPdfFonts();

  private pickFont(text: string, bold = false): string {
    return pickPdfFont(text, bold);
  }

  renderReportCard(rc: ReportCardData, opts: { schoolName: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const [name, buf] of Object.entries(this.fonts)) doc.registerFont(name, buf);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      // ── Header: school name + Nepali title ──────────────────────────────────
      doc.font(this.pickFont(opts.schoolName, true)).fontSize(20).fillColor(PRIMARY)
        .text(opts.schoolName, { align: 'center' });
      doc.font('deva-bold').fontSize(13).fillColor('#111827')
        .text('प्रगति-पत्र', { align: 'center' }); // "Report Card" in Nepali (Devanagari)
      doc.font('latin').fontSize(9).fillColor(MUTED)
        .text(`Academic Year ${rc.student.academicYear || '—'}`, { align: 'center' });
      doc.moveTo(left, doc.y + 6).lineTo(left + pageW, doc.y + 6).strokeColor(PRIMARY).lineWidth(1.5).stroke();
      doc.moveDown(1.2);

      // ── Student identity ────────────────────────────────────────────────────
      const idy = doc.y;
      const colW = pageW / 2;
      const field = (label: string, value: string, x: number, y: number) => {
        doc.font('latin').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y);
        doc.font(this.pickFont(value, true)).fontSize(10.5).fillColor('#111827').text(value || '—', x, y + 10);
      };
      field('Student Name', rc.student.fullName, left, idy);
      field('Admission No.', rc.student.admissionNumber, left + colW, idy);
      field('Class / Section', `${rc.student.className} ${rc.student.sectionName}`.trim(), left, idy + 30);
      field('Roll No.', rc.student.rollNumber != null ? String(rc.student.rollNumber) : '—', left + colW, idy + 30);
      doc.y = idy + 64;

      // ── Per-term tables ─────────────────────────────────────────────────────
      for (const term of rc.examResults) {
        this.renderTerm(doc, term, left, pageW);
      }

      // ── Annual summary ──────────────────────────────────────────────────────
      this.renderAnnual(doc, rc.annualResult, left, pageW);

      // ── Footer (every page) ─────────────────────────────────────────────────
      const today = new Date();
      const bs = adToBs(today);
      const bsStr = `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('latin').fontSize(7.5).fillColor(MUTED).text(
          `Generated ${bsStr} BS · system-generated, reflects published results only`,
          left,
          doc.page.height - 30,
          { align: 'center', width: pageW },
        );
      }

      doc.end();
    });
  }

  private renderTerm(doc: PDFKit.PDFDocument, term: ReportCardTerm, left: number, pageW: number) {
    if (doc.y > doc.page.height - 160) doc.addPage();

    // Term heading band
    doc.rect(left, doc.y, pageW, 22).fill('#eef6f1');
    const bandY = doc.y + 6;
    doc.font(this.pickFont(term.examType.name, true)).fontSize(11).fillColor(PRIMARY)
      .text(term.examType.name, left + 8, bandY);
    const meta = [
      term.gpa != null ? `GPA ${term.gpa.toFixed(2)}` : null,
      term.grade ? `Grade ${term.grade}` : null,
      term.rankInClass != null ? `Rank ${term.rankInClass}` : null,
    ].filter(Boolean).join('   ');
    doc.font('latin').fontSize(9).fillColor('#111827').text(meta, left, bandY, { align: 'right', width: pageW - 8 });
    doc.y = bandY + 18;

    // Column layout: Subject | Full | Theory | Practical | Obtained | Grade
    const cols = [
      { key: 'subject', label: 'Subject', w: 0.40, align: 'left' as const },
      { key: 'full', label: 'Full', w: 0.12, align: 'right' as const },
      { key: 'theory', label: 'Theory', w: 0.13, align: 'right' as const },
      { key: 'practical', label: 'Practical', w: 0.13, align: 'right' as const },
      { key: 'obtained', label: 'Obtained', w: 0.12, align: 'right' as const },
      { key: 'grade', label: 'Grade', w: 0.10, align: 'right' as const },
    ];
    const xs: number[] = [];
    let acc = left;
    for (const c of cols) { xs.push(acc); acc += c.w * pageW; }

    // Header row (English labels → latin)
    const hy = doc.y;
    doc.font('latin-bold').fontSize(8.5).fillColor(MUTED);
    cols.forEach((c, i) => doc.text(c.label, xs[i] + 2, hy, { width: c.w * pageW - 4, align: c.align }));
    doc.y = hy + 13;
    doc.moveTo(left, doc.y - 2).lineTo(left + pageW, doc.y - 2).strokeColor(BORDER).lineWidth(0.5).stroke();

    const num = (v: number | null | undefined) => (v == null ? '—' : String(v));
    for (const s of term.subjects) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const ry = doc.y + 2;
      // subject name may be Nepali → pick per script; numbers → latin
      doc.font(this.pickFont(s.subjectName)).fontSize(9).fillColor('#111827')
        .text(s.subjectName, xs[0] + 2, ry, { width: cols[0].w * pageW - 4, align: 'left' });
      const numCells = [
        num(s.fullMarks),
        s.isAbsent ? 'Abs' : num(s.theoryMarks),
        s.isAbsent ? 'Abs' : num(s.practicalMarks),
        s.isAbsent ? 'Abs' : num(s.marksObtained),
        s.grade ?? '—',
      ];
      doc.font('latin').fontSize(9).fillColor('#111827');
      numCells.forEach((val, i) => {
        const ci = i + 1;
        doc.text(val, xs[ci] + 2, ry, { width: cols[ci].w * pageW - 4, align: cols[ci].align });
      });
      doc.y = ry + 13;
    }
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.moveDown(0.8);
  }

  private renderAnnual(
    doc: PDFKit.PDFDocument,
    annual: ReportCardData['annualResult'],
    left: number,
    pageW: number,
  ) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.moveDown(0.4);
    const y = doc.y;
    doc.rect(left, y, pageW, 70).fillAndStroke('#f0fdf4', PRIMARY);
    doc.font('latin-bold').fontSize(12).fillColor(PRIMARY).text('Annual Summary', left + 12, y + 10);

    const items: [string, string][] = [
      ['Final Weighted %', `${annual.weightedPercentage.toFixed(2)}%`],
      ['Final GPA', annual.finalGpa != null ? annual.finalGpa.toFixed(2) : '—'],
      ['Final Grade', annual.finalGrade ?? '—'],
      ['Division', annual.division],
      ['Result', annual.isPassed ? 'PASS' : 'FAIL'],
    ];
    const cw = pageW / items.length;
    items.forEach(([label, value], i) => {
      const x = left + i * cw;
      doc.font('latin').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x + 8, y + 34, { width: cw - 10 });
      doc.font(this.pickFont(value, true)).fontSize(12).fillColor('#111827').text(value, x + 8, y + 46, { width: cw - 10 });
    });
    doc.y = y + 80;
  }
}
