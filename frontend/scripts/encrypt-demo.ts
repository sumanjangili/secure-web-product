/**
 * scripts/encrypt-demo.ts
 *
 * Simple demonstration of AES‑256‑GCM encryption/decryption using Node's crypto API.
 *
 * Usage (add to package.json):
 *   "encrypt-demo": "ts-node ./scripts/encrypt-demo.ts"
 *
 * Run:
 *   npm run encrypt-demo
 *
 * The script prints:
 *   • Random key (base64)
 *   • Random IV / nonce (base64)
 *   • Ciphertext (base64)
 *   • Auth tag (base64)
 *   • Decrypted plaintext (should match the original)
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// ---------------------------------------------------------------------------
// Configuration – tweak these values for your own demo
// ---------------------------------------------------------------------------
const PLAINTEXT = `Demo payload – generated at ${new Date().toISOString()}`;
const ALGO = 'aes-256-gcm'; // Authenticated encryption
const KEY_SIZE = 32; // 256 bits
const IV_SIZE = 12; // Recommended size for GCM

// ---------------------------------------------------------------------------
// Helper: pretty‑print a Buffer as base64
// ---------------------------------------------------------------------------
const b64 = (buf: Buffer) => buf.toString('base64');

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
function encrypt(plain: string, key: Buffer, iv: Buffer) {
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16‑byte tag
  return { encrypted, authTag };
}

// ---------------------------------------------------------------------------
// Decryption
// ---------------------------------------------------------------------------
function decrypt(
  encrypted: Buffer,
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
) {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// Demo execution
// ---------------------------------------------------------------------------
(() => {
  // Generate random key & IV (nonce)
  const key = randomBytes(KEY_SIZE);
  const iv = randomBytes(IV_SIZE);

  console.log('🔑 Key (base64) :', b64(key));
  console.log('🔐 IV  (base64) :', b64(iv));
  console.log('📝 Plaintext   :', PLAINTEXT);

  // Encrypt
  const { encrypted, authTag } = encrypt(PLAINTEXT, key, iv);
  console.log('📦 Ciphertext (base64) :', b64(encrypted));
  console.log('🏷️ Auth tag  (base64) :', b64(authTag));

  // Decrypt (to prove it works)
  const recovered = decrypt(encrypted, key, iv, authTag);
  console.log('🔓 Recovered plaintext :', recovered);

  // Simple sanity check
  if (recovered === PLAINTEXT) {
    console.log('✅ Success – round‑trip encryption matches original text.');
  } else {
    console.error('❌ Failure – decrypted text differs from original!');
    process.exit(1);
  }
})();
