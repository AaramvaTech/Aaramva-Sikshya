import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillPrintJobService } from '../bill-print-job.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';
import { StorageService } from '../../storage/storage.service';

const mockJobRow = {
  id: 'job-1',
  job_type: 'RUN',
  ref_run_id: 'run-1',
  ref_class_id: null,
  ref_section_id: null,
  ref_bs_year: null,
  ref_bs_month: null,
  invoice_ids: ['inv-1', 'inv-2'],
  language: 'EN',
  status: 'PENDING',
  total: 2,
  processed: 0,
  failed_count: 0,
  failures: [],
  result_key: null,
  created_by: 'user-1',
  created_at: new Date('2026-07-30'),
  started_at: null,
  completed_at: null,
};

describe('BillPrintJobService', () => {
  let service: BillPrintJobService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let publicPrisma: jest.Mocked<PublicPrismaService>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillPrintJobService,
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: jest.fn().mockReturnValue({ tenantId: 't-1', slug: 'demo' }) } },
        { provide: PublicPrismaService, useValue: { query: jest.fn() } },
        { provide: StorageService, useValue: { presignRead: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillPrintJobService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    publicPrisma = module.get(PublicPrismaService) as jest.Mocked<PublicPrismaService>;
    storageService = module.get(StorageService) as jest.Mocked<StorageService>;
    jest.clearAllMocks();
  });

  describe('createForRun', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.createForRun('missing-run', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a run with zero posted invoices', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1' }]) // run exists
        .mockResolvedValueOnce([]); // no posted invoices
      await expect(service.createForRun('run-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('resolves posted invoice ids and freezes them onto the job row', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'run-1' }])
        .mockResolvedValueOnce([{ id: 'inv-1' }, { id: 'inv-2' }])
        .mockResolvedValueOnce([mockJobRow]);
      (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{ print_language: 'EN' }]);

      const result = await service.createForRun('run-1', 'user-1');

      expect(result.total).toBe(2);
      expect(result.status).toBe('PENDING');
      expect(tenantPrisma.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO bill_print_jobs'),
        'run-1',
        JSON.stringify(['inv-1', 'inv-2']),
        'EN',
        2,
        'user-1',
      );
    });
  });

  describe('createForClass', () => {
    const dto = { classId: 'class-1', bsYear: 2083, bsMonth: 3 };

    it('rejects when no posted invoices match the class+period', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.createForClass(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('narrows to a section when sectionId is given', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'inv-1' }])
        .mockResolvedValueOnce([{ ...mockJobRow, job_type: 'CLASS' }]);
      (publicPrisma.query as jest.Mock).mockResolvedValueOnce([{ print_language: 'EN' }]);

      await service.createForClass({ ...dto, sectionId: 'section-1' }, 'user-1');

      expect(tenantPrisma.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('s.section_id = $4::uuid'),
        'class-1', 2083, 3, 'section-1',
      );
    });
  });

  describe('findOne', () => {
    it('404s on a missing job', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns progress fields with no download link while still running', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockJobRow, status: 'RUNNING', processed: 1 }]);
      const result = await service.findOne('job-1');
      expect(result.status).toBe('RUNNING');
      expect(result.downloadUrl).toBeUndefined();
      expect(storageService.presignRead).not.toHaveBeenCalled();
    });

    it('presigns a download link once the job is COMPLETED', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockJobRow, status: 'COMPLETED', processed: 2, result_key: 'tenant_demo/bill-print-job/job-1-v1.pdf' },
      ]);
      (storageService.presignRead as jest.Mock).mockResolvedValueOnce('https://minio.local/signed');

      const result = await service.findOne('job-1');

      expect(result.downloadUrl).toBe('https://minio.local/signed');
      expect(storageService.presignRead).toHaveBeenCalledWith('tenant_demo/bill-print-job/job-1-v1.pdf');
    });
  });
});
