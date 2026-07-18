import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertRoleLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;
}
