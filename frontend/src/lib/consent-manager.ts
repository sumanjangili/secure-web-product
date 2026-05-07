// frontend/src/lib/consent-manager.ts
import { secureFetchJson } from './fetch-helper'; // ✅ Import the secure helper

interface ConsentData {
  essential: boolean;
  analytics: boolean;
  timestamp: string;
  version: string;
}

const CONSENT_STORAGE_KEY = "user_consent_v1";

class ConsentManagerClass {
  private cachedConsent: ConsentData | null = null;
  private listeners: ((consent: ConsentData | null) => void)[] = [];

  /**
   * Retrieves the current consent status from localStorage.
   * Returns null if no consent is found.
   * 
   * Note: Local storage uses plain JSON for UX speed. 
   * The server holds the authoritative record.
   */
  async getConsent(): Promise<ConsentData | null> {
    // Return cached value if available
    if (this.cachedConsent) return this.cachedConsent;

    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) {
      this.cachedConsent = null;
      return null;
    }

    try {
      const data = JSON.parse(stored) as ConsentData;
      
      // Basic validation
      if (typeof data.essential !== 'boolean' || typeof data.analytics !== 'boolean') {
        console.warn("Stored consent data is malformed.");
        this.cachedConsent = null;
        return null;
      }

      // Validate version
      if (data.version !== "1.0") {
        console.warn("Consent version mismatch. Treating as new consent.");
        this.cachedConsent = null;
        return null;
      }

      this.cachedConsent = data;
      return data;
    } catch (error) {
      console.error("Failed to read consent data:", error);
      this.cachedConsent = null;
      return null;
    }
  }

  /**
   * Saves consent data to the server and updates local storage.
   * Implements a "Write-Behind" pattern: Local update first for UX, 
   * then sync to server. If server fails, local state is reverted.
   * 
   * @param consentData - The consent object to save
   */
  async saveConsent(consentData: ConsentData): Promise<void> {
    // Store previous state for potential rollback
    const previousConsent = this.cachedConsent;
    const previousStorage = localStorage.getItem(CONSENT_STORAGE_KEY);

    try {
      // 1. Optimistic Update: Save to local storage immediately for UX
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
      this.cachedConsent = consentData;

      // 2. Send to backend
      // ✅ Using secureFetchJson: Automatically handles CSRF token and credentials
      await secureFetchJson("/.netlify/functions/save-consent", {
        method: "POST",
        body: JSON.stringify(consentData),
      });

      // 3. Success: Notify listeners
      this.notifyConsentUpdated();
    } catch (error: any) {
      console.error("Failed to save consent:", error);
      
      // ROLLBACK: Revert local storage and cache to previous state
      if (previousStorage) {
        localStorage.setItem(CONSENT_STORAGE_KEY, previousStorage);
      } else {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
      }
      this.cachedConsent = previousConsent;

      // Re-throw to let the UI (ConsentBanner) handle the error message
      // The error object from secureFetchJson has .status and .data properties
      throw error;
    }
  }

  /**
   * Checks if a specific category is allowed based on stored consent.
   * Essential is always considered allowed if any consent record exists.
   */
  async isAllowed(category: "essential" | "analytics"): Promise<boolean> {
    const consent = await this.getConsent();
    
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
    // Fetch fresh data to notify with current state
    this.getConsent().then((consent) => {
      this.listeners.forEach((cb) => cb(consent));
    });
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
