import { Test } from '@nestjs/testing';
import { ImportService } from '../import.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StudentService } from '../student.service';
import { GuardianService } from '../guardian.service';

const HEADER =
  'First Name,Last Name,DOB (BS),Gender,Class,Section,Roll No,Guardian First Name,Guardian Last Name,Guardian Phone,Guardian Relation,Guardian Email';

describe('ImportService.preview', () => {
  let service: ImportService;
  let tenantPrisma: { query: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: StudentService, useValue: { admitStudent: jest.fn() } },
        { provide: GuardianService, useValue: { provisionGuardian: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ImportService);
  });

  // loadContext() queries in order: years, classes, sections, existing students
  function mockContext(opts?: { existing?: { fn: string; ln: string; dob: string }[] }) {
    tenantPrisma.query
      .mockResolvedValueOnce([{ id: 'year-1', name: '2081-82' }]) // current year
      .mockResolvedValueOnce([{ id: 'class-1', name: 'Grade 1' }]) // classes
      .mockResolvedValueOnce([{ id: 'sec-1', name: 'A', class_id: 'class-1' }]) // sections
      .mockResolvedValueOnce(opts?.existing ?? []); // existing students
  }

  it('categorizes valid / invalid / duplicate rows with specific errors', async () => {
    mockContext();
    const csv = [
      HEADER,
      'Ram,Sharma,2070-05-15,MALE,Grade 1,A,1,Hari,Sharma,9800000001,Father,hari@x.com', // valid
      'Sita,Rai,2071-03-10,UNKNOWN,Grade 1,A,,Gita,Rai,9800000002,Mother,gita@x.com',     // bad gender
      'Bad,Class,2071-01-01,FEMALE,Grade 9,A,,G,X,9800000003,Father,g@x.com',             // nonexistent class
      'Ram,Sharma,2070-05-15,MALE,Grade 1,A,2,Hari,Sharma,9800000001,Father,hari@x.com',  // duplicate of row 1
    ].join('\n');

    const res = await service.preview(csv);

    expect(res.summary).toEqual({ total: 4, valid: 1, invalid: 2, duplicate: 1 });
    expect(res.rows[0].status).toBe('valid');
    // BS 2070-05-15 → AD round-trip (bs-calendar)
    expect(res.rows[0].resolved?.dobAd).toBe('2013-08-29');
    expect(res.rows[0].resolved?.classId).toBe('class-1');
    expect(res.rows[0].resolved?.sectionId).toBe('sec-1');

    expect(res.rows[1].status).toBe('invalid');
    expect(res.rows[1].errors.join(' ')).toMatch(/Gender must be/);
    expect(res.rows[2].status).toBe('invalid');
    expect(res.rows[2].errors.join(' ')).toMatch(/Class "Grade 9" does not exist/);
    expect(res.rows[3].status).toBe('duplicate');
  });

  it('flags rows duplicating EXISTING students (re-import safety)', async () => {
    mockContext({ existing: [{ fn: 'ram', ln: 'sharma', dob: '2013-08-29' }] });
    const csv = [
      HEADER,
      'Ram,Sharma,2070-05-15,MALE,Grade 1,A,1,Hari,Sharma,9800000001,Father,hari@x.com',
    ].join('\n');

    const res = await service.preview(csv);

    expect(res.summary.duplicate).toBe(1);
    expect(res.rows[0].status).toBe('duplicate');
    expect(res.rows[0].errors.join(' ')).toMatch(/already exists/);
  });

  it('reports missing required fields per row (partially-filled row)', async () => {
    mockContext();
    // Only first name filled — row is non-blank so it validates and surfaces gaps.
    const csv = [HEADER, 'Ram,,,,,,,,,,,'].join('\n');
    const res = await service.preview(csv);
    expect(res.rows[0].status).toBe('invalid');
    expect(res.rows[0].errors).toEqual(
      expect.arrayContaining([
        'Last Name is required',
        'DOB (BS) is required',
        'Guardian Email is required',
      ]),
    );
  });
});
