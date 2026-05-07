// frontend/src/components/MFASetup.tsx
import React, { useState } from "react";
import { secureFetchJson } from "../lib/fetch-helper"; // ✅ Import the secure helper

type Step = "enable" | "scan" | "verify" | "backup" | "complete";

interface MFASetupProps {
  onSuccess?: () => void;
}

const MFASetup: React.FC<MFASetupProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<Step>("enable");
  const [qrUrl, setQrUrl] = useState<string>("");
  const [otpAuthUrl, setOtpAuthUrl] = useState<string>(""); // ✅ For optional manual entry
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [inputCode, setInputCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleEnableMFA = async () => {
    setLoading(true);
    setError("");
    
    try {
      // ✅ Using secureFetchJson: Automatically handles CSRF token and credentials
      const data = await secureFetchJson<{ 
        success: boolean; 
        qrUrl: string;
        otpAuthUrl: string;
        message: string;
      }>("/.netlify/functions/mfa-setup-init", {
        method: "POST",
        body: JSON.stringify({}),
      });
      
      // Store only the QR URL and otpAuthUrl (NOT the raw secret)
      setQrUrl(data.qrUrl);
      setOtpAuthUrl(data.otpAuthUrl);
      setStep("scan");
    } catch (error: any) {
      setError(error.data?.error || (error instanceof Error ? error.message : "Failed to initialize MFA"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!inputCode || inputCode.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ Using secureFetchJson: Automatically handles CSRF token and credentials
      const data = await secureFetchJson<{ 
        success: boolean; 
        backupCodes: string[];
        message: string;
      }>("/.netlify/functions/mfa-setup-verify", {
        method: "POST",
        body: JSON.stringify({ code: inputCode }),
      });

      setBackupCodes(data.backupCodes);
      setStep("backup");
    } catch (error: any) {
      setError(error.data?.error || (error instanceof Error ? error.message : "Verification failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    setStep("complete");
    if (onSuccess) onSuccess();
  };

  // Styles
  const containerStyle: React.CSSProperties = { 
    maxWidth: "500px", 
    margin: "2rem auto", 
    padding: "2rem", 
    border: "1px solid #ddd", 
    borderRadius: "8px", 
    backgroundColor: "#fff", 
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)" 
  };
  const buttonStyle: React.CSSProperties = { 
    padding: "0.5rem 1rem", 
    backgroundColor: loading ? "#93c5fd" : "#007bff", 
    color: "white", 
    border: "none", 
    borderRadius: "4px", 
    cursor: loading ? "not-allowed" : "pointer", 
    fontSize: "1rem", 
    fontWeight: 600, 
    opacity: loading ? 0.7 : 1 
  };
  const inputStyle: React.CSSProperties = { 
    width: "100%", 
    padding: "0.5rem", 
    marginBottom: "1rem", 
    border: "1px solid #ccc", 
    borderRadius: "4px", 
    fontSize: "1rem" 
  };

  return (
    <div style={containerStyle}>
      <h2>Set Up Multi-Factor Authentication</h2>
      {error && <div style={{ color: "red", marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#ffe6e6", borderRadius: "4px" }}>{error}</div>}

      {step === "enable" && (
        <div>
          <p>To enable MFA, you will need an authenticator app (like Google Authenticator, Authy, or Microsoft Authenticator).</p>
          <button style={{ ...buttonStyle, width: "100%" }} onClick={handleEnableMFA} disabled={loading}>
            {loading ? "Generating..." : "Enable MFA"}
          </button>
        </div>
      )}

      {step === "scan" && (
        <div>
          <p>Scan this QR code with your authenticator app:</p>
          <div style={{ textAlign: "center", margin: "1rem 0" }}>
            <img src={qrUrl} alt="MFA QR Code" style={{ maxWidth: "100%", height: "auto" }} />
          </div>
                    {/* ✅ Optional: Manual Entry Link (shows otpAuthUrl, NOT raw secret) */}
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <details>
              <summary style={{ color: "#2563eb", cursor: "pointer", fontSize: "0.9rem" }}>
                Can't scan the QR code? Use manual entry
              </summary> {/* ✅ FIXED: Closed summary tag correctly */}
              <div style={{ marginTop: "0.5rem", padding: "0.75rem", backgroundColor: "#f8f9fa", borderRadius: "4px", wordBreak: "break-all" }}>
                <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
                  Open your authenticator app and select "Enter Setup Key" or "Manual Entry". Then paste this URL:
                </p>
                <code style={{ display: "block", padding: "0.5rem", backgroundColor: "#e9ecef", borderRadius: "4px", fontSize: "0.8rem" }}>
                  {otpAuthUrl}
                </code>
                <small style={{ display: "block", marginTop: "0.5rem", color: "#dc3545" }}>
                  ⚠️ Do not share this URL. It contains your secret key.
                </small>
              </div>
            </details>
          </div>
          <label style={{ display: "block", marginTop: "1.5rem", marginBottom: "0.5rem", fontWeight: 500 }}>
            Enter the 6-digit code from your app:
          </label>
          <input 
            type="text" 
            maxLength={6} 
            value={inputCode} 
            onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))} 
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.5rem", fontSize: "1.25rem", fontWeight: "bold" }} 
            placeholder="123456" 
            autoFocus 
          />
          <button 
            style={{ ...buttonStyle, width: "100%" }} 
            onClick={handleVerifyCode} 
            disabled={loading || inputCode.length !== 6}
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
        </div>
      )}

      {step === "backup" && (
        <div>
          <h3 style={{ color: "#d32f2f" }}>⚠️ Save Your Backup Codes!</h3>
          <p>If you lose your device, these codes are the only way to regain access. Store them securely.</p>
          <div style={{ backgroundColor: "#f8f9fa", padding: "1rem", borderRadius: "4px", fontFamily: "monospace", marginBottom: "1rem", wordBreak: "break-all" }}>
            {backupCodes.map((code, idx) => <div key={idx}>{code}</div>)}
          </div>
          <button 
            style={{ ...buttonStyle, width: "100%", backgroundColor: "#28a745" }} 
            onClick={handleComplete}
          >
            I've Saved My Codes - Finish Setup
          </button>
        </div>
      )}

      {step === "complete" && (
        <div style={{ textAlign: "center" }}>
          <h3 style={{ color: "green" }}>✅ MFA Enabled Successfully!</h3>
          <p>Your account is now protected with two-factor authentication.</p>
          <button 
            style={{ ...buttonStyle, marginTop: "1rem", backgroundColor: "#007bff" }} 
            onClick={() => window.location.reload()}
          >
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  );
};

export default MFASetup;
