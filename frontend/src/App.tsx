// src/App.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useState, useCallback } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
import LoginForm from "./components/LoginForm";

// Simple Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", color: "red" }}>
          <h2>Something went wrong.</h2>
          <p>Please check the console for details.</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [sessionKey, setSessionKey] = useState<string | undefined>(undefined);

  // Initialize sessionKey from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    setSessionKey(token || undefined);
  }, []);

  // Listen for storage changes (e.g., login from another tab, or manual updates)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        setSessionKey(e.newValue || undefined);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Callback to update session key after login
  const handleLoginSuccess = useCallback((userId: string, token: string) => {
    localStorage.setItem('auth_token', token);
    setSessionKey(token);
    console.log("✅ Login successful, session key updated");
  }, []);

  // Callback to clear session key after logout
  const handleLogout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setSessionKey(undefined);
    console.log("✅ Logged out, session key cleared");
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Secure Web Product</h1>
      
      {/* Display current auth status for debugging */}
      <div style={{ marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#f0f0f0", borderRadius: "4px" }}>
        <small>
          Auth Status: {sessionKey ? "✅ Logged In" : "❌ Not Logged In"}
          {sessionKey && (
            <button 
              onClick={handleLogout}
              style={{ marginLeft: "1rem", padding: "0.25rem 0.5rem", cursor: "pointer" }}
            >
              Logout
            </button>
          )}
        </small>
      </div>

      <ErrorBoundary>
        {/* 
          Conditional Rendering:
          - If sessionKey exists, show the SecureForm (and hide login).
          - If no sessionKey, show the LoginForm.
        */}
        {!sessionKey ? (
          <LoginForm 
            onLoginSuccess={handleLoginSuccess} 
            sessionKey={sessionKey} 
          />
        ) : (
          <>
            {/* Pass the JWT token as userSessionKey */}
            <ConsentBanner userSessionKey={sessionKey} />
            <hr />
            <SecureForm
              sessionKey={sessionKey} 
              onLogout={handleLogout} 
            />
          </>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default App;
