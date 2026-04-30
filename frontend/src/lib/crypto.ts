// frontend/src/lib/crypto.ts

/**
 * Secure client-side crypto helper.
 * Uses the Web Crypto API (AES-GCM) with adaptive key derivation.
 * 
 * Algorithm: AES-GCM (256-bit)
 * Key Derivation: 
 *   - PBKDF2 (SHA-256, 100k iterations) for User Passwords
 *   - SHA-256 (Single pass) for JWT Tokens (Session Keys)
 */

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// Constants
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256; // 32 bytes
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits (standard for GCM)

// Safety Check
const isCryptoAvailable = 
  typeof crypto !== 'undefined' && 
  crypto.subtle && 
  typeof crypto.subtle.encrypt === 'function' &&
  typeof crypto.subtle.decrypt === 'function' &&
  typeof crypto.getRandomValues === 'function';

if (!isCryptoAvailable) {
  console.warn("[Crypto] Web Crypto API is not available. Encryption features will be disabled.");
}

/**
 * Validates if a string looks like a JWT (3 parts separated by dots).
 * This is a heuristic; a password could theoretically contain dots.
 * For higher security, explicitly pass the key type.
 */
function isLikelyJwt(keyMaterial: string): boolean {
  const parts = keyMaterial.split('.');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Derives a cryptographic key from a password using PBKDF2.
 * Used for user-provided passwords (high entropy, slow derivation).
 */
async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Web Crypto API is not available.");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derives a key from a JWT Token using SHA-256.
 * Used for session keys (already random, fast derivation).
 */
async function deriveKeyFromToken(token: string): Promise<CryptoKey> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Web Crypto API is not available.");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  
  // Hash the token using SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Import the hash as a raw key for AES-GCM
  return await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Smart Key Derivation: Detects if input is a JWT or Password.
 * - JWTs contain 3 parts separated by '.'
 * - Passwords are treated as raw strings.
 * 
 * WARNING: If a password contains exactly 2 dots, it might be misidentified as a JWT.
 * For critical applications, pass an explicit 'type' parameter.
 */
async function deriveKey(keyMaterial: string, salt?: Uint8Array): Promise<CryptoKey> {
  if (isLikelyJwt(keyMaterial)) {
    return deriveKeyFromToken(keyMaterial);
  }
  
  // Otherwise, assume it's a password
  if (!salt) {
    throw new Error("[Crypto] Salt is required for password-based key derivation.");
  }
  return deriveKeyFromPassword(keyMaterial, salt);
}

/**
 * Encrypt a UTF-8 string.
 * Returns { ciphertext, salt, iv } as Base64 strings.
 */
export async function encrypt(plainText: string, keyMaterial: string): Promise<{ 
  ciphertext: string; 
  salt: string; 
  iv: string 
}> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Encryption failed: Web Crypto API unavailable.");
  }

  try {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Smart derivation
    const key = await deriveKey(keyMaterial, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      TEXT_ENCODER.encode(plainText)
    );

    return {
      ciphertext: bufferToBase64(encryptedBuffer),
      salt: bufferToBase64(salt),
      iv: bufferToBase64(iv)
    };
  } catch (error) {
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
      console.error("[Crypto] Encryption error:", error);
    }
    throw new Error("[Crypto] Encryption failed.");
  }
}

/**
 * Decrypt a Base64-encoded ciphertext.
 */
export async function decrypt(
  ciphertextBase64: string, 
  keyMaterial: string, 
  saltBase64: string, 
  ivBase64: string
): Promise<string> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Decryption failed: Web Crypto API unavailable.");
  }

  try {
    const salt = base64ToBuffer(saltBase64);
    const iv = base64ToBuffer(ivBase64);
    const ciphertext = base64ToBuffer(ciphertextBase64);

    // Smart derivation (salt is ignored for JWTs, but passed for type safety)
    const key = await deriveKey(keyMaterial, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    return TEXT_DECODER.decode(decryptedBuffer);
  } catch (error) {
    // Check for specific decryption failure (wrong key or corrupted data)
    if (error instanceof Error && error.name === 'OperationError') {
      throw new Error("[Crypto] Decryption failed: Invalid key or corrupted data.");
    }
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
      console.error("[Crypto] Decryption error:", error);
    }
    throw new Error("[Crypto] Decryption failed.");
  }
}

// --- Helper Functions ---

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
