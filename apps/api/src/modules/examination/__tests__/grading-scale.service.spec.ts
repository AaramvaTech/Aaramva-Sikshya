import { Test } from '@nestjs/testing';
import { GradingScaleService } from '../grading-scale.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const nebThresholds = [
  { id: 't1', grading_scale_id: 'scale-1', grade: 'A+', gpa_point: '4.00', min_percent: '90.00', max_percent: '100.00', remarks: 'Outstanding', created_at: new Date() },
  { id: 't2', grading_scale_id: 'scale-1', grade: 'A',  gpa_point: '3.60', min_percent: '80.00', max_percent: '89.99', remarks: 'Excellent',    created_at: new Date() },
  { id: 't3', grading_scale_id: 'scale-1', grade: 'B+', gpa_point: '3.20', min_percent: '70.00', max_percent: '79.99', remarks: 'Very Good',     created_at: new Date() },
  { id: 't4', grading_scale_id: 'scale-1', grade: 'B',  gpa_point: '2.80', min_percent: '60.00', max_percent: '69.99', remarks: 'Good',          created_at: new Date() },
  { id: 't5', grading_scale_id: 'scale-1', grade: 'C',  gpa_point: '2.40', min_percent: '50.00', max_percent: '59.99', remarks: 'Satisfactory',  created_at: new Date() },
  { id: 't6', grading_scale_id: 'scale-1', grade: 'D',  gpa_point: '2.00', min_percent: '40.00', max_percent: '49.99', remarks: 'Acceptable',    created_at: new Date() },
];

describe('GradingScaleService', () => {
  let service: GradingScaleService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GradingScaleService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn(),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(GradingScaleService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
  });

  describe('calculateGrade()', () => {
    it("returns 'A+' for 95% on NEB scale", async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce(nebThresholds);

      const result = await service.calculateGrade(95, 'scale-1');

      expect(result.grade).toBe('A+');
      expect(result.gpaPoint).toBe(4.0);
    });

    it("returns 'NG' for percentage outside all thresholds", async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { id: 't6', grading_scale_id: 'scale-1', grade: 'D', gpa_point: '2.00', min_percent: '40.00', max_percent: '49.99', remarks: null, created_at: new Date() },
      ]);

      const result = await service.calculateGrade(20, 'scale-1');

      expect(result.grade).toBe('NG');
      expect(result.gpaPoint).toBeNull();
    });
  });
});
