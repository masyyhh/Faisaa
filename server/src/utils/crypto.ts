import crypto from 'crypto';

/**
 * Interface representing components of an AES-256-GCM encrypted payload.
 */
export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Derives a deterministic 32-byte AES key from ENCRYPTION_KEY.
 * ENCRYPTION_KEY is strictly required (must be >= 32 bytes or 64 hex characters).
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY environment variable is required. Please set a 64-character hex string or a secure passphrase (minimum 32 bytes).'
    );
  }

  // If 64 hex characters (32 bytes in hex encoding)
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  // Passphrase must be at least 32 bytes
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY is invalid. It must be at least 32 bytes (or a 64-character hex string).'
    );
  }

  // Derive a deterministic 32-byte AES key using HKDF
  return Buffer.from(crypto.hkdfSync('sha256', secret, '', '', 32));
}

/**
 * Check if a string follows the iv:authTag:ciphertext format (all hex segments)
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, authTag, ciphertext] = parts;
  // IV is 12 bytes = 24 hex chars; Auth tag is 16 bytes = 32 hex chars
  const hexRegex = /^[0-9a-fA-F]+$/;
  return (
    iv.length === 24 &&
    authTag.length === 32 &&
    ciphertext.length > 0 &&
    hexRegex.test(iv) &&
    hexRegex.test(authTag) &&
    hexRegex.test(ciphertext)
  );
}

/**
 * Parse an encrypted string into its EncryptedPayload components.
 */
export function parseEncryptedPayload(payload: string): EncryptedPayload | null {
  if (!isEncrypted(payload)) return null;
  const [iv, authTag, ciphertext] = payload.split(':');
  return { iv, authTag, ciphertext };
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const text = String(plaintext);
  if (!text) return '';

  // Already encrypted? Avoid double encryption
  if (isEncrypted(text)) return text;

  const key = getEncryptionKey();
  // 12-byte IV recommended by NIST SP 800-38D for GCM
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 * Safely handles unencrypted legacy text for zero-downtime backwards compatibility.
 */
export function decrypt(encryptedPayload: string | null | undefined): string | null {
  if (encryptedPayload === null || encryptedPayload === undefined) return null;
  const payload = String(encryptedPayload);
  if (!payload) return '';

  // If not in encrypted format, it is a legacy plaintext string; return as-is
  if (!isEncrypted(payload)) {
    return payload;
  }

  try {
    const [ivHex, authTagHex, cipherHex] = payload.split(':');
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(cipherHex, 'hex'),
      decipher.final(),
    ]).toString('utf8');

    return decrypted;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to decrypt payload:', errorMsg);
    // Return null on authentication failure (tampered or wrong key)
    return null;
  }
}

/**
 * Mask a sensitive token for outgoing API responses.
 * Example: 123456789:ABCDefGh... -> 123456789:••••••••••••••••••
 */
export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const raw = isEncrypted(token) ? decrypt(token) : token;
  if (!raw) return null;

  if (raw.includes(':')) {
    const colonIdx = raw.indexOf(':');
    const prefix = raw.substring(0, colonIdx);
    const secretPart = raw.substring(colonIdx + 1);
    const maskLen = Math.max(12, Math.min(secretPart.length, 35));
    return `${prefix}:${'•'.repeat(maskLen)}`;
  }

  // Non-colon token: show first 4 and last 2, mask the rest
  if (raw.length <= 8) {
    return '••••••••';
  }
  return `${raw.slice(0, 4)}${'•'.repeat(16)}${raw.slice(-2)}`;
}

/**
 * Generate a cryptographically secure random integer between min and max (inclusive).
 * Uses Node.js native crypto.randomInt (CSPRNG).
 */
export function generateSecureInt(min: number, max: number): number {
  return crypto.randomInt(min, max);
}

/**
 * Generate a cryptographically secure N-digit OTP code (e.g. 6-digit one-time code).
 */
export function generateSecureOtp(digits: number = 6): string {
  const min = 0;
  const max = Math.pow(10, digits);
  return crypto.randomInt(min, max).toString().padStart(digits, '0');
}

/**
 * Generate a cryptographically secure random hex string token (e.g., refresh tokens).
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Compute SHA-256 hash of a string (used to securely store refresh tokens).
 */
export function hashToken(token: string): string;
export function hashToken(token: string | null | undefined): string | null;
export function hashToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
  maskToken,
  generateSecureInt,
  generateSecureOtp,
  generateSecureToken,
  hashToken,
};
