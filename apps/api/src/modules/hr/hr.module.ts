import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';
import { CredentialDeliveryModule } from '../credential-delivery/credential-delivery.module';
import { HrController } from './hr.controller';
import { DepartmentService } from './department.service';
import { DesignationService } from './designation.service';
import { EmploymentTypeService } from './employment-type.service';
import { StaffService } from './staff.service';
import { LeaveService } from './leave.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [TenantModule, StorageModule, CredentialDeliveryModule],
  controllers: [HrController],
  providers: [
    DepartmentService,
    DesignationService,
    EmploymentTypeService,
    StaffService,
    LeaveService,
    PayrollService,
  ],
  exports: [StaffService],
})
export class HrModule {}
