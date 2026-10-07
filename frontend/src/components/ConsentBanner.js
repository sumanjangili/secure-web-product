import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/ConsentBanner.tsx
import { useState, useEffect, useCallback } from "react";
import { ConsentManager } from "../lib/consent-manager";
import { secureFetchJson } from "../lib/fetch-helper";
const CONSENT_STORAGE_KEY = "user_consent_v1";
const ConsentBanner = ({ userSessionKey }) => {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [analyticsConsent, setAnalyticsConsent] = useState(false);
    const [checking, setChecking] = useState(true);
    // Memoize handlers to prevent unnecessary re-renders
    const handleSaveConsent = useCallback(async (acceptAnalytics) => {
        if (checking || loading)
            return; // Prevent double-clicks and race conditions
        setLoading(true);
        setErrorMessage(null);
        const consentData = {
            essential: true,
            analytics: acceptAnalytics,
            timestamp: new Date().toISOString(),
            version: "1.0",
        };
        const previousStorage = localStorage.getItem(CONSENT_STORAGE_KEY);
        try {
            // Optimistic Update: Save to local storage immediately for UX
            localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
            setAnalyticsConsent(acceptAnalytics);
            // Sync to Server
            await secureFetchJson("/.netlify/functions/save-consent", {
                method: "POST",
                body: JSON.stringify(consentData),
            });
            // Notify global manager
            ConsentManager.notifyConsentUpdated();
            setVisible(false);
        }
        catch (error) {
            console.error("Failed to save consent:", error);
            // Rollback: Revert local storage and cache to previous state
            if (previousStorage) {
                localStorage.setItem(CONSENT_STORAGE_KEY, previousStorage);
                try {
                    const prevParsed = JSON.parse(previousStorage);
                    setAnalyticsConsent(prevParsed.analytics);
                }
                catch (e) {
                    setAnalyticsConsent(false);
                }
            }
            else {
                localStorage.removeItem(CONSENT_STORAGE_KEY);
                setAnalyticsConsent(false);
            }
            // Set user-friendly error message
            if (error.status === 401) {
                setErrorMessage("Session expired. Please log in to save preferences.");
            }
            else {
                setErrorMessage("Could not save consent. Please try again.");
            }
        }
        finally {
            setLoading(false);
        }
    }, [checking, loading]);
    const handleDismiss = useCallback(() => {
        handleSaveConsent(false);
    }, [handleSaveConsent]);
    useEffect(() => {
        const checkConsent = async () => {
            // 1. Check local storage first
            const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    // Validate version and structure
                    if (parsed.version === "1.0" &&
                        typeof parsed.essential === 'boolean' &&
                        typeof parsed.analytics === 'boolean') {
                        setAnalyticsConsent(parsed.analytics);
                        // If essential is true, we assume consent is valid and hide banner
                        // If essential is false, we show the banner (though this is rare in local storage)
                        if (parsed.essential) {
                            setVisible(false);
                        }
                        else {
                            setVisible(true);
                        }
                        setChecking(false);
                        return;
                    }
                }
                catch (e) {
                    console.warn("Corrupt consent data in localStorage, resetting.");
                    localStorage.removeItem(CONSENT_STORAGE_KEY);
                }
            }
            // 2. If no local consent, check server
            try {
                const serverConsent = await secureFetchJson("/.netlify/functions/get-consent");
                // Check if consent is actually given
                if (serverConsent.essential) {
                    // Server says "Consent recorded"
                    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(serverConsent));
                    setAnalyticsConsent(serverConsent.analytics);
                    setVisible(false);
                }
                else {
                    // Server says "No consent recorded"
                    setVisible(true);
                }
            }
            catch (error) {
                // If 401 (not logged in) or network error, SHOW the banner
                if (error?.status === 401 || !error?.status) {
                    console.log("Not authenticated or error, showing consent banner.");
                    setVisible(true);
                }
                else {
                    // Other errors -> Show banner to be safe
                    console.error("Consent check failed:", error);
                    setVisible(true);
                }
            }
            finally {
                setChecking(false);
            }
        };
        checkConsent();
    }, [userSessionKey]);
    // DEV TOOL: Add a button to reset consent for testing
    const handleResetConsent = () => {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
        window.location.reload();
    };
    if (checking)
        return null;
    if (!visible)
        return (
        // Optional: Show a small "Reset" button in dev mode to test the banner
        _jsx("button", { onClick: handleResetConsent, style: { position: 'fixed', top: 10, right: 10, zIndex: 9999, opacity: 0.5, fontSize: '0.8rem' }, title: "Reset Consent (Dev Mode)", children: "Reset Consent (Dev)" }));
    return (_jsxs("section", { style: {
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
        }, role: "dialog", "aria-labelledby": "consent-title", "aria-describedby": "consent-description", "data-testid": "consent-banner", children: [_jsx("h3", { id: "consent-title", style: { margin: "0 0 0.5rem 0", fontSize: "1.1rem", fontWeight: 600 }, children: "Cookie Preferences" }), _jsxs("p", { id: "consent-description", style: { margin: "0 0 1rem 0", fontSize: "0.95rem", lineHeight: "1.4", color: "#334155" }, children: ["We use cookies to enhance your experience.", _jsx("strong", { children: " Essential cookies" }), " are required for the site to function.", _jsx("strong", { children: " Analytics cookies" }), " help us improve our services."] }), errorMessage && (_jsx("div", { role: "alert", "aria-live": "assertive", style: { color: "#d32f2f", fontSize: "0.9rem", margin: "0.5rem 0", padding: "0.5rem", backgroundColor: "#ffebee", borderRadius: "4px" }, children: errorMessage })), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "default" }, children: [_jsx("input", { type: "checkbox", checked: true, disabled: true, style: { accentColor: "#2563eb", transform: "scale(1.2)" }, "aria-label": "Essential Cookies (Required)" }), _jsx("span", { style: { fontWeight: 500 }, children: "Essential Cookies (Required)" })] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }, children: [_jsx("input", { type: "checkbox", id: "analytics-consent", checked: analyticsConsent, onChange: (e) => setAnalyticsConsent(e.target.checked), disabled: loading, style: { accentColor: "#2563eb", transform: "scale(1.2)" }, "aria-label": "Analytics & Performance Cookies" }), _jsx("span", { children: "Analytics & Performance Cookies" })] })] }), _jsxs("div", { style: { display: "flex", gap: "0.75rem", justifyContent: "flex-end" }, children: [_jsx("button", { onClick: handleDismiss, disabled: loading, "aria-busy": loading, style: {
                            padding: "0.5rem 1rem",
                            backgroundColor: "transparent",
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            cursor: loading ? "not-allowed" : "pointer",
                            color: loading ? "#94a3b8" : "#475569",
                            fontWeight: 500,
                            transition: "all 0.2s"
                        }, "data-testid": "reject-button", children: loading ? "Saving..." : "Reject Non-Essential" }), _jsx("button", { onClick: () => handleSaveConsent(true), disabled: loading, "aria-busy": loading, style: {
                            padding: "0.5rem 1rem",
                            backgroundColor: loading ? "#93c5fd" : "#2563eb",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: loading ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            opacity: loading ? 0.7 : 1,
                            transition: "background-color 0.2s"
                        }, "data-testid": "accept-button", children: loading ? "Saving..." : "Accept All" })] })] }));
};
export default ConsentBanner;
