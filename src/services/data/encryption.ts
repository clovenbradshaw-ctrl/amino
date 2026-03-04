// =============================================================================
// Amino Encryption — PBKDF2 Key Derivation + AES-GCM-256 Encrypt/Decrypt
//
// Ported from data-layer.js (lines 59-183). Uses the Web Crypto API
// (SubtleCrypto) for all cryptographic operations.
//
// Key derivation:
//   - PBKDF2 with 600,000 iterations (OWASP 2023 recommendation)
//   - SHA-256 hash
//   - 256-bit AES-GCM key output
//   - Salt = "amino-local-encrypt:" + userId (deterministic per user)
//
// Encryption:
//   - AES-GCM with 12-byte (96-bit) random IV
//   - Output: IV + ciphertext concatenated into a single ArrayBuffer
//   - For storage: base64-encoded IV+ciphertext string
// =============================================================================

const SYNAPSE_SALT_PREFIX = 'amino-local-encrypt:';
const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH = 256;
const IV_BYTE_LENGTH = 12;

// =============================================================================
// Core Crypto Functions
// =============================================================================

/**
 * Derive an AES-GCM-256 CryptoKey from a password and salt using PBKDF2.
 *
 * @param password - The plaintext password (e.g. Synapse password)
 * @param salt     - Salt bytes (Uint8Array or ArrayBuffer)
 * @returns A CryptoKey usable for AES-GCM encrypt/decrypt
 */
export async function deriveKey(
  password: string,
  salt: BufferSource,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true, // extractable — allows key export for sub-page access
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derive the Synapse-specific encryption key.
 * Salt is deterministic: "amino-local-encrypt:" + userId.
 *
 * @param password - The user's Synapse password
 * @param userId   - The Matrix user ID (e.g. "@alice:matrix.org")
 * @returns A CryptoKey tied to this specific user
 */
export async function deriveSynapseKey(
  password: string,
  userId: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(SYNAPSE_SALT_PREFIX + userId);
  return deriveKey(password, salt);
}

/**
 * Encrypt plaintext using AES-GCM-256.
 *
 * @param key       - AES-GCM CryptoKey
 * @param plaintext - The string to encrypt
 * @returns ArrayBuffer containing IV (12 bytes) + ciphertext
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  // Concatenate IV + ciphertext into a single buffer
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

/**
 * Decrypt an AES-GCM-256 encrypted buffer back to plaintext.
 *
 * @param key             - AES-GCM CryptoKey
 * @param encryptedBuffer - ArrayBuffer containing IV (12 bytes) + ciphertext
 * @returns The decrypted plaintext string
 */
export async function decrypt(
  key: CryptoKey,
  encryptedBuffer: ArrayBuffer,
): Promise<string> {
  const data = new Uint8Array(encryptedBuffer);
  const iv = data.slice(0, IV_BYTE_LENGTH);
  const ciphertext = data.slice(IV_BYTE_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

// =============================================================================
// Base64 <-> ArrayBuffer Helpers
// =============================================================================

/** Convert an ArrayBuffer to a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert a base64 string back to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// =============================================================================
// Encrypt/Decrypt with Base64 Encoding (convenience wrappers)
// =============================================================================

/**
 * Encrypt plaintext and return a base64-encoded string (IV + ciphertext).
 * Suitable for storing in JSON fields or transmitting over text-based protocols.
 */
export async function encryptToBase64(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const buffer = await encrypt(key, plaintext);
  return arrayBufferToBase64(buffer);
}

/**
 * Decrypt a base64-encoded string (IV + ciphertext) back to plaintext.
 */
export async function decryptFromBase64(
  key: CryptoKey,
  encoded: string,
): Promise<string> {
  const buffer = base64ToArrayBuffer(encoded);
  return decrypt(key, buffer);
}

// =============================================================================
// Key Export/Import (for sub-page access via localStorage)
// =============================================================================

const DATA_LAYER_KEY_STORAGE = 'amino_data_layer_key';

/**
 * Export a CryptoKey to localStorage so sub-pages can import it.
 * The key is exported as raw bytes and stored as base64.
 */
export async function exportKeyToStorage(key: CryptoKey): Promise<void> {
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(DATA_LAYER_KEY_STORAGE, arrayBufferToBase64(raw));
  } catch (e) {
    console.warn('[Encryption] Could not export key to storage:', e);
  }
}

/**
 * Import a CryptoKey from localStorage (previously stored by exportKeyToStorage).
 * Returns null if no key is stored or import fails.
 */
export async function importKeyFromStorage(): Promise<CryptoKey | null> {
  const stored = localStorage.getItem(DATA_LAYER_KEY_STORAGE);
  if (!stored) return null;
  try {
    const raw = base64ToArrayBuffer(stored);
    return crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch (e) {
    console.warn('[Encryption] Could not import key from storage:', e);
    localStorage.removeItem(DATA_LAYER_KEY_STORAGE);
    return null;
  }
}

/** Remove the exported key from localStorage (call on logout). */
export function clearKeyFromStorage(): void {
  localStorage.removeItem(DATA_LAYER_KEY_STORAGE);
}

// =============================================================================
// Verification Token — Detect if the derived key has changed
// =============================================================================

const VERIFICATION_PLAINTEXT = 'amino-encryption-verify';

/**
 * Create a verification token by encrypting a known plaintext.
 * Store this in IndexedDB; on next login, verify the new key
 * produces the same plaintext to detect password changes.
 */
export async function createVerificationToken(key: CryptoKey): Promise<string> {
  const encrypted = await encrypt(key, VERIFICATION_PLAINTEXT);
  return arrayBufferToBase64(encrypted);
}

/**
 * Verify that a key can decrypt a previously stored verification token.
 * Returns false if the key has changed (e.g. password was changed).
 */
export async function verifyEncryptionKey(
  key: CryptoKey,
  token: string,
): Promise<boolean> {
  try {
    const buffer = base64ToArrayBuffer(token);
    const decrypted = await decrypt(key, buffer);
    return decrypted === VERIFICATION_PLAINTEXT;
  } catch {
    return false;
  }
}
