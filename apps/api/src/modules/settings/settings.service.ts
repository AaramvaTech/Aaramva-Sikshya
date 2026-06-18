import { Injectable } from '@nestjs/common';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { UpdateProfileDto } from './dto/settings.dto';
import { BrandingColorService, contrastRatio } from '../branding/branding-color.service';

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

interface TenantProfileRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  description: string | null;
  motto: string | null;
  established_year: number | null;
  website: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  alternate_phone: string | null;
  email: string | null;
  pan_number: string | null;
  registration_number: string | null;
  affiliation_board: string | null;
  affiliation_number: string | null;
  principal_name: string | null;
  principal_signature_url: string | null;
  school_stamp_url: string | null;
  primary_foreground: string | null;
  color_source: string;
  logo_palette: Record<string, string> | null;
}

function toProfileResponse(row: TenantProfileRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    description: row.description,
    motto: row.motto,
    establishedYear: row.established_year,
    website: row.website,
    address: row.address,
    province: row.province,
    district: row.district,
    phone: row.phone,
    alternatePhone: row.alternate_phone,
    email: row.email,
    panNumber: row.pan_number,
    registrationNumber: row.registration_number,
    affiliationBoard: row.affiliation_board,
    affiliationNumber: row.affiliation_number,
    principalName: row.principal_name,
    principalSignatureUrl: row.principal_signature_url,
    schoolStampUrl: row.school_stamp_url,
    primaryForeground: row.primary_foreground,
    colorSource: row.color_source,
    logoPalette: row.logo_palette,
  };
}

// tenants columns are camelCase in Postgres (Prisma default, no @map) — quote them.
const PROFILE_SELECT = `id, name, slug,
  "logoUrl" AS logo_url, "primaryColor" AS primary_color,
  description, motto, "establishedYear" AS established_year, website,
  address, province, district, phone, "alternatePhone" AS alternate_phone,
  email, "panNumber" AS pan_number,
  "registrationNumber" AS registration_number,
  "affiliationBoard" AS affiliation_board,
  "affiliationNumber" AS affiliation_number,
  "principalName" AS principal_name,
  "principalSignatureUrl" AS principal_signature_url,
  "schoolStampUrl" AS school_stamp_url,
  "primaryForeground" AS primary_foreground,
  "colorSource" AS color_source,
  "logoPalette" AS logo_palette`;

@Injectable()
export class SettingsService {
  constructor(
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly brandingColor: BrandingColorService,
  ) {}

  async getProfile() {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.publicPrisma.query<TenantProfileRow>(
      `SELECT ${PROFILE_SELECT} FROM tenants WHERE id = $1`,
      tenantId,
    );
    return toProfileResponse(rows[0]);
  }

  async updateProfile(dto: UpdateProfileDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { updates.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.logoUrl !== undefined) { updates.push(`"logoUrl" = $${idx++}`); values.push(dto.logoUrl); }
    if (dto.primaryColor !== undefined) {
      updates.push(`"primaryColor" = $${idx++}`); values.push(dto.primaryColor);
      const fg = contrastRatio(dto.primaryColor, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1220';
      updates.push(`"primaryForeground" = $${idx++}`); values.push(fg);
      updates.push(`"colorSource" = 'manual'`);
    }
    if (dto.description !== undefined) { updates.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.establishedYear !== undefined) { updates.push(`"establishedYear" = $${idx++}`); values.push(dto.establishedYear); }
    if (dto.website !== undefined) { updates.push(`website = $${idx++}`); values.push(dto.website); }
    if (dto.address !== undefined) { updates.push(`address = $${idx++}`); values.push(dto.address); }
    if (dto.phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(dto.phone); }
    if (dto.email !== undefined) { updates.push(`email = $${idx++}`); values.push(dto.email); }
    if (dto.panNumber !== undefined) { updates.push(`"panNumber" = $${idx++}`); values.push(dto.panNumber); }
    if (dto.motto !== undefined) { updates.push(`motto = $${idx++}`); values.push(dto.motto); }
    if (dto.province !== undefined) { updates.push(`province = $${idx++}`); values.push(dto.province); }
    if (dto.district !== undefined) { updates.push(`district = $${idx++}`); values.push(dto.district); }
    if (dto.alternatePhone !== undefined) { updates.push(`"alternatePhone" = $${idx++}`); values.push(dto.alternatePhone); }
    if (dto.registrationNumber !== undefined) { updates.push(`"registrationNumber" = $${idx++}`); values.push(dto.registrationNumber); }
    if (dto.affiliationBoard !== undefined) { updates.push(`"affiliationBoard" = $${idx++}`); values.push(dto.affiliationBoard); }
    if (dto.affiliationNumber !== undefined) { updates.push(`"affiliationNumber" = $${idx++}`); values.push(dto.affiliationNumber); }
    if (dto.principalName !== undefined) { updates.push(`"principalName" = $${idx++}`); values.push(dto.principalName); }
    if (dto.principalSignatureUrl !== undefined) { updates.push(`"principalSignatureUrl" = $${idx++}`); values.push(dto.principalSignatureUrl); }
    if (dto.schoolStampUrl !== undefined) { updates.push(`"schoolStampUrl" = $${idx++}`); values.push(dto.schoolStampUrl); }

    if (updates.length === 0) return this.getProfile();

    values.push(tenantId);
    const rows = await this.publicPrisma.query<TenantProfileRow>(
      `UPDATE tenants
       SET ${updates.join(', ')}, "updatedAt" = NOW()
       WHERE id = $${idx}
       RETURNING ${PROFILE_SELECT}`,
      ...values,
    );

    if (dto.logoUrl !== undefined) {
      const buffer = await fetchImageBuffer(dto.logoUrl);
      if (buffer && rows[0].color_source !== 'manual') {
        const result = await this.brandingColor.deriveThemeFromLogo(buffer);
        if (result) {
          await this.publicPrisma.query(
            `UPDATE tenants
             SET "primaryColor" = $1, "primaryForeground" = $2,
                 "colorSource" = 'auto', "logoPalette" = $3, "updatedAt" = NOW()
             WHERE id = $4`,
            result.primaryColor,
            result.primaryForeground,
            JSON.stringify(result.palette),
            tenantId,
          );
          return this.getProfile();
        }
      }
    }

    return toProfileResponse(rows[0]);
  }

  async rederiveBrandingColor(): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.publicPrisma.query<{ logo_url: string | null; color_source: string }>(
      `SELECT "logoUrl" AS logo_url, "colorSource" AS color_source FROM tenants WHERE id = $1`,
      tenantId,
    );
    const row = rows[0];
    if (!row?.logo_url) return;

    const buffer = await fetchImageBuffer(row.logo_url);
    if (!buffer) return;

    const result = await this.brandingColor.deriveThemeFromLogo(buffer);
    if (!result) return;

    await this.publicPrisma.query(
      `UPDATE tenants
       SET "primaryColor" = $1, "primaryForeground" = $2,
           "colorSource" = 'auto', "logoPalette" = $3, "updatedAt" = NOW()
       WHERE id = $4`,
      result.primaryColor,
      result.primaryForeground,
      JSON.stringify(result.palette),
      tenantId,
    );
  }
}
