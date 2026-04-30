// frontend/src/components/SecureForm.tsx
import React, { useState, useEffect, useCallback } from "react";
import { encrypt, decrypt } from "../lib/crypto";

interface FormData {
  name: string;
  email: string;
  title: string;
  description: string;
}

interface SecureFormProps {
  sessionKey?: string; // Passed from App.tsx (Single Source of Truth)
  onLogout?: () => void;
}

// Helper to sanitize input (prevent accidental XSS if decrypted later in a non-escaped context)
const sanitizeInput = (str: string): string => {
  return str.replace(/[<>]/g, (char) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;' };
    return map[char] || char;
  });
};

const SecureForm: React.FC<SecureFormProps> = ({ sessionKey, onLogout }) => {
  const [form, setForm] = useState<FormData>({ 
    name: "", 
    email: "", 
    title: "", 
    description: "" 
  });
  const [status, setStatus] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // ✅ SECURITY: Use ONLY the prop for auth status. 
  // Relying on localStorage here can cause race conditions if App.tsx updates it asynchronously.
  const isAuthenticated = !!sessionKey;

  const clearSensitiveData = useCallback(() => {
    setPassword("");
    setForm({ name: "", email: "", title: "", description: "" });
    setStatus("");
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Sanitize input on change (optional, but good practice)
    const value = sanitizeInput(e.target.value);
    setForm({ ...form, [e.target.name]: value });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      
      // 1. Encrypt locally
      const { ciphertext, salt, iv } = await encrypt(payload, password); 
      
      // 2. Verify round-trip (Integrity Check)
      const recovered = await decrypt(ciphertext, password, salt, iv);
      if (recovered !== payload) {
        throw new Error("Encryption integrity check failed. Please try again.");
      }

      // 3. Send to Backend
      // sessionKey is guaranteed to be valid here because of the isAuthenticated check
      const response = await fetch("/.netlify/functions/save-secure-data", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionKey}`
        },
        body: JSON.stringify({ ciphertext, salt, iv }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 401) {
          setStatus("❌ Session expired. Redirecting to login...");
          clearSensitiveData();
          if (onLogout) onLogout();
          // Optional: Force reload or redirect
          setTimeout(() => window.location.reload(), 2000);
          return;
        }
        
        throw new Error(errorData.error || "Failed to save data on server.");
      }

      // 4. Success: Clear sensitive data immediately
      clearSensitiveData();
      setStatus("✅ Data securely encrypted and transmitted!");
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setStatus(`❌ Error: ${errorMessage}`);
      // Clear password on error to prevent it lingering in memory
      setPassword("");
    } finally {
      setUploading(false);
    }
  };

  // Clear password if component unmounts or session expires
  useEffect(() => {
    return () => {
      setPassword("");
    };
  }, []);

  // Clear password if sessionKey becomes undefined (logout)
  useEffect(() => {
    if (!sessionKey) {
      clearSensitiveData();
    }
  }, [sessionKey, clearSensitiveData]);

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "500px", margin: "2rem auto", fontFamily: "sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Secure Contact Form</h2>
        <span style={{ 
          fontSize: '0.85rem', 
          padding: '0.25rem 0.75rem', 
          borderRadius: '4px',
          backgroundColor: isAuthenticated ? '#e8f5e9' : '#ffebee',
          color: isAuthenticated ? '#2e7d32' : '#c62828',
          fontWeight: 'bold',
          border: `1px solid ${isAuthenticated ? '#4caf50' : '#f44336'}`
        }}>
          {isAuthenticated ? "✅ Authenticated" : "❌ Login Required"}
        </span>
      </div>
      
      {/* Title Field */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          Subject / Title <span style={{color: '#d32f2f'}}>*</span>
        </label>
        <input 
          name="title" 
          value={form.title} 
          onChange={handleChange} 
          required 
          placeholder="e.g., Urgent Security Issue"
          style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }}
        />
      </div>

      {/* Description Field */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          Description <span style={{color: '#d32f2f'}}>*</span>
        </label>
        <textarea 
          name="description" 
          value={form.description} 
          onChange={handleChange} 
          required 
          rows={4}
          placeholder="Provide details about your inquiry..."
          style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      {/* Name & Email */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Name</label>
          <input name="name" value={form.name} onChange={handleChange} required style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} required style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Password */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
          Encryption Password <span style={{color: '#d32f2f'}}>*</span>
        </label>
        <input 
          type="password" 
          value={password} 
          onChange={handlePasswordChange} 
          required 
          minLength={8}
          placeholder="Enter strong password (min 8 chars)"
          autoComplete="new-password"
          style={{ width: "100%", padding: "0.75rem", border: "1px solid #ccc", borderRadius: "4px", boxSizing: "border-box" }}
        />
        <small style={{ color: "#666", display: "block", marginTop: "0.25rem" }}>
          This password encrypts your data locally before sending. We cannot recover it if lost.
        </small>
      </div>
      
      <button 
        type="submit" 
        disabled={uploading || !isAuthenticated}
        style={{
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
        }}
      >
        {uploading ? "Encrypting & Sending..." : (!isAuthenticated ? "Login to Submit" : "Send Securely")}
      </button>
      
      {status && (
        <p style={{ 
          marginTop: "1rem", 
          textAlign: "center", 
          fontWeight: "bold",
          color: status.startsWith("✅") ? "#2e7d32" : "#c62828",
          padding: "0.5rem",
          backgroundColor: status.startsWith("✅") ? "#e8f5e9" : "#ffebee",
          borderRadius: "4px"
        }}>
          {status}
        </p>
      )}
    </form>
  );
};

export default SecureForm;
