import { Test } from '@nestjs/testing';
import { BillDocumentService } from '../bill-document.service';
import { BillInvoiceService } from '../bill-invoice.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';
import { BillPdfService } from '../bill-pdf.service';
import { Role } from '../../common/enums/role.enum';
import { amountInWords } from '../../../common/money/amount-in-words';
import { Money } from '../../../common/money/money';

const mockInvoice = {
  id: 'invoice-1',
  invoiceNumber: 'BINV-2083-000001',
  studentId: 'student-1',
  studentName: 'Test Student',
  admissionNumber: 'ADM-1',
  className: 'Grade 9',
  academicYearId: 'year-1',
  billRunId: 'run-1',
  bsYear: 2083,
  bsMonth: 4,
  issueDate: '2026-07-20',
  dueDate: '2026-08-05',
  grossAmount: 1500,
  concessionAmount: 100,
  taxableBase: 1400,
  taxRate: 13,
  taxAmount: 182,
  netAmount: 1582,
  previousBalance: 0,
  totalReceivable: 1582,
  amountInWordsEn: 'One Thousand Five Hundred Eighty-Two Rupees',
  amountInWordsNe: null,
  status: 'POSTED',
  ledgerEntryId: 'ledger-1',
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  items: [
    {
      id: 'item-1', feeHeadId: 'head-1', transportRouteId: null, itemName: 'Tuition',
      recurrence: 'MONTHLY', grossAmount: 1500, concessionAmount: 100, isTaxable: true,
      netAmount: 1400, prorationNote: null, createdAt: new Date().toISOString(),
    },
  ],
};

describe('BillDocumentService.getOrGenerateBillPdf', () => {
  let service: BillDocumentService;
  let billInvoiceService: jest.Mocked<BillInvoiceService>;
  let storageService: jest.Mocked<StorageService>;
  let billPdfService: jest.Mocked<BillPdfService>;
  let publicPrisma: jest.Mocked<PublicPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillDocumentService,
        { provide: BillInvoiceService, useValue: { findOne: jest.fn() } },
        { provide: PublicPrismaService, useValue: { query: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) } },
        {
          provide: StorageService,
          useValue: {
            headObject: jest.fn(), putObject: jest.fn(), presignRead: jest.fn(), getObjectBuffer: jest.fn(),
          },
        },
        { provide: BillPdfService, useValue: { render: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillDocumentService);
    billInvoiceService = module.get(BillInvoiceService) as jest.Mocked<BillInvoiceService>;
    storageService = module.get(StorageService) as jest.Mocked<StorageService>;
    billPdfService = module.get(BillPdfService) as jest.Mocked<BillPdfService>;
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    jest.clearAllMocks();
  });

  it('B8-3 byte-identical reprint: when the object already exists at the deterministic key, presigns and returns it WITHOUT re-rendering', async () => {
    (billInvoiceService.findOne as jest.Mock).mockResolvedValueOnce(mockInvoice);
    // Language is now resolved (for the key) before the cache check, so the
    // tenant header loads even on a cache hit.
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{
      name: 'Demo School', logo_url: null, pan_number: null, registration_number: null,
      address: null, phone: null, website: null, tagline: null, payment_instructions: null,
      qr_image_url: null, principal_name: null, principal_signature_url: null, school_stamp_url: null,
      brand_color: null, print_language: null,
    }]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce({ size: 12345, contentType: 'application/pdf' });
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/presigned-existing');

    const result = await service.getOrGenerateBillPdf('invoice-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result).toEqual({ presignedUrl: 'https://minio.local/presigned-existing', generated: false });
    expect(billPdfService.render).not.toHaveBeenCalled();
    expect(storageService.putObject).not.toHaveBeenCalled();
    expect(storageService.headObject).toHaveBeenCalledWith('tenant_demo/bill-pdf/invoice-1-v1-EN.pdf');
  });

  it('generates, stores at the deterministic key, and presigns on first request (nothing exists yet)', async () => {
    (billInvoiceService.findOne as jest.Mock).mockResolvedValueOnce(mockInvoice);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{
      name: 'Demo School', logo_url: null, pan_number: null, registration_number: null,
      address: null, phone: null, website: null, tagline: null, payment_instructions: null,
      qr_image_url: null, principal_name: null, principal_signature_url: null, school_stamp_url: null,
    }]);
    (billPdfService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF-1.4 fake'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/presigned-new');

    const result = await service.getOrGenerateBillPdf('invoice-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result).toEqual({ presignedUrl: 'https://minio.local/presigned-new', generated: true });
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-pdf/invoice-1-v1-EN.pdf', Buffer.from('%PDF-1.4 fake'), 'application/pdf',
    );
  });

  it('B8-7 footing: apportions the whole-bill concession (header total minus already-itemized) across every rendered line', async () => {
    const invoiceWithWholeBillConcession = {
      ...mockInvoice,
      grossAmount: 1500, // 1000 tuition + 500 transport
      concessionAmount: 300, // 100 already on the tuition item + 200 un-attributed whole-bill
      taxRate: null,
      taxAmount: 0,
      netAmount: 1200, // pre-tax: gross(1500) - concession(300) — no tax in this case, so no ambiguity
      items: [
        { ...mockInvoice.items[0], grossAmount: 1000, concessionAmount: 100 },
        {
          id: 'item-2', feeHeadId: null, transportRouteId: 'route-1', itemName: 'Transport',
          recurrence: null, grossAmount: 500, concessionAmount: 0, isTaxable: false,
          netAmount: 500, prorationNote: null, createdAt: new Date().toISOString(),
        },
      ],
    };
    (billInvoiceService.findOne as jest.Mock).mockResolvedValueOnce(invoiceWithWholeBillConcession);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{
      name: 'Demo School', logo_url: null, pan_number: null, registration_number: null,
      address: null, phone: null, website: null, tagline: null, payment_instructions: null,
      qr_image_url: null, principal_name: null, principal_signature_url: null, school_stamp_url: null,
    }]);
    (billPdfService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateBillPdf('invoice-1', 'accountant-1', Role.ACCOUNTANT);

    const renderedData = (billPdfService.render as jest.Mock).mock.calls[0][0];
    // whole-bill concession = 300 - 100 = 200, split 1000:500 -> 133.33 / 66.67 (2:1, exact).
    expect(renderedData.items[0].apportionedConcession).toBeCloseTo(133.33, 2);
    expect(renderedData.items[1].apportionedConcession).toBeCloseTo(66.67, 2);
    const printedNetSum = renderedData.items.reduce(
      (acc: number, i: { grossAmount: number; concessionAmount: number; apportionedConcession: number }) =>
        acc + (i.grossAmount - i.concessionAmount - i.apportionedConcession),
      0,
    );
    expect(printedNetSum).toBeCloseTo(invoiceWithWholeBillConcession.netAmount, 2);
  });

  it('BILL-8-BUG-1 follow-up: amount-in-words is computed at render time from total_receivable, overriding a stale stored value — never a live balance lookup', async () => {
    const invoiceWithStaleStoredWords = {
      ...mockInvoice,
      netAmount: 1350,
      previousBalance: 450, // Dr — carried forward from a prior invoice
      totalReceivable: 1800, // net(1350) + previousBalance(450)
      // Deliberately wrong/stale — simulates a pre-BILL-8-BUG-1-fix row.
      // The render must ignore this and compute fresh from totalReceivable.
      amountInWordsEn: 'One Thousand Three Hundred Fifty Rupees',
    };
    (billInvoiceService.findOne as jest.Mock).mockResolvedValueOnce(invoiceWithStaleStoredWords);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{
      name: 'Demo School', logo_url: null, pan_number: null, registration_number: null,
      address: null, phone: null, website: null, tagline: null, payment_instructions: null,
      qr_image_url: null, principal_name: null, principal_signature_url: null, school_stamp_url: null,
    }]);
    (billPdfService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateBillPdf('invoice-1', 'accountant-1', Role.ACCOUNTANT);

    const renderedData = (billPdfService.render as jest.Mock).mock.calls[0][0];
    const expectedWords = amountInWords(Money.fromNumber(1800), 'en');
    expect(renderedData.invoice.amountInWordsEn).toBe(expectedWords);
    expect(renderedData.invoice.amountInWordsEn).not.toBe(invoiceWithStaleStoredWords.amountInWordsEn);
  });

  it('B8-6 gate, end to end through the real orchestration: a tenant with printLanguage=NE stored still renders EN while the review gate is closed, at the EN-suffixed key, with amountInWordsNe still computed (harmless, just not selected for print)', async () => {
    (billInvoiceService.findOne as jest.Mock).mockResolvedValueOnce(mockInvoice);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{
      name: 'Demo School', logo_url: null, pan_number: null, registration_number: null,
      address: null, phone: null, website: null, tagline: null, payment_instructions: null,
      qr_image_url: null, principal_name: null, principal_signature_url: null, school_stamp_url: null,
      brand_color: null, print_language: 'NE', // stored as NE — must not win while the gate is closed
    }]);
    (billPdfService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateBillPdf('invoice-1', 'accountant-1', Role.ACCOUNTANT, 'NE'); // staff override, also NE

    const renderedData = (billPdfService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.language).toBe('EN');
    expect(renderedData.invoice.amountInWordsNe).toEqual(expect.any(String)); // computed regardless
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-pdf/invoice-1-v1-EN.pdf', expect.any(Buffer), 'application/pdf',
    );
  });
});
