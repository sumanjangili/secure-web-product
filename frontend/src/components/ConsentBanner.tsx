import React, { useState, useEffect } from "react";

/**
 * Simple cookie‑style consent banner.
 * Stores the decision in localStorage (encrypted via lib/crypto.ts).
 */
const ConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if consent already stored
    const stored = localStorage.getItem("consent");
    if (!stored) setVisible(true);
  }, []);

  const handleAccept = async () => {
    // Example: encrypt a tiny flag before persisting
    const { encrypt } = await import("../lib/crypto");
    const encrypted = await encrypt("accepted");
    localStorage.setItem("consent", encrypted);
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
      }}
    >
      <p>
        We use cookies to improve your experience. By continuing you accept our
        privacy policy.
      </p>
      <button onClick={handleAccept} style={{ marginRight: "0.5rem" }}>
        Accept
      </button>
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </section>
  );
};

export default ConsentBanner;
