// frontend/src/components/LoginForm.tsx
import React, { useState, useEffect, useCallback } from "react";
import { secureFetchJson } from "../lib/fetch-helper"; 

type LoginStep = "credentials" | "mfa" | "backup-code";

interface LoginFormProps {
  onLoginSuccess: (userId: string) => void; 
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // ✅ FIXED: Use boolean dependency to prevent timer churn
  const isLockedOut = retryAfter > 0;

  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockedOut]);

  useEffect(() => {
    setError("");
  }, [step]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const endpoint = "/login";

      // ✅ FIXED: skipCsrf=true for login (no CSRF validation on backend anyway)
      const data = await secureFetchJson<{ 
        success: boolean; 
        userId: string; 
        mfaEnabled: boolean; 
        message: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipCsrf: true, // ✅ Login doesn't require CSRF
      });

      if (data.mfaEnabled) {
        setStep("mfa");
      } else {
        // ✅ FIXED: Clear password on success
        setPassword("");
        onLoginSuccess(data.userId); 
      }
    } catch (err: any) {
      if (err.status === 429) {
        const waitTime = err.data?.retryAfter || 900;
        setRetryAfter(waitTime);
        setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
      } else {
        setError(err.data?.error || (err instanceof Error ? err.message : "Login failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const endpoint = "/verify-mfa";
      
      const data = await secureFetchJson<{ 
        success: boolean; 
        userId: string; 
        message: string;
        requiresBackupCode?: boolean;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ 
          mfaCode,
          method: "totp"
        }),
      });

      // ✅ FIXED: Clear password on MFA success too
      setPassword("");
      onLoginSuccess(data.userId);
      
    } catch (err: any) {
      if (err.status === 429) {
        const waitTime = err.data?.retryAfter || 900;
        setRetryAfter(waitTime);
        setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
      } else if (err.status === 403) {
        setError("CSRF validation failed. Please refresh the page and try again.");
      } else if (err.data?.requiresBackupCode) {
        setStep("backup-code");
        setError("Invalid TOTP code. Please use a backup code.");
      } else {
        setError(err.data?.error || (err instanceof Error ? err.message : "MFA verification failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const endpoint = "/verify-mfa";
      
      const data = await secureFetchJson<{ 
        success: boolean; 
        userId: string; 
        message: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ 
          backupCode: backupCode.toUpperCase(),
          method: "backup"
        }),
      });

      // ✅ FIXED: Clear password on success
      setPassword("");
      onLoginSuccess(data.userId);
      
    } catch (err: any) {
      if (err.status === 429) {
        const waitTime = err.data?.retryAfter || 900;
        setRetryAfter(waitTime);
        setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
      } else {
        setError(err.data?.error || (err instanceof Error ? err.message : "Backup code invalid or already used"));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleBackupCodeMode = () => {
    if (loading || isLockedOut) return;
    
    setStep(step === "mfa" ? "backup-code" : "mfa");
    setMfaCode("");
    setBackupCode("");
    setError("");
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    maxWidth: "400px",
    margin: "2rem auto",
    padding: "2rem",
    border: "1px solid #ddd",
    borderRadius: "8px",
    backgroundColor: "#fff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    marginBottom: "1rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontSize: "1rem",
    boxSizing: "border-box"
  };
  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    backgroundColor: loading ? "#93c5fd" : "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: loading || isLockedOut ? "not-allowed" : "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    opacity: loading || isLockedOut ? 0.7 : 1,
    transition: "background-color 0.2s"
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ textAlign: "center", marginBottom: "1.5rem", marginTop: 0 }}>Sign In</h2>
      
      {error && (
        <div role="alert" style={{ 
          padding: "0.75rem", 
          marginBottom: "1rem", 
          backgroundColor: "#ffebee", 
          color: "#c62828", 
          borderRadius: "4px", 
          fontSize: "0.9rem",
          borderLeft: "4px solid #c62828"
        }}>
          {error}
        </div>
      )}

      {step === "credentials" && (
        <form onSubmit={handleCredentialsSubmit}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Email</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            style={inputStyle} 
            required 
            autoComplete="email" 
            disabled={loading || isLockedOut}
          />
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={inputStyle} 
            required 
            autoComplete="current-password" 
            disabled={loading || isLockedOut}
          />
          <button type="submit" style={buttonStyle} disabled={loading || isLockedOut}>
            {loading ? "Signing in..." : isLockedOut ? `Wait ${Math.ceil(retryAfter/60)}m` : "Sign In"}
          </button>
        </form>
      )}

      {step === "mfa" && (
        <form onSubmit={handleMfaSubmit}>
          <p style={{ marginBottom: "1rem", textAlign: "center", color: "#555" }}>
            Enter the 6-digit code from your authenticator app
          </p>
          <input 
            type="text" 
            maxLength={6} 
            value={mfaCode} 
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} 
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.5rem", fontSize: "1.25rem", fontWeight: "bold" }} 
            placeholder="123456" 
            autoFocus 
            disabled={loading || isLockedOut}
          />
          <button type="submit" style={buttonStyle} disabled={loading || mfaCode.length !== 6 || isLockedOut}>
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
              disabled={loading || isLockedOut}
            >
              Can't access your authenticator? Use a backup code
            </button>
          </div>
        </form>
      )}

      {step === "backup-code" && (
        <form onSubmit={handleBackupCodeSubmit}>
          <p style={{ marginBottom: "1rem", textAlign: "center", color: "#555" }}>
            Enter one of your 12-character backup codes
          </p>
          <input 
            type="text" 
            maxLength={12} 
            value={backupCode} 
            onChange={(e) => setBackupCode(e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase())} 
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.25rem", fontSize: "1.1rem", fontWeight: "bold" }} 
            placeholder="A1B2C3D4E5F6" 
            autoFocus 
            disabled={loading || isLockedOut}
          />
          <button type="submit" style={buttonStyle} disabled={loading || backupCode.length !== 12 || isLockedOut}>
            {loading ? "Verifying..." : "Use Backup Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
              disabled={loading || isLockedOut}
            >
              Back to authenticator app
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default LoginForm;
