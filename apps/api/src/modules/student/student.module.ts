import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [TenantModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
