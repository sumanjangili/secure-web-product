// frontend/src/components/ConsentBanner.tsx
import React, { useState, useEffect } from "react";
import { encrypt } from "../lib/crypto";
import { ConsentManager } from "../lib/consent-manager";

interface ConsentBannerProps {
  userSessionKey?: string; // The JWT or session token
}

interface ConsentData {
  essential: boolean;
  analytics: boolean;
  timestamp: string;
  version: string;
}

const ConsentBanner: React.FC<ConsentBannerProps> = ({ userSessionKey }) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  useEffect(() => {
    const checkConsent = async () => {
      const stored = localStorage.getItem("consent");
      
      if (!stored) {
        setVisible(true);
        return;
      }

      if (!userSessionKey) {
        setVisible(true);
        return;
      }

      try {
        const consent = await ConsentManager.getConsent(userSessionKey);
        if (consent) {
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (error) {
        console.error("Consent check failed:", error);
        setVisible(true);
      }
    };

    checkConsent();
  }, [userSessionKey]);

  const handleSaveConsent = async (acceptAnalytics: boolean) => {
    setLoading(true);
    setErrorMessage(null);

    if (!userSessionKey) {
      setErrorMessage("Authentication required to save consent.");
      setLoading(false);
      return;
    }

    try {
      const consentData: ConsentData = {
        essential: true,
        analytics: acceptAnalytics,
        timestamp: new Date().toISOString(),
        version: "1.0",
      };

      // Encrypt using the JWT string directly as the password/key material
      const encrypted = await encrypt(JSON.stringify(consentData), userSessionKey);
      
      localStorage.setItem("consent", JSON.stringify(encrypted));
      
      ConsentManager.notifyConsentUpdated();
      setVisible(false);
    } catch (error) {
      setErrorMessage("Could not save consent. Please try again.");
      console.error("Failed to save consent:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    handleSaveConsent(false);
  };

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
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>Cookie Preferences</h3>
      <p style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", lineHeight: "1.4" }}>
        We use cookies to enhance your experience. 
        <strong>Essential cookies</strong> are required. 
        <strong>Analytics cookies</strong> are optional.
      </p>

      {errorMessage && (
        <p style={{ color: "#d32f2f", fontSize: "0.9rem", margin: "0.5rem 0" }}>
          {errorMessage}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "default" }}>
          <input type="checkbox" checked disabled style={{ accentColor: "#2563eb" }} />
          <span style={{ fontWeight: 500 }}>Essential Cookies (Required)</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input 
            type="checkbox" 
            id="analytics-consent"
            checked={analyticsConsent}
            onChange={(e) => setAnalyticsConsent(e.target.checked)}
            style={{ accentColor: "#2563eb" }}
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
            fontWeight: 500
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
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Saving..." : "Accept All"}
        </button>
      </div>
    </section>
  );
};

export default ConsentBanner;
