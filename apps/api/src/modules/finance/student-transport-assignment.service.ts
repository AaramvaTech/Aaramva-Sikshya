import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  StudentTransportAssignmentRow,
  toStudentTransportAssignmentResponse,
  StudentTransportAssignmentResponseDto,
} from './entities/bill-assignment.entity';
import {
  CreateStudentTransportAssignmentDto,
  UpdateStudentTransportAssignmentDto,
  StudentTransportAssignmentQueryDto,
} from './dto/student-transport-assignment.dto';

@Injectable()
export class StudentTransportAssignmentService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(
    dto: CreateStudentTransportAssignmentDto,
    assignedById: string,
  ): Promise<StudentTransportAssignmentResponseDto> {
    const rows = await this.tenantPrisma.query<StudentTransportAssignmentRow>(
      `INSERT INTO student_transport_assignments
         (student_id, transport_route_id, effective_from, effective_to, assigned_by)
       VALUES ($1::uuid, $2::uuid, $3::date, $4::date, $5::uuid)
       RETURNING *`,
      dto.studentId,
      dto.transportRouteId,
      dto.effectiveFrom,
      dto.effectiveTo ?? null,
      assignedById,
    );
    return toStudentTransportAssignmentResponse(rows[0]);
  }

  async findAll(query: StudentTransportAssignmentQueryDto): Promise<{
    data: StudentTransportAssignmentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.studentId) { conditions.push(`student_id = $${idx++}::uuid`); params.push(query.studentId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StudentTransportAssignmentRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM student_transport_assignments ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toStudentTransportAssignmentResponse), meta: { page, limit, total } };
  }

  async update(id: string, dto: UpdateStudentTransportAssignmentDto): Promise<StudentTransportAssignmentResponseDto> {
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.transportRouteId !== undefined) { sets.push(`transport_route_id = $${idx++}::uuid`); params.push(dto.transportRouteId); }
    if (dto.effectiveFrom !== undefined) { sets.push(`effective_from = $${idx++}::date`); params.push(dto.effectiveFrom); }
    if (dto.effectiveTo !== undefined) { sets.push(`effective_to = $${idx++}::date`); params.push(dto.effectiveTo); }

    params.push(id);
    const rows = await this.tenantPrisma.query<StudentTransportAssignmentRow>(
      `UPDATE student_transport_assignments SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Transport assignment ${id} not found`);
    return toStudentTransportAssignmentResponse(rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.tenantPrisma.execute(
      `UPDATE student_transport_assignments SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!result) throw new NotFoundException(`Transport assignment ${id} not found`);
  }

  /** FeePreviewService's read path: the active transport assignment, if any. */
  async findActiveForStudent(
    studentId: string,
    asOfDate: string,
  ): Promise<StudentTransportAssignmentRow | null> {
    const rows = await this.tenantPrisma.query<StudentTransportAssignmentRow>(
      `SELECT * FROM student_transport_assignments
       WHERE student_id = $1::uuid AND deleted_at IS NULL
         AND effective_from <= $2::date
         AND (effective_to IS NULL OR effective_to >= $2::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      studentId,
      asOfDate,
    );
    return rows[0] ?? null;
  }
}
