import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { ImportService } from './import.service';
import { ImportStudentsDto } from './dto/import.dto';

const IMPORT_ROLES = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR];

@Controller('students/import')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('template')
  @Roles(...IMPORT_ROLES)
  template(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.csv"');
    res.send(ImportService.templateCsv());
  }

  // Dry-run: parse + validate + dedupe, NO writes.
  @Post('preview')
  @Roles(...IMPORT_ROLES)
  preview(@Body() dto: ImportStudentsDto) {
    return this.importService.preview(dto.csv);
  }

  // Commit: create valid students (admission path) + provision guardians (R1 path).
  @Post('commit')
  @Roles(...IMPORT_ROLES)
  commit(@Body() dto: ImportStudentsDto, @CurrentUser() user: AuthUser) {
    return this.importService.commit(dto.csv, user.userId);
  }
}
