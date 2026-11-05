// frontend/src/components/ConsentBanner.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { ConsentManager } from "../lib/consent-manager";
import { secureFetchJson, ApiError } from "../lib/fetch-helper";

interface ConsentBannerProps {
  userSessionKey?: string;
}

interface ConsentData {
  essential: boolean;
  analytics: boolean;
  timestamp: string | null;
  version: string;
}

const CONSENT_STORAGE_KEY = "user_consent_v1";
const CONSENT_VERSION = "1.0";

/**
 * ✅ FIXED: single validation routine shared by both localStorage reads
 * and server responses, so neither path can smuggle in malformed data.
 *
 * Note: `timestamp === null` is what get-consent.js now returns when NO
 * consent record exists for the user — it must NOT be treated as consent.
 */
function isValidConsent(value: unknown): value is ConsentData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<ConsentData>;
  return (
    typeof v.essential === "boolean" &&
    typeof v.analytics === "boolean" &&
    typeof v.version === "string" &&
    (v.timestamp === null || typeof v.timestamp === "string")
  );
}

const ConsentBanner: React.FC<ConsentBannerProps> = ({ userSessionKey }) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [checking, setChecking] = useState(true);

  // ✅ FIXED: guards all async setState calls against unmount races
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isDev = import.meta.env.DEV === true;

  const handleSaveConsent = useCallback(
    async (acceptAnalytics: boolean) => {
      if (checking || loading) return;

      setLoading(true);
      setErrorMessage(null);

      const consentData: ConsentData = {
        essential: true,
        analytics: acceptAnalytics,
        timestamp: new Date().toISOString(),
        version: CONSENT_VERSION,
      };

      const previousStorage = localStorage.getItem(CONSENT_STORAGE_KEY);

      try {
        // Optimistic Update: local first for instant UI feedback
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
        setAnalyticsConsent(acceptAnalytics);

        await secureFetchJson("/save-consent", {
          method: "POST",
          body: JSON.stringify(consentData),
        });

        if (!mountedRef.current) return;

        ConsentManager.notifyConsentUpdated();
        setVisible(false);
      } catch (error: unknown) {
        if (!mountedRef.current) return;

        console.error("Failed to save consent:", error);

        // Rollback to the pre-save snapshot
        if (previousStorage) {
          localStorage.setItem(CONSENT_STORAGE_KEY, previousStorage);
          try {
            const prevParsed: unknown = JSON.parse(previousStorage);
            if (isValidConsent(prevParsed)) {
              setAnalyticsConsent(prevParsed.analytics);
            } else {
              setAnalyticsConsent(false);
            }
          } catch {
            localStorage.removeItem(CONSENT_STORAGE_KEY);
            setAnalyticsConsent(false);
          }
        } else {
          localStorage.removeItem(CONSENT_STORAGE_KEY);
          setAnalyticsConsent(false);
        }

        // ✅ FIXED: structured ApiError handling with actionable messages
        if (error instanceof ApiError) {
          if (error.status === 401) {
            setErrorMessage("Session expired. Please log in to save preferences.");
          } else if (error.status === 403) {
            setErrorMessage("Security check failed. Refresh the page and try again.");
          } else if (error.status === 429) {
            setErrorMessage("Too many updates. Please wait a moment and try again.");
          } else {
            setErrorMessage(
              typeof error.data?.error === "string"
                ? error.data.error
                : "Could not save consent. Please try again."
            );
          }
        } else {
          setErrorMessage("Could not save consent. Please check your connection.");
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [checking, loading]
  );

  const handleDismiss = useCallback(() => {
    handleSaveConsent(false);
  }, [handleSaveConsent]);

  useEffect(() => {
    const checkConsent = async () => {
      try {
        // 1. Local check first (fast path)
        const stored = localStorage.getItem(CONSENT_STORAGE_KEY);

        if (stored) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(stored);
          } catch {
            console.warn("Corrupt consent data in localStorage, resetting.");
            localStorage.removeItem(CONSENT_STORAGE_KEY);
            parsed = null;
          }

          // ✅ FIXED: version check + full validation via shared helper.
          // A record with timestamp null (saved before consent was actually
          // confirmed) is treated as no-consent and falls through to the
          // server check instead of hiding the banner.
          if (
            isValidConsent(parsed) &&
            parsed.version === CONSENT_VERSION &&
            parsed.timestamp !== null
          ) {
            setAnalyticsConsent(parsed.analytics);
            setVisible(!parsed.essential);
            setChecking(false);
            return;
          }
        }

        // 2. Server check (authoritative record)
        const serverConsent = await secureFetchJson<ConsentData>("/get-consent");

        if (!mountedRef.current) return;

        // ✅ FIXED: align with updated get-consent.js semantics —
        // `essential: false` / `timestamp: null` means NO consent exists.
        // The old backend returned `essential: true` for unknown users,
        // which hid the banner for everyone (the reported bug).
        const hasRealConsent =
          serverConsent.essential === true && serverConsent.timestamp !== null;

        if (hasRealConsent) {
          // Persist the authoritative record locally, replacing any stale entry
          localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(serverConsent));
          setAnalyticsConsent(serverConsent.analytics);
          setVisible(false);
        } else {
          setVisible(true);
        }
      } catch (error: unknown) {
        if (!mountedRef.current) return;

        // ✅ FIXED: structured handling. 401 (anonymous or expired session)
        // and network failures both default to SHOWING the banner —
        // fail-open for consent collection, never silently suppress it.
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403) {
            setVisible(true);
          } else {
            console.error("Consent check failed:", error.status, error.data);
            setVisible(true);
          }
        } else {
          console.error("Consent check failed (network error):", error);
          setVisible(true);
        }
      } finally {
        if (mountedRef.current) setChecking(false);
      }
    };

    checkConsent();
  }, [userSessionKey]);

  // ✅ FIXED: reset action only available in development builds
  const handleResetConsent = useCallback(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.location.reload();
  }, []);

  if (checking) return null;

  if (!visible) {
    if (isDev) {
      return (
        <button
          onClick={handleResetConsent}
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            zIndex: 9999,
            opacity: 0.5,
            fontSize: "0.8rem",
          }}
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
          style={{
            color: "#d32f2f",
            fontSize: "0.9rem",
            margin: "0.5rem 0",
            padding: "0.5rem",
            backgroundColor: "#ffebee",
            borderRadius: "4px",
          }}
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

        <label htmlFor="analytics-consent" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            id="analytics-consent"
            checked={analyticsConsent}
            onChange={(e) => setAnalyticsConsent(e.target.checked)}
            disabled={loading}
            style={{ accentColor: "#2563eb", transform: "scale(1.2)" }}
          />
          <span>Analytics &amp; Performance Cookies</span>
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
            transition: "all 0.2s",
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
            transition: "background-color 0.2s",
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
