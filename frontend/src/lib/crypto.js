// frontend/src/lib/crypto.ts
/**
 * Secure client-side crypto helper.
 * Uses the Web Crypto API (AES-GCM) with PBKDF2 key derivation.
 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
// Constants for PBKDF2
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
// SAFETY CHECK: Ensure Web Crypto API is available
const isCryptoAvailable = typeof crypto !== 'undefined' &&
    crypto.subtle &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.decrypt === 'function' &&
    typeof crypto.getRandomValues === 'function';
if (!isCryptoAvailable) {
    console.error("❌ Web Crypto API is NOT available in this browser.");
    console.error("   This browser may not support client-side encryption.");
    console.error("   Try using Chrome, Firefox, or Edge.");
}
/**
 * Derives a cryptographic key from a password using PBKDF2.
 */
async function deriveKey(password, salt) {
    if (!isCryptoAvailable) {
        throw new Error("Web Crypto API is not available. Cannot derive key.");
    }
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
    return await crypto.subtle.deriveKey({
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
    }, keyMaterial, { name: "AES-GCM", length: KEY_LENGTH * 8 }, false, ["encrypt", "decrypt"]);
}
/**
 * Encrypt a utf8 string.
 * Returns an object containing the ciphertext, salt, and IV as Base64 strings.
 * These three components are required to decrypt the data later.
 */
export async function encrypt(plainText, password) {
    if (!isCryptoAvailable) {
        throw new Error("Encryption failed: Web Crypto API unavailable in this browser.");
    }
    try {
        // Generate random salt and IV
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);
        const encryptedBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, TEXT_ENCODER.encode(plainText));
        // Convert ArrayBuffer to Uint8Array for Base64 conversion
        const encryptedBytes = new Uint8Array(encryptedBuffer);
        return {
            ciphertext: btoa(String.fromCharCode(...encryptedBytes)),
            salt: btoa(String.fromCharCode(...salt)),
            iv: btoa(String.fromCharCode(...iv))
        };
    }
    catch (error) {
        console.error("Encryption error:", error);
        throw new Error("Encryption failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
}
/**
 * Decrypt a Base64-encoded ciphertext using the provided salt and IV.
 * All three components (ciphertext, salt, iv) are required.
 */
export async function decrypt(ciphertextBase64, password, saltBase64, ivBase64) {
    if (!isCryptoAvailable) {
        throw new Error("Decryption failed: Web Crypto API unavailable in this browser.");
    }
    try {
        // Decode Base64 strings back to Uint8Array
        const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
        const key = await deriveKey(password, salt);
        const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        return TEXT_DECODER.decode(decryptedBuffer);
    }
    catch (error) {
        console.error("Decryption error:", error);
        // FIX: Check error type before accessing .name property
        if (error instanceof Error && error.name === 'OperationError') {
            throw new Error("Decryption failed: Invalid password or corrupted data.");
        }
        throw new Error("Decryption failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
}
