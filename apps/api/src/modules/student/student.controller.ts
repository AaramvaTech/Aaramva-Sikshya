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
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentService } from './student.service';
import { GuardianService } from './guardian.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly guardianService: GuardianService,
  ) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  admitStudent(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.studentService.admitStudent(dto, user.userId);
  }

  @Get()
  @Roles(
    Role.SCHOOL_OWNER,
    Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR,
    Role.TEACHER,
    Role.ACCOUNTANT,
    Role.LIBRARIAN,
  )
  findAll(@Query() query: ListStudentsQueryDto) {
    return this.studentService.findAll(query);
  }

  @Get('stats')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.ACCOUNTANT, Role.TEACHER,
  )
  getStats() {
    return this.studentService.getStats();
  }

  @Get('my-children')
  @Roles(Role.PARENT)
  getMyChildren(@CurrentUser() user: AuthUser) {
    return this.guardianService.getMyChildren(user.userId);
  }

  @Get(':id')
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
    Role.TEACHER, Role.ACCOUNTANT, Role.LIBRARIAN,
    // STUDENT and PARENT access re-added when user-student linking is implemented in Academic module
  )
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.findOne(id);
  }

  @Post(':id/enroll')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollStudentDto) {
    return this.studentService.enroll(id, dto);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.studentService.updateStudent(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentStatusDto) {
    return this.studentService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studentService.removeStudent(id);
  }

  @Post(':studentId/guardians/:guardianId/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createGuardianAccount(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() dto: CreateGuardianAccountDto,
  ) {
    return this.guardianService.createGuardianAccount(studentId, guardianId, dto);
  }
}
