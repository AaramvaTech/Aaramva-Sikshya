import { Test } from '@nestjs/testing';
import { ExamScheduleService } from '../exam-schedule.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const TEACHER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CLASS_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const SUBJECT_MATH = 'cccccccc-0000-0000-0000-000000000001';
const EXAM_TYPE_ID = 'dddddddd-0000-0000-0000-000000000001';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eeeeeeee-0000-0000-0000-000000000001',
    exam_type_id: EXAM_TYPE_ID,
    class_id: CLASS_ID,
    subject_id: SUBJECT_MATH,
    exam_type_name: 'Mid-Term',
    subject_name: 'Mathematics',
    class_name: 'Class 10',
    exam_date: '2081-01-15',
    start_time: '10:00:00',
    end_time: '12:00:00',
    full_marks: '100',
    pass_marks: '40',
    theory_marks: null,
    practical_marks: null,
    room: null,
    invigilator_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

describe('ExamScheduleService.getMySchedules', () => {
  let service: ExamScheduleService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExamScheduleService,
        {
          provide: TenantPrismaService,
          useValue: { query: jest.fn(), execute: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ExamScheduleService);
    tenantPrisma = module.get(TenantPrismaService);
  });

  it('returns schedules matching the teacher\'s taught (class, subject) pairs', async () => {
    tenantPrisma.query.mockResolvedValueOnce([makeRow()]);

    const result = await service.getMySchedules(TEACHER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].examTypeName).toBe('Mid-Term');
    expect(result[0].subjectName).toBe('Mathematics');
    expect(result[0].className).toBe('Class 10');
    const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('timetable_slots');
  });

  it('discrimination: userId is bound to teacher_id filter — other teachers\' subjects are excluded by the subquery', async () => {
    // The subquery WHERE ts.teacher_id = $1::uuid limits which (class, subject) pairs are returned.
    // Only rows matching TEACHER_ID's slots come back. Science taught by another teacher won't match.
    tenantPrisma.query.mockResolvedValueOnce([makeRow({ subject_name: 'Mathematics' })]);

    const result = await service.getMySchedules(TEACHER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].subjectName).toBe('Mathematics');

    const [sql, firstParam] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('ts.teacher_id = $1::uuid');
    expect(firstParam).toBe(TEACHER_ID);
  });

  it('DISTINCT: SQL contains DISTINCT so a subject taught in two sections returns one schedule', async () => {
    // The outer SELECT DISTINCT and inner SELECT DISTINCT in the subquery collapse duplicates.
    // Database returns a single row even if the teacher has two sections.
    tenantPrisma.query.mockResolvedValueOnce([makeRow()]);

    const result = await service.getMySchedules(TEACHER_ID);

    expect(result).toHaveLength(1);
    const [sql] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('DISTINCT');
  });

  it('examTypeId passthrough: appends exam_type_id filter and passes value as second param', async () => {
    tenantPrisma.query.mockResolvedValueOnce([makeRow()]);

    await service.getMySchedules(TEACHER_ID, EXAM_TYPE_ID);

    const [sql, ...params] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('exam_type_id');
    expect(params).toContain(EXAM_TYPE_ID);
  });

  it('empty case: no matching slots returns empty array without throwing', async () => {
    tenantPrisma.query.mockResolvedValueOnce([]);

    const result = await service.getMySchedules(TEACHER_ID);

    expect(result).toEqual([]);
  });

  it('resolves from token only: userId is bound as the first positional SQL parameter', async () => {
    tenantPrisma.query.mockResolvedValueOnce([]);

    await service.getMySchedules(TEACHER_ID);

    const [, firstParam] = (tenantPrisma.query as jest.Mock).mock.calls[0];
    expect(firstParam).toBe(TEACHER_ID);
  });
});
