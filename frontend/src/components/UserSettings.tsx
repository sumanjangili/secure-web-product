// frontend/src/components/UserSettings.tsx
import React, { useState, useEffect } from "react";
import MFASetup from "./MFASetup";
import { secureFetchJson } from "../lib/fetch-helper"; 

interface UserSettingsProps {
  user: {
    needsNewBackupCodes: boolean;
    mfaEnabled?: boolean;
    id: string;
  };
  sessionKey?: string;
}

const UserSettings: React.FC<UserSettingsProps> = ({ user, sessionKey }) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showMFASetup, setShowMFASetup] = useState(!user.mfaEnabled);
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  
  // State for Audit Logs
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    return () => {
      if (generatedCodes) {
        setGeneratedCodes(null);
      }
    };
  }, [generatedCodes]);

  const handleManageBackupCodes = async () => {
    setGenerating(true);
    setMessage(null);

    try {
      const data = await secureFetchJson<{ codes: string[] }>("/.netlify/functions/generate-backup-codes", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });

      setGeneratedCodes(data.codes);
      setMessage({ type: "success", text: "New backup codes generated! Save them now." });
      setTimeout(() => setGeneratedCodes(null), 30000);

    } catch (error: any) {
      setMessage({ 
        type: "error", 
        text: error.data?.error || (error instanceof Error ? error.message : "Failed to generate codes") 
      });
    } finally {
      setGenerating(false);
    }
  };

  // Handler to fetch audit logs
  const handleFetchLogs = async () => {
    setLoadingLogs(true);
    setMessage(null);
    try {
      const data = await secureFetchJson<{ logs: any[]; count: number }>("/.netlify/functions/audit_log");
      setLogs(data.logs);
      setShowLogs(true);
      setMessage({ type: "success", text: `Loaded ${data.count} recent log entries.` });
    } catch (err: any) {
      setMessage({ 
        type: "error", 
        text: err.data?.error || "Failed to load logs. You may not have permission." 
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      await secureFetchJson("/.netlify/functions/delete-user", {
        method: "POST",
        body: JSON.stringify({ 
          userId: user.id,
          reason: "GDPR Right to Erasure",
          timestamp: new Date().toISOString()
        }),
      });

      setMessage({ type: "success", text: "Your data has been permanently deleted." });
      window.location.href = "/login";

    } catch (error: any) {
      setMessage({ 
        type: "error", 
        text: error.data?.error || (error instanceof Error ? error.message : "An unexpected error occurred.") 
      });
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  // Styles
  const primaryButtonStyle: React.CSSProperties = {
    backgroundColor: generating || loadingLogs ? "#93c5fd" : "#2563eb",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "4px",
    cursor: generating || loadingLogs ? "not-allowed" : "pointer",
    fontWeight: "bold",
    fontSize: "1rem",
    opacity: generating || loadingLogs ? 0.7 : 1,
    transition: "background-color 0.2s"
  };

  const dangerButtonStyle: React.CSSProperties = {
    backgroundColor: deleting ? "#999" : "#d32f2f",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "4px",
    cursor: deleting ? "not-allowed" : "pointer",
    fontWeight: "bold",
    fontSize: "1rem"
  };

  return (
    <div style={{ maxWidth: "600px", margin: "2rem auto", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
      <h2>Account Management</h2>
      
      {/* SECTION 1: Security Status & MFA Setup */}
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#fafafa" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#333" }}>Security Status</h3>
        
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
          disabled={generating}
        >
          {generating ? (
            <>
              <span style={{ marginRight: "0.5rem" }}>⏳ Generating...</span>
            </>
          ) : (
            "Generate New Backup Codes"
          )}
        </button>
      </div>

      {/* SECTION 2: System Audit Logs (NEW) */}
      <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#f9f9f9" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", color: "#333" }}>System Audit Logs</h3>
        <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "1rem" }}>
          View recent security events (Login, Logout, Data Saves). 
          <br/><em>Note: Admins see all logs; regular users see only their own.</em>
        </p>
        
        <button 
          onClick={handleFetchLogs}
          disabled={loadingLogs}
          style={{ 
            ...primaryButtonStyle, 
            backgroundColor: loadingLogs ? "#93c5fd" : "#6c757d",
            width: "auto",
            marginRight: "1rem"
          }}
        >
          {loadingLogs ? "Loading..." : "Load Recent Logs"}
        </button>

        {showLogs && (
          <div style={{ marginTop: "1rem", maxHeight: "300px", overflowY: "auto", border: "1px solid #eee", padding: "0.5rem", backgroundColor: "#fff" }}>
            {logs.length === 0 ? (
              <p style={{ textAlign: "center", color: "#888" }}>No logs found.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem" }}>Time</th>
                    <th style={{ padding: "0.5rem" }}>Event</th>
                    <th style={{ padding: "0.5rem" }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.5rem", fontWeight: "bold", color: "#2563eb" }}>
                        {log.event_type}
                      </td>
                      <td style={{ padding: "0.5rem", color: "#555", wordBreak: "break-word" }}>
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* SECTION 3: Danger Zone (Delete Account) */}
      <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
        <h3 style={{ color: "#d32f2f", marginTop: 0 }}>Danger Zone</h3>
        <p>Once you delete your account, there is no going back. Please be certain.</p>

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
                fontWeight: "bold",
                opacity: deleting ? 0.7 : 1
              }}
            >
              {deleting ? "Processing..." : "Yes, Delete Everything"}
            </button>
            <button 
              onClick={() => setConfirming(false)}
              disabled={deleting}
              style={{
                backgroundColor: deleting ? "#e0e0e0" : "transparent",
                color: deleting ? "#999" : "#666",
                border: "1px solid #ccc",
                padding: "0.75rem 1.5rem",
                borderRadius: "4px",
                cursor: deleting ? "not-allowed" : "pointer"
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
