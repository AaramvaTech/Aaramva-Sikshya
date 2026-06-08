import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

interface StudentMigrationRow {
  id: string;
  class_name: string;
  section_name: string | null;
}

@Injectable()
export class AcademicMigrationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async migrateStudentClassReferences(): Promise<{ migrated: number; failed: number }> {
    const students = await this.tenantPrisma.query<StudentMigrationRow>(
      `SELECT id, class_name, section_name FROM students
       WHERE class_id IS NULL AND class_name IS NOT NULL AND deleted_at IS NULL`,
    );

    let migrated = 0;
    let failed = 0;

    for (const student of students) {
      try {
        await this.tenantPrisma.run(async (tx) => {
          let classRows = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM classes WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
            student.class_name,
          );

          let classId: string;
          if (classRows[0]) {
            classId = classRows[0].id;
          } else {
            const newClass = await tx.$queryRawUnsafe<{ id: string }[]>(
              `INSERT INTO classes (name, order_index) VALUES ($1, 0) RETURNING id`,
              student.class_name,
            );
            classId = newClass[0].id;
          }

          let sectionId: string | null = null;
          if (student.section_name) {
            let sectionRows = await tx.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM sections WHERE class_id = $1::uuid AND name = $2 AND deleted_at IS NULL LIMIT 1`,
              classId, student.section_name,
            );

            if (sectionRows[0]) {
              sectionId = sectionRows[0].id;
            } else {
              const newSection = await tx.$queryRawUnsafe<{ id: string }[]>(
                `INSERT INTO sections (class_id, name) VALUES ($1::uuid, $2) RETURNING id`,
                classId, student.section_name,
              );
              sectionId = newSection[0].id;
            }
          }

          await tx.$executeRawUnsafe(
            `UPDATE students SET class_id = $1::uuid, section_id = $2::uuid, updated_at = NOW()
             WHERE id = $3::uuid`,
            classId, sectionId, student.id,
          );
        });
        migrated++;
      } catch {
        failed++;
      }
    }

    return { migrated, failed };
  }
}
