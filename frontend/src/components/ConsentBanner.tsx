// frontend/src/components/ConsentBanner.tsx
import React, { useState, useEffect } from "react";
import { ConsentManager } from "../lib/consent-manager";

interface ConsentBannerProps {
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
          // Validate version
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

      // 2. If no local consent, check server (if authenticated)
      if (userSessionKey) {
        try {
          const serverConsent = await ConsentManager.getConsent(userSessionKey);
          if (serverConsent) {
            // Sync local storage with server
            localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(serverConsent));
            setAnalyticsConsent(serverConsent.analytics);
            setVisible(false);
          } else {
            setVisible(true);
          }
        } catch (error) {
          console.error("Consent check failed:", error);
          // If server check fails, show banner to be safe
          setVisible(true);
        }
      } else {
        // Not authenticated, show banner
        setVisible(true);
      }
      setChecking(false);
    };

    checkConsent();
  }, [userSessionKey]);

  const handleSaveConsent = async (acceptAnalytics: boolean) => {
    if (checking) return; // Prevent saving while checking
    
    setLoading(true);
    setErrorMessage(null);

    const consentData: ConsentData = {
      essential: true,
      analytics: acceptAnalytics,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };

    try {
      // 1. Save locally immediately (UX responsiveness)
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
      setAnalyticsConsent(acceptAnalytics);

      // 2. Notify Manager (which should send to server)
      // If ConsentManager.notifyConsentUpdated requires a server call, do it here
      if (userSessionKey) {
        await ConsentManager.saveConsent(userSessionKey, consentData);
      } else {
        // If not logged in, maybe queue for later or just rely on local
        console.log("Consent saved locally. Will sync on login.");
      }

      ConsentManager.notifyConsentUpdated();
      setVisible(false);
    } catch (error) {
      setErrorMessage("Could not save consent. Please try again.");
      console.error("Failed to save consent:", error);
      // Revert local change if server fails? Or keep local? 
      // Keeping local is safer for UX, but server might be out of sync.
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    handleSaveConsent(false);
  };

  // Don't render while checking to avoid flash of banner
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
            color: "#475569",
            fontWeight: 500,
            transition: "background-color 0.2s"
          }}
        >
          Reject Non-Essential
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
