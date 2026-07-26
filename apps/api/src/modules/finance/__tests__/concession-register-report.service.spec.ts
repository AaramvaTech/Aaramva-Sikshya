import { Test } from '@nestjs/testing';
import { ConcessionRegisterReportService } from '../concession-register-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'sc-1',
  student_id: 'student-1',
  student_admission_number: 'STU-2083-0001',
  first_name: 'Aarav',
  last_name: 'Shrestha',
  class_name: 'Grade 5',
  fee_head_id: 'head-1',
  fee_head_name: 'Tuition',
  type: 'PERCENT',
  value: '20.00',
  cap_amount: '500.00',
  discount_reason_id: 'reason-1',
  discount_reason_name: 'Scholarship',
  applied_by_first_name: 'Ram',
  applied_by_last_name: 'Accountant',
  created_at: new Date('2026-04-14T06:00:00Z'),
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  total_count: '1',
};

describe('ConcessionRegisterReportService', () => {
  let service: ConcessionRegisterReportService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConcessionRegisterReportService,
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConcessionRegisterReportService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  it('maps student, head, type, value, reason, and who/when applied', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);
    const result = await service.findAll({});
    expect(result.data[0]).toMatchObject({
      studentName: 'Aarav Shrestha',
      studentAdmissionNumber: 'STU-2083-0001',
      className: 'Grade 5',
      feeHeadName: 'Tuition',
      type: 'PERCENT',
      value: 20,
      capAmount: 500,
      discountReasonName: 'Scholarship',
      appliedBy: 'Ram Accountant',
    });
    expect(result.meta.total).toBe(1);
  });

  it('filters by academicYearId, classId, and discountReasonId when given', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    await service.findAll({ academicYearId: 'year-1', classId: 'class-1', discountReasonId: 'reason-1' });
    const [sql, ...params] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('sc.academic_year_id = $1::uuid');
    expect(sql).toContain('s.class_id = $2::uuid');
    expect(sql).toContain('sc.discount_reason_id = $3::uuid');
    expect(params).toEqual(['year-1', 'class-1', 'reason-1', 20, 0]);
  });
});
