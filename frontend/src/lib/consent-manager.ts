// frontend/src/lib/consent-manager.ts

import { decrypt } from "./crypto";

interface ConsentData {
  essential: boolean;
  analytics: boolean;
  timestamp: string;
  version: string;
}

interface EncryptedConsent {
  ciphertext: string;
  salt: string;
  iv: string;
}

class ConsentManagerClass {
  private cachedConsent: ConsentData | null = null;
  private listeners: ((consent: ConsentData | null) => void)[] = [];

  /**
   * Retrieves and decrypts the current consent status from localStorage.
   * Returns null if no consent is found or if decryption fails.
   * 
   * @param userSessionKey - The JWT or session token used as the decryption key
   */
  async getConsent(userSessionKey: string): Promise<ConsentData | null> {
    // Return cached value if available to avoid redundant decryption
    if (this.cachedConsent) return this.cachedConsent;

    const stored = localStorage.getItem("consent");
    if (!stored) {
      this.cachedConsent = null;
      return null;
    }

    try {
      const encryptedObj: EncryptedConsent = JSON.parse(stored);
      
      // Validate structure
      if (!encryptedObj.ciphertext || !encryptedObj.salt || !encryptedObj.iv) {
        console.warn("Stored consent data is malformed.");
        this.cachedConsent = null;
        return null;
      }

      const decryptedString = await decrypt(
        encryptedObj.ciphertext,
        userSessionKey,
        encryptedObj.salt,
        encryptedObj.iv
      );
      
      const data = JSON.parse(decryptedString) as ConsentData;
      
      // Basic validation
      if (typeof data.essential !== 'boolean' || typeof data.analytics !== 'boolean') {
        throw new Error("Invalid consent data structure");
      }

      this.cachedConsent = data;
      return data;
    } catch (error) {
      console.error("Failed to read or decrypt consent:", error);
      this.cachedConsent = null;
      return null;
    }
  }

  /**
   * Checks if a specific category is allowed based on stored consent.
   * Essential is always considered allowed if any consent record exists.
   * 
   * @param category - The category to check ("essential" or "analytics")
   * @param userSessionKey - The session token for decryption
   */
  async isAllowed(category: "essential" | "analytics", userSessionKey: string): Promise<boolean> {
    const consent = await this.getConsent(userSessionKey);
    
    if (!consent) return false; // No consent given yet

    if (category === "essential") return true;
    if (category === "analytics") return consent.analytics;
    
    return false;
  }

  /**
   * Notifies all listeners that consent has changed.
   * Clears the cache to force re-fetch on next access.
   */
  notifyConsentUpdated() {
    this.cachedConsent = null; // Invalidate cache
    const currentConsent = this.cachedConsent; // Will be null, but we notify anyway
    this.listeners.forEach((cb) => cb(currentConsent));
  }

  /**
   * Subscribes a callback to listen for consent changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (consent: ConsentData | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const ConsentManager = new ConsentManagerClass();
