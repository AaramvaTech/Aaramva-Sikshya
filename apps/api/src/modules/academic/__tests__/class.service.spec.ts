import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClassService } from '../class.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockClassRow = {
  id: 'class-1',
  name: 'Grade 10',
  alias: 'X',
  order_index: 10,
  created_at: new Date('2024-04-14T00:00:00Z'),
  updated_at: new Date('2024-04-14T00:00:00Z'),
  deleted_at: null,
  section_count: '2',
  student_count: '30',
  sections: [],
  total_count: '1',
};

const mockSectionRow = {
  id: 'sec-1',
  class_id: 'class-1',
  name: 'A',
  capacity: 40,
  class_teacher_id: null,
  created_at: new Date('2024-04-14T00:00:00Z'),
  updated_at: new Date('2024-04-14T00:00:00Z'),
  deleted_at: null,
  class_teacher_name: null,
};

describe('ClassService', () => {
  let service: ClassService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ClassService,
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

    service = module.get(ClassService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
  });

  describe('createClass()', () => {
    it('creates class and returns mapped response with correct orderIndex', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockClassRow]);

      const result = await service.createClass({
        name: 'Grade 10',
        alias: 'X',
        orderIndex: 10,
      });

      expect(result.id).toBe('class-1');
      expect(result.name).toBe('Grade 10');
      expect(result.orderIndex).toBe(10);
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO classes'),
        'Grade 10',
        'X',
        10,
      );
    });
  });

  describe('deleteClass()', () => {
    it('throws BadRequestException when students are enrolled', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ count: '5' }]);

      await expect(service.deleteClass('class-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('soft-deletes class when no students enrolled', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ count: '0' }]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(1);

      await service.deleteClass('class-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at'),
        'class-1',
      );
    });

    it('throws NotFoundException when class does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ count: '0' }]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0);

      await expect(service.deleteClass('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getSections()', () => {
    it('returns only non-deleted sections for the class', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        mockSectionRow,
        { ...mockSectionRow, id: 'sec-2', name: 'B' },
      ]);

      const result = await service.getSections('class-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
      expect(tenantPrisma.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        'class-1',
      );
    });
  });
});
