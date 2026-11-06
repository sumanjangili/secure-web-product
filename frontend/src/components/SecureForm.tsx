// frontend/src/components/SecureForm.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { encrypt, decrypt } from "../lib/crypto";
import { secureFetchJson, ApiError, getErrorMessage } from "../lib/fetch-helper";

interface FormData {
  name: string;
  email: string;
  title: string;
  description: string;
}

interface SecureFormProps {
  sessionKey?: string;
  onLogout?: () => void;
}

// ✅ Truncate only, NO HTML escaping (React escapes on render)
const sanitizeInput = (str: string): string => str.slice(0, 10_000);

// ✅ Centralised form state so "clear everything" is one operation
const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  title: "",
  description: "",
};

const SecureForm: React.FC<SecureFormProps> = ({ sessionKey, onLogout }) => {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [status, setStatus] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // ✅ FIXED: guards against setState-after-unmount from racing async work
  const mountedRef = useRef(true);

  const isAuthenticated = !!sessionKey;

  // Track mount state for all async callbacks
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * ✅ FIXED: clears ALL sensitive local state in one place.
   * Form fields are decrypted-equivalent plaintext and treated as sensitive;
   * password is wiped aggressively on every exit path (see clearEncryptionSecret).
   */
  const clearSensitiveData = useCallback(() => {
    setPassword("");
    setForm(EMPTY_FORM);
    setStatus("");
  }, []);

  // ✅ FIXED: password-only wipe used on error paths — keeps the user's
  // form input intact so a transient failure doesn't destroy their work,
  // while ensuring the encryption secret never lingers in memory/state.
  const clearEncryptionSecret = useCallback(() => {
    setPassword("");
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = sanitizeInput(e.target.value);
    setForm({ ...form, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploading) return;

    if (!isAuthenticated) {
      setStatus("❌ You must be logged in to submit.");
      return;
    }
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

      // Client-side encryption: the password NEVER leaves this component.
      const { ciphertext, salt, iv } = await encrypt(payload, password);

      // Round-trip integrity check BEFORE anything hits the network.
      const recovered = await decrypt(ciphertext, password, salt, iv);
      if (recovered !== payload) {
        throw new Error("Encryption integrity check failed. Please try again.");
      }

      // ✅ Keep retry disabled: POST is non-idempotent — a retried request
      // after a timeout would silently create duplicate secure tickets.
      await secureFetchJson("/save-secure-data", {
        method: "POST",
        body: JSON.stringify({ ciphertext, salt, iv }),
        retryOnTransientError: false,
      });

      if (!mountedRef.current) return;

      // ✅ FIXED: clear everything INCLUDING password on success
      clearSensitiveData();
      setStatus("✅ Data securely encrypted and transmitted!");
    } catch (error: unknown) {
      if (!mountedRef.current) return;

      // ✅ FIXED: structured ApiError handling with distinct messages
      if (error instanceof ApiError) {
        if (error.status === 401) {
          // Session died mid-submission: wipe secrets, log out, reload.
          setStatus("❌ Session expired. Redirecting to login...");
          clearSensitiveData();
          if (onLogout) onLogout();
          setTimeout(() => {
            if (mountedRef.current) window.location.reload();
          }, 2000);
          return;
        }

        if (error.status === 403) {
          setStatus("❌ Security check failed. Refresh the page and try again.");
        } else {
          setStatus(`❌ Error: ${getErrorMessage(error.data, error.message)}`);
        }
      } else if (error instanceof Error) {
        setStatus(`❌ Error: ${error.message}`);
      } else {
        setStatus("❌ An unexpected error occurred.");
      }

      // ✅ FIXED: clear password on ALL error paths (was missing in the
      // generic-error branch of the original). Form input is preserved so
      // the user doesn't retype their submission on a transient failure.
      clearEncryptionSecret();
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  };

  // ✅ FIXED: unmount cleanup wipes the password AND the form
  useEffect(() => {
    return () => {
      setPassword("");
      setForm(EMPTY_FORM);
    };
  }, []);

  // Logging out / losing the session purges everything sensitive
  useEffect(() => {
    if (!sessionKey) {
      clearSensitiveData();
    }
  }, [sessionKey, clearSensitiveData]);

  const isAuthenticatedBadge: React.CSSProperties = {
    fontSize: "0.85rem",
    padding: "0.25rem 0.75rem",
    borderRadius: "4px",
    fontWeight: "bold",
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: 500,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ maxWidth: "500px", margin: "2rem auto", fontFamily: "sans-serif" }}
      autoComplete="off"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Secure Contact Form</h2>
        <span
          style={{
            ...isAuthenticatedBadge,
            backgroundColor: isAuthenticated ? "#e8f5e9" : "#ffebee",
            color: isAuthenticated ? "#2e7d32" : "#c62828",
            border: `1px solid ${isAuthenticated ? "#4caf50" : "#f44336"}`,
          }}
        >
          {isAuthenticated ? "✅ Authenticated" : "❌ Login Required"}
        </span>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="sf-title" style={labelStyle}>
          Subject / Title <span style={{ color: "#d32f2f" }}>*</span>
        </label>
        <input
          id="sf-title"
          name="title"
          value={form.title}
          onChange={handleChange}
          required
          maxLength={10000}
          placeholder="e.g., Urgent Security Issue"
          style={fieldStyle}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="sf-description" style={labelStyle}>
          Description <span style={{ color: "#d32f2f" }}>*</span>
        </label>
        <textarea
          id="sf-description"
          name="description"
          value={form.description}
          onChange={handleChange}
          required
          maxLength={10000}
          rows={4}
          placeholder="Provide details about your inquiry..."
          style={{ ...fieldStyle, fontFamily: "inherit" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label htmlFor="sf-name" style={labelStyle}>Name</label>
          <input
            id="sf-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            autoComplete="name"
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="sf-email" style={labelStyle}>Email</label>
          <input
            id="sf-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
            style={fieldStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="sf-password" style={labelStyle}>
          Encryption Password <span style={{ color: "#d32f2f" }}>*</span>
        </label>
        <input
          id="sf-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Enter strong password (min 8 chars)"
          autoComplete="new-password"
          style={fieldStyle}
        />
        <small style={{ color: "#666", display: "block", marginTop: "0.25rem" }}>
          This password encrypts your data locally before sending. It is never transmitted
          to the server. We cannot recover your data if it is lost.
        </small>
      </div>

      <button
        type="submit"
        disabled={uploading || !isAuthenticated}
        style={{
          width: "100%",
          padding: "0.85rem",
          backgroundColor: uploading ? "#93c5fd" : !isAuthenticated ? "#e0e0e0" : "#2563eb",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: uploading || !isAuthenticated ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: "1rem",
          opacity: uploading || !isAuthenticated ? 0.7 : 1,
          transition: "background-color 0.2s",
        }}
      >
        {uploading ? "Encrypting & Sending..." : !isAuthenticated ? "Login to Submit" : "Send Securely"}
      </button>

      {status && (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: "1rem",
            textAlign: "center",
            fontWeight: "bold",
            color: status.startsWith("✅") ? "#2e7d32" : "#c62828",
            padding: "0.5rem",
            backgroundColor: status.startsWith("✅") ? "#e8f5e9" : "#ffebee",
            borderRadius: "4px",
          }}
        >
          {status}
        </p>
      )}
    </form>
  );
};

export default SecureForm;
