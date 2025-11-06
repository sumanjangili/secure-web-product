/**
 * Minimal client‑side crypto helper.
 * Uses the Web Crypto API (AES‑GCM) with a static demo key.
 * In production you would derive the key from a password or fetch it from a secure backend.
 */

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/* ------------------------------------------------------------------
   Demo static key – DO NOT ship this in a real product!
   Replace with a proper key‑derivation routine before going live.
------------------------------------------------------------------- */
const RAW_KEY = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
  0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f
]);

/**
 * Import the raw key into a CryptoKey object (AES‑GCM, non‑extractable).
 */
async function getKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    RAW_KEY,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a utf8 string and return a Base64‑encoded payload.
 */
export async function encrypt(plainText: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODER.encode(plainText)
  );

  // Concatenate IV + ciphertext, then Base64‑encode for transport
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a Base64‑encoded payload produced by `encrypt`.
 */
export async function decrypt(base64Cipher: string): Promise<string> {
  const data = Uint8Array.from(atob(base64Cipher), c => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const key = await getKey();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return TEXT_DECODER.decode(decrypted);
}
