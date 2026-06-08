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
import { AcademicYearService } from './academic-year.service';
import {
  CreateAcademicYearDto,
  ListAcademicYearsQueryDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';

@Controller('academic-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicYearController {
  constructor(private readonly academicYearService: AcademicYearService) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  create(@Body() dto: CreateAcademicYearDto) {
    return this.academicYearService.create(dto);
  }

  @Get()
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  findAll(@Query() query: ListAcademicYearsQueryDto) {
    return this.academicYearService.findAll(query);
  }

  @Get('current')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  findCurrent() {
    return this.academicYearService.findCurrent();
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academicYearService.update(id, dto);
  }

  @Patch(':id/set-current')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  setCurrentYear(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicYearService.setCurrentYear(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicYearService.remove(id);
  }
}
