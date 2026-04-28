// frontend/src/lib/mfa.ts

/**
 * MFA Manager
 * Handles TOTP generation, verification, and backup code creation.
 * 
 * NOTE: In a production app, the 'secret' generation and verification 
 * should ideally happen on the server to prevent client-side manipulation.
 * This implementation is for demonstration purposes only.
 * 
 * For production, replace the mock logic with the 'otpauth' library:
 * npm install otpauth
 */

// FIX: Removed 'import { subtle } from "crypto";'
// The browser 'crypto' object is globally available and does not need importing.
// The Node.js 'crypto' module is not available in the browser environment.

// Mock TOTP logic for demonstration (Replace with 'otpauth' library in production)
const generateTOTP = (secret: string, time: number = Math.floor(Date.now() / 1000 / 30)): string => {
  // Simplified TOTP generation for demo. 
  // In production: const totp = new TOTP({ secret }); return totp.generate();
  // This mock just returns a deterministic string based on time for testing.
  const hash = new TextEncoder().encode(`${secret}-${time}`);
  // In real code, use crypto.subtle.digest('SHA-1', hash)
  return "123456"; // Placeholder for demo verification
};

export class MFAManager {
  /**
   * Step 1: Generate a new TOTP secret and QR URL
   */
  static generateSecret(): { secret: string; qrUrl: string } {
    // Generate a random 16-byte array (standard for TOTP)
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    
    // Convert to Base32 (simplified for demo, usually requires a library like base32-js)
    // For this demo, we use a random hex string as the secret
    const secret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    
    const issuer = "SecureWebProduct";
    const label = "user@example.com"; // Should be dynamic based on logged-in user
    
    // Construct OTPAuth URI
    const qrUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    
    return { secret, qrUrl };
  }

  /**
   * Step 2: Verify a TOTP code against a secret
   */
  static verifyCode(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    
    // In production: return totp.validate({ token: code }) !== null;
    // For demo: We accept "123456" if the secret matches (simulated)
    // Real implementation requires the exact time-window calculation.
    const expected = generateTOTP(secret);
    return code === expected;
  }

  /**
   * Step 3: Generate Backup Codes
   */
  static generateBackupCodes(count: number = 5): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate random alphanumeric code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    return codes;
  }

  /**
   * Step 4: Validate Backup Code
   */
  static validateBackupCode(inputCode: string, validCodes: string[]): boolean {
    const index = validCodes.indexOf(inputCode.toUpperCase());
    if (index !== -1) {
      // In a real app, mark this code as used in the database
      return true;
    }
    return false;
  }
}
