// frontend/src/components/SecureForm.tsx
import React, { useState, useEffect } from "react";
import { encrypt, decrypt } from "../lib/crypto";

// Added title and description
interface FormData {
  name: string;
  email: string;
  title: string;
  description: string;
}

// Define Props interface
interface SecureFormProps {
  sessionKey?: string; // Passed from App.tsx
  onLogout?: () => void; // Optional callback if form triggers logout
}

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

  // Visual indicator for auth status
  const isAuthenticated = !!sessionKey || !!localStorage.getItem("auth_token");

  const clearSensitiveData = () => {
    setPassword("");
    setForm({ name: "", email: "", title: "", description: "" });
    setStatus("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation: Ensure all fields are filled
    if (!form.title.trim()) {
      setStatus("❌ Title is required.");
      return;
    }
    if (!form.description.trim()) {
      setStatus("❌ Description is required.");
      return;
    }
    if (!password || password.length < 8) {
      setStatus("❌ Password required (min 8 chars).");
      return;
    }

    setStatus("Encrypting…");
    setUploading(true);

    try {
      const payload = JSON.stringify(form);
      
      // 1. Encrypt locally
      // Note: 'password' is used here for client-side encryption of the payload.
      // The 'sessionKey' is used for authentication with the backend.
      const { ciphertext, salt, iv } = await encrypt(payload, password); 
      
      // 2. Verify round-trip
      const recovered = await decrypt(ciphertext, password, salt, iv);
      if (recovered !== payload) {
        throw new Error("Data integrity check failed.");
      }

      // 3. Send to Backend
      // PRIORITY: Use sessionKey prop first, fallback to localStorage
      const token = sessionKey || localStorage.getItem("auth_token");
      
      if (!token) {
        throw new Error("Authentication required. Please log in.");
      }

      const response = await fetch("/.netlify/functions/save-secure-data", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ ciphertext, salt, iv }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // If 401 Unauthorized, suggest logout
        if (response.status === 401) {
          setStatus("❌ Session expired. Please log in again.");
          if (onLogout) onLogout();
          return;
        }
        throw new Error(errorData.error || "Failed to save data");
      }

      // 4. Clear memory
      clearSensitiveData();
      setStatus("✅ Data securely transmitted and verified!");
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setStatus(`❌ Encryption failed: ${errorMessage}`);
      setPassword("");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    return () => { setPassword(""); };
  }, []);

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "500px", margin: "2rem auto" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Secure Contact Form</h2>
        <span style={{ 
          fontSize: '0.85rem', 
          padding: '0.25rem 0.5rem', 
          borderRadius: '4px',
          backgroundColor: isAuthenticated ? '#e8f5e9' : '#ffebee',
          color: isAuthenticated ? '#2e7d32' : '#c62828',
          fontWeight: 'bold'
        }}>
          {isAuthenticated ? "✅ Authenticated" : "❌ Not Logged In"}
        </span>
      </div>
      
      {/* Title Field */}
      <label>
        Subject / Title <span style={{color: 'red'}}>*</span>:
        <input 
          name="title" 
          value={form.title} 
          onChange={handleChange} 
          required 
          placeholder="e.g., Urgent Security Issue"
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: "4px" }}
        />
      </label>

      {/* Description Field */}
      <label>
        Description <span style={{color: 'red'}}>*</span>:
        <textarea 
          name="description" 
          value={form.description} 
          onChange={handleChange} 
          required 
          rows={4}
          placeholder="Provide details about your inquiry..."
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "inherit" }}
        />
      </label>

      {/* Existing Name & Email */}
      <label>
        Name:
        <input name="name" value={form.name} onChange={handleChange} required style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: "4px" }} />
      </label>
      
      <label>
        Email:
        <input name="email" type="email" value={form.email} onChange={handleChange} required style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: "4px" }} />
      </label>

      {/* Password */}
      <label>
        Encryption Password (Min 8 chars):
        <input 
          type="password" 
          value={password} 
          onChange={handlePasswordChange} 
          required 
          minLength={8}
          placeholder="Enter strong password"
          autoComplete="new-password"
          style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #ccc", borderRadius: "4px" }}
        />
      </label>
      
      <button 
        type="submit" 
        disabled={uploading || !isAuthenticated}
        style={{
          width: "100%",
          padding: "0.75rem",
          backgroundColor: uploading ? "#93c5fd" : (!isAuthenticated ? "#ccc" : "#2563eb"),
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: uploading || !isAuthenticated ? "not-allowed" : "pointer",
          fontWeight: 600,
          opacity: uploading || !isAuthenticated ? 0.7 : 1
        }}
      >
        {uploading ? "Sending..." : (!isAuthenticated ? "Login Required" : "Send securely")}
      </button>
      
      <p style={{ marginTop: "1rem", textAlign: "center", fontWeight: "bold" }}>{status}</p>
    </form>
  );
};

export default SecureForm;
