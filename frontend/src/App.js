import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// frontend/src/App.tsx
import { Component, useEffect, useState, useCallback, useRef } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
import LoginForm from "./components/LoginForm";
import UserSettings from "./components/UserSettings";
import { secureFetchJson } from "./lib/fetch-helper";
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("Uncaught error:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { style: { padding: "2rem", color: "#d32f2f", textAlign: "center" }, children: [_jsx("h2", { children: "Application Error" }), _jsx("button", { onClick: () => window.location.reload(), children: "Reload" })] }));
        }
        return this.props.children;
    }
}
const App = () => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    // Simple flag to prevent double execution
    const authChecked = useRef(false);
    useEffect(() => {
        if (authChecked.current)
            return;
        authChecked.current = true;
        const checkAuth = async () => {
            try {
                const data = await secureFetchJson("/.netlify/functions/get-user-profile");
                setCurrentUser(data);
                setIsLoggedIn(true);
            }
            catch (err) {
                if (err?.status === 401) {
                    setIsLoggedIn(false);
                    setCurrentUser(null);
                }
                else if (err?.status === 403) {
                    window.location.replace('/login?force_reset=true');
                    return;
                }
                else {
                    setIsLoggedIn(false);
                    setCurrentUser(null);
                }
            }
            finally {
                // Directly set loading to false. No setTimeout.
                setIsLoading(false);
            }
        };
        checkAuth();
    }, []);
    const handleLogout = useCallback(async () => {
        setIsLoggingOut(true);
        try {
            await secureFetchJson("/.netlify/functions/logout", { method: 'POST' });
        }
        catch (e) { }
        finally {
            setCurrentUser(null);
            setIsLoggedIn(false);
            window.location.href = '/login';
        }
    }, []);
    const handleLoginSuccess = useCallback(async () => {
        try {
            const data = await secureFetchJson("/.netlify/functions/get-user-profile");
            setCurrentUser(data);
            setIsLoggedIn(true);
        }
        catch (e) {
            handleLogout();
        }
    }, [handleLogout]);
    if (isLoading) {
        return _jsx("div", { style: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }, children: "Loading..." });
    }
    return (_jsxs("div", { style: { padding: "2rem", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }, children: [_jsx("h1", { children: "Secure Web Product" }), _jsxs("div", { style: { marginBottom: "1.5rem", padding: "0.75rem", backgroundColor: isLoggedIn ? "#e8f5e9" : "#ffebee", borderRadius: "4px" }, children: [_jsx("strong", { children: "Status:" }), " ", isLoggedIn ? "✅ Logged In" : "❌ Not Logged In", currentUser && _jsxs("span", { children: [" (", currentUser.email, ")"] }), isLoggedIn && _jsx("button", { onClick: handleLogout, style: { marginLeft: "1rem" }, children: "Logout" })] }), _jsx(ErrorBoundary, { children: !isLoggedIn ? (_jsx(LoginForm, { onLoginSuccess: handleLoginSuccess })) : (_jsxs(_Fragment, { children: [_jsx(ConsentBanner, { userSessionKey: currentUser?.id }), _jsx("hr", {}), currentUser && _jsx(UserSettings, { user: currentUser }), _jsx("hr", {}), _jsx(SecureForm, { sessionKey: currentUser?.id, onLogout: handleLogout })] })) })] }));
};
export default App;
