import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AcademicMigrationService } from './academic-migration.service';

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicMigrationController {
  constructor(private readonly migrationService: AcademicMigrationService) {}

  @Post('migrate-student-refs')
  @Roles(Role.SCHOOL_OWNER)
  migrateStudentRefs() {
    return this.migrationService.migrateStudentClassReferences();
  }
}
