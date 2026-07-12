import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { FILE_KIND_NAMES } from '../storage.policy';

/**
 * Presign request (FILE-1 upload flow). There is deliberately NO key field —
 * keys are server-generated; anything key-shaped a client sends is stripped
 * by the whitelist ValidationPipe and ignored.
 */
export class PresignUploadDto {
  @IsIn(FILE_KIND_NAMES)
  kind: string;

  /** Original client filename — logging/UX only, never used for the key. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  /** Declared size in bytes; signed into the PUT (Content-Length). */
  @IsInt()
  @Min(1)
  size: number;
}
