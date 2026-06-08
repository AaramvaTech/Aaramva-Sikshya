import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  monthlyPrice: number;

  @IsNumber()
  @Min(0)
  annualPrice: number;

  @IsInt()
  @Min(1)
  maxStudents: number;

  @IsInt()
  @Min(1)
  maxStaff: number;

  @IsObject()
  features: Record<string, boolean>;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxStaff?: number;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
