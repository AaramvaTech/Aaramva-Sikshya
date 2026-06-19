import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '../mail.service';
import { PublicPrismaService } from '../../super-admin/public-prisma.service';

const mockPublicPrisma = { query: jest.fn(), execute: jest.fn() };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: PublicPrismaService, useValue: mockPublicPrisma },
      ],
    }).compile();
    service = module.get(MailService);
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    // INSERT ... RETURNING id, then UPDATE status
    mockPublicPrisma.query.mockResolvedValue([{ id: 'log-1' }]);
    mockPublicPrisma.execute.mockResolvedValue(1);
  });

  it('records a MOCK send and returns its log id when SMTP is unconfigured', async () => {
    const res = await service.send({
      to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi', type: 'CREDENTIALS_NEW',
    });
    expect(res).toEqual({ status: 'MOCK', logId: 'log-1' });
    // first query = INSERT email_log PENDING
    expect(mockPublicPrisma.query).toHaveBeenCalled();
    // status updated to MOCK
    expect(mockPublicPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE email_log'),
      'MOCK', null, null, 'log-1',
    );
  });

  it('never throws and records FAILED when the transport throws', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
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
