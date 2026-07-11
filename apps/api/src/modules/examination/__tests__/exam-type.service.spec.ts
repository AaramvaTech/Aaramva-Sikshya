import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExamTypeService } from '../exam-type.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

const EXAM_TYPE_ROW = {
  id: 'et-1',
  name: 'First Terminal',
  weight_percent: '30.00',
  academic_year_id: 'ay-1',
  grading_scale_id: null,
  order_index: 1,
  results_published_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

describe('ExamTypeService — setPublished (PUSH-1 new event)', () => {
  let service: ExamTypeService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExamTypeService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), run: jest.fn(), execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: jest.fn().mockReturnValue({ tenantId: 't-1', slug: 'demo' }) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(ExamTypeService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  afterEach(() => jest.clearAllMocks());

  it('emits result.published on the unpublished→published edge', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'et-1', results_published_at: null }]) // existing
      .mockResolvedValueOnce([EXAM_TYPE_ROW]) // update RETURNING
      .mockResolvedValueOnce([{ total: '100' }]); // total weight

    await service.setPublished('et-1', true);

    expect(eventEmitter.emit).toHaveBeenCalledWith('result.published', {
      tenantSlug: 'demo',
      examTypeId: 'et-1',
      examTypeName: 'First Terminal',
      academicYearId: 'ay-1',
    });
  });

  it('does NOT re-emit when the term was already published', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'et-1', results_published_at: new Date() }])
      .mockResolvedValueOnce([EXAM_TYPE_ROW])
      .mockResolvedValueOnce([{ total: '100' }]);

    await service.setPublished('et-1', true);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does NOT emit on unpublish', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'et-1', results_published_at: new Date() }])
      .mockResolvedValueOnce([{ ...EXAM_TYPE_ROW, results_published_at: null }])
      .mockResolvedValueOnce([{ total: '100' }]);

    await service.setPublished('et-1', false);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
