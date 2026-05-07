// frontend/src/components/ConsentBanner.tsx
import React, { useState, useEffect } from "react";
import { ConsentManager } from "../lib/consent-manager";
import { secureFetchJson } from "../lib/fetch-helper"; // ✅ Import the secure helper

interface ConsentBannerProps {
  // userSessionKey is no longer needed for auth logic, kept only if used for UI display
  userSessionKey?: string; 
}

interface ConsentData {
  essential: boolean;
  analytics: boolean;
  timestamp: string;
  version: string;
}

const CONSENT_STORAGE_KEY = "user_consent_v1";

const ConsentBanner: React.FC<ConsentBannerProps> = ({ userSessionKey }) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkConsent = async () => {
      // 1. Check local storage first (fast path)
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      
      if (stored) {
        try {
          const parsed: ConsentData = JSON.parse(stored);
          if (parsed.version === "1.0") {
            setAnalyticsConsent(parsed.analytics);
            setVisible(false);
            setChecking(false);
            return;
          }
        } catch (e) {
          console.warn("Corrupt consent data in localStorage, resetting.");
          localStorage.removeItem(CONSENT_STORAGE_KEY);
        }
      }

      // 2. If no local consent, check server
      // We attempt to fetch regardless of userSessionKey presence, 
      // as the backend will return 401 if not authenticated.
      try {
        // ✅ Using secureFetchJson: Handles CSRF token and credentials automatically
        const serverConsent = await secureFetchJson<ConsentData>("/.netlify/functions/get-consent");
        
        // If we got here, the request was successful (200 OK)
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(serverConsent));
        setAnalyticsConsent(serverConsent.analytics);
        setVisible(false);
      } catch (error: any) {
        // If 401, user is not logged in -> Show banner
        if (error.status === 401) {
          console.log("Not authenticated, showing consent banner.");
          setVisible(true);
        } else {
          // Network error or other server error -> Show banner to be safe
          console.error("Consent check failed:", error);
          setVisible(true);
        }
      } finally {
        setChecking(false);
      }
    };

    checkConsent();
  }, [userSessionKey]);

  // ✅ CORRECTED: Removed access to private 'cachedConsent' property
  const handleSaveConsent = async (acceptAnalytics: boolean) => {
    if (checking) return;
    
    setLoading(true);
    setErrorMessage(null);

    const consentData: ConsentData = {
      essential: true,
      analytics: acceptAnalytics,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };

    // Store previous state for potential rollback
    const previousStorage = localStorage.getItem(CONSENT_STORAGE_KEY);
    
    try {
      // 1. Optimistic Update: Save to local storage immediately for UX
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
      setAnalyticsConsent(acceptAnalytics);

      // 2. Sync to Server
      // ✅ Using secureFetchJson: Automatically adds X-CSRF-Token and credentials: include
      await secureFetchJson("/.netlify/functions/save-consent", {
        method: "POST",
        body: JSON.stringify(consentData),
      });

      // 3. Success: Notify listeners
      ConsentManager.notifyConsentUpdated();
      setVisible(false);

    } catch (error: any) {
      console.error("Failed to save consent:", error);
      
      // Rollback: Revert local storage to previous state
      if (previousStorage) {
        localStorage.setItem(CONSENT_STORAGE_KEY, previousStorage);
        // Parse and restore the UI state from the previous storage
        try {
          const prevParsed: ConsentData = JSON.parse(previousStorage);
          setAnalyticsConsent(prevParsed.analytics);
        } catch (e) {
          setAnalyticsConsent(false); // Fallback if corrupt
        }
      } else {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        setAnalyticsConsent(false);
      }

      // Handle specific errors
      if (error.status === 401) {
        setErrorMessage("Session expired. Please log in to save preferences.");
      } else {
        setErrorMessage("Could not save consent. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    handleSaveConsent(false);
  };

  if (checking) return null;
  if (!visible) return null;

  return (
    <section
      style={{
        background: "#f0f4ff",
        padding: "1.5rem",
        borderRadius: "8px",
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        maxWidth: "600px",
        margin: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 9999,
        border: "1px solid #dbeafe",
        fontFamily: "sans-serif",
      }}
      role="dialog"
      aria-labelledby="consent-title"
    >
      <h3 id="consent-title" style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 600 }}>
        Cookie Preferences
      </h3>
      <p style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", lineHeight: "1.4", color: "#334155" }}>
        We use cookies to enhance your experience. 
        <strong> Essential cookies</strong> are required for the site to function. 
        <strong> Analytics cookies</strong> help us improve our services.
      </p>

      {errorMessage && (
        <div role="alert" style={{ color: "#d32f2f", fontSize: "0.9rem", margin: "0.5rem 0", padding: "0.5rem", backgroundColor: "#ffebee", borderRadius: "4px" }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "default" }}>
          <input type="checkbox" checked disabled style={{ accentColor: "#2563eb", transform: "scale(1.2)" }} />
          <span style={{ fontWeight: 500 }}>Essential Cookies (Required)</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input 
            type="checkbox" 
            id="analytics-consent"
            checked={analyticsConsent}
            onChange={(e) => setAnalyticsConsent(e.target.checked)}
            style={{ accentColor: "#2563eb", transform: "scale(1.2)" }}
          />
          <span>Analytics & Performance Cookies</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button 
          onClick={handleDismiss}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "transparent",
            border: "1px solid #cbd5e1",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            color: loading ? "#94a3b8" : "#475569",
            fontWeight: 500,
            transition: "all 0.2s"
          }}
        >
          {loading ? "Saving..." : "Reject Non-Essential"}
        </button>

        <button 
          onClick={() => handleSaveConsent(true)}
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: loading ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            opacity: loading ? 0.7 : 1,
            transition: "background-color 0.2s"
          }}
        >
          {loading ? "Saving..." : "Accept All"}
        </button>
      </div>
    </section>
  );
};

export default ConsentBanner;
