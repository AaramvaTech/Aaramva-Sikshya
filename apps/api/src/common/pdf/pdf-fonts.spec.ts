import PDFDocument from 'pdfkit';
import { loadPdfFonts, drawMixedText } from './pdf-fonts';

/**
 * BILL-8 Checkpoint B regression: found live — a translated label
 * (possibly Devanagari) concatenated with independently-scripted dynamic
 * data (a tenant name, usually Latin) and rendered via ONE pickFont() call
 * on the whole string tofu'd whichever script that one font didn't cover.
 * pdftotext can't distinguish "renders correctly" from "renders as tofu"
 * for Devanagari either way (a separate, disclosed limitation — see
 * BILL-BUGS.md), so this test doesn't try to prove glyphs are visually
 * correct. What it DOES prove, with a real PDFDocument (not mocked): each
 * run is font-picked independently — a Devanagari run gets a 'deva' font,
 * a Latin run gets a 'latin' font, in the SAME drawMixedText call. Before
 * the fix, one .font() call covered the whole concatenated string.
 */
describe('drawMixedText', () => {
  function makeDoc() {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    doc.on('data', () => {}); // drain — this test never reads the output bytes
    const fonts = loadPdfFonts();
    for (const [name, buf] of Object.entries(fonts)) doc.registerFont(name, buf);
    return doc;
  }

  it('font-picks each run independently for a Devanagari label + Latin value (the reported bug)', () => {
    const doc = makeDoc();
    const fontSpy = jest.spyOn(doc, 'font');

    drawMixedText(
      doc,
      [{ text: 'को तर्फबाट: ' }, { text: 'Demo School Nepal' }],
      40, 40,
      { width: 300, align: 'right', fontSize: 9, color: '#111827' },
    );

    const fontsUsed = fontSpy.mock.calls.map((c) => c[0]);
    expect(fontsUsed).toContain('deva'); // the label run
    expect(fontsUsed).toContain('latin'); // the value run — this is the fix:
    // before it, only 'deva' (picked from the label) was ever selected, and
    // the Latin run was drawn through it anyway.
    doc.end();
  });

  it('all-Latin runs never pick a Devanagari font (no regression for the common case)', () => {
    const doc = makeDoc();
    const fontSpy = jest.spyOn(doc, 'font');

    drawMixedText(
      doc,
      [{ text: 'Reg. No. ' }, { text: 'REG-KTM-2019-04521' }],
      40, 40,
      { width: 200, align: 'right', fontSize: 7.5, color: '#6b7280' },
    );

    // drawMixedText calls .font() twice per run (once to measure width,
    // once to draw) — the meaningful assertion is that it's never 'deva'.
    expect(fontSpy.mock.calls.every((c) => c[0] === 'latin')).toBe(true);
    doc.end();
  });

  it('right-aligns the combined run so the last run ends flush with x + width', () => {
    const doc = makeDoc();
    const textSpy = jest.spyOn(doc, 'text');
    const x = 40;
    const width = 300;

    drawMixedText(doc, [{ text: 'For: ' }, { text: 'Demo School' }], x, 40, {
      width, align: 'right', fontSize: 9, color: '#111827',
    });

    doc.font('latin').fontSize(9);
    const w1 = doc.widthOfString('For: ');
    const w2 = doc.widthOfString('Demo School');
    const [firstCall, secondCall] = textSpy.mock.calls;
    const firstX = firstCall[1] as number;
    const secondX = secondCall[1] as number;
    // First run starts at x + width - totalWidth; second run starts right
    // after the first ends — together they end exactly at x + width.
    expect(firstX).toBeCloseTo(x + width - (w1 + w2), 1);
    expect(secondX).toBeCloseTo(firstX + w1, 1);
    expect(secondX + w2).toBeCloseTo(x + width, 1);
    doc.end();
  });
});
