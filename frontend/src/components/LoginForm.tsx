// frontend/src/components/LoginForm.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { secureFetchJson, checkAuthStatus, ApiError } from "../lib/fetch-helper";

type LoginStep = "credentials" | "mfa" | "backup-code";

interface LoginFormProps {
  onLoginSuccess: (userId: string) => void;
  /**
   * Where to redirect users who arrive already authenticated.
   * Leave undefined to disable the check (e.g., if this form is also
   * used in a flow where an active session is expected).
   */
  redirectIfAuthenticated?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess, redirectIfAuthenticated }) => {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number>(0);

  // Guards against setState on an unmounted component (stale async responses)
  const mountedRef = useRef(true);

  // ✅ FIXED: boolean dependency prevents timer churn
  const isLockedOut = retryAfter > 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ FIXED: Detect stale sessions on mount.
  // If cookies survived a logout (e.g., Domain-attribute mismatch in a prior
  // logout deployment), the user appeared "auto-logged-in". Surface that here.
  useEffect(() => {
    if (!redirectIfAuthenticated) return;

    const auth = checkAuthStatus();
    if (auth.isAuthenticated) {
      window.location.href = redirectIfAuthenticated;
    }
  }, [redirectIfAuthenticated]);

  useEffect(() => {
    if (!isLockedOut) return;
    const timer = setInterval(() => {
      setRetryAfter((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLockedOut]);

  // Clear error whenever the step changes
  useEffect(() => {
    setError("");
  }, [step]);

  // ✅ FIXED: clear sensitive state if the component unmounts mid-flow
  useEffect(() => {
    return () => {
      setPassword("");
      setMfaCode("");
      setBackupCode("");
    };
  }, []);

  /**
   * ✅ FIXED: centralised, resilient error handling.
   * - Reads err.data.retryAfter first, then falls back to the Retry-After
   *   HEADER (which save-consent/login now send and fetch-helper parses).
   * - Guards against non-ApiError throwables.
   */
  const handleApiError = useCallback((err: unknown, fallbackMessage: string) => {
    if (!mountedRef.current) return;

    if (err instanceof ApiError) {
      if (err.status === 429) {
        const bodyValue = Number(err.data?.retryAfter);
        const waitTime =
          Number.isFinite(bodyValue) && bodyValue > 0
            ? bodyValue
            : (err.retryAfter ?? 900); // 15 min default matches backend lockout

        setRetryAfter(waitTime);
        setError(`Too many attempts. Please wait ${Math.ceil(waitTime / 60)} minute(s).`);
        return;
      }

      if (err.status === 403) {
        setError("Security check failed. Please refresh the page and try again.");
        return;
      }

      if (err.status === 401) {
        const msg = err.data?.error;
        setError(typeof msg === 'string' && msg ? msg : "Invalid credentials");
        return;
      }

            const msg = err.data?.error;
      setError(
        (typeof msg === 'string' && msg ? msg : '') ||
          err.message ||
          fallbackMessage
      );
      return;
    }

    // Non-ApiError throw (network failure, TypeError, etc.)
    if (err instanceof Error) {
      setError(err.message || fallbackMessage);
      return;
    }

    setError(fallbackMessage);
  }, []);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const data = await secureFetchJson<{
        success: boolean;
        userId: string;
        mfaEnabled: boolean;
        message: string;
      }>("/login", {
        method: "POST",
        // ✅ Trimmed + lowercased client-side; backend also normalises, but this
        // prevents a wasted round-trip on whitespace and keeps UX consistent
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        skipCsrf: true, // Login has no session/CSRF token yet
      });

      if (!mountedRef.current) return;

      if (data.mfaEnabled) {
        // ✅ FIXED: clear the password before moving to the MFA step —
        // it is no longer needed once the backend has verified it
        setPassword("");
        setStep("mfa");
      } else {
        setPassword("");
        onLoginSuccess(data.userId);
      }
    } catch (err: unknown) {
      handleApiError(err, "Login failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const data = await secureFetchJson<{
        success: boolean;
        userId: string;
        message: string;
        requiresBackupCode?: boolean;
      }>("/verify-mfa", {
        method: "POST",
        body: JSON.stringify({ mfaCode, method: "totp" }),
      });

      if (!mountedRef.current) return;

      // ✅ FIXED: clear ALL sensitive inputs on success
      setPassword("");
      setMfaCode("");
      setBackupCode("");
      onLoginSuccess(data.userId);
    } catch (err: unknown) {
      handleApiError(err, "MFA verification failed");

      // Backend signals "use a backup code" via requiresBackupCode flag
      if (err instanceof ApiError && err.data?.requiresBackupCode) {
        if (mountedRef.current) {
          setStep("backup-code");
        }
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || isLockedOut) return;

    setLoading(true);
    setError("");

    try {
      const data = await secureFetchJson<{
        success: boolean;
        userId: string;
        message: string;
      }>("/verify-mfa", {
        method: "POST",
        body: JSON.stringify({ backupCode: backupCode.toUpperCase(), method: "backup" }),
      });

      if (!mountedRef.current) return;

      // ✅ FIXED: clear ALL sensitive inputs on success
      setPassword("");
      setMfaCode("");
      setBackupCode("");
      onLoginSuccess(data.userId);
    } catch (err: unknown) {
      handleApiError(err, "Backup code invalid or already used");
    } finally {
      if (mountedRef.current) setLoading(false);
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
  const linkButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "#2563eb",
    cursor: "pointer",
    textDecoration: "underline",
    fontSize: "0.9rem",
    padding: 0
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ textAlign: "center", marginBottom: "1.5rem", marginTop: 0 }}>Sign In</h2>

      {error && (
        <div
          role="alert"
          style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            backgroundColor: "#ffebee",
            color: "#c62828",
            borderRadius: "4px",
            fontSize: "0.9rem",
            borderLeft: "4px solid #c62828"
          }}
        >
          {error}
        </div>
      )}

      {step === "credentials" && (
        <form onSubmit={handleCredentialsSubmit} noValidate>
          <label htmlFor="login-email" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
            autoComplete="email"
            autoFocus
            disabled={loading || isLockedOut}
          />
          <label htmlFor="login-password" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
            autoComplete="current-password"
            disabled={loading || isLockedOut}
          />
          <button
            type="submit"
            style={buttonStyle}
            disabled={loading || isLockedOut}
          >
            {loading
              ? "Signing in..."
              : isLockedOut
                ? `Wait ${Math.ceil(retryAfter / 60)}m`
                : "Sign In"}
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
            inputMode="numeric"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.5rem", fontSize: "1.25rem", fontWeight: "bold" }}
            placeholder="123456"
            autoComplete="one-time-code"
            autoFocus
            disabled={loading || isLockedOut}
            aria-label="6-digit authenticator code"
          />
          <button
            type="submit"
            style={buttonStyle}
            disabled={loading || mfaCode.length !== 6 || isLockedOut}
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button
              type="button"
              onClick={toggleBackupCodeMode}
              style={linkButtonStyle}
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
            aria-label="12-character backup code"
          />
          <button
            type="submit"
            style={buttonStyle}
            disabled={loading || backupCode.length !== 12 || isLockedOut}
          >
            {loading ? "Verifying..." : "Use Backup Code"}
          </button>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button
              type="button"
              onClick={toggleBackupCodeMode}
              style={linkButtonStyle}
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
