import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// frontend/src/components/SecureForm.tsx
import { useState, useEffect, useCallback } from "react";
import { encrypt, decrypt } from "../lib/crypto";
import { secureFetchJson } from "../lib/fetch-helper";
const sanitizeInput = (str) => {
    return str.replace(/[<>]/g, (char) => {
        const map = { '<': '&lt;', '>': '&gt;' };
        return map[char] || char;
    });
};
const SecureForm = ({ sessionKey, onLogout }) => {
    const [form, setForm] = useState({
        name: "",
        email: "",
        title: "",
        description: ""
    });
    const [status, setStatus] = useState("");
    const [password, setPassword] = useState("");
    const [uploading, setUploading] = useState(false);
    // ✅ CRITICAL FIX: Check if sessionKey exists
    const isAuthenticated = !!sessionKey;
    const clearSensitiveData = useCallback(() => {
        setPassword("");
        setForm({ name: "", email: "", title: "", description: "" });
        setStatus("");
    }, []);
    const handleChange = (e) => {
        const value = sanitizeInput(e.target.value);
        setForm({ ...form, [e.target.name]: value });
    };
    const handlePasswordChange = (e) => {
        setPassword(e.target.value);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (uploading)
            return;
        // Double check auth (UI + Backend)
        if (!isAuthenticated) {
            setStatus("❌ You must be logged in to submit.");
            return;
        }
        // Validation
        if (!form.title.trim()) {
            setStatus("❌ Title is required.");
            return;
        }
        if (!form.description.trim()) {
            setStatus("❌ Description is required.");
            return;
        }
        if (!password || password.length < 8) {
            setStatus("❌ Encryption password required (min 8 chars).");
            return;
        }
        setStatus("Encrypting data locally...");
        setUploading(true);
        try {
            const payload = JSON.stringify(form);
            const { ciphertext, salt, iv } = await encrypt(payload, password);
            // Verify round-trip
            const recovered = await decrypt(ciphertext, password, salt, iv);
            if (recovered !== payload) {
                throw new Error("Encryption integrity check failed. Please try again.");
            }
            // Send to Backend
            await secureFetchJson("/.netlify/functions/save-secure-data", {
                method: "POST",
                body: JSON.stringify({ ciphertext, salt, iv }),
            });
            clearSensitiveData();
            setStatus("✅ Data securely encrypted and transmitted!");
        }
        catch (error) {
            if (error.status === 401) {
                setStatus("❌ Session expired. Redirecting to login...");
                clearSensitiveData();
                if (onLogout)
                    onLogout();
                setTimeout(() => window.location.reload(), 2000);
                return;
            }
            const errorMessage = error.data?.error || (error instanceof Error ? error.message : "An unexpected error occurred.");
            setStatus(`❌ Error: ${errorMessage}`);
            setPassword("");
        }
        finally {
            setUploading(false);
        }
    };
    useEffect(() => {
        return () => {
            setPassword("");
        };
    }, []);
    useEffect(() => {
        if (!sessionKey) {
            clearSensitiveData();
        }
    }, [sessionKey, clearSensitiveData]);
    return (_jsxs("form", { onSubmit: handleSubmit, style: { maxWidth: "500px", margin: "2rem auto", fontFamily: "sans-serif" }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }, children: [_jsx("h2", { style: { margin: 0, fontSize: "1.5rem" }, children: "Secure Contact Form" }), _jsx("span", { style: {
                            fontSize: '0.85rem',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '4px',
                            backgroundColor: isAuthenticated ? '#e8f5e9' : '#ffebee',
                            color: isAuthenticated ? '#2e7d32' : '#c62828',
                            fontWeight: 'bold',
                            border: `1px solid ${isAuthenticated ? '#4caf50' : '#f44336'}`
                        }, children: isAuthenticated ? "✅ Authenticated" : "❌ Login Required" })] }), _jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsxs("label", { style: { display: "block", marginBottom: "0.5rem", fontWeight: 500 }, children: ["Subject / Title ", _jsx("span", { style: { color: '#d32f2f' }, children: "*" })] }), _jsx("input", { name: "title", value: form.title, onChange: handleChange, required: true, placeholder: "e.g., Urgent Security Issue", style: { width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" } })] }), _jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsxs("label", { style: { display: "block", marginBottom: "0.5rem", fontWeight: 500 }, children: ["Description ", _jsx("span", { style: { color: '#d32f2f' }, children: "*" })] }), _jsx("textarea", { name: "description", value: form.description, onChange: handleChange, required: true, rows: 4, placeholder: "Provide details about your inquiry...", style: { width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "inherit", boxSizing: "border-box" } })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: "block", marginBottom: "0.5rem", fontWeight: 500 }, children: "Name" }), _jsx("input", { name: "name", value: form.name, onChange: handleChange, required: true, style: { width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" } })] }), _jsxs("div", { children: [_jsx("label", { style: { display: "block", marginBottom: "0.5rem", fontWeight: 500 }, children: "Email" }), _jsx("input", { name: "email", type: "email", value: form.email, onChange: handleChange, required: true, style: { width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" } })] })] }), _jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsxs("label", { style: { display: "block", marginBottom: "0.5rem", fontWeight: 500 }, children: ["Encryption Password ", _jsx("span", { style: { color: '#d32f2f' }, children: "*" })] }), _jsx("input", { type: "password", value: password, onChange: handlePasswordChange, required: true, minLength: 8, placeholder: "Enter strong password (min 8 chars)", autoComplete: "new-password", style: { width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" } }), _jsx("small", { style: { color: "#666", display: "block", marginTop: "0.25rem" }, children: "This password encrypts your data locally before sending. We cannot recover it if lost." })] }), _jsx("button", { type: "submit", disabled: uploading || !isAuthenticated, style: {
                    width: "100%",
                    padding: "0.85rem",
                    backgroundColor: uploading ? "#93c5fd" : (!isAuthenticated ? "#e0e0e0" : "#2563eb"),
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: uploading || !isAuthenticated ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "1rem",
                    opacity: uploading || !isAuthenticated ? 0.7 : 1,
                    transition: "background-color 0.2s"
                }, children: uploading ? "Encrypting & Sending..." : (!isAuthenticated ? "Login to Submit" : "Send Securely") }), status && (_jsx("p", { style: {
                    marginTop: "1rem",
                    textAlign: "center",
                    fontWeight: "bold",
                    color: status.startsWith("✅") ? "#2e7d32" : "#c62828",
                    padding: "0.5rem",
                    backgroundColor: status.startsWith("✅") ? "#e8f5e9" : "#ffebee",
                    borderRadius: "4px"
                }, children: status }))] }));
};
export default SecureForm;
