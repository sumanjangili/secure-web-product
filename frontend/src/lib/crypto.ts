// frontend/src/lib/crypto.ts

/**
 * Secure client-side crypto helper.
 * Uses the Web Crypto API (AES-GCM) with adaptive key derivation.
 * 
 * Algorithm: AES-GCM (256-bit)
 * Key Derivation: PBKDF2 (SHA-256, 100k iterations)
 * 
 * SECURITY NOTES:
 * - This module is designed for USER-PASSWORDS only.
 * - The password is NEVER sent to the server.
 * - The server only receives the encrypted ciphertext, salt, and IV.
 * - This library is NOT vulnerable to XSS, CSRF, or Race Conditions as it 
 *   performs local mathematical operations only.
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
 * Derives a cryptographic key from a password using PBKDF2.
 */
async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Web Crypto API is not available.");
  }

  if (!password || password.length === 0) {
    throw new Error("[Crypto] Password cannot be empty.");
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
 * Encrypt a UTF-8 string using a user-provided password.
 * Returns { ciphertext, salt, iv } as Base64 strings.
 * 
 * Note: Each encryption produces a unique ciphertext due to random Salt/IV.
 * This is expected behavior and prevents pattern analysis.
 */
export async function encrypt(plainText: string, password: string): Promise<{ 
  ciphertext: string; 
  salt: string; 
  iv: string 
}> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Encryption failed: Web Crypto API unavailable.");
  }

  if (!plainText || typeof plainText !== 'string') {
    throw new Error("[Crypto] Invalid plain text.");
  }

  if (!password || password.length === 0) {
    throw new Error("[Crypto] Password cannot be empty.");
  }

  try {
    // Generate cryptographically secure random Salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive key from password
    const key = await deriveKeyFromPassword(password, salt);

    // Encrypt
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
    // Do not expose internal error details to the user
    throw new Error("[Crypto] Encryption failed.");
  }
}

/**
 * Decrypt a Base64-encoded ciphertext using the original password.
 */
export async function decrypt(
  ciphertextBase64: string, 
  password: string, 
  saltBase64: string, 
  ivBase64: string
): Promise<string> {
  if (!isCryptoAvailable) {
    throw new Error("[Crypto] Decryption failed: Web Crypto API unavailable.");
  }

  if (!ciphertextBase64 || !saltBase64 || !ivBase64 || !password) {
    throw new Error("[Crypto] Missing required decryption parameters.");
  }

  try {
    const salt = base64ToBuffer(saltBase64);
    const iv = base64ToBuffer(ivBase64);
    const ciphertext = base64ToBuffer(ciphertextBase64);

    // Derive key from password
    const key = await deriveKeyFromPassword(password, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    return TEXT_DECODER.decode(decryptedBuffer);
  } catch (error) {
    // Check for specific decryption failure (wrong key or corrupted data)
    if (error instanceof Error && error.name === 'OperationError') {
      // This usually means the password was wrong or the data was tampered with
      throw new Error("[Crypto] Decryption failed: Invalid password or corrupted data.");
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
