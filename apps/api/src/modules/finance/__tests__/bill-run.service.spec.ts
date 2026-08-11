import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillRunService } from '../bill-run.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { BillLineResolverService } from '../bill-line-resolver.service';
import { BillRunScope } from '../dto/bill-run.dto';

const mockRunRow = {
  id: 'run-1',
  academic_year_id: 'year-1',
  bs_year: 2083,
  bs_month: 3,
  scope: 'CLASS',
  class_id: 'class-1',
  status: 'DRAFT',
  issue_date: new Date('2026-07-16'),
  due_date: new Date('2026-07-31'),
  total_students: 2,
  total_gross: '0',
  total_concession: '0',
  total_tax: '0',
  total_net: '0',
  idempotency_key: 'demo:year-1:3:CLASS:class-1',
  created_by: 'user-1',
  posted_by: null,
  posted_at: null,
  created_at: new Date('2026-07-16'),
  updated_at: new Date('2026-07-16'),
  deleted_at: null,
};

function baseDto() {
  return {
    academicYearId: 'year-1',
    scope: BillRunScope.CLASS,
    classId: 'class-1',
    bsYear: 2083,
    bsMonth: 3,
  };
}

describe('BillRunService', () => {
  let service: BillRunService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let billLineResolverService: jest.Mocked<BillLineResolverService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillRunService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        { provide: BillLineResolverService, useValue: { resolve: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillRunService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    billLineResolverService = module.get(BillLineResolverService) as jest.Mocked<BillLineResolverService>;
    jest.clearAllMocks();
  });

  describe('generateDraft', () => {
    it('rejects CLASS scope without classId', async () => {
      await expect(
        service.generateDraft({ ...baseDto(), classId: undefined }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the academic year does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // academic year check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('404s when the class does not exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([]); // class check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('409s when a run already exists for this period+scope', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([{ id: 'existing-run', status: 'DRAFT' }]); // idempotency check
      await expect(service.generateDraft(baseDto(), 'user-1')).rejects.toThrow(ConflictException);
    });

    it('creates zero bill_run_lines and a zero-student run when the roster is empty', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([]) // idempotency check: none existing
        .mockResolvedValueOnce([]) // roster: empty class
        .mockResolvedValueOnce([{ ...mockRunRow, total_students: 0 }]) // INSERT bill_runs RETURNING *
        .mockResolvedValueOnce([{ ...mockRunRow, total_students: 0 }]); // final aggregate UPDATE RETURNING *

      const result = await service.generateDraft(baseDto(), 'user-1');
      expect(result.totalStudents).toBe(0);
      expect(result.outcomeSummary).toEqual({});
      expect(billLineResolverService.resolve).not.toHaveBeenCalled();
    });

    it('records DRAFT for a student with an active assignment and SKIPPED_NO_ASSIGNMENT for one without', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([{ id: 'class-1' }]) // class check
        .mockResolvedValueOnce([]) // idempotency check
        .mockResolvedValueOnce([{ id: 'student-1' }, { id: 'student-2' }]) // roster
        .mockResolvedValueOnce([mockRunRow]) // INSERT bill_runs RETURNING *
        .mockResolvedValueOnce([]) // student-1 already-billed check: none
        .mockResolvedValueOnce([]) // student-2 already-billed check: none
        .mockResolvedValueOnce([{ ...mockRunRow, total_gross: '5000.00', total_net: '4500.00', total_concession: '500.00' }]); // final aggregate UPDATE RETURNING *

      billLineResolverService.resolve
        .mockResolvedValueOnce({
          outcome: 'DRAFT', skipReason: null, gross: 5000, concession: 500,
          taxableBase: 0, taxRate: null, taxAmount: 0, net: 4500, items: [],
        })
        .mockResolvedValueOnce({
          outcome: 'SKIPPED_NO_ASSIGNMENT',
          skipReason: 'No active fee structure assignment for this student in the given academic year',
          gross: 0, concession: 0, taxableBase: 0, taxRate: null, taxAmount: 0, net: 0, items: [],
        });

      const result = await service.generateDraft(baseDto(), 'user-1');

      expect(billLineResolverService.resolve).toHaveBeenCalledTimes(2);
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'DRAFT', null, 5000, 500, 0, 4500,
      );
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-2', 'SKIPPED_NO_ASSIGNMENT',
        'No active fee structure assignment for this student in the given academic year',
        0, 0, 0, 0,
      );
      expect(result.totalGross).toBe(5000);
    });

    it('records SKIPPED_ALREADY_BILLED without calling BillLineResolverService', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'class-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([mockRunRow])
        .mockResolvedValueOnce([{ id: 'existing-invoice-1' }]) // already-billed check: found
        .mockResolvedValueOnce([mockRunRow]); // final aggregate UPDATE

      await service.generateDraft(baseDto(), 'user-1');

      expect(billLineResolverService.resolve).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'SKIPPED_ALREADY_BILLED', expect.stringContaining('existing-invoice-1'),
        0, 0, 0, 0,
      );
    });

    it('records FAILED (not an abort) when BillLineResolverService throws unexpectedly', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'class-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([mockRunRow])
        .mockResolvedValueOnce([]) // already-billed check
        .mockResolvedValueOnce([mockRunRow]); // final aggregate UPDATE

      billLineResolverService.resolve.mockRejectedValueOnce(new Error('unexpected DB error'));

      const result = await service.generateDraft(baseDto(), 'user-1');

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bill_run_lines'),
        'run-1', 'student-1', 'FAILED', 'unexpected DB error', 0, 0, 0, 0,
      );
      expect(result).toBeDefined(); // run continues, does not throw
    });

    it('WHOLE_SCHOOL scope resolves the roster with no class filter', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'year-1' }]) // academic year check
        .mockResolvedValueOnce([]) // idempotency check (no class check for WHOLE_SCHOOL)
        .mockResolvedValueOnce([]) // roster (empty for simplicity)
        .mockResolvedValueOnce([{ ...mockRunRow, scope: 'WHOLE_SCHOOL', class_id: null, total_students: 0 }])
        .mockResolvedValueOnce([{ ...mockRunRow, scope: 'WHOLE_SCHOOL', class_id: null, total_students: 0 }]);

      const result = await service.generateDraft(
        { academicYearId: 'year-1', scope: BillRunScope.WHOLE_SCHOOL, bsYear: 2083, bsMonth: 3 },
        'user-1',
      );
      expect(result.scope).toBe('WHOLE_SCHOOL');
      const rosterCall = (tenantPrisma.query as jest.Mock).mock.calls[2];
      expect(rosterCall[0]).not.toContain('class_id =');
    });
  });

  describe('findOne', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the run with lines and an outcome summary', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockRunRow]) // run row
        .mockResolvedValueOnce([{ outcome: 'DRAFT', count: '2' }, { outcome: 'SKIPPED_NO_ASSIGNMENT', count: '1' }]) // outcome summary
        .mockResolvedValueOnce([ // lines page
          { id: 'line-1', bill_run_id: 'run-1', student_id: 'student-1', outcome: 'DRAFT', skip_reason: null, bill_invoice_id: null, gross: '5000', concession: '500', tax: '0', net: '4500', created_at: new Date('2026-07-16'), student_name: 'Test Student', admission_number: 'STU-001', total_count: '3' },
        ]);

      const result = await service.findOne('run-1');
      expect(result.lines).toHaveLength(1);
      expect(result.outcomeSummary).toEqual({ DRAFT: 2, SKIPPED_NO_ASSIGNMENT: 1 });
    });

    it('maps class and section name onto each line from the joined query', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockRunRow]) // run row
        .mockResolvedValueOnce([{ outcome: 'DRAFT', count: '1' }]) // outcome summary
        .mockResolvedValueOnce([
          {
            id: 'line-1', bill_run_id: 'run-1', student_id: 'student-1', outcome: 'DRAFT',
            skip_reason: null, bill_invoice_id: null, gross: '5000', concession: '500', tax: '0', net: '4500',
            created_at: new Date('2026-07-16'), student_name: 'Test Student', admission_number: 'STU-001',
            class_name: 'Grade 9', section_name: 'A', total_count: '1',
          },
        ]);

      const result = await service.findOne('run-1');
      expect(result.lines[0].className).toBe('Grade 9');
      expect(result.lines[0].sectionName).toBe('A');
    });

    it('filters lines by classId when given', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockRunRow]) // run row
        .mockResolvedValueOnce([]) // outcome summary
        .mockResolvedValueOnce([]); // lines page

      await service.findOne('run-1', { classId: 'class-9' });

      const lineCall = (tenantPrisma.query as jest.Mock).mock.calls[2];
      expect(lineCall[0]).toContain('s.class_id =');
      expect(lineCall).toContain('class-9');
    });
  });

  describe('findAll', () => {
    it('applies default pagination', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      const result = await service.findAll({});
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
    });
  });

  describe('requestPost', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.requestPost('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects posting a VOIDED run', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRunRow, status: 'VOIDED' }]);
      await expect(service.requestPost('run-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('is a no-op when the run is already POSTED (idempotent — no UPDATE issued)', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRunRow, status: 'POSTED' }]);
      const result = await service.requestPost('run-1', 'user-1');
      expect(result.status).toBe('POSTED');
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1); // only the initial fetch
    });

    it('is a no-op when the run is already POSTING', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRunRow, status: 'POSTING' }]);
      const result = await service.requestPost('run-1', 'user-1');
      expect(result.status).toBe('POSTING');
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
    });

    it('transitions DRAFT -> POSTING and stamps posted_by', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'DRAFT' }]) // fetch
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'POSTING', posted_by: 'user-9' }]); // UPDATE RETURNING *

      const result = await service.requestPost('run-1', 'user-9');

      expect(tenantPrisma.query).toHaveBeenLastCalledWith(
        expect.stringContaining("SET status = 'POSTING'"),
        'run-1', 'user-9',
      );
      expect(result.status).toBe('POSTING');
    });
  });

  describe('excludeLines', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.excludeLines('missing', ['student-1'])).rejects.toThrow(NotFoundException);
    });

    it('rejects excluding from a non-DRAFT run', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRunRow, status: 'POSTED' }]);
      await expect(service.excludeLines('run-1', ['student-1'])).rejects.toThrow(BadRequestException);
    });

    it('marks the given students EXCLUDED, recomputes totals, and returns the run detail', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'DRAFT' }]) // fetch + status check
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'DRAFT', total_gross: '0', total_net: '0' }]) // findOne: run row
        .mockResolvedValueOnce([{ outcome: 'EXCLUDED', count: '1' }]) // findOne: outcome summary
        .mockResolvedValueOnce([]); // findOne: lines page

      const result = await service.excludeLines('run-1', ['student-1']);

      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET outcome = 'EXCLUDED'"),
        'run-1', ['student-1'],
      );
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bill_runs br SET'),
        'run-1',
      );
      expect(result.outcomeSummary).toEqual({ EXCLUDED: 1 });
    });
  });

  describe('voidRun', () => {
    it('404s when the run does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.voidRun('missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects voiding a non-DRAFT run', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...mockRunRow, status: 'POSTED' }]);
      await expect(service.voidRun('run-1')).rejects.toThrow(BadRequestException);
    });

    it('voids a DRAFT run: status VOIDED, soft-deleted', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'DRAFT' }]) // fetch
        .mockResolvedValueOnce([{ ...mockRunRow, status: 'VOIDED', deleted_at: new Date('2026-07-26') }]); // UPDATE RETURNING *

      const result = await service.voidRun('run-1');

      expect(tenantPrisma.query).toHaveBeenLastCalledWith(
        expect.stringContaining("SET status = 'VOIDED'"),
        'run-1',
      );
      expect(result.status).toBe('VOIDED');
    });
  });
});
