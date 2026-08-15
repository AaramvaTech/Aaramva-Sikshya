import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SmsService, normaliseNepalPhone } from '../sms.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

describe('normaliseNepalPhone()', () => {
  // Nepal local 10-digit numbers start with 97 or 98.
  // 0-prefix format: 0 + 9-digit suffix (e.g. 0984123456) → strip 0, prepend 977.
  // International format: 977 + 10-digit number = 13 digits total (e.g. 9779841234567).

  it("normalises 0-prefixed number: '0984123456' → '977984123456'", () => {
    expect(normaliseNepalPhone('0984123456')).toBe('977984123456');
  });

  it("accepts 13-digit international format '9779841234567' as-is", () => {
    expect(normaliseNepalPhone('9779841234567')).toBe('9779841234567');
  });

  it("normalises bare 10-digit number starting with 98", () => {
    expect(normaliseNepalPhone('9841234567')).toBe('9779841234567');
  });

  it("normalises bare 10-digit number starting with 97", () => {
    expect(normaliseNepalPhone('9761234567')).toBe('9779761234567');
  });

  it('strips non-digit characters then normalises', () => {
    // +977-9841-234567 strips to 9779841234567 (13 digits) → valid, returned as-is
    expect(normaliseNepalPhone('+977-9841-234567')).toBe('9779841234567');
  });

  it('returns null for invalid numbers', () => {
    expect(normaliseNepalPhone('12345')).toBeNull();
    expect(normaliseNepalPhone('0123456789')).toBeNull(); // 0-prefix but rest doesn't start with 97/98
    expect(normaliseNepalPhone('')).toBeNull();
  });
});

describe('SmsService', () => {
  let service: SmsService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let guardianService: jest.Mocked<GuardianService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, SPARROW_SMS_ENABLED: 'false' };

    const module = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        { provide: GuardianService, useValue: { getPrimaryGuardianPhones: jest.fn() } },
      ],
    }).compile();

    service = module.get(SmsService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    guardianService = module.get(GuardianService) as jest.Mocked<GuardianService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('send()', () => {
    it('throws BadRequestException for an invalid phone number', async () => {
      await expect(service.send('12345', 'hello', 'TEST')).rejects.toThrow(BadRequestException);
    });

    it('logs to sms_logs with status PENDING before sending', async () => {
      // INSERT uses $queryRawUnsafe to retrieve the new log ID
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'log-1' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(undefined);

      await service.send('9841234567', 'Test message', 'MANUAL');

      const [firstSql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string];
      expect(firstSql.toLowerCase()).toContain('sms_logs');
      expect(firstSql.toUpperCase()).toContain('INSERT');
    });

    it("updates status to MOCK when SPARROW_SMS_ENABLED=false", async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'log-1' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(undefined);

      await service.send('9841234567', 'Test message', 'MANUAL');

      const calls = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls as [string, ...unknown[]][];
      const updateCall = calls.find(([sql]) => sql.includes('MOCK'));
      expect(updateCall).toBeDefined();
    });

    it('updates status to FAILED when API returns error code', async () => {
      process.env.SPARROW_SMS_ENABLED = 'true';
      process.env.SPARROW_SMS_TOKEN = 'fake-token';
      process.env.SPARROW_SMS_SENDER = 'TestSMS';

      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'log-1' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(undefined);

      global.fetch = jest.fn().mockResolvedValueOnce({
        json: async () => ({ response_code: 400, error: 'Insufficient balance' }),
      }) as jest.Mock;

      await service.send('9841234567', 'Test message', 'MANUAL');

      const calls = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls as [string, ...unknown[]][];
      const failCall = calls.find(([sql]) => sql.includes('FAILED'));
      expect(failCall).toBeDefined();
    });
  });

  describe('bulkSend()', () => {
    it('deduplicates phone numbers and returns correct counts', async () => {
      // collectPhones() scopes student ids via tenantPrisma.query, then resolves
      // phones via GuardianService; send() uses tenantPrisma.run → mockTx
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { id: 's1' }, { id: 's2' }, { id: 's3' },
      ]);
      guardianService.getPrimaryGuardianPhones.mockResolvedValueOnce(new Map([
        ['s1', '9841234567'],
        ['s2', '9841234567'], // duplicate phone (different guardians, same number)
        ['s3', '9851234567'],
      ]));
      // For each unique phone, send() calls run → $queryRawUnsafe (INSERT) then $executeRawUnsafe (UPDATE)
      mockTx.$queryRawUnsafe.mockResolvedValue([{ id: 'log-x' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(undefined);

      const result = await service.bulkSend({
        audience: 'ALL_PARENTS',
        message: 'Test bulk SMS',
        trigger: 'MANUAL',
      });

      // 3 rows but only 2 unique phones → sent=2, skipped=1
      expect(result.skipped).toBe(1);
      expect(result.sent + result.failed).toBe(2);
    });

    it('returns sent count equal to unique phone numbers when all succeed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]);
      guardianService.getPrimaryGuardianPhones.mockResolvedValueOnce(new Map([
        ['s1', '9841234567'],
        ['s2', '9851234567'],
      ]));
      mockTx.$queryRawUnsafe.mockResolvedValue([{ id: 'log-x' }]);
      mockTx.$executeRawUnsafe.mockResolvedValue(undefined);

      const result = await service.bulkSend({
        audience: 'ALL_PARENTS',
        message: 'School closed tomorrow',
        trigger: 'MANUAL',
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });
});
