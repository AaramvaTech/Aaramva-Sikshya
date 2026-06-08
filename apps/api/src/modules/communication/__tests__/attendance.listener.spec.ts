import { Test } from '@nestjs/testing';
import { AttendanceListener } from '../listeners/attendance.listener';
import { SmsService } from '../sms.service';

describe('AttendanceListener', () => {
  let listener: AttendanceListener;
  let smsService: jest.Mocked<SmsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AttendanceListener,
        {
          provide: SmsService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    listener = module.get(AttendanceListener);
    smsService = module.get(SmsService) as jest.Mocked<SmsService>;

    jest.clearAllMocks();
  });

  describe('handleAbsent()', () => {
    it('calls smsService.send for each absent student with a parentPhone', async () => {
      await listener.handleAbsent({
        tenantSlug: 'school-1',
        date: '2081-04-15',
        absentStudents: [
          { studentId: 'stu-1', studentName: 'Ram Sharma', parentPhone: '9841234567' },
          { studentId: 'stu-2', studentName: 'Sita Thapa', parentPhone: '9851234567' },
        ],
      });

      expect(smsService.send).toHaveBeenCalledTimes(2);
      expect(smsService.send).toHaveBeenCalledWith(
        '9841234567',
        expect.stringContaining('Ram Sharma'),
        'ATTENDANCE_ABSENT',
        'stu-1',
      );
    });

    it('skips absent students with no parentPhone', async () => {
      await listener.handleAbsent({
        tenantSlug: 'school-1',
        date: '2081-04-15',
        absentStudents: [
          { studentId: 'stu-1', studentName: 'Ram Sharma', parentPhone: null },
          { studentId: 'stu-2', studentName: 'Sita Thapa', parentPhone: '9851234567' },
        ],
      });

      expect(smsService.send).toHaveBeenCalledTimes(1);
      expect(smsService.send).toHaveBeenCalledWith(
        '9851234567',
        expect.any(String),
        'ATTENDANCE_ABSENT',
        'stu-2',
      );
    });

    it('does not throw even if smsService.send rejects', async () => {
      (smsService.send as jest.Mock).mockRejectedValueOnce(new Error('SMS provider down'));

      await expect(
        listener.handleAbsent({
          tenantSlug: 'school-1',
          date: '2081-04-15',
          absentStudents: [
            { studentId: 'stu-1', studentName: 'Ram Sharma', parentPhone: '9841234567' },
          ],
        }),
      ).resolves.not.toThrow();
    });
  });
});
