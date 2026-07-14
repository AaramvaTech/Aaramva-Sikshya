import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { StudentController } from './student.controller';
import { GuardianController } from './guardian.controller';
import { ImportController } from './import.controller';
import { StudentService } from './student.service';
import { StudentMeService } from './student-me.service';
import { GuardianService } from './guardian.service';
import { ImportService } from './import.service';
import { ExaminationModule } from '../examination/examination.module';
import { CredentialDeliveryModule } from '../credential-delivery/credential-delivery.module';

@Module({
  imports: [ExaminationModule, StorageModule, CredentialDeliveryModule], // + REG-1 guardian credential delivery
  controllers: [StudentController, GuardianController, ImportController],
  providers: [StudentService, StudentMeService, GuardianService, ImportService],
  exports: [StudentService],
})
export class StudentModule {}
