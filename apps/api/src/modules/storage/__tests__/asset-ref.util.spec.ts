import { UnprocessableEntityException } from '@nestjs/common';
import { checkAssetRef } from '../asset-ref.util';

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SIG = `tenant_demo/principal-signature/${UUID}.png`;
const PREFIX = 'http://s3.test/bucket/';
const base = { slug: 'demo', kind: 'principal-signature' as const, current: null as string | null };

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(UnprocessableEntityException);
    return (e as UnprocessableEntityException).getResponse() as { code: string; details?: unknown };
  }
  throw new Error('expected a throw');
}

describe('checkAssetRef (FILE-1-BLOB)', () => {
  it('undefined → undefined (column untouched)', () => {
    expect(checkAssetRef('f', undefined, base)).toBeUndefined();
  });

  it("'' and null clear the column → NULL", () => {
    expect(checkAssetRef('f', '', base)).toBeNull();
    expect(checkAssetRef('f', null, base)).toBeNull();
  });

  it('rejects data: with ASSET_LEGACY_BASE64_REJECTED {field}', () => {
    const r = codeOf(() => checkAssetRef('principalSignatureUrl', 'data:image/png;base64,AAAA', base));
    expect(r.code).toBe('ASSET_LEGACY_BASE64_REJECTED');
    expect(r.details).toEqual({ field: 'principalSignatureUrl' });
  });

  it('rejects data: EVEN WHEN it equals the stored value', () => {
    const v = 'data:image/png;base64,AAAA';
    expect(codeOf(() => checkAssetRef('f', v, { ...base, current: v })).code).toBe('ASSET_LEGACY_BASE64_REJECTED');
  });

  it('accepts a key for this tenant + kind', () => {
    expect(checkAssetRef('f', SIG, base)).toBe(SIG);
  });

  it("rejects another tenant's key, a wrong-kind key, and a foreign URL with ASSET_REF_INVALID", () => {
    expect(codeOf(() => checkAssetRef('f', `tenant_other/principal-signature/${UUID}.png`, base)).code).toBe('ASSET_REF_INVALID');
    expect(codeOf(() => checkAssetRef('f', `tenant_demo/school-stamp/${UUID}.png`, base)).code).toBe('ASSET_REF_INVALID');
    expect(codeOf(() => checkAssetRef('f', 'https://evil.test/x.png', base)).code).toBe('ASSET_REF_INVALID');
  });

  it('accepts an unchanged NON-data: value even if not a valid key (demo bill-qr), but not a different one', () => {
    const legacy = `tenant_demo/bill-qr/${UUID}.png`;
    expect(checkAssetRef('f', legacy, { ...base, current: legacy })).toBe(legacy);
    expect(codeOf(() => checkAssetRef('f', legacy, base)).code).toBe('ASSET_REF_INVALID');
  });

  it("logo: accepts this deployment's public URL of the tenant's own logo key only", () => {
    const o = { slug: 'demo', kind: 'school-logo' as const, current: null, publicPrefix: PREFIX };
    const ok = `${PREFIX}tenant_demo/school-logo/${UUID}.png`;
    expect(checkAssetRef('logoUrl', ok, o)).toBe(ok);
    expect(codeOf(() => checkAssetRef('logoUrl', `https://evil.test/tenant_demo/school-logo/${UUID}.png`, o)).code).toBe('ASSET_REF_INVALID');
    expect(codeOf(() => checkAssetRef('logoUrl', `${PREFIX}tenant_other/school-logo/${UUID}.png`, o)).code).toBe('ASSET_REF_INVALID');
    expect(codeOf(() => checkAssetRef('logoUrl', SIG, o)).code).toBe('ASSET_REF_INVALID');
  });
});
