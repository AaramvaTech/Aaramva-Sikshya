import { Test } from '@nestjs/testing';
import { BillReceiptDocumentService } from '../bill-receipt-document.service';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';
import { BillReceiptService } from '../bill-receipt.service';
import { Role } from '../../common/enums/role.enum';

const mockPayment = {
  id: 'payment-1',
  receiptNumber: 'RCPT-2083-000001',
  studentId: 'student-1',
  academicYearId: 'year-1',
  amount: 1800,
  method: 'CASH',
  status: 'CLEARED',
  receivedDate: '2026-07-30',
  receivedBs: { year: 2083, month: 4, day: 14 },
  reference: null,
  chequeBank: null,
  chequeDate: null,
  allocationMode: 'AUTO_FIFO',
  ledgerEntryId: 'ledger-1',
  gatewayTxnRef: null,
  notes: null,
  receivedBy: 'user-1',
  createdAt: new Date().toISOString(),
  clearedAt: new Date().toISOString(),
  clearedBy: 'user-1',
  bouncedAt: null,
  bouncedBy: null,
  bounceReason: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  allocations: [
    { id: 'alloc-1', billInvoiceId: 'invoice-1', amount: 1350, createdAt: new Date().toISOString() },
  ],
  allocatedAmount: 1350,
  advanceAmount: 450,
};

const mockTenantRow = {
  name: 'Demo School', principal_name: 'Dr. Kamala Shrestha', brand_color: null, print_language: null,
};

describe('BillReceiptDocumentService.getOrGenerateReceiptPdf', () => {
  let service: BillReceiptDocumentService;
  let billPaymentService: jest.Mocked<BillPaymentService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let storageService: jest.Mocked<StorageService>;
  let billReceiptService: jest.Mocked<BillReceiptService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillReceiptDocumentService,
        { provide: BillPaymentService, useValue: { findOne: jest.fn() } },
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
        { provide: PublicPrismaService, useValue: { query: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo' }) } },
        {
          provide: StorageService,
          useValue: { headObject: jest.fn(), putObject: jest.fn(), presignRead: jest.fn() },
        },
        { provide: BillReceiptService, useValue: { render: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillReceiptDocumentService);
    billPaymentService = module.get(BillPaymentService) as jest.Mocked<BillPaymentService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    storageService = module.get(StorageService) as jest.Mocked<StorageService>;
    billReceiptService = module.get(BillReceiptService) as jest.Mocked<BillReceiptService>;
    jest.clearAllMocks();
  });

  it('B8-3 byte-identical reprint: existing object at the deterministic key — presigns, does not re-render', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce({ size: 999, contentType: 'application/pdf' });
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/existing');

    const result = await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result).toEqual({ presignedUrl: 'https://minio.local/existing', generated: false });
    expect(billReceiptService.render).not.toHaveBeenCalled();
    expect(storageService.headObject).toHaveBeenCalledWith('tenant_demo/bill-receipt/payment-1-v1-EN.pdf');
  });

  it('generates, stores, and presigns on first request — fetches student/class + invoice numbers for allocations', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9' }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/new');

    const result = await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result).toEqual({ presignedUrl: 'https://minio.local/new', generated: true });
    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.studentName).toBe('Om Subedi');
    expect(renderedData.className).toBe('Grade 9');
    expect(renderedData.allocations).toEqual([{ invoiceNumber: 'BINV-2083-000027', amount: 1350 }]);
    expect(renderedData.advanceAmount).toBe(450);
    expect(renderedData.amountInWordsEn).toEqual(expect.stringContaining('Eight Hundred'));
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v1-EN.pdf', Buffer.from('%PDF'), 'application/pdf',
    );
  });

  it('B8-6 gate: a stored printLanguage=NE resolves NE now that the review gate is open (B8-6, reviewed 2026-07-30)', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockTenantRow, print_language: 'NE' }]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9' }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT, 'NE');

    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.language).toBe('NE');
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v1-NE.pdf', expect.any(Buffer), 'application/pdf',
    );
  });

  it('no allocations (ADVANCE_ONLY payment): skips the invoice-number lookup entirely', async () => {
    const advanceOnlyPayment = { ...mockPayment, allocations: [], allocatedAmount: 0, advanceAmount: 1800 };
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(advanceOnlyPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    // Only ONE tenantPrisma.query call (student lookup) — no second call for
    // invoice numbers when there's nothing to look up.
    expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.allocations).toEqual([]);
    expect(renderedData.advanceAmount).toBe(1800);
  });
});
