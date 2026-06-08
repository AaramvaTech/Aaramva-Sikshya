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
import { Role } from '../common/enums/role.enum';
import { TimetableService } from './timetable.service';
import { CreateTimetableSlotDto, BulkTimetableDto } from './dto/timetable.dto';

@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createSlot(@Body() dto: CreateTimetableSlotDto) {
    return this.timetableService.createSlot(dto);
  }

  @Get('section/:sectionId')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  getSectionTimetable(@Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.timetableService.getSectionTimetable(sectionId);
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
