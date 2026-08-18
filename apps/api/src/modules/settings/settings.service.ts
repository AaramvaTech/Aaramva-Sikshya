import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { UpdateProfileDto } from './dto/settings.dto';
import { BrandingColorService, contrastRatio, fetchImageBuffer } from '../branding/branding-color.service';
import { StorageService } from '../storage/storage.service';
import { NEPALI_PRINT_PERMITTED } from '../../common/nepali-print-review-gate';

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
  brand_color: string | null;
  print_language: string | null;
  primary_foreground: string | null;
  color_source: string;
  logo_palette: Record<string, string> | null;
  payment_instructions: string | null;
  qr_image_url: string | null;
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
    brandColor: row.brand_color,
    printLanguage: row.print_language,
    primaryForeground: row.primary_foreground,
    colorSource: row.color_source,
    logoPalette: row.logo_palette,
    paymentInstructions: row.payment_instructions,
    qrImageUrl: row.qr_image_url,
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
  "brandColor" AS brand_color,
  "printLanguage" AS print_language,
  "primaryForeground" AS primary_foreground,
  "colorSource" AS color_source,
  "logoPalette" AS logo_palette,
  "paymentInstructions" AS payment_instructions,
  "qrImageUrl" AS qr_image_url`;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly brandingColor: BrandingColorService,
    private readonly storage: StorageService,
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
    const { tenantId, slug } = this.tenantContext.getOrThrow();

    // BILL-8 B8-6: the DTO's @IsIn only validates the SHAPE (one of the 3
    // known values) — the "requires native-speaker review" business rule
    // lives here, same split as MANUAL allocation's role check
    // (bill-payment.controller.ts): a declarative decorator can't
    // discriminate on a runtime flag.
    // BILL-PRINT-1: now NEPALI_PRINT_PERMITTED, which additionally requires
    // the keyset this ticket added to have been reviewed. Without this the
    // write path would still let a tenant SAVE printLanguage='NE' while the
    // render path silently downgraded it to EN — a setting that appears to
    // take and then does nothing.
    if (dto.printLanguage !== undefined && dto.printLanguage !== 'EN' && !NEPALI_PRINT_PERMITTED) {
      throw new BadRequestException(
        'Nepali print output is not yet available for any school — pending native-speaker review of the Devanagari translation.',
      );
    }

    // FILE-1: verified storage keys win over their legacy base64 *Url twins.
    // school-logo is the one public-read kind — its column gets the PUBLIC URL
    // (pre-auth consumers: mobile school-code screen, login page); signature
    // and stamp stay private and store the KEY (read via presigned GET).
    let logoBufferFromStorage: Buffer | null = null;
    if (dto.logoFileKey !== undefined) {
      await this.storage.verifyConfirmedKey(dto.logoFileKey, 'school-logo', slug);
      dto.logoUrl = this.storage.publicUrlFor(dto.logoFileKey);
      logoBufferFromStorage = await this.storage.getObjectBuffer(dto.logoFileKey);
    }
    if (dto.principalSignatureFileKey !== undefined) {
      await this.storage.verifyConfirmedKey(dto.principalSignatureFileKey, 'principal-signature', slug);
      dto.principalSignatureUrl = dto.principalSignatureFileKey;
    }
    if (dto.schoolStampFileKey !== undefined) {
      await this.storage.verifyConfirmedKey(dto.schoolStampFileKey, 'school-stamp', slug);
      dto.schoolStampUrl = dto.schoolStampFileKey;
    }
    if (dto.qrImageFileKey !== undefined) {
      await this.storage.verifyConfirmedKey(dto.qrImageFileKey, 'qr-image', slug);
      dto.qrImageUrl = dto.qrImageFileKey;
    }
    for (const [field, value] of [
      ['logoUrl', dto.logoFileKey === undefined ? dto.logoUrl : undefined],
      ['principalSignatureUrl', dto.principalSignatureFileKey === undefined ? dto.principalSignatureUrl : undefined],
      ['schoolStampUrl', dto.schoolStampFileKey === undefined ? dto.schoolStampUrl : undefined],
      ['qrImageUrl', dto.qrImageFileKey === undefined ? dto.qrImageUrl : undefined],
    ] as const) {
      if (value?.startsWith('data:')) {
        this.logger.warn(
          `[FILE-1] deprecated base64 ${field} received — switch to the presign flow (*FileKey)`,
        );
      }
    }

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
    // BILL-8: already restricted to the curated set at the DTO layer (@IsIn).
    if (dto.brandColor !== undefined) { updates.push(`"brandColor" = $${idx++}`); values.push(dto.brandColor); }
    // BILL-8: gate-checked above; safe to persist unconditionally here.
    if (dto.printLanguage !== undefined) { updates.push(`"printLanguage" = $${idx++}`); values.push(dto.printLanguage); }
    if (dto.paymentInstructions !== undefined) { updates.push(`"paymentInstructions" = $${idx++}`); values.push(dto.paymentInstructions); }
    if (dto.qrImageUrl !== undefined) { updates.push(`"qrImageUrl" = $${idx++}`); values.push(dto.qrImageUrl); }

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
      // FILE-1: presign-flow logos read their bytes straight from storage;
      // legacy values (data-URI / URL) still go through fetchImageBuffer.
      const buffer = logoBufferFromStorage ?? (await fetchImageBuffer(dto.logoUrl));
      if (buffer && rows[0].color_source !== 'manual') {
        const result = await this.brandingColor.deriveThemeFromLogo(buffer);
        if (result) {
          await this.publicPrisma.query(
            `UPDATE tenants
             SET "primaryColor" = $1, "primaryForeground" = $2,
                 "colorSource" = 'auto', "logoPalette" = $3::jsonb, "updatedAt" = NOW()
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
           "colorSource" = 'auto', "logoPalette" = $3::jsonb, "updatedAt" = NOW()
       WHERE id = $4`,
      result.primaryColor,
      result.primaryForeground,
      JSON.stringify(result.palette),
      tenantId,
    );
  }
}
