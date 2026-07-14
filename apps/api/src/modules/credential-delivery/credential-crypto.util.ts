import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// REG-1 §3 (REG-OBS-3) — AES-256-GCM encryption of the temp password at rest in
// credential_delivery_secrets. Key from env CREDENTIAL_SECRET_KEY (64 hex chars
// = 32 bytes, or a 32-byte base64 value). Plaintext is NEVER persisted or logged.

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV — the GCM standard

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function key(): Buffer {
  const raw = process.env.CREDENTIAL_SECRET_KEY;
  if (!raw) {
    throw new Error(
      'CREDENTIAL_SECRET_KEY is not set — credential delivery cannot encrypt temp passwords',
    );
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('CREDENTIAL_SECRET_KEY must decode to 32 bytes (AES-256)');
  }
  return buf;
}

/** True when a valid 32-byte key is configured (used for boot notices). */
export function credentialKeyConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Throws if the ciphertext/auth-tag was tampered with (GCM authentication). */
export function decryptSecret(s: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(s.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(s.authTag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(s.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}
