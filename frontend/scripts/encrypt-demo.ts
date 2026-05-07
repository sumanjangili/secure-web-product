// frontend/scripts/encrypt-demo.ts
// ⚠️ SECURITY WARNING - DEMO ONLY ⚠️
// This script is for LOCAL DEVELOPMENT ONLY. It must NEVER run in production or CI/CD.

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
// Production Safety Checks (STRICT)
// ---------------------------------------------------------------------------
function checkProductionEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isCI = !!process.env.CI || !!process.env.GITHUB_ACTIONS || !!process.env.TRAVIS || !!process.env.GITLAB_CI;
  const allowDemo = process.env.ALLOW_DEMO_SCRIPT === "true";
  const forceShowKeys = process.env.FORCE_SHOW_KEYS === "true";

  // 1. Block Production
  if (nodeEnv === "production") {
    console.error("❌ CRITICAL ERROR: This demo script is BLOCKED in production environments.");
    console.error("   Reason: Key leakage risk.");
    console.error("   Action: Remove this script from production builds or set NODE_ENV=development.");
    process.exit(1);
  }

  // 2. Block CI/CD unless explicitly overridden (Dangerous)
  if (isCI) {
    if (!allowDemo) {
      console.error("❌ CRITICAL ERROR: This script is BLOCKED in CI/CD environments.");
      console.error("   Reason: Logs in CI are often public or archived. Keys would be exposed.");
      console.error("   Action: Do not run this in CI. Remove from build pipeline.");
      process.exit(1);
    } else {
      console.warn("⚠️ DANGER: Running in CI/CD with ALLOW_DEMO_SCRIPT=true.");
      console.warn("   Your encryption keys WILL be printed to logs. This is a severe security risk.");
      console.warn("   Proceeding only because you explicitly forced it.");
    }
  }

  console.log(`ℹ️  Environment: ${nodeEnv} | CI: ${isCI ? "Yes" : "No"}`);
  
  if (!forceShowKeys && !isCI) {
    console.log("ℹ️  Keys will be HIDDEN by default for safety. Use FORCE_SHOW_KEYS=true to reveal.");
  }
}

// ---------------------------------------------------------------------------
// Helper: pretty‑print a Buffer as base64 (with masking option)
// ---------------------------------------------------------------------------
const b64 = (buf: Buffer, mask: boolean = true) => {
  if (mask) return "***KEY_HIDDEN*** (Set FORCE_SHOW_KEYS=true to reveal)";
  return buf.toString("base64");
};

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
  const forceShowKeys = process.env.FORCE_SHOW_KEYS === "true";

  console.log("\n🔐 ENCRYPTION DEMO - LOCAL DEVELOPMENT ONLY 🔐\n");
  
  // Mask keys by default to prevent accidental leaks in logs
  console.log("🔑 Key (base64) :", b64(key, !forceShowKeys));
  console.log("🔐 IV  (base64) :", b64(iv, !forceShowKeys));
  console.log("📝 Plaintext   :", PLAINTEXT);

  const { encrypted, authTag } = encrypt(PLAINTEXT, key, iv);
  console.log("📦 Ciphertext (base64) :", b64(encrypted, !forceShowKeys)); // Usually safe to show ciphertext, but masking for consistency
  console.log("🏷️ Auth tag  (base64) :", b64(authTag, !forceShowKeys));

  const recovered = decrypt(encrypted, key, iv, authTag);
  console.log("🔓 Recovered plaintext :", recovered);

  if (recovered === PLAINTEXT) {
    console.log("\n✅ Success – round‑trip encryption matches original text.\n");
  } else {
    console.error("\n❌ Failure – decrypted text differs from original!\n");
    process.exit(1);
  }

  console.log("⚠️  REMINDER: ");
  console.log("   1. This script generates ephemeral keys. Data encrypted here cannot be decrypted later.");
  console.log("   2. Delete this script or add to .gitignore before deploying.");
  console.log("   3. XSS, CSRF, and Race Conditions are NOT applicable to this local script.");
})();
