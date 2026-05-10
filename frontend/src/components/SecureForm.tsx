// frontend/src/components/SecureForm.tsx
import React, { useState, useEffect, useCallback } from "react";
import { encrypt, decrypt } from "../lib/crypto";
import { secureFetchJson } from "../lib/fetch-helper"; 

interface FormData {
  name: string;
  email: string;
  title: string;
  description: string;
}

interface SecureFormProps {
  sessionKey?: string; // Now passed from App.tsx as currentUser?.id
  onLogout?: () => void;
}

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

  // ✅ CRITICAL FIX: Check if sessionKey exists
  const isAuthenticated = !!sessionKey;

  const clearSensitiveData = useCallback(() => {
    setPassword("");
    setForm({ name: "", email: "", title: "", description: "" });
    setStatus("");
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = sanitizeInput(e.target.value);
    setForm({ ...form, [e.target.name]: value });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (uploading) return; 

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
      
    } catch (error: any) {
      if (error.status === 401) {
        setStatus("❌ Session expired. Redirecting to login...");
        clearSensitiveData();
        if (onLogout) onLogout();
        setTimeout(() => window.location.reload(), 2000);
        return;
      }

      const errorMessage = error.data?.error || (error instanceof Error ? error.message : "An unexpected error occurred.");
      setStatus(`❌ Error: ${errorMessage}`);
      setPassword(""); 
    } finally {
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
