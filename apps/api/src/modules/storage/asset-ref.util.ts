import { UnprocessableEntityException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-codes';
import { parseStorageKey, type FileKind } from './storage.policy';

/**
 * FILE-1-BLOB: the single gate for every column that stores an image
 * reference (tenants logo/signature/stamp/QR, staff + student photos).
 *
 *  - undefined            → not supplied, leave the column alone
 *  - null / ''            → cleared; normalised to NULL
 *  - `data:` (ALWAYS)     → ASSET_LEGACY_BASE64_REJECTED, even when it equals
 *                           the stored value (that is what forces the cleanup)
 *  - equal to `current`   → accepted unchanged (web resends the stored value on
 *                           every save; covers keys of retired kinds)
 *  - storage key for THIS tenant + `kind`, or (logo) this deployment's public
 *    URL of one          → accepted
 *  - anything else        → ASSET_REF_INVALID { field }
 *
 * No HEAD check here: an unchanged resend must not touch storage. New uploads
 * go through `*FileKey` + verifyConfirmedKey, which does.
 */
export function checkAssetRef(
  field: string,
  value: string | null | undefined,
  opts: {
    slug: string;
    kind: FileKind;
    current: string | null | undefined;
    /** `storage.publicUrlFor('')` — set only for the public-read logo column. */
    publicPrefix?: string;
  },
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value.startsWith('data:')) {
    throw new UnprocessableEntityException(errorBody('ASSET_LEGACY_BASE64_REJECTED', undefined, { field }));
  }
  if (opts.current && value === opts.current) return value;

  let key = value;
  if (opts.publicPrefix !== undefined) {
    key = value.startsWith(opts.publicPrefix) ? value.slice(opts.publicPrefix.length) : '';
  }
  const parsed = parseStorageKey(key);
  if (parsed && parsed.slug === opts.slug && parsed.kind === opts.kind) return value;
  throw new UnprocessableEntityException(errorBody('ASSET_REF_INVALID', undefined, { field }));
}
