import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { StudentController } from './student.controller';
import { GuardianController } from './guardian.controller';
import { ImportController } from './import.controller';
import { StudentService } from './student.service';
import { StudentMeService } from './student-me.service';
import { GuardianService } from './guardian.service';
import { GuardianScopeService } from './guardian-scope.service';
import { ImportService } from './import.service';
import { ExaminationModule } from '../examination/examination.module';
import { CredentialDeliveryModule } from '../credential-delivery/credential-delivery.module';

/**
 * CL: Global so GuardianScopeService (ownership checks) and GuardianService's
 * audience helpers (getActiveParentUserIds etc.) can be injected by finance,
 * attendance, examination, storage, academic and communication modules
 * without those modules importing StudentModule — StudentModule already
 * imports ExaminationModule, so a back-import would be circular. Same
 * rationale as TenantModule's @Global().
 */
@Global()
@Module({
  imports: [ExaminationModule, StorageModule, CredentialDeliveryModule], // + REG-1 guardian credential delivery
  controllers: [StudentController, GuardianController, ImportController],
  providers: [StudentService, StudentMeService, GuardianService, GuardianScopeService, ImportService],
  exports: [StudentService, GuardianService, GuardianScopeService],
})
export class StudentModule {}
