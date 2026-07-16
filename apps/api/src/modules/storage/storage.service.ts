import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errorBody } from '../common/errors/error-codes';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { Role } from '../common/enums/role.enum';
import {
  FILE_KIND_POLICIES,
  FileKind,
  FileKindPolicy,
  parseStorageKey,
} from './storage.policy';

/** Short expiries per the FILE-1 design (~10 min upload, 5 min read). */
export const UPLOAD_URL_TTL_SEC = 600;
export const READ_URL_TTL_SEC = 300;

export interface PresignUploadResult {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  /** headers the client MUST send on the PUT (they are signed) */
  headers: Record<string, string>;
  /** only for public-read kinds — persist THIS value, not the key */
  publicUrl?: string;
}

export interface StoredObjectInfo {
  size: number;
  contentType: string;
}

/**
 * FILE-1 StorageService — the only S3 touchpoint in the codebase.
 *
 * Provider-agnostic (MinIO dev, R2/B2/AWS prod) via S3_* env. All optional:
 * absent = storage disabled with a boot notice; presign endpoints 503 while
 * the legacy base64 path keeps working until cutover completes.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucket = '';
  private publicBase = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('S3_ENDPOINT') || '';
    const accessKey = this.config.get<string>('S3_ACCESS_KEY') || '';
    const secretKey = this.config.get<string>('S3_SECRET_KEY') || '';
    this.bucket = this.config.get<string>('S3_BUCKET') || '';

    if (!endpoint || !accessKey || !secretKey || !this.bucket) {
      this.logger.warn(
        'File storage DISABLED — set S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET to enable presigned uploads. Legacy base64 uploads remain accepted.',
      );
      return;
    }

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION') || 'us-east-1',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      // Path-style for MinIO/R2 (bucket in the path, not a subdomain).
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE') !== false,
      // SDK v3 defaults to embedding a CRC32 checksum in presigned URLs
      // (x-amz-checksum-crc32 of an EMPTY body) — MinIO ignores it but real
      // AWS S3 enforces it and would reject every browser PUT. Only checksum
      // when an operation requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.publicBase = (
      this.config.get<string>('S3_PUBLIC_URL') ||
      `${endpoint.replace(/\/+$/, '')}/${this.bucket}`
    ).replace(/\/+$/, '');
    this.logger.log(`File storage enabled — bucket "${this.bucket}" at ${endpoint}`);
    // BUG-1: enabled means the S3_* env is present, NOT that the backend is
    // reachable. Probe once at startup (fire-and-forget) so a down/misconfigured
    // backend is loud in the logs instead of only surfacing as a failed upload.
    void this.warnIfUnreachable(endpoint);
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /** BUG-1: HeadBucket reachability probe (used by /health). Throws when the
   *  backend is unreachable/misconfigured; caller decides how to report. */
  async assertReachable(): Promise<void> {
    const client = this.requireClient();
    await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  private async warnIfUnreachable(endpoint: string): Promise<void> {
    try {
      await this.assertReachable();
    } catch (err) {
      this.logger.warn(
        `File storage backend UNREACHABLE at ${endpoint} (bucket "${this.bucket}") — ` +
          `presign will still 201 but the browser PUT will fail until it is up. ` +
          `${(err as Error).message.split('\n')[0]}`,
      );
    }
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(errorBody('STORAGE_UNAVAILABLE'));
    }
    return this.client;
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /**
   * Validates the request against the kind-policy table and returns a
   * presigned PUT. The key is SERVER-GENERATED — any client-supplied key is
   * ignored by the DTO shape itself. Content-Type and Content-Length are
   * signed, so the PUT must match what was declared here.
   */
  async presignUpload(
    kind: string,
    contentType: string,
    size: number,
    slug: string,
    role: Role,
    opts?: {
      /** EDU-1: set ONLY by feature endpoints that performed the kind's
       *  object-level eligibility check (e.g. assignment submission presign). */
      eligibilityVerified?: boolean;
    },
  ): Promise<PresignUploadResult> {
    const client = this.requireClient();

    const policy: FileKindPolicy | undefined = FILE_KIND_POLICIES[kind as FileKind];
    if (!policy) {
      throw new BadRequestException(`Unknown file kind "${kind}".`);
    }
    if (policy.scopedOnly && !opts?.eligibilityVerified) {
      throw new ForbiddenException(
        `${kind} uploads must be presigned through their feature endpoint.`,
      );
    }
    if (!policy.uploadRoles.includes(role)) {
      throw new ForbiddenException(`Role ${role} may not upload ${kind} files.`);
    }
    const ext = policy.contentTypes[contentType];
    if (!ext) {
      throw new BadRequestException(
        `Content type "${contentType}" is not allowed for ${kind}. Allowed: ${Object.keys(policy.contentTypes).join(', ')}.`,
      );
    }
    if (!Number.isInteger(size) || size <= 0 || size > policy.maxBytes) {
      throw new BadRequestException(
        `File size ${size} exceeds the ${Math.round(policy.maxBytes / 1024 / 1024)} MB limit for ${kind}.`,
      );
    }

    const key = `tenant_${slug}/${kind}/${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: UPLOAD_URL_TTL_SEC },
    );

    return {
      key,
      uploadUrl,
      expiresIn: UPLOAD_URL_TTL_SEC,
      headers: { 'Content-Type': contentType },
      ...(policy.publicRead ? { publicUrl: this.publicUrlFor(key) } : {}),
    };
  }

  /** Short-lived presigned GET. Scoping happens in FileAccessService — do not
   *  expose this directly on a controller. */
  async presignRead(key: string): Promise<string> {
    const client = this.requireClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: READ_URL_TTL_SEC },
    );
  }

  /** null when the object does not exist. */
  async headObject(key: string): Promise<StoredObjectInfo | null> {
    const client = this.requireClient();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  /** Fetches object bytes (brand-color extraction reads logos this way). */
  async getObjectBuffer(key: string): Promise<Buffer | null> {
    const client = this.requireClient();
    try {
      const res = await client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Lists keys under a prefix (used by scripts/prune-orphans). */
  async listKeys(prefix: string): Promise<string[]> {
    const client = this.requireClient();
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /**
   * Confirm-side gate for feature endpoints that accept a `…FileKey`:
   * the key must be OUR shape, for THIS tenant and THIS kind, and the object
   * must actually exist within the kind's size/type policy (HEAD).
   * Returns the verified object info.
   */
  async verifyConfirmedKey(
    key: string,
    kind: FileKind,
    slug: string,
  ): Promise<StoredObjectInfo> {
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'File keys cannot be accepted while file storage is disabled.',
      );
    }
    const parsed = parseStorageKey(key);
    if (!parsed || parsed.kind !== kind || parsed.slug !== slug) {
      throw new BadRequestException(`Invalid ${kind} file key.`);
    }
    const info = await this.headObject(key);
    if (!info) {
      throw new BadRequestException(
        `No uploaded file found for the given ${kind} key — upload before confirming.`,
      );
    }
    const policy: FileKindPolicy = FILE_KIND_POLICIES[kind];
    if (info.size > policy.maxBytes || !policy.contentTypes[info.contentType]) {
      throw new BadRequestException(
        `The uploaded ${kind} object violates the size/type policy.`,
      );
    }
    return info;
  }

  private isNotFound(err: unknown): boolean {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
  }
}
