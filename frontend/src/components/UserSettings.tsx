// frontend/src/components/UserSettings.tsx
import React, { useState } from "react";
import MFASetup from "./MFASetup"; 

interface UserSettingsProps {
  user: {
    needsNewBackupCodes: boolean;
    mfaEnabled?: boolean;
    id: string;
  };
}

const UserSettings: React.FC<UserSettingsProps> = ({ user }) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showMFASetup, setShowMFASetup] = useState(!user.mfaEnabled);
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);

  // --- Handle Backup Code Management ---
  const handleManageBackupCodes = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setMessage({ type: "error", text: "Authentication required." });
        return;
      }

      const response = await fetch("/.netlify/functions/generate-backup-codes", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // ✅ JWT Only
        },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate codes");
      }

      // Show codes to user
      setGeneratedCodes(data.codes);
      setMessage({ type: "success", text: "New backup codes generated! Save them now." });
      
      // Auto-hide codes after 30 seconds for security
      setTimeout(() => setGeneratedCodes(null), 30000);

    } catch (err) {
      setMessage({ 
        type: "error", 
        text: err instanceof Error ? err.message : "Failed to generate codes" 
      });
    }
  };

  // --- Handle Account Deletion ---
  const handleDeleteRequest = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Authentication required.");
      }

      const response = await fetch("/.netlify/functions/delete-user", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // ✅ JWT Only
        },
        body: JSON.stringify({ 
          userId: user.id,
          reason: "GDPR Right to Erasure",
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Deletion failed");
      }

      setMessage({ type: "success", text: "Your data has been permanently deleted." });
      localStorage.removeItem("auth_token");
      window.location.href = "/login";

    } catch (err) {
      setMessage({ 
        type: "error", 
        text: err instanceof Error ? err.message : "An unexpected error occurred." 
      });
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  // Styles
  const primaryButtonStyle: React.CSSProperties = {
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "1rem"
  };

  const dangerButtonStyle: React.CSSProperties = {
    backgroundColor: "#d32f2f",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "1rem"
  };

  return (
    <div style={{ maxWidth: "600px", margin: "2rem auto", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
      <h2>Account Management</h2>
      
      {/* SECTION 1: Security Status & MFA Setup */}
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#fafafa" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#333" }}>Security Status</h3>
        
        {/* Backup Code Alert */}
        {user.needsNewBackupCodes && (
          <div style={{ 
            padding: "0.75rem", 
            marginBottom: "1rem", 
            backgroundColor: "#fff3cd", 
            color: "#856404",
            borderRadius: "4px",
            border: "1px solid #ffeeba"
          }}>
            <strong>⚠️ Action Required:</strong> You've used all your backup codes. 
            Please generate new ones below.
          </div>
        )}

        {/* Generated Codes Display */}
        {generatedCodes && (
          <div style={{ 
            padding: "1rem", 
            marginBottom: "1rem", 
            backgroundColor: "#e8f5e9", 
            color: "#2e7d32",
            borderRadius: "4px",
            border: "1px solid #a5d6a7"
          }}>
            <strong>✅ Your New Backup Codes:</strong>
            <div style={{ fontFamily: "monospace", marginTop: "0.5rem", wordBreak: "break-all" }}>
              {generatedCodes.join(", ")}
            </div>
            <small style={{ display: "block", marginTop: "0.5rem" }}>These codes will disappear in 30 seconds. Save them now!</small>
          </div>
        )}

        {/* MFA Setup Section */}
        <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid #e0e0e0", borderRadius: "4px" }}>
          <h4 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Two-Factor Authentication (2FA)</h4>
          
          {showMFASetup ? (
            <>
              <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }}>
                Protect your account by enabling Two-Factor Authentication.
              </p>
              <MFASetup 
                onSuccess={() => {
                  setShowMFASetup(false);
                  setMessage({ type: "success", text: "MFA Enabled Successfully!" });
                }} 
              />
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "green", fontWeight: "bold" }}>✅ MFA is Enabled</span>
              <button 
                style={{ ...primaryButtonStyle, backgroundColor: "#6c757d", fontSize: "0.8rem", padding: "0.5rem 1rem" }}
                onClick={() => setShowMFASetup(true)}
              >
                Reconfigure MFA
              </button>
            </div>
          )}
        </div>

        <button 
          onClick={handleManageBackupCodes}
          style={primaryButtonStyle}
        >
          Generate New Backup Codes
        </button>
      </div>

      {/* SECTION 2: Danger Zone (Delete Account) */}
      <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
        <h3 style={{ color: "#d32f2f", marginTop: 0 }}>Danger Zone</h3>
        <p>
          Once you delete your account, there is no going back. Please be certain.
        </p>

        {message && (
          <div style={{ 
            padding: "0.75rem", 
            marginBottom: "1rem", 
            borderRadius: "4px",
            backgroundColor: message.type === "error" ? "#ffebee" : "#e8f5e9",
            color: message.type === "error" ? "#c62828" : "#2e7d32"
          }}>
            {message.text}
          </div>
        )}

        {!confirming ? (
          <button 
            onClick={() => setConfirming(true)}
            style={dangerButtonStyle}
          >
            Delete My Data
          </button>
        ) : (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <span>Are you sure?</span>
            <button 
              onClick={handleDeleteRequest}
              disabled={deleting}
              style={{
                backgroundColor: deleting ? "#999" : "#d32f2f",
                color: "white",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "4px",
                cursor: deleting ? "not-allowed" : "pointer",
                fontWeight: "bold"
              }}
            >
              {deleting ? "Processing..." : "Yes, Delete Everything"}
            </button>
            <button 
              onClick={() => setConfirming(false)}
              style={{
                backgroundColor: "transparent",
                color: "#666",
                border: "1px solid #ccc",
                padding: "0.75rem 1.5rem",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSettings;
