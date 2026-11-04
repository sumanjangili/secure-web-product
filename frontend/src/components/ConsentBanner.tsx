// frontend/src/components/ConsentBanner.tsx
import React, { useState, useEffect, useCallback } from "react";
import { ConsentManager } from "../lib/consent-manager";
import { secureFetchJson } from "../lib/fetch-helper"; 

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

  const handleSaveConsent = useCallback(async (acceptAnalytics: boolean) => {
    if (checking || loading) return; 
    
    setLoading(true);
    setErrorMessage(null);

    const consentData: ConsentData = {
      essential: true,
      analytics: acceptAnalytics,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };

    const previousStorage = localStorage.getItem(CONSENT_STORAGE_KEY);
    
    try {
      // Optimistic Update
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
      setAnalyticsConsent(acceptAnalytics);

      // ✅ FIXED: Use short path
      await secureFetchJson("/save-consent", {
        method: "POST",
        body: JSON.stringify(consentData),
      });

      ConsentManager.notifyConsentUpdated();
      setVisible(false);

    } catch (error: any) {
      console.error("Failed to save consent:", error);
      
      // Rollback
      if (previousStorage) {
        localStorage.setItem(CONSENT_STORAGE_KEY, previousStorage);
        try {
          const prevParsed: ConsentData = JSON.parse(previousStorage);
          setAnalyticsConsent(prevParsed.analytics);
        } catch (e) {
          setAnalyticsConsent(false);
        }
      } else {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        setAnalyticsConsent(false);
      }

      if (error.status === 401) {
        setErrorMessage("Session expired. Please log in to save preferences.");
      } else {
        setErrorMessage("Could not save consent. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [checking, loading]);

  const handleDismiss = useCallback(() => {
    handleSaveConsent(false);
  }, [handleSaveConsent]);

  useEffect(() => {
    const checkConsent = async () => {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      
      if (stored) {
        try {
          const parsed: ConsentData = JSON.parse(stored);
          if (parsed.version === "1.0" && 
              typeof parsed.essential === 'boolean' && 
              typeof parsed.analytics === 'boolean') {
            
            setAnalyticsConsent(parsed.analytics);
            setVisible(!parsed.essential);
            setChecking(false);
            return;
          }
        } catch (e) {
          console.warn("Corrupt consent data in localStorage, resetting.");
          localStorage.removeItem(CONSENT_STORAGE_KEY);
        }
      }

      try {
        const serverConsent = await secureFetchJson<ConsentData>("/get-consent");
        
        if (serverConsent.essential) {
          localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(serverConsent));
          setAnalyticsConsent(serverConsent.analytics);
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (error: any) {
        if (error?.status === 401 || !error?.status) {
          setVisible(true);
        } else {
          console.error("Consent check failed:", error);
          setVisible(true);
        }
      } finally {
        setChecking(false);
      }
    };

    checkConsent();
  }, [userSessionKey]);

  // ✅ FIXED: Gate dev button behind environment check
  const handleResetConsent = () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.location.reload();
  };

  if (checking) return null;
  
  if (!visible) {
    // Only show reset button in development mode
    if (import.meta.env.DEV) {
      return (
        <button 
          onClick={handleResetConsent}
          style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, opacity: 0.5, fontSize: '0.8rem' }}
          title="Reset Consent (Dev Mode)"
        >
          Reset Consent (Dev)
        </button>
      );
    }
    return null;
  }

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
      aria-describedby="consent-description"
      data-testid="consent-banner"
    >
      <h3 id="consent-title" style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 600 }}>
        Cookie Preferences
      </h3>
      <p 
        id="consent-description"
        style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", lineHeight: "1.4", color: "#334155" }}
      >
        We use cookies to enhance your experience. 
        <strong> Essential cookies</strong> are required for the site to function. 
        <strong> Analytics cookies</strong> help us improve our services.
      </p>

      {errorMessage && (
        <div 
          role="alert" 
          aria-live="assertive"
          style={{ color: "#d32f2f", fontSize: "0.9rem", margin: "0.5rem 0", padding: "0.5rem", backgroundColor: "#ffebee", borderRadius: "4px" }}
        >
          {errorMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "default" }}>
          <input 
            type="checkbox" 
            checked 
            disabled 
            style={{ accentColor: "#2563eb", transform: "scale(1.2)" }} 
            aria-label="Essential Cookies (Required)"
          />
          <span style={{ fontWeight: 500 }}>Essential Cookies (Required)</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input 
            type="checkbox" 
            id="analytics-consent"
            checked={analyticsConsent}
            onChange={(e) => setAnalyticsConsent(e.target.checked)}
            disabled={loading}
            style={{ accentColor: "#2563eb", transform: "scale(1.2)" }}
            aria-label="Analytics & Performance Cookies"
          />
          <span>Analytics & Performance Cookies</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button 
          onClick={handleDismiss}
          disabled={loading}
          aria-busy={loading}
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
          data-testid="reject-button"
        >
          {loading ? "Saving..." : "Reject Non-Essential"}
        </button>

        <button 
          onClick={() => handleSaveConsent(true)}
          disabled={loading}
          aria-busy={loading}
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
          data-testid="accept-button"
        >
          {loading ? "Saving..." : "Accept All"}
        </button>
      </div>
    </section>
  );
};

export default ConsentBanner;
