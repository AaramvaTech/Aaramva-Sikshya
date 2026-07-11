import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';

const mockPublicPrisma = { query: jest.fn(), execute: jest.fn() };
// MAIL-1 adaptation: config-driven. Tests mutate this map per case.
const configValues: Record<string, unknown> = {};
const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => configValues[key] ?? def),
};

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: PublicPrismaService, useValue: mockPublicPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(MailService);
    jest.clearAllMocks();
    for (const k of Object.keys(configValues)) delete configValues[k];
    // INSERT ... RETURNING id, then UPDATE status
    mockPublicPrisma.query.mockResolvedValue([{ id: 'log-1' }]);
    mockPublicPrisma.execute.mockResolvedValue(1);
  });

  it('records a MOCK send and returns its log id when SMTP is unconfigured', async () => {
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res).toEqual({ status: 'MOCK', logId: 'log-1' });
    // first query = INSERT email_log PENDING — assert SQL and all positional args
    expect(mockPublicPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_log'),
      null,           // tenantId
      'a@b.com',      // recipient
      'CREDENTIALS_NEW', // type
      'Hi',           // subject
      null,           // relatedUserId
    );
    // status updated to MOCK
    expect(mockPublicPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE email_log'),
      'MOCK', null, null, 'log-1',
    );
  });

  it('returns FAILED with empty logId and does not throw when the log INSERT itself throws', async () => {
    mockPublicPrisma.query.mockRejectedValueOnce(new Error('db down'));
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res).toEqual({ status: 'FAILED', logId: '' });
    // no UPDATE should have been attempted — no log row was created
    expect(mockPublicPrisma.execute).not.toHaveBeenCalled();
  });

  it('never throws and records FAILED when the transport throws', async () => {
    configValues['SMTP_HOST'] = 'smtp.example.com';
    // Force the transporter to fail by stubbing the private send.
    jest.spyOn(service as any, 'deliver').mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res.status).toBe('FAILED');
    expect(mockPublicPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE email_log'),
      'FAILED', null, 'connect ECONNREFUSED', 'log-1',
    );
  });
});
