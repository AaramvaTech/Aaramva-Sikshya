import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export interface OnboardingStatus {
  steps: {
    year: boolean;
    classes: boolean;
    sections: boolean;
    subjects: boolean;
    /** Recommended (not required) steps — presence-derived, like the academic ones. */
    students: boolean;
    staff: boolean;
    branding: boolean;
  };
  /** 1-based first incomplete academic step (1..4), or 5 when all four are done. */
  currentStep: number;
  /** All four academic-setup steps satisfied. */
  academicComplete: boolean;
  /** Owner has finished/dismissed the wizard (the persisted flag). */
  completed: boolean;
  completedAt: string | null;
  counts: {
    hasCurrentYear: boolean;
    classes: number;
    sections: number;
    classSubjects: number;
    students: number;
    staff: number;
  };
}

const STEP_ORDER = ['year', 'classes', 'sections', 'subjects'] as const;

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService, // public schema (tenants flag)
    private readonly tenantPrisma: TenantPrismaService, // tenant schema (data presence)
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Single source of truth for "is this school set up?". Step completion is
   * DERIVED from data presence in the tenant schema (no per-step state table);
   * only the finish/dismiss flag is persisted on public.tenants.
   */
  async getStatus(): Promise<OnboardingStatus> {
    const { tenantId } = this.tenantContext.getOrThrow();

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingCompletedAt: true, logoUrl: true, colorSource: true },
    });

    const count = async (sql: string) => {
      const rows = await this.tenantPrisma.query<{ n: string }>(sql);
      return Number(rows[0]?.n ?? 0);
    };

    // class_subjects has no deleted_at (hard delete) — don't filter it.
    const [currentYears, classes, sections, classSubjects, students, staff] = await Promise.all([
      count(`SELECT COUNT(*) AS n FROM academic_years WHERE is_current = true AND deleted_at IS NULL`),
      count(`SELECT COUNT(*) AS n FROM classes WHERE deleted_at IS NULL`),
      count(`SELECT COUNT(*) AS n FROM sections WHERE deleted_at IS NULL`),
      count(`SELECT COUNT(*) AS n FROM class_subjects`),
      count(`SELECT COUNT(*) AS n FROM students WHERE deleted_at IS NULL`),
      count(`SELECT COUNT(*) AS n FROM staff_profiles WHERE deleted_at IS NULL`),
    ]);

    // Branding is "done" once a logo is stored or a colour was set manually.
    const brandingDone = !!tenant?.logoUrl || tenant?.colorSource === 'manual';

    const steps = {
      year: currentYears > 0,
      classes: classes > 0,
      sections: sections > 0,
      subjects: classSubjects > 0,
      students: students > 0,
      staff: staff > 0,
      branding: brandingDone,
    };
    const firstIncomplete = STEP_ORDER.findIndex((k) => !steps[k]);
    const academicComplete = firstIncomplete === -1;

    return {
      steps,
      currentStep: academicComplete ? STEP_ORDER.length + 1 : firstIncomplete + 1,
      academicComplete,
      completed: tenant?.onboardingCompletedAt != null,
      completedAt: tenant?.onboardingCompletedAt?.toISOString() ?? null,
      counts: { hasCurrentYear: steps.year, classes, sections, classSubjects, students, staff },
    };
  }

  /** Mark the wizard finished/dismissed so the owner stops being routed into it. */
  async complete(): Promise<OnboardingStatus> {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingCompletedAt: new Date() },
    });
    return this.getStatus();
  }
}
