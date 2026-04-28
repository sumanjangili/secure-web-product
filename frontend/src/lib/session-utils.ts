// frontend/src/lib/session-utils.ts

/**
 * Derives a consistent cryptographic key from a user's JWT or session token.
 * Uses SHA-256 to hash the token into a key suitable for AES-GCM.
 * 
 * @param token - The JWT or session token string
 * @returns A CryptoKey object ready for encryption/decryption
 */
export async function deriveKeyFromToken(token: string): Promise<CryptoKey> {
  if (!token) {
    throw new Error("Token is required to derive a key.");
  }

  try {
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
  } catch (error) {
    console.error("Error deriving key from token:", error);
    throw new Error("Failed to derive session key.");
  }
}
