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
import { ClassService } from './class.service';
import { SubjectService } from './subject.service';
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from './dto/class.dto';
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';
import { AssignSubjectToClassDto } from './dto/class-subject.dto';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassController {
  constructor(
    private readonly classService: ClassService,
    private readonly subjectService: SubjectService,
  ) {}

  @Post()
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createClass(@Body() dto: CreateClassDto) {
    return this.classService.createClass(dto);
  }

  @Get()
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  findAll(@Query() query: ListClassesQueryDto) {
    return this.classService.findAllClasses(query);
  }

  @Get(':id')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.classService.findOneClass(id);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  updateClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classService.updateClass(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER)
  deleteClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.classService.deleteClass(id);
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  @Post(':id/sections')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createSection(
    @Param('id', ParseUUIDPipe) classId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.classService.createSection(classId, dto);
  }

  @Get(':id/sections')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  getSections(@Param('id', ParseUUIDPipe) classId: string) {
    return this.classService.getSections(classId);
  }

  @Patch(':id/sections/:sectionId')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  updateSection(
    @Param('id', ParseUUIDPipe) classId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.classService.updateSection(classId, sectionId, dto);
  }

  @Delete(':id/sections/:sectionId')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER)
  deleteSection(
    @Param('id', ParseUUIDPipe) classId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return this.classService.deleteSection(classId, sectionId);
  }

  // ── Subjects (class–subject assignments) ──────────────────────────────────

  @Post(':id/subjects')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  assignSubject(
    @Param('id', ParseUUIDPipe) classId: string,
    @Body() dto: AssignSubjectToClassDto,
  ) {
    return this.subjectService.assignSubjectToClass(classId, dto);
  }

  @Get(':id/subjects')
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  getSubjects(@Param('id', ParseUUIDPipe) classId: string) {
    return this.subjectService.getClassSubjects(classId);
  }

  @Delete(':id/subjects/:subjectId')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  removeSubject(
    @Param('id', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.subjectService.removeClassSubject(classId, subjectId);
  }
}
