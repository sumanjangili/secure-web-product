// frontend/src/components/SecureForm.tsx

import React, { useState, useEffect } from "react";
import { encrypt, decrypt } from "../lib/crypto";

interface FormData {
  name: string;
  email: string;
}

const SecureForm: React.FC = () => {
  const [form, setForm] = useState<FormData>({ name: "", email: "" });
  const [status, setStatus] = useState<string>("");
  const [password, setPassword] = useState<string>(""); // Start empty to force user input
  
  // Helper to clear password from memory
  const clearPassword = () => setPassword("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password length
    if (!password || password.length < 8) {
      setStatus("❌ Password required (min 8 chars recommended)");
      return;
    }

    setStatus("Encrypting…");

    try {
      const payload = JSON.stringify(form);
      
      // 1. Encrypt returns { ciphertext, salt, iv }
      const { ciphertext, salt, iv } = await encrypt(payload, password); 
      
      console.log("Encryption successful. Components:", { 
        ciphertextLen: ciphertext.length, 
        saltLen: salt.length, 
        ivLen: iv.length 
      });

      // 2. Verify round-trip using the separate components
      const recovered = await decrypt(ciphertext, password, salt, iv);
      
      if (recovered !== payload) {
        throw new Error("Data integrity check failed: Decrypted content mismatch.");
      }

      // 3. Clear sensitive data from memory immediately
      setPassword(""); 
      setForm({ name: "", email: "" });

      // 4. Success State
      setStatus("✅ Data securely transmitted and verified!");
      
      // TODO: In a real app, send { ciphertext, salt, iv } to your backend API here.
      // Example: await fetch('/api/save', { method: 'POST', body: JSON.stringify({ ciphertext, salt, iv }) });
      console.log("Ready to send to server:", { ciphertext, salt, iv });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Encryption process failed:", errorMessage);
      
      // Show generic error to user, log details to console
      setStatus(`❌ Encryption failed: ${errorMessage}`);
      
      // Clear password on failure too
      setPassword("");
    }
  };

  // Auto-clear password if component unmounts (optional safety)
  useEffect(() => {
    return () => {
      clearPassword();
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "400px" }}>
      <h2>Secure Contact Form</h2>
      
      <label>
        Encryption Password (Min 8 chars):
        <input 
          type="password" 
          value={password} 
          onChange={handlePasswordChange} 
          required 
          minLength={8}
          placeholder="Enter strong password"
          autoComplete="new-password" // Prevent browser autofill caching
        />
      </label>
      <br /><br />

      <label>
        Name:
        <input name="name" value={form.name} onChange={handleChange} required />
      </label>
      <br />
      <label>
        Email:
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
        />
      </label>
      <br />
      <button type="submit">Send securely</button>
      <p>{status}</p>
    </form>
  );
};

export default SecureForm;
