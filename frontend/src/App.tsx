// src/App.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useState, useCallback } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
import LoginForm from "./components/LoginForm";

// --- Error Boundary ---
// Sanitized to prevent rendering user-controlled content in error messages
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console (and ideally to an error tracking service like Sentry)
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: "2rem", 
          color: "#d32f2f", 
          backgroundColor: "#fff8f8", 
          border: "1px solid #d32f2f", 
          borderRadius: "8px",
          maxWidth: "600px",
          margin: "2rem auto",
          textAlign: "center"
        }}>
          <h2 style={{ marginTop: 0 }}>Application Error</h2>
          <p>A critical error occurred. The application cannot continue.</p>
          <details style={{ textAlign: "left", marginTop: "1rem", fontSize: "0.85rem", color: "#666" }}>
            <summary>Error Details</summary>
            <pre>{this.state.error?.message}</pre>
          </details>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              marginTop: "1rem", 
              padding: "0.5rem 1rem", 
              cursor: "pointer",
              backgroundColor: "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: "4px"
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [sessionKey, setSessionKey] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize sessionKey from localStorage on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem('auth_token');
      // Validate token format (basic check: non-empty string)
      if (token && typeof token === 'string' && token.trim().length > 0) {
        setSessionKey(token);
      } else {
        setSessionKey(undefined);
      }
    } catch (err) {
      console.error("Error accessing localStorage:", err);
      setSessionKey(undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for storage changes (e.g., login/logout from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        const newToken = e.newValue;
        if (newToken && typeof newToken === 'string' && newToken.trim().length > 0) {
          setSessionKey(newToken);
        } else {
          setSessionKey(undefined);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Callback to update session key after login
  const handleLoginSuccess = useCallback((userId: string, token: string) => {
    // Validate token before setting
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.error("Invalid token received from login");
      return;
    }
    
    try {
      localStorage.setItem('auth_token', token);
      setSessionKey(token);
      console.log("✅ Login successful, session key updated");
    } catch (err) {
      console.error("Failed to save token to localStorage:", err);
      // Optionally show error to user
    }
  }, []);

  // Callback to clear session key after logout
  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem('auth_token');
      setSessionKey(undefined);
      console.log("✅ Logged out, session key cleared");
    } catch (err) {
      console.error("Failed to remove token from localStorage:", err);
    }
  }, []);

  // Show loading state while checking localStorage
  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "sans-serif" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Secure Web Product</h1>
      
      {/* Debug Status Bar */}
      <div style={{ 
        marginBottom: "1.5rem", 
        padding: "0.75rem", 
        backgroundColor: sessionKey ? "#e8f5e9" : "#ffebee", 
        borderRadius: "4px", 
        border: `1px solid ${sessionKey ? "#4caf50" : "#f44336"}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <small>
          <strong>Status:</strong> {sessionKey ? "✅ Logged In" : "❌ Not Logged In"}
        </small>
        {sessionKey && (
          <button 
            onClick={handleLogout}
            style={{ 
              padding: "0.4rem 0.8rem", 
              cursor: "pointer",
              backgroundColor: "#f44336",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.9rem"
            }}
          >
            Logout
          </button>
        )}
      </div>

      <ErrorBoundary>
        {!sessionKey ? (
          <LoginForm 
            onLoginSuccess={handleLoginSuccess} 
            sessionKey={sessionKey} 
          />
        ) : (
          <>
            <ConsentBanner userSessionKey={sessionKey} />
            <hr style={{ margin: "1.5rem 0", borderColor: "#ddd" }} />
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
