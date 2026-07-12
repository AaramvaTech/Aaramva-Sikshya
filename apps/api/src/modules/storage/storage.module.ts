import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { FileAccessService } from './file-access.service';

/**
 * FILE-1 file storage (S3-compatible presigned uploads).
 * TenantModule is @Global, so no imports needed. StorageService is exported
 * for the confirm-side verification in student/hr/settings/super-admin.
 */
@Module({
  controllers: [StorageController],
  providers: [StorageService, FileAccessService],
  exports: [StorageService],
})
export class StorageModule {}
