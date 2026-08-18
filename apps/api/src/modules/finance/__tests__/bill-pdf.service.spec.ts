import { BillPdfService, BillPdfData } from '../bill-pdf.service';

function makeData(overrides: Partial<BillPdfData['invoice']> = {}): BillPdfData {
  return {
    tenant: {
      name: 'Demo School Nepal', logoBuffer: null, panNumber: '301234567',
      registrationNumber: 'REG-KTM-2019-04521', address: 'Kathmandu', phone: '01-4780123',
      website: null, tagline: null, paymentInstructions: null, qrImageBuffer: null,
      principalName: 'Dr. Kamala Shrestha', principalSignatureBuffer: null, schoolStampBuffer: null,
      accentColor: '#0f6e56', accentTint: '#eaf5f1',
    },
    invoice: {
      invoiceNumber: 'BINV-2083-000001', studentName: 'Om Subedi', admissionNumber: 'STU-001',
      className: 'Grade 9', bsYear: 2083, bsMonth: 3, issueDateAd: '2026-06-01', issueDateBs: '2083-02-18',
      dueDateAd: '2026-06-15', dueDateBs: '2083-03-01', taxRate: null, taxAmount: 0, netAmount: 1000,
      previousBalance: 0, totalReceivable: 1000, amountInWordsEn: 'One Thousand', amountInWordsNe: 'एक हजार',
      ...overrides,
    },
    items: [{ itemName: 'Tuition', grossAmount: 1000, concessionAmount: 0, apportionedConcession: 0, isTaxable: false }],
    language: 'EN',
  };
}

/** Checkpoint C (B8-9): merged multi-invoice PDF. Counting `/Type /Page`
 *  markers (not `/Type /Pages`) in the raw PDF bytes is a simple, reliable
 *  page-count proof without a PDF-parsing dependency — verified empirically
 *  to match pdfkit's actual output for both single and multi-page docs. */
function countPageMarkers(buffer: Buffer): number {
  const text = buffer.toString('latin1');
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

describe('BillPdfService', () => {
  const service = new BillPdfService();

  it('render() produces a single-page PDF for one invoice', async () => {
    const buffer = await service.render(makeData());
    expect(countPageMarkers(buffer)).toBe(1);
  });

  // BILL-PRINT-1 changed this contract deliberately: an invoice is now an A5
  // half, so a sheet carries TWO of them and three invoices occupy two sheets
  // (the trailing half is left blank). Before, each invoice took a whole A4
  // page. The old assertion (3 invoices -> 3 pages) encoded the single-A4
  // layout that the new stationery replaces.
  it('renderMerged() packs two A5 documents per A4 sheet', async () => {
    const dataList = [
      makeData({ invoiceNumber: 'BINV-2083-000001', studentName: 'Om Subedi' }),
      makeData({ invoiceNumber: 'BINV-2083-000002', studentName: 'Sita Rai' }),
      makeData({ invoiceNumber: 'BINV-2083-000003', studentName: 'Hari Thapa' }),
    ];
    const buffer = await service.renderMerged(dataList);
    expect(countPageMarkers(buffer)).toBe(2);
  });

  it('renderMerged() rejects an empty invoice list rather than producing a zero-page PDF', () => {
    expect(() => service.renderMerged([])).toThrow('at least one invoice');
  });
});
