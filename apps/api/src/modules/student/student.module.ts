import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { ImportController } from './import.controller';
import { StudentService } from './student.service';
import { StudentMeService } from './student-me.service';
import { GuardianService } from './guardian.service';
import { ImportService } from './import.service';
import { ExaminationModule } from '../examination/examination.module';

@Module({
  imports: [ExaminationModule], // ResultService for /students/me/results + report-card
  controllers: [StudentController, ImportController],
  providers: [StudentService, StudentMeService, GuardianService, ImportService],
  exports: [StudentService],
})
export class StudentModule {}
