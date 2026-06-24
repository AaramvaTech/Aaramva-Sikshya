import { IsString, MinLength } from 'class-validator';

export class ImportStudentsDto {
  @IsString()
  @MinLength(1)
  csv!: string;
}
