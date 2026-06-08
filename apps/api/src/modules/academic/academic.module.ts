import { Module } from '@nestjs/common';
import { AcademicYearController } from './academic-year.controller';
import { AcademicYearService } from './academic-year.service';
import { ClassController } from './class.controller';
import { ClassService } from './class.service';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { AcademicMigrationController } from './academic-migration.controller';
import { AcademicMigrationService } from './academic-migration.service';

@Module({
  controllers: [
    AcademicYearController,
    ClassController,
    SubjectController,
    TimetableController,
    AcademicMigrationController,
  ],
  providers: [
    AcademicYearService,
    ClassService,
    SubjectService,
    TimetableService,
    AcademicMigrationService,
  ],
  exports: [
    AcademicYearService,
    ClassService,
    SubjectService,
    TimetableService,
  ],
})
export class AcademicModule {}
