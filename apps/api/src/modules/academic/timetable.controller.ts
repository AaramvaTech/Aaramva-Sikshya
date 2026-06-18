import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { TimetableService } from './timetable.service';
import { CreateTimetableSlotDto, BulkTimetableDto } from './dto/timetable.dto';

const TEACHER_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.TEACHER,
];

@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createSlot(@Body() dto: CreateTimetableSlotDto) {
    return this.timetableService.createSlot(dto);
  }

  // ─── Self-scoped teacher routes (declared before parameterised routes) ───────

  @Get('my/sections')
  @Roles(...TEACHER_AND_ABOVE)
  getMySections(@CurrentUser() user: AuthUser) {
    return this.timetableService.getMySections(user.userId);
  }

  @Get('my')
  @Roles(...TEACHER_AND_ABOVE)
  getMyTimetable(@CurrentUser() user: AuthUser) {
    return this.timetableService.getMyTimetable(user.userId);
  }

  // ─── Admin-facing parameterised routes ───────────────────────────────────────

  @Get('section/:sectionId')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  getSectionTimetable(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.timetableService.getSectionTimetable(sectionId, user.userId, user.role);
  }

  @Get('teacher/:teacherId')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.TEACHER,
  )
  getTeacherTimetable(@Param('teacherId', ParseUUIDPipe) teacherId: string) {
    return this.timetableService.getTeacherTimetable(teacherId);
  }

  @Put('section/:sectionId/bulk')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  bulkReplaceTimetable(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: BulkTimetableDto,
  ) {
    return this.timetableService.bulkReplaceTimetable(sectionId, dto);
  }

  @Delete(':slotId')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  deleteSlot(@Param('slotId', ParseUUIDPipe) slotId: string) {
    return this.timetableService.deleteSlot(slotId);
  }
}
