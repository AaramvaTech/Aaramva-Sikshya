import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { HrController } from './hr.controller';
import { DepartmentService } from './department.service';
import { DesignationService } from './designation.service';
import { StaffService } from './staff.service';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TenantModule],
  controllers: [HrController],
  providers: [
    DepartmentService,
    DesignationService,
    StaffService,
    LeaveService,
    PayrollService,
  ],
  exports: [StaffService],
})
export class HrModule {}
