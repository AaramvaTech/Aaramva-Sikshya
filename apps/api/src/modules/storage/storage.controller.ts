import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from './storage.service';
import { FileAccessService } from './file-access.service';
import { UPLOADER_ROLES } from './storage.policy';
import { PresignUploadDto } from './dto/presign-upload.dto';

const ALL_ROLES = Object.values(Role);

/**
 * FILE-1 presign endpoints. Tenant-scoped (TenantMiddleware) + JWT like every
 * feature route. Upload presigns are further narrowed per kind by the policy
 * table; read presigns are object-scoped in FileAccessService.
 *
 * Note the read route takes the key as a QUERY param (`?key=`) — storage keys
 * contain slashes, which path params can't carry cleanly.
 */
@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly fileAccessService: FileAccessService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('presign-upload')
  @Roles(...UPLOADER_ROLES)
  presignUpload(@Body() dto: PresignUploadDto, @CurrentUser() user: AuthUser) {
    const { slug } = this.tenantContext.getOrThrow();
    return this.storageService.presignUpload(
      dto.kind,
      dto.contentType,
      dto.size,
      slug,
      user.role,
    );
  }

  @Get('presigned')
  @Roles(...ALL_ROLES)
  presignRead(@Query('key') key: string | undefined, @CurrentUser() user: AuthUser) {
    return this.fileAccessService.presignRead(key, user);
  }
}
