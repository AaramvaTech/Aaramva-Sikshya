import { Test } from '@nestjs/testing';
import { FinanceSettingsService } from '../finance-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

describe('FinanceSettingsService', () => {
  let service: FinanceSettingsService;
  let prisma: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        FinanceSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 'tenant-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
      ],
    }).compile();

    service = module.get(FinanceSettingsService);
    jest.clearAllMocks();
  });

  describe('getInvoiceNumberingReset', () => {
    it('reads the current tenant row via raw SQL against the public schema (not the typed Prisma client)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ invoiceNumberingReset: true }]);
      const result = await service.getInvoiceNumberingReset();
      expect(result).toEqual({ invoiceNumberingReset: true });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FROM tenants'),
        'tenant-1',
      );
    });

    it('defaults to false if somehow no row comes back', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      const result = await service.getInvoiceNumberingReset();
      expect(result).toEqual({ invoiceNumberingReset: false });
    });
  });

  describe('setInvoiceNumberingReset', () => {
    it('updates the tenant row and returns the new value', async () => {
      const result = await service.setInvoiceNumberingReset(true);
      expect(result).toEqual({ invoiceNumberingReset: true });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants'),
        true, 'tenant-1',
      );
    });
  });
});
