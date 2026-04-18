// src/components/ConsentBanner.tsx

import React, { useState, useEffect } from "react";
import { encrypt, decrypt } from "../lib/crypto";

/**
 * Simple cookie‑style consent banner.
 * Stores the decision in localStorage (encrypted via lib/crypto.ts).
 */
const ConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if consent already stored
    const stored = localStorage.getItem("consent");
    if (!stored) setVisible(true);
  }, []);

  const handleAccept = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // SECURITY NOTE: 
      // In production, derive this key from a user session or a secure password.
      const DEMO_PASSWORD = "demo-consent-key-change-me"; 
      
      // FIX: encrypt returns an object, serialize to JSON for localStorage
      const encrypted = await encrypt("accepted", DEMO_PASSWORD);
      localStorage.setItem("consent", JSON.stringify(encrypted));
      setVisible(false);
    } catch (error) {
      setErrorMessage("Could not save consent. Please try again.");
      console.error("Failed to save consent:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section
      style={{
        background: "#f0f4ff",
        padding: "1rem",
        borderRadius: "4px",
        position: "fixed",
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        maxWidth: "600px",
        margin: "auto",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        zIndex: 9999,
      }}
    >
      <p>
        We use cookies to improve your experience. By continuing you accept our
        privacy policy.
      </p>
      
      {errorMessage && (
        <p style={{ color: "#d32f2f", fontSize: "0.9rem", margin: "0.5rem 0" }}>
          {errorMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button 
          onClick={handleAccept} 
          disabled={loading}
          style={{ 
            marginRight: "0.5rem", 
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Saving..." : "Accept"}
        </button>
        <button 
          onClick={handleDismiss}
          style={{ cursor: "pointer" }}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
};

export default ConsentBanner;
