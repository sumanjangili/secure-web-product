// frontend/src/App.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useState, useCallback, useRef } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
import LoginForm from "./components/LoginForm";
import UserSettings from "./components/UserSettings";
import { secureFetchJson, ApiError } from "./lib/fetch-helper";

interface UserProfile {
  id: string;
  email: string;
  mfaEnabled: boolean;
  needsNewBackupCodes: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("Uncaught error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", color: "#d32f2f", textAlign: "center" }}>
          <h2>Application Error</h2>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Simple flag to prevent double execution
  const authChecked = useRef(false);

  useEffect(() => {
    if (authChecked.current) return;
    authChecked.current = true;

    const checkAuth = async () => {
      try {
        const data = await secureFetchJson<UserProfile>("/get-user-profile");
        setCurrentUser(data);
        setIsLoggedIn(true);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            // No session / expired — normal unauthenticated state
            setIsLoggedIn(false);
            setCurrentUser(null);
          } else if (err.status === 403) {
            // CSRF/cookie-attribute mismatch — force a clean login
            window.location.replace('/login?force_reset=true');
            return;
          } else {
            setIsLoggedIn(false);
            setCurrentUser(null);
          }
        } else {
          // Network failure etc. — treat as unauthenticated
          setIsLoggedIn(false);
          setCurrentUser(null);
        }
      } finally {
        // Directly set loading to false. No setTimeout.
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await secureFetchJson("/logout", { method: 'POST' });
    } catch {
      // Best-effort: network failure on logout must not block clearing local
      // state — the backend session dies via cookie expiry regardless.
    } finally {
      setCurrentUser(null);
      setIsLoggedIn(false);
      window.location.href = '/login';
    }
  }, []);

  const handleLoginSuccess = useCallback(async () => {
    try {
      const data = await secureFetchJson<UserProfile>("/get-user-profile");
      setCurrentUser(data);
      setIsLoggedIn(true);
    } catch {
      // Profile fetch failed post-login — fall back to logout so the user
      // sees a clean unauthenticated state rather than a broken dashboard.
      handleLogout();
    }
  }, [handleLogout]);

  if (isLoading) {
    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Loading...</div>;
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Secure Web Product</h1>
      <div style={{ marginBottom: "1.5rem", padding: "0.75rem", backgroundColor: isLoggedIn ? "#e8f5e9" : "#ffebee", borderRadius: "4px" }}>
        <strong>Status:</strong> {isLoggedIn ? "✅ Logged In" : "❌ Not Logged In"}
        {currentUser && <span> ({currentUser.email})</span>}
        {isLoggedIn && <button onClick={handleLogout} disabled={isLoggingOut}>{isLoggingOut ? "Logging out…" : "Logout"}</button>}
      </div>

      <ErrorBoundary>
        {!isLoggedIn ? (
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
            <ConsentBanner userSessionKey={currentUser?.id} />
            <hr />
            {currentUser && <UserSettings user={currentUser} />}
            <hr />
            <SecureForm sessionKey={currentUser?.id} onLogout={handleLogout} />
          </>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default App;
