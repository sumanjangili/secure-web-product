import React, { useState } from "react";
import { encrypt, decrypt } from "../lib/crypto";

interface FormData {
  name: string;
  email: string;
}

/**
 * Demonstrates client‑side encryption before sending data to the backend.
 */
const SecureForm: React.FC = () => {
  const [form, setForm] = useState<FormData>({ name: "", email: "" });
  const [status, setStatus] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Encrypting…");

    try {
      const payload = JSON.stringify(form);
      const ciphertext = await encrypt(payload); // returns Base64 string
      // Simulate sending to API – replace with fetch(...)
      console.log("Encrypted payload sent to server:", ciphertext);

      // For demo, decrypt locally to prove round‑trip works
      const recovered = await decrypt(ciphertext);
      console.log("Decrypted back on client:", recovered);

      setStatus("✅ Data securely transmitted!");
    } catch (err) {
      console.error(err);
      setStatus("❌ Encryption failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: "400px" }}>
      <h2>Secure Contact Form</h2>
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
