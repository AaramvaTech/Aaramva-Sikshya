import {
  encryptSecret,
  decryptSecret,
  credentialKeyConfigured,
} from '../credential-crypto.util';

// A deterministic 32-byte test key (64 hex chars).
const TEST_KEY =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

describe('credential-crypto.util (REG-1 §3 / REG-OBS-3)', () => {
  const prev = process.env.CREDENTIAL_SECRET_KEY;
  beforeAll(() => {
    process.env.CREDENTIAL_SECRET_KEY = TEST_KEY;
  });
  afterAll(() => {
    process.env.CREDENTIAL_SECRET_KEY = prev;
  });

  it('round-trips a temp password (encrypt → decrypt)', () => {
    const pw = 'Tk7#mQ2@pL9x';
    const enc = encryptSecret(pw);
    expect(enc.ciphertext).not.toContain(pw);
    expect(decryptSecret(enc)).toBe(pw);
  });

  it('produces a distinct IV/ciphertext each call (semantic security)', () => {
    const a = encryptSecret('same-plaintext');
    const b = encryptSecret('same-plaintext');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects a tampered auth tag (GCM authentication)', () => {
    const enc = encryptSecret('secret');
    const tampered = { ...enc, authTag: Buffer.from('deadbeefdeadbeef').toString('base64') };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptSecret('secret');
    const corrupt = Buffer.from(enc.ciphertext, 'base64');
    corrupt[0] ^= 0xff;
    expect(() => decryptSecret({ ...enc, ciphertext: corrupt.toString('base64') })).toThrow();
  });

  it('credentialKeyConfigured reflects a valid 32-byte key', () => {
    expect(credentialKeyConfigured()).toBe(true);
    process.env.CREDENTIAL_SECRET_KEY = 'too-short';
    expect(credentialKeyConfigured()).toBe(false);
    process.env.CREDENTIAL_SECRET_KEY = TEST_KEY;
  });

  it('throws when no key is set', () => {
    delete process.env.CREDENTIAL_SECRET_KEY;
    expect(() => encryptSecret('x')).toThrow(/CREDENTIAL_SECRET_KEY/);
    process.env.CREDENTIAL_SECRET_KEY = TEST_KEY;
  });
});
