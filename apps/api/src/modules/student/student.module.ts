import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { GuardianService } from './guardian.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, GuardianService],
  exports: [StudentService],
})
export class StudentModule {}
