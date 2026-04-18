// frontend/scripts/encrypt-demo.ts
// ⚠️ SECURITY WARNING - DEMO ONLY ⚠️

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import * as dotenv from "dotenv";

// Load environment variables if .env exists
dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PLAINTEXT = `Demo payload – generated at ${new Date().toISOString()}`;
const ALGO = "aes-256-gcm";
const KEY_SIZE = 32;
const IV_SIZE = 12;

// ---------------------------------------------------------------------------
// Production Safety Checks
// ---------------------------------------------------------------------------
function checkProductionEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS || !!process.env.TRAVIS;
  const allowDemo = process.env.ALLOW_DEMO_SCRIPT === "true";

  if (nodeEnv === "production") {
    console.error("❌ ERROR: This demo script is blocked in production environments.");
    console.error("   Set NODE_ENV=development or ALLOW_DEMO_SCRIPT=true to override (NOT RECOMMENDED).");
    process.exit(1);
  }

  if (isCI && !allowDemo) {
    console.error("⚠️ WARNING: Running in CI/CD environment.");
    console.error("   Console output may be logged publicly. Consider disabling this script.");
    console.error("   Set ALLOW_DEMO_SCRIPT=true to proceed anyway.");
  }

  console.log(`ℹ️  Environment: ${nodeEnv} | CI: ${isCI ? "Yes" : "No"}`);
}

// ---------------------------------------------------------------------------
// Helper: pretty‑print a Buffer as base64
// ---------------------------------------------------------------------------
const b64 = (buf: Buffer) => buf.toString("base64");

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
function encrypt(plain: string, key: Buffer, iv: Buffer) {
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { encrypted, authTag };
}

// ---------------------------------------------------------------------------
// Decryption
// ---------------------------------------------------------------------------
function decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer) {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Demo execution
// ---------------------------------------------------------------------------
(() => {
  checkProductionEnvironment();

  const key = randomBytes(KEY_SIZE);
  const iv = randomBytes(IV_SIZE);

  console.log("\n🔐 ENCRYPTION DEMO - LOCAL DEVELOPMENT ONLY 🔐\n");
  console.log("🔑 Key (base64) :", b64(key));
  console.log("🔐 IV  (base64) :", b64(iv));
  console.log("📝 Plaintext   :", PLAINTEXT);

  const { encrypted, authTag } = encrypt(PLAINTEXT, key, iv);
  console.log("📦 Ciphertext (base64) :", b64(encrypted));
  console.log("🏷️ Auth tag  (base64) :", b64(authTag));

  const recovered = decrypt(encrypted, key, iv, authTag);
  console.log("🔓 Recovered plaintext :", recovered);

  if (recovered === PLAINTEXT) {
    console.log("\n✅ Success – round‑trip encryption matches original text.\n");
  } else {
    console.error("\n❌ Failure – decrypted text differs from original!\n");
    process.exit(1);
  }

  console.log("⚠️  REMINDER: Delete this script or add to .gitignore before deploying to production.");
})();
