import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StudentFeeOverrideService } from '../student-fee-override.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'sfo-1',
  student_id: 'student-1',
  fee_head_id: 'head-1',
  fee_head_name: 'Tuition',
  academic_year_id: 'year-1',
  override_amount: '5000.00',
  reason: 'Financial hardship',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  created_by: 'user-1',
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

describe('StudentFeeOverrideService', () => {
  let service: StudentFeeOverrideService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StudentFeeOverrideService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentFeeOverrideService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('create() inserts with a ::numeric cast and maps overrideAmount to a number', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.create(
      {
        studentId: 'student-1',
        feeHeadId: 'head-1',
        academicYearId: 'year-1',
        overrideAmount: '5000.00',
        effectiveFrom: '2026-04-14',
      },
      'user-1',
    );
    expect(result.overrideAmount).toBe(5000);
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('$4::numeric'),
      'student-1',
      'head-1',
      'year-1',
      '5000.00',
      null,
      '2026-04-14',
      null,
      'user-1',
    );
  });

  it('findAll() paginates and reports total from the window count', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRow, total_count: '2' }]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(1);
  });

  it('update() 404s on a missing row', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await expect(service.update('missing', { overrideAmount: '100' })).rejects.toThrow(NotFoundException);
  });

  it('softDelete() 404s on a missing row', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);
    await expect(service.softDelete('missing')).rejects.toThrow(NotFoundException);
  });

  it('findActiveForStudent() filters by the effective range around asOfDate', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.findActiveForStudent('student-1', 'year-1', '2026-04-20');
    expect(tenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('effective_from <= $3::date'),
      'student-1',
      'year-1',
      '2026-04-20',
    );
    expect(result).toEqual([mockRow]);
  });
});
