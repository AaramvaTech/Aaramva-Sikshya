import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CalendarService } from './calendar.service';
import {
  CreateSchoolHolidayDto,
  UpdateSchoolHolidayDto,
  ListCalendarDaysQueryDto,
} from './dto/calendar-day.dto';

/** Same tier as late-fee-rules / fee-structures (bill-catalog.controller.ts) —
 *  the closest existing "settings" analog, per the spec's own framing. */
const ACCOUNTANT_AND_ABOVE = [
  Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT,
];

@Controller('calendar/holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  create(@Body() dto: CreateSchoolHolidayDto, @CurrentUser() user: AuthUser) {
    return this.calendarService.createSchoolHoliday(dto, user.userId);
  }

  @Get()
  @Roles(...ACCOUNTANT_AND_ABOVE)
  list(@Query() query: ListCalendarDaysQueryDto) {
    return this.calendarService.list(query);
  }

  @Patch(':id')
  @Roles(...ACCOUNTANT_AND_ABOVE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolHolidayDto) {
    return this.calendarService.updateSchoolHoliday(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...ACCOUNTANT_AND_ABOVE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.calendarService.removeSchoolHoliday(id);
  }
}
