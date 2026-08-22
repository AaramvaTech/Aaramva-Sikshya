import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceTokenService } from '../device-token.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { RegisterDeviceDto } from '../dto/device-token.dto';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTenantPrisma = guardSurvivingMocks({
  query: jest.fn(),
  execute: jest.fn(),
});

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
      ],
    }).compile();

    service = module.get<DeviceTokenService>(DeviceTokenService);
    jest.clearAllMocks();
  });

  it('register() creates a new device token and returns camelCase row', async () => {
    const userId = 'user-uuid';
    const dto: RegisterDeviceDto = {
      token: 'ExponentPushToken[abc123]',
      platform: 'ANDROID',
      deviceName: 'Pixel 7',
    };
    mockTenantPrisma.query.mockResolvedValueOnce([{
      id: 'dt-uuid', user_id: userId, token: dto.token,
      platform: dto.platform, device_name: dto.deviceName,
      last_seen_at: new Date(), created_at: new Date(),
    }]);

    const result = await service.register(userId, dto);

    expect(mockTenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (token) DO UPDATE'),
      userId, dto.token, dto.platform, 'Pixel 7',
    );
    expect(result.userId).toBe(userId);
    expect(result.token).toBe(dto.token);
    expect(result.platform).toBe('ANDROID');
  });

  it('register() with null deviceName passes null to query', async () => {
    const userId = 'user-uuid';
    const dto: RegisterDeviceDto = {
      token: 'ExponentPushToken[xyz]',
      platform: 'IOS',
    };
    mockTenantPrisma.query.mockResolvedValueOnce([{
      id: 'dt-uuid', user_id: userId, token: dto.token,
      platform: 'IOS', device_name: null,
      last_seen_at: new Date(), created_at: new Date(),
    }]);

    const result = await service.register(userId, dto);

    expect(mockTenantPrisma.query).toHaveBeenCalledWith(
      expect.any(String),
      userId, dto.token, dto.platform, null,
    );
    expect(result.deviceName).toBeNull();
  });

  it('register() reassigns token from another user (upsert updates user_id)', async () => {
    const newUserId = 'new-user-uuid';
    const dto: RegisterDeviceDto = {
      token: 'ExponentPushToken[shared]',
      platform: 'ANDROID',
    };
    mockTenantPrisma.query.mockResolvedValueOnce([{
      id: 'dt-uuid', user_id: newUserId, token: dto.token,
      platform: 'ANDROID', device_name: null,
      last_seen_at: new Date(), created_at: new Date(),
    }]);

    const result = await service.register(newUserId, dto);

    expect(result.userId).toBe(newUserId);
    // The UPSERT SQL includes SET user_id = EXCLUDED.user_id
    expect(mockTenantPrisma.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id      = EXCLUDED.user_id'),
      expect.anything(), expect.anything(), expect.anything(), null,
    );
  });

  it('remove() deletes token belonging to user', async () => {
    mockTenantPrisma.execute.mockResolvedValueOnce(1);

    await expect(service.remove('user-uuid', 'ExponentPushToken[abc]')).resolves.toBeUndefined();

    expect(mockTenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM device_tokens'),
      'ExponentPushToken[abc]',
      'user-uuid',
    );
  });

  it("remove() throws NotFoundException when token doesn't belong to user", async () => {
    mockTenantPrisma.execute.mockResolvedValueOnce(0);

    await expect(service.remove('user-uuid', 'ExponentPushToken[other]')).rejects.toThrow(
      NotFoundException,
    );
  });
});
