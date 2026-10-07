import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/MFASetup.tsx
import { useState } from "react";
import { secureFetchJson } from "../lib/fetch-helper"; // ✅ Import the secure helper
const MFASetup = ({ onSuccess }) => {
    const [step, setStep] = useState("enable");
    const [qrUrl, setQrUrl] = useState("");
    const [otpAuthUrl, setOtpAuthUrl] = useState(""); // ✅ For optional manual entry
    const [backupCodes, setBackupCodes] = useState([]);
    const [inputCode, setInputCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const handleEnableMFA = async () => {
        setLoading(true);
        setError("");
        try {
            // ✅ Using secureFetchJson: Automatically handles CSRF token and credentials
            const data = await secureFetchJson("/.netlify/functions/mfa-setup-init", {
                method: "POST",
                body: JSON.stringify({}),
            });
            // Store only the QR URL and otpAuthUrl (NOT the raw secret)
            setQrUrl(data.qrUrl);
            setOtpAuthUrl(data.otpAuthUrl);
            setStep("scan");
        }
        catch (error) {
            setError(error.data?.error || (error instanceof Error ? error.message : "Failed to initialize MFA"));
        }
        finally {
            setLoading(false);
        }
    };
    const handleVerifyCode = async () => {
        if (!inputCode || inputCode.length !== 6) {
            setError("Please enter a valid 6-digit code.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            // ✅ Using secureFetchJson: Automatically handles CSRF token and credentials
            const data = await secureFetchJson("/.netlify/functions/mfa-setup-verify", {
                method: "POST",
                body: JSON.stringify({ code: inputCode }),
            });
            setBackupCodes(data.backupCodes);
            setStep("backup");
        }
        catch (error) {
            setError(error.data?.error || (error instanceof Error ? error.message : "Verification failed"));
        }
        finally {
            setLoading(false);
        }
    };
    const handleComplete = () => {
        setStep("complete");
        if (onSuccess)
            onSuccess();
    };
    // Styles
    const containerStyle = {
        maxWidth: "500px",
        margin: "2rem auto",
        padding: "2rem",
        border: "1px solid #ddd",
        borderRadius: "8px",
        backgroundColor: "#fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    };
    const buttonStyle = {
        padding: "0.5rem 1rem",
        backgroundColor: loading ? "#93c5fd" : "#007bff",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: loading ? "not-allowed" : "pointer",
        fontSize: "1rem",
        fontWeight: 600,
        opacity: loading ? 0.7 : 1
    };
    const inputStyle = {
        width: "100%",
        padding: "0.5rem",
        marginBottom: "1rem",
        border: "1px solid #ccc",
        borderRadius: "4px",
        fontSize: "1rem"
    };
    return (_jsxs("div", { style: containerStyle, children: [_jsx("h2", { children: "Set Up Multi-Factor Authentication" }), error && _jsx("div", { style: { color: "red", marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#ffe6e6", borderRadius: "4px" }, children: error }), step === "enable" && (_jsxs("div", { children: [_jsx("p", { children: "To enable MFA, you will need an authenticator app (like Google Authenticator, Authy, or Microsoft Authenticator)." }), _jsx("button", { style: { ...buttonStyle, width: "100%" }, onClick: handleEnableMFA, disabled: loading, children: loading ? "Generating..." : "Enable MFA" })] })), step === "scan" && (_jsxs("div", { children: [_jsx("p", { children: "Scan this QR code with your authenticator app:" }), _jsx("div", { style: { textAlign: "center", margin: "1rem 0" }, children: _jsx("img", { src: qrUrl, alt: "MFA QR Code", style: { maxWidth: "100%", height: "auto" } }) }), _jsx("div", { style: { marginTop: "1rem", textAlign: "center" }, children: _jsxs("details", { children: [_jsx("summary", { style: { color: "#2563eb", cursor: "pointer", fontSize: "0.9rem" }, children: "Can't scan the QR code? Use manual entry" }), " ", _jsxs("div", { style: { marginTop: "0.5rem", padding: "0.75rem", backgroundColor: "#f8f9fa", borderRadius: "4px", wordBreak: "break-all" }, children: [_jsx("p", { style: { fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }, children: "Open your authenticator app and select \"Enter Setup Key\" or \"Manual Entry\". Then paste this URL:" }), _jsx("code", { style: { display: "block", padding: "0.5rem", backgroundColor: "#e9ecef", borderRadius: "4px", fontSize: "0.8rem" }, children: otpAuthUrl }), _jsx("small", { style: { display: "block", marginTop: "0.5rem", color: "#dc3545" }, children: "\u26A0\uFE0F Do not share this URL. It contains your secret key." })] })] }) }), _jsx("label", { style: { display: "block", marginTop: "1.5rem", marginBottom: "0.5rem", fontWeight: 500 }, children: "Enter the 6-digit code from your app:" }), _jsx("input", { type: "text", maxLength: 6, value: inputCode, onChange: (e) => setInputCode(e.target.value.replace(/\D/g, '')), style: { ...inputStyle, textAlign: "center", letterSpacing: "0.5rem", fontSize: "1.25rem", fontWeight: "bold" }, placeholder: "123456", autoFocus: true }), _jsx("button", { style: { ...buttonStyle, width: "100%" }, onClick: handleVerifyCode, disabled: loading || inputCode.length !== 6, children: loading ? "Verifying..." : "Verify Code" })] })), step === "backup" && (_jsxs("div", { children: [_jsx("h3", { style: { color: "#d32f2f" }, children: "\u26A0\uFE0F Save Your Backup Codes!" }), _jsx("p", { children: "If you lose your device, these codes are the only way to regain access. Store them securely." }), _jsx("div", { style: { backgroundColor: "#f8f9fa", padding: "1rem", borderRadius: "4px", fontFamily: "monospace", marginBottom: "1rem", wordBreak: "break-all" }, children: backupCodes.map((code, idx) => _jsx("div", { children: code }, idx)) }), _jsx("button", { style: { ...buttonStyle, width: "100%", backgroundColor: "#28a745" }, onClick: handleComplete, children: "I've Saved My Codes - Finish Setup" })] })), step === "complete" && (_jsxs("div", { style: { textAlign: "center" }, children: [_jsx("h3", { style: { color: "green" }, children: "\u2705 MFA Enabled Successfully!" }), _jsx("p", { children: "Your account is now protected with two-factor authentication." }), _jsx("button", { style: { ...buttonStyle, marginTop: "1rem", backgroundColor: "#007bff" }, onClick: () => window.location.reload(), children: "Return to Dashboard" })] }))] }));
};
export default MFASetup;
