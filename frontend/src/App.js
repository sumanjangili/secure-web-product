import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/App.tsx
import { Component } from "react";
import ConsentBanner from "./components/ConsentBanner";
import SecureForm from "./components/SecureForm";
// Simple Error Boundary Component
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(_) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        // You can log this error to an error reporting service here
    }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { style: { padding: "2rem", color: "red" }, children: [_jsx("h2", { children: "Something went wrong." }), _jsx("p", { children: "Please check the console for details." }), _jsx("button", { onClick: () => window.location.reload(), children: "Reload Page" })] }));
        }
        return this.props.children;
    }
}
const App = () => {
    return (_jsxs("div", { style: { padding: "2rem", fontFamily: "sans-serif" }, children: [_jsx("h1", { children: "Secure Web Product Demo" }), _jsxs(ErrorBoundary, { children: [_jsx(ConsentBanner, {}), _jsx("hr", {}), _jsx(SecureForm, {})] })] }));
};
export default App;
