// src/App.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useState, useCallback, useRef } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
import LoginForm from "./components/LoginForm";
import UserSettings from "./components/UserSettings";
import { secureFetchJson } from "./lib/fetch-helper"; // ✅ Import secure fetch helper

// --- Types ---
interface UserProfile {
  id: string;
  email: string;
  mfaEnabled: boolean;
  needsNewBackupCodes: boolean;
}

// --- Error Boundary ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false); // ✅ Prevent race condition on logout
  
  // Ref to track component mount status for async cleanup
  const isMountedRef = useRef(true);

  // Initialize: Check if user is logged in by fetching profile
  useEffect(() => {
    isMountedRef.current = true;

    const checkAuth = async () => {
      try {
        // ✅ UPDATED: Use secureFetchJson for automatic CSRF token and credentials
        const data = await secureFetchJson<UserProfile>("/.netlify/functions/get-user-profile");
        
        if (isMountedRef.current) {
          setCurrentUser({
            id: data.id,
            email: data.email,
            mfaEnabled: data.mfaEnabled,
            needsNewBackupCodes: data.needsNewBackupCodes
          });
          setIsLoggedIn(true);
        }
      } catch (err: any) {
        // Handle 401 (Not logged in) gracefully
        if (isMountedRef.current) {
          if (err.status === 401) {
            setIsLoggedIn(false);
            setCurrentUser(null);
          } else {
            console.error("Auth check failed:", err);
            // On network error, assume not logged in to be safe
            setIsLoggedIn(false);
            setCurrentUser(null);
          }
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();

    // Cleanup: Prevent state updates if component unmounts
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ UPDATED: Logout with race condition protection and secure fetch
  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return; // Prevent duplicate clicks
    setIsLoggingOut(true);

    try {
      // ✅ UPDATED: Use secureFetchJson for CSRF protection
      await secureFetchJson("/.netlify/functions/logout", { 
        method: 'POST' 
      });
      
      // Clear local state
      setCurrentUser(null);
      setIsLoggedIn(false);
      
      // Redirect to login
      window.location.href = '/login';
    } catch (err) {
      console.error("Logout failed:", err);
      // Even if network fails, force redirect to be safe
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut]);

  // ✅ UPDATED: Login callback with secure fetch
  const handleLoginSuccess = useCallback(async () => {
    try {
      // ✅ UPDATED: Use secureFetchJson for CSRF protection
      const data = await secureFetchJson<UserProfile>("/.netlify/functions/get-user-profile");
      
      setCurrentUser({
        id: data.id,
        email: data.email,
        mfaEnabled: data.mfaEnabled,
        needsNewBackupCodes: data.needsNewBackupCodes
      });
      setIsLoggedIn(true);
    } catch (err: any) {
      console.error("Failed to fetch user profile after login:", err);
      // If profile fetch fails after login, something is wrong. Force logout.
      handleLogout();
    }
  }, [handleLogout]);

  // Show loading state
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
        backgroundColor: isLoggedIn ? "#e8f5e9" : "#ffebee", 
        borderRadius: "4px", 
        border: `1px solid ${isLoggedIn ? "#4caf50" : "#f44336"}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <small>
          <strong>Status:</strong> {isLoggedIn ? "✅ Logged In" : "❌ Not Logged In"}
          {/* ✅ XSS SAFE: React automatically escapes text content in curly braces */}
          {currentUser && <span style={{ marginLeft: "1rem", color: "#666" }}>({currentUser.email})</span>}
        </small>
        {isLoggedIn && (
          <button 
            onClick={handleLogout}
            disabled={isLoggingOut} // ✅ Prevent race condition
            style={{ 
              padding: "0.4rem 0.8rem", 
              cursor: isLoggingOut ? "not-allowed" : "pointer",
              backgroundColor: isLoggingOut ? "#999" : "#f44336",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.9rem",
              opacity: isLoggingOut ? 0.7 : 1
            }}
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        )}
      </div>

      <ErrorBoundary>
        {!isLoggedIn ? (
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
            <ConsentBanner />
            <hr style={{ margin: "1.5rem 0", borderColor: "#ddd" }} />
            
            {currentUser && (
              <UserSettings 
                user={currentUser} 
              />
            )}
            
            <hr style={{ margin: "1.5rem 0", borderColor: "#ddd" }} />
            
            <SecureForm onLogout={handleLogout} />
          </>
        )}
      </ErrorBoundary>
    </div>
  );
};

export default App;
