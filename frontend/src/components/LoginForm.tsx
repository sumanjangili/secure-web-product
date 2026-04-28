// frontend/src/components/LoginForm.tsx
import React, { useState, useEffect } from "react";

type LoginStep = "credentials" | "mfa" | "backup-code" | "success";

interface LoginFormProps {
  onLoginSuccess: (userId: string, token: string) => void;
  sessionKey?: string; // Optional: to detect if already logged in
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, sessionKey }) => {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // ✅ NEW: Check if user is already logged in via sessionKey prop
  useEffect(() => {
    if (sessionKey) {
      console.log("✅ User already authenticated. Redirecting or showing dashboard...");
      // Optional: Uncomment the line below if you have a specific dashboard route
      // window.location.href = "/dashboard"; 
      
      // If you want to clear the form and show a "Logged In" state instead of hiding the form:
      // You might want to conditionally render this component in App.tsx based on sessionKey
    }
  }, [sessionKey]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/.netlify/functions/login", {
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
        throw new Error(data.error || "Invalid credentials");
      }

      if (data.mfaEnabled) {
        setStep("mfa");
      } else {
        if (data.sessionToken) {
          // ✅ Update localStorage FIRST to ensure storage event listeners fire
          localStorage.setItem("auth_token", data.sessionToken);
          
          // ✅ Notify parent App component immediately
          onLoginSuccess(data.userId, data.sessionToken);
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
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/.netlify/functions/verify-mfa", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // ✅ Use sessionKey if available, fallback to localStorage for robustness
          "Authorization": `Bearer ${sessionKey || localStorage.getItem("auth_token")}` 
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
          setError("Invalid TOTP code. Would you like to use a backup code?");
        } else {
          throw new Error(data.error || "MFA verification failed");
        }
      } else {
        if (data.sessionToken) {
          localStorage.setItem("auth_token", data.sessionToken);
          onLoginSuccess(data.userId, data.sessionToken);
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
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/.netlify/functions/verify-mfa", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionKey || localStorage.getItem("auth_token")}`
        },
        body: JSON.stringify({ 
          email, 
          backupCode,
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
        throw new Error(data.error || "Backup code invalid or already used");
      }

      if (data.sessionToken) {
        localStorage.setItem("auth_token", data.sessionToken);
        onLoginSuccess(data.userId, data.sessionToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup code verification failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleBackupCodeMode = () => {
    setUseBackupCode(!useBackupCode);
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
    fontSize: "1rem"
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
    opacity: loading ? 0.7 : 1
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Sign In</h2>
      {error && (
        <div style={{ padding: "0.75rem", marginBottom: "1rem", backgroundColor: "#ffebee", color: "#c62828", borderRadius: "4px", fontSize: "0.9rem" }}>
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
          />
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={inputStyle} 
            required 
            autoComplete="current-password" 
          />
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      )}

      {step === "mfa" && (
        <form onSubmit={handleMfaSubmit}>
          <p style={{ marginBottom: "1rem", textAlign: "center" }}>Enter the 6-digit code from your authenticator app</p>
          <input 
            type="text" 
            maxLength={6} 
            value={mfaCode} 
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} 
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.5rem", fontSize: "1.25rem" }} 
            placeholder="123456" 
            autoFocus 
          />
          <button type="submit" style={buttonStyle} disabled={loading || mfaCode.length !== 6}>
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
            >
              Can't access your authenticator? Use a backup code
            </button>
          </div>
        </form>
      )}

      {step === "backup-code" && (
        <form onSubmit={handleBackupCodeSubmit}>
          <p style={{ marginBottom: "1rem", textAlign: "center" }}>Enter one of your 12-character backup codes</p>
          <input 
            type="text" 
            maxLength={12} 
            value={backupCode} 
            onChange={(e) => setBackupCode(e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase())} 
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.25rem", fontSize: "1.1rem" }} 
            placeholder="A1B2C3D4E5F6" 
            autoFocus 
          />
          <button type="submit" style={buttonStyle} disabled={loading || backupCode.length !== 12}>
            {loading ? "Verifying..." : "Use Backup Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button 
              type="button" 
              onClick={toggleBackupCodeMode} 
              style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "0.9rem" }}
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
