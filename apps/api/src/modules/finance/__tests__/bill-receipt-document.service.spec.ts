import { Test } from '@nestjs/testing';
import { BillReceiptDocumentService } from '../bill-receipt-document.service';
import { BillPaymentService } from '../bill-payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { StorageService } from '../../storage/storage.service';
import { BillReceiptService } from '../bill-receipt.service';
import { BillReceiptA5Service } from '../bill-receipt-a5.service';
import { Role } from '../../common/enums/role.enum';
import { ConflictException } from '@nestjs/common';
import { assertReceiptPrintable } from '../bill-receipt-document.service';

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

// BILL-PRINT-1: the receipt now reads the SAME tenant header the bill does
// (TENANT_HEADER_SELECT), because the A5 stationery carries a full letterhead.
const mockTenantRow = {
  name: 'Demo School', principal_name: 'Dr. Kamala Shrestha', brand_color: null, print_language: null,
  logo_url: null, pan_number: '301234567', registration_number: 'REG-1', address: 'Kathmandu',
  phone: '01-4780123', website: 'demo.edu.np', tagline: null, payment_instructions: null,
  qr_image_url: null, principal_signature_url: null, school_stamp_url: null,
};

describe('BillReceiptDocumentService.getOrGenerateReceiptPdf', () => {
  let service: BillReceiptDocumentService;
  let billPaymentService: jest.Mocked<BillPaymentService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let storageService: jest.Mocked<StorageService>;
  let billReceiptService: jest.Mocked<BillReceiptService>;
  let billReceiptA5Service: jest.Mocked<BillReceiptA5Service>;

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
        // BILL-PRINT-1: the A5 stationery renderer. These cases all exercise the
        // default (thermal) format, so it is never called — but it is a real
        // constructor dependency and must resolve.
        { provide: BillReceiptA5Service, useValue: { render: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillReceiptDocumentService);
    billPaymentService = module.get(BillPaymentService) as jest.Mocked<BillPaymentService>;
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    storageService = module.get(StorageService) as jest.Mocked<StorageService>;
    billReceiptService = module.get(BillReceiptService) as jest.Mocked<BillReceiptService>;
    billReceiptA5Service = module.get(BillReceiptA5Service) as jest.Mocked<BillReceiptA5Service>;
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
    expect(storageService.headObject).toHaveBeenCalledWith('tenant_demo/bill-receipt/payment-1-v2-thermal-EN.pdf');
  });

  it('generates, stores, and presigns on first request — fetches student/class + invoice numbers for allocations', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9', section_name: 'A', roll_number: 14 }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027', bs_year: 2083, bs_month: 4 }])
      .mockResolvedValueOnce([{ full_name: 'Sita Maharjan' }])
      .mockResolvedValueOnce([{ sum: '2150.00' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/new');

    const result = await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result).toEqual({ presignedUrl: 'https://minio.local/new', generated: true });
    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.studentName).toBe('Om Subedi');
    expect(renderedData.className).toBe('Grade 9');
    expect(renderedData.allocations).toEqual([
      { invoiceNumber: 'BINV-2083-000027', amount: 1350, installment: 'Shrawan 2083' },
    ]);
    // BILL-PRINT-1: as-of-entry balance and the receiving cashier's name.
    expect(renderedData.balanceAfter).toBe(2150);
    expect(renderedData.receivedByName).toBe('Sita Maharjan');
    expect(renderedData.advanceAmount).toBe(450);
    expect(renderedData.amountInWordsEn).toEqual(expect.stringContaining('Eight Hundred'));
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v2-thermal-EN.pdf', Buffer.from('%PDF'), 'application/pdf',
    );
  });

  it('B8-6 gate: a stored printLanguage=NE falls back to EN while the BILL-PRINT-1 keyset is unreviewed', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockTenantRow, print_language: 'NE' }]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9', section_name: 'A', roll_number: 14 }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027', bs_year: 2083, bs_month: 4 }])
      .mockResolvedValueOnce([{ full_name: 'Sita Maharjan' }])
      .mockResolvedValueOnce([{ sum: '2150.00' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT, 'NE');

    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.language).toBe('EN');
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v2-thermal-EN.pdf', expect.any(Buffer), 'application/pdf',
    );
  });

  it('no allocations (ADVANCE_ONLY payment): skips the invoice-number lookup entirely', async () => {
    const advanceOnlyPayment = { ...mockPayment, allocations: [], allocatedAmount: 0, advanceAmount: 1800 };
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(advanceOnlyPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9', section_name: 'A', roll_number: 14 }])
      .mockResolvedValueOnce([{ full_name: 'Sita Maharjan' }])
      .mockResolvedValueOnce([{ sum: '0.00' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    // The invoice-number lookup is still skipped when there is nothing to look
    // up. BILL-PRINT-1 note: this used to assert a query COUNT of 1, which was
    // a proxy for "no invoice lookup" that stopped being one once the receipt
    // also read the received-by name and the as-of-entry balance. Asserting on
    // the SQL itself tests the actual intent instead of a fragile count.
    const sql = (tenantPrisma.query as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(sql.some((q) => q.includes('bill_invoices'))).toBe(false);
    const renderedData = (billReceiptService.render as jest.Mock).mock.calls[0][0];
    expect(renderedData.allocations).toEqual([]);
    expect(renderedData.advanceAmount).toBe(1800);
  });

  // -- BILL-RCPT-STATUS ------------------------------------------------------
  // The defect: this endpoint had no status check at all, so 16 of demo's 31
  // payments printed "Amount received" for money that never arrived or was
  // reversed.

  /** The refusal must happen before ANY storage call. Asserted by leaving
   *  headObject primed to succeed - if the order were wrong, the cached URL
   *  would come back instead of the throw. */
  const primeRefusalCase = (status: string) => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce({ ...mockPayment, status });
    (storageService.headObject as jest.Mock).mockResolvedValue({ size: 999, contentType: 'application/pdf' });
    (storageService.presignRead as jest.Mock).mockResolvedValue('https://minio.local/cached');
  };

  it.each([
    ['BOUNCED', 'RECEIPT_PAYMENT_BOUNCED'],
    ['VOIDED', 'RECEIPT_PAYMENT_VOIDED'],
  ])('%s refuses with a 409 and never reaches storage', async (status, code) => {
    primeRefusalCase(status);

    await expect(service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT))
      .rejects.toThrow(ConflictException);

    expect(storageService.headObject).not.toHaveBeenCalled();
    expect(storageService.presignRead).not.toHaveBeenCalled();
    expect(billReceiptService.render).not.toHaveBeenCalled();
    expect(billReceiptA5Service.render).not.toHaveBeenCalled();

    // The catalog code is the client's contract (ERR-1 section 1.1) - the web
    // maps it to a specific message, so an accidental swap to a generic code
    // would silently degrade the UI to "Failed to open the receipt".
    primeRefusalCase(status);
    await expect(
      service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT),
    ).rejects.toMatchObject({ response: { code } });
  });

  it('THE reprint rule: a receipt cached while CLEARED refuses once the payment has bounced', async () => {
    // The exact population the ruling exists to protect. This receipt was
    // issued and stored days ago; the cheque has since bounced. Below the
    // headObject call the rule would do nothing here - the object is present
    // and would be handed straight back.
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce({ ...mockPayment, status: 'BOUNCED' });
    (storageService.headObject as jest.Mock).mockResolvedValue({ size: 41234, contentType: 'application/pdf' });
    (storageService.presignRead as jest.Mock).mockResolvedValue('https://minio.local/the-cached-receipt');

    await expect(service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT))
      .rejects.toThrow(ConflictException);

    // Refusing to serve is NOT deleting: the artifact stays a true record of
    // what was handed over at the time. Nothing in this service may mutate it.
    expect(storageService.putObject).not.toHaveBeenCalled();
    expect(storageService.presignRead).not.toHaveBeenCalled();
  });

  it('PENDING renders an acknowledgement - provisional flag set, own cache key', async () => {
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockPayment, status: 'PENDING', method: 'CHEQUE', ledgerEntryId: null,
    });
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9', section_name: 'A', roll_number: 14 }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027', bs_year: 2083, bs_month: 4 }])
      .mockResolvedValueOnce([{ full_name: 'Sita Maharjan' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/pending');

    const result = await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    expect(result.generated).toBe(true);
    expect((billReceiptService.render as jest.Mock).mock.calls[0][0].provisional).toBe(true);
    // A separate artifact from the receipt this payment gets once it clears -
    // otherwise the cleared reprint would serve the "subject to clearance" slip.
    expect(storageService.headObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v2-thermal-EN-pending.pdf',
    );
    expect(storageService.putObject).toHaveBeenCalledWith(
      'tenant_demo/bill-receipt/payment-1-v2-thermal-EN-pending.pdf', expect.any(Buffer), 'application/pdf',
    );
  });

  it('CLEARED is unchanged: provisional false, and the key keeps no suffix', async () => {
    // Guards the no-invalidation promise - every object BILL-PRINT-1 already
    // stored must stay reachable at exactly the key it was written under.
    (billPaymentService.findOne as jest.Mock).mockResolvedValueOnce(mockPayment);
    (publicPrisma.query as jest.Mock).mockResolvedValueOnce([mockTenantRow]);
    (storageService.headObject as jest.Mock).mockResolvedValueOnce(null);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ student_name: 'Om Subedi', class_name: 'Grade 9', section_name: 'A', roll_number: 14 }])
      .mockResolvedValueOnce([{ id: 'invoice-1', invoice_number: 'BINV-2083-000027', bs_year: 2083, bs_month: 4 }])
      .mockResolvedValueOnce([{ full_name: 'Sita Maharjan' }])
      .mockResolvedValueOnce([{ sum: '2150.00' }]);
    (billReceiptService.render as jest.Mock).mockResolvedValueOnce(Buffer.from('%PDF'));
    (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/x');

    await service.getOrGenerateReceiptPdf('payment-1', 'accountant-1', Role.ACCOUNTANT);

    expect((billReceiptService.render as jest.Mock).mock.calls[0][0].provisional).toBe(false);
    expect(storageService.headObject).toHaveBeenCalledWith('tenant_demo/bill-receipt/payment-1-v2-thermal-EN.pdf');
  });
});

describe('assertReceiptPrintable', () => {
  it.each(['CLEARED', 'PENDING'])('%s may produce a document', (status) => {
    expect(() => assertReceiptPrintable(status)).not.toThrow();
  });

  it.each(['BOUNCED', 'VOIDED'])('%s refuses', (status) => {
    expect(() => assertReceiptPrintable(status)).toThrow(ConflictException);
  });

  it('an unrecognised status refuses rather than printing', () => {
    // The CHECK constraint admits exactly four values, so a fifth means the
    // enum grew without this rule being revisited. Defaulting to "print it"
    // would hand out a receipt for a state nobody has ruled on.
    expect(() => assertReceiptPrintable('REVERSED')).toThrow(ConflictException);
  });
});

