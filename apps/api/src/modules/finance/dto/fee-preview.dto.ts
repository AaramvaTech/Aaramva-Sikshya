import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FeePreviewQueryDto {
  @IsUUID() academicYearId: string;
  /** Defaults to today (server date) when omitted — see FeePreviewService. */
  @IsOptional() @IsDateString() asOfDate?: string;
}
