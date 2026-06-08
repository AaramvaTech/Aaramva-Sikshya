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
import { SubjectService } from './subject.service';
import { CreateSubjectDto, ListSubjectsQueryDto, UpdateSubjectDto } from './dto/subject.dto';

@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectController {
  constructor(private readonly subjectService: SubjectService) {}

  @Post()
  @Roles(
    Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR,
  )
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.subjectService.createSubject(dto);
  }

  @Get()
  @Roles(
    Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL,
    Role.ACADEMIC_COORDINATOR, Role.ACCOUNTANT, Role.LIBRARIAN,
    Role.TEACHER, Role.STUDENT, Role.PARENT,
  )
  findAll(@Query() query: ListSubjectsQueryDto) {
    return this.subjectService.findAllSubjects(query);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  updateSubject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjectService.updateSubject(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL)
  deleteSubject(@Param('id', ParseUUIDPipe) id: string) {
    return this.subjectService.deleteSubject(id);
  }
}
