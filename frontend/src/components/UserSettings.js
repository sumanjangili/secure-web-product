import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// frontend/src/components/UserSettings.tsx
import { useState, useEffect } from "react";
import MFASetup from "./MFASetup";
import { secureFetchJson } from "../lib/fetch-helper";
const UserSettings = ({ user, sessionKey }) => {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState(null);
    const [showMFASetup, setShowMFASetup] = useState(!user.mfaEnabled);
    const [generatedCodes, setGeneratedCodes] = useState(null);
    // State for Audit Logs
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    useEffect(() => {
        return () => {
            if (generatedCodes) {
                setGeneratedCodes(null);
            }
        };
    }, [generatedCodes]);
    const handleManageBackupCodes = async () => {
        setGenerating(true);
        setMessage(null);
        try {
            const data = await secureFetchJson("/.netlify/functions/generate-backup-codes", {
                method: "POST",
                body: JSON.stringify({ userId: user.id }),
            });
            setGeneratedCodes(data.codes);
            setMessage({ type: "success", text: "New backup codes generated! Save them now." });
            setTimeout(() => setGeneratedCodes(null), 30000);
        }
        catch (error) {
            setMessage({
                type: "error",
                text: error.data?.error || (error instanceof Error ? error.message : "Failed to generate codes")
            });
        }
        finally {
            setGenerating(false);
        }
    };
    // Handler to fetch audit logs
    const handleFetchLogs = async () => {
        setLoadingLogs(true);
        setMessage(null);
        try {
            const data = await secureFetchJson("/.netlify/functions/audit_log");
            setLogs(data.logs);
            setShowLogs(true);
            setMessage({ type: "success", text: `Loaded ${data.count} recent log entries.` });
        }
        catch (err) {
            setMessage({
                type: "error",
                text: err.data?.error || "Failed to load logs. You may not have permission."
            });
        }
        finally {
            setLoadingLogs(false);
        }
    };
    const handleDeleteRequest = async () => {
        if (!confirming) {
            setConfirming(true);
            return;
        }
        setDeleting(true);
        setMessage(null);
        try {
            await secureFetchJson("/.netlify/functions/delete-user", {
                method: "POST",
                body: JSON.stringify({
                    userId: user.id,
                    reason: "GDPR Right to Erasure",
                    timestamp: new Date().toISOString()
                }),
            });
            setMessage({ type: "success", text: "Your data has been permanently deleted." });
            window.location.href = "/login";
        }
        catch (error) {
            setMessage({
                type: "error",
                text: error.data?.error || (error instanceof Error ? error.message : "An unexpected error occurred.")
            });
        }
        finally {
            setDeleting(false);
            setConfirming(false);
        }
    };
    // Styles
    const primaryButtonStyle = {
        backgroundColor: generating || loadingLogs ? "#93c5fd" : "#2563eb",
        color: "white",
        border: "none",
        padding: "0.75rem 1.5rem",
        borderRadius: "4px",
        cursor: generating || loadingLogs ? "not-allowed" : "pointer",
        fontWeight: "bold",
        fontSize: "1rem",
        opacity: generating || loadingLogs ? 0.7 : 1,
        transition: "background-color 0.2s"
    };
    const dangerButtonStyle = {
        backgroundColor: deleting ? "#999" : "#d32f2f",
        color: "white",
        border: "none",
        padding: "0.75rem 1.5rem",
        borderRadius: "4px",
        cursor: deleting ? "not-allowed" : "pointer",
        fontWeight: "bold",
        fontSize: "1rem"
    };
    return (_jsxs("div", { style: { maxWidth: "600px", margin: "2rem auto", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }, children: [_jsx("h2", { children: "Account Management" }), _jsxs("div", { style: { marginTop: "1rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#fafafa" }, children: [_jsx("h3", { style: { marginTop: 0, marginBottom: "1rem", color: "#333" }, children: "Security Status" }), user.needsNewBackupCodes && (_jsxs("div", { style: {
                            padding: "0.75rem",
                            marginBottom: "1rem",
                            backgroundColor: "#fff3cd",
                            color: "#856404",
                            borderRadius: "4px",
                            border: "1px solid #ffeeba"
                        }, children: [_jsx("strong", { children: "\u26A0\uFE0F Action Required:" }), " You've used all your backup codes. Please generate new ones below."] })), generatedCodes && (_jsxs("div", { style: {
                            padding: "1rem",
                            marginBottom: "1rem",
                            backgroundColor: "#e8f5e9",
                            color: "#2e7d32",
                            borderRadius: "4px",
                            border: "1px solid #a5d6a7"
                        }, children: [_jsx("strong", { children: "\u2705 Your New Backup Codes:" }), _jsx("div", { style: { fontFamily: "monospace", marginTop: "0.5rem", wordBreak: "break-all" }, children: generatedCodes.join(", ") }), _jsx("small", { style: { display: "block", marginTop: "0.5rem" }, children: "These codes will disappear in 30 seconds. Save them now!" })] })), _jsxs("div", { style: { marginBottom: "1.5rem", padding: "1rem", border: "1px solid #e0e0e0", borderRadius: "4px" }, children: [_jsx("h4", { style: { marginTop: 0, marginBottom: "0.5rem" }, children: "Two-Factor Authentication (2FA)" }), showMFASetup ? (_jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }, children: "Protect your account by enabling Two-Factor Authentication." }), _jsx(MFASetup, { onSuccess: () => {
                                            setShowMFASetup(false);
                                            setMessage({ type: "success", text: "MFA Enabled Successfully!" });
                                        } })] })) : (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("span", { style: { color: "green", fontWeight: "bold" }, children: "\u2705 MFA is Enabled" }), _jsx("button", { style: { ...primaryButtonStyle, backgroundColor: "#6c757d", fontSize: "0.8rem", padding: "0.5rem 1rem" }, onClick: () => setShowMFASetup(true), children: "Reconfigure MFA" })] }))] }), _jsx("button", { onClick: handleManageBackupCodes, style: primaryButtonStyle, disabled: generating, children: generating ? (_jsx(_Fragment, { children: _jsx("span", { style: { marginRight: "0.5rem" }, children: "\u23F3 Generating..." }) })) : ("Generate New Backup Codes") })] }), _jsxs("div", { style: { marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#f9f9f9" }, children: [_jsx("h3", { style: { marginTop: 0, marginBottom: "0.5rem", color: "#333" }, children: "System Audit Logs" }), _jsxs("p", { style: { fontSize: "0.9rem", color: "#666", marginBottom: "1rem" }, children: ["View recent security events (Login, Logout, Data Saves).", _jsx("br", {}), _jsx("em", { children: "Note: Admins see all logs; regular users see only their own." })] }), _jsx("button", { onClick: handleFetchLogs, disabled: loadingLogs, style: {
                            ...primaryButtonStyle,
                            backgroundColor: loadingLogs ? "#93c5fd" : "#6c757d",
                            width: "auto",
                            marginRight: "1rem"
                        }, children: loadingLogs ? "Loading..." : "Load Recent Logs" }), showLogs && (_jsx("div", { style: { marginTop: "1rem", maxHeight: "300px", overflowY: "auto", border: "1px solid #eee", padding: "0.5rem", backgroundColor: "#fff" }, children: logs.length === 0 ? (_jsx("p", { style: { textAlign: "center", color: "#888" }, children: "No logs found." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: "2px solid #ddd", textAlign: "left" }, children: [_jsx("th", { style: { padding: "0.5rem" }, children: "Time" }), _jsx("th", { style: { padding: "0.5rem" }, children: "Event" }), _jsx("th", { style: { padding: "0.5rem" }, children: "Details" })] }) }), _jsx("tbody", { children: logs.map((log) => (_jsxs("tr", { style: { borderBottom: "1px solid #eee" }, children: [_jsx("td", { style: { padding: "0.5rem", whiteSpace: "nowrap" }, children: new Date(log.timestamp).toLocaleString() }), _jsx("td", { style: { padding: "0.5rem", fontWeight: "bold", color: "#2563eb" }, children: log.event_type }), _jsx("td", { style: { padding: "0.5rem", color: "#555", wordBreak: "break-word" }, children: typeof log.details === 'string' ? log.details : JSON.stringify(log.details) })] }, log.id))) })] })) }))] }), _jsxs("div", { style: { marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }, children: [_jsx("h3", { style: { color: "#d32f2f", marginTop: 0 }, children: "Danger Zone" }), _jsx("p", { children: "Once you delete your account, there is no going back. Please be certain." }), message && (_jsx("div", { style: {
                            padding: "0.75rem",
                            marginBottom: "1rem",
                            borderRadius: "4px",
                            backgroundColor: message.type === "error" ? "#ffebee" : "#e8f5e9",
                            color: message.type === "error" ? "#c62828" : "#2e7d32"
                        }, children: message.text })), !confirming ? (_jsx("button", { onClick: () => setConfirming(true), style: dangerButtonStyle, children: "Delete My Data" })) : (_jsxs("div", { style: { display: "flex", gap: "1rem", alignItems: "center" }, children: [_jsx("span", { children: "Are you sure?" }), _jsx("button", { onClick: handleDeleteRequest, disabled: deleting, style: {
                                    backgroundColor: deleting ? "#999" : "#d32f2f",
                                    color: "white",
                                    border: "none",
                                    padding: "0.75rem 1.5rem",
                                    borderRadius: "4px",
                                    cursor: deleting ? "not-allowed" : "pointer",
                                    fontWeight: "bold",
                                    opacity: deleting ? 0.7 : 1
                                }, children: deleting ? "Processing..." : "Yes, Delete Everything" }), _jsx("button", { onClick: () => setConfirming(false), disabled: deleting, style: {
                                    backgroundColor: deleting ? "#e0e0e0" : "transparent",
                                    color: deleting ? "#999" : "#666",
                                    border: "1px solid #ccc",
                                    padding: "0.75rem 1.5rem",
                                    borderRadius: "4px",
                                    cursor: deleting ? "not-allowed" : "pointer"
                                }, children: "Cancel" })] }))] })] }));
};
export default UserSettings;
