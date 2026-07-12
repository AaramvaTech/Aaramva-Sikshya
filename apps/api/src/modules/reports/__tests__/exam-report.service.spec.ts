import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExamReportService } from '../exam-report.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

describe('ExamReportService', () => {
  let service: ExamReportService;
  const queryMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ExamReportService,
        { provide: TenantPrismaService, useValue: { query: queryMock } },
      ],
    }).compile();
    service = module.get(ExamReportService);
  });

  describe('the publish boundary (privacy gate)', () => {
    it('404s summary/comparison for an unpublished exam — indistinguishable from missing', async () => {
      queryMock.mockResolvedValueOnce([]); // assertPublished finds nothing
      await expect(service.getSummary('exam-1')).rejects.toThrow(NotFoundException);
      expect(queryMock).toHaveBeenCalledTimes(1); // no aggregation queries ran

      queryMock.mockResolvedValueOnce([]);
      await expect(service.getComparison('exam-1')).rejects.toThrow(NotFoundException);
    });

    it('student progress only joins published exam types (the SQL carries the gate)', async () => {
      queryMock.mockResolvedValueOnce([]);
      await service.getStudentProgress('stu-1');
      const sql = queryMock.mock.calls[0][0] as string;
      expect(sql).toContain('results_published_at IS NOT NULL');
    });
  });

  describe('getSummary — crafted fixture, hand-computed', () => {
    it('aggregates per-subject stats + grade distribution exactly', async () => {
      queryMock
        .mockResolvedValueOnce([{ ok: 1 }]) // published gate
        .mockResolvedValueOnce([
          // Math: marks 80, 60, 40 (one absent) → avg 60, hi 80, lo 40; 2 of 3 passed
          { subject_id: 'sub1', subject_name: 'Math', appeared: '3', average: '60', highest: '80', lowest: '40', passed: '2' },
        ])
        .mockResolvedValueOnce([
          { grade: 'A', count: '1' },
          { grade: 'C', count: '2' },
        ])
        .mockResolvedValueOnce([{ students: '3', passed: '2', avg_percentage: '58.333' }]);

      const result = await service.getSummary('exam-1');

      expect(result).toEqual({
        examTypeId: 'exam-1',
        students: 3,
        passRate: 66.7, // 2/3
        averagePercentage: 58.3,
        subjects: [
          {
            subjectId: 'sub1',
            subjectName: 'Math',
            appeared: 3,
            average: 60,
            highest: 80,
            lowest: 40,
            passRate: 66.7,
          },
        ],
        gradeDistribution: [
          { grade: 'A', count: 1 },
          { grade: 'C', count: 2 },
        ],
      });
    });
  });

  describe('getComparison', () => {
    it('computes per-section pass rates (hand-computed)', async () => {
      queryMock
        .mockResolvedValueOnce([{ ok: 1 }])
        .mockResolvedValueOnce([
          { class_name: 'G9', section_name: 'A', students: '10', passed: '9', avg_percentage: '72.55' },
          { class_name: 'G9', section_name: 'B', students: '8', passed: '4', avg_percentage: '48.1' },
        ]);
      const result = await service.getComparison('exam-1');
      expect(result).toEqual([
        { className: 'G9', sectionName: 'A', students: 10, passRate: 90, averagePercentage: 72.6 },
        { className: 'G9', sectionName: 'B', students: 8, passRate: 50, averagePercentage: 48.1 },
      ]);
    });
  });
});
