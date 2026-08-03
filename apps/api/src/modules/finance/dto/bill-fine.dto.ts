import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The trigger (`POST .../run`) and reverse (`POST .../:id/reverse`) endpoints
 * take no body — only this list-query DTO is needed this checkpoint. */
export class BillFineRunQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
