// frontend/src/components/LoginForm.tsx
import React, { useState, useEffect, useCallback } from "react";

type LoginStep = "credentials" | "mfa" | "backup-code";

interface LoginFormProps {
  onLoginSuccess: (userId: string, token: string) => void;
  sessionKey?: string;
}

// Helper to sanitize error messages (remove potential HTML tags)
const sanitizeError = (msg: string): string => {
  return msg.replace(/<[^>]*>/g, '');
};

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, sessionKey }) => {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // Cleanup retry timer
  useEffect(() => {
    if (retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [retryAfter]);

  // Reset error when step changes
  useEffect(() => {
    setError("");
  }, [step]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retryAfter > 0) return;

    setLoading(true);
    setError("");

    try {
      // ✅ CORRECT: Use relative path. 
      // Netlify Dev proxies this to localhost:9999
      // Production serves this from the same domain (securewebproducts.netlify.app)
      const endpoint = "/.netlify/functions/login";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = data.retryAfter || 900;
          setRetryAfter(waitTime);
          setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
          return;
        }
        throw new Error(sanitizeError(data.error || "Invalid credentials"));
      }

      if (data.mfaEnabled) {
        setStep("mfa");
      } else {
        if (data.sessionToken) {
          // Notify parent to handle storage and state
          onLoginSuccess(data.userId, data.sessionToken);
        } else {
          throw new Error("Login successful but no token received");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retryAfter > 0) return;

    setLoading(true);
    setError("");

    try {
      // ✅ CORRECT: Use relative path
      const endpoint = "/.netlify/functions/verify-mfa";
      
      // Use sessionKey if available (from App.tsx), otherwise fallback to localStorage
      // This handles the case where the user might have refreshed the page
      const token = sessionKey || localStorage.getItem("auth_token");
      
      if (!token) {
        throw new Error("Authentication session expired. Please log in again.");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          email, 
          mfaCode,
          method: "totp"
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = data.retryAfter || 900;
          setRetryAfter(waitTime);
          setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
          return;
        }
        if (data.requiresBackupCode) {
          setStep("backup-code");
          setError("Invalid TOTP code. Please use a backup code.");
        } else {
          throw new Error(sanitizeError(data.error || "MFA verification failed"));
        }
      } else {
        if (data.sessionToken) {
          onLoginSuccess(data.userId, data.sessionToken);
        } else {
          throw new Error("MFA successful but no token received");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "MFA verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retryAfter > 0) return;

    setLoading(true);
    setError("");

    try {
      // ✅ CORRECT: Use relative path
      const endpoint = "/.netlify/functions/verify-mfa";
      
      const token = sessionKey || localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Authentication session expired. Please log in again.");
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          email, 
          backupCode: backupCode.toUpperCase(),
          method: "backup"
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = data.retryAfter || 900;
          setRetryAfter(waitTime);
          setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minutes.`);
          return;
        }
        throw new Error(sanitizeError(data.error || "Backup code invalid or already used"));
      }

      if (data.sessionToken) {
        onLoginSuccess(data.userId, data.sessionToken);
      } else {
        throw new Error("Backup code successful but no token received");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup code verification failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleBackupCodeMode = () => {
    setStep(step === "mfa" ? "backup-code" : "mfa");
    setMfaCode("");
    setBackupCode("");
    setError("");
  };

  // Styles (Sanitized: no dynamic user input in styles)
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
    cursor: loading ? "not-allowed" : "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    opacity: loading ? 0.7 : 1,
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
            disabled={loading || retryAfter > 0}
          />
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={inputStyle} 
            required 
            autoComplete="current-password" 
            disabled={loading || retryAfter > 0}
          />
          <button type="submit" style={buttonStyle} disabled={loading || retryAfter > 0}>
            {loading ? "Signing in..." : retryAfter > 0 ? `Wait ${Math.ceil(retryAfter/60)}m` : "Sign In"}
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
            disabled={loading || retryAfter > 0}
          />
          <button type="submit" style={buttonStyle} disabled={loading || mfaCode.length !== 6 || retryAfter > 0}>
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
              disabled={retryAfter > 0}
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
            disabled={loading || retryAfter > 0}
          />
          <button type="submit" style={buttonStyle} disabled={loading || backupCode.length !== 12 || retryAfter > 0}>
            {loading ? "Verifying..." : "Use Backup Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
              disabled={retryAfter > 0}
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
