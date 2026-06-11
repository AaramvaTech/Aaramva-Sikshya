import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DashboardService } from './dashboard.service';

const PRINCIPAL_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
];

const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.TEACHER,
];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('weekly-attendance')
  @Roles(...TEACHER_AND_ABOVE)
  getWeeklyAttendance() {
    return this.dashboardService.getWeeklyAttendance();
  }

  @Get('activity')
  @Roles(...PRINCIPAL_AND_ABOVE)
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('upcoming')
  @Roles(...TEACHER_AND_ABOVE)
  getUpcoming() {
    return this.dashboardService.getUpcoming();
  }
}
