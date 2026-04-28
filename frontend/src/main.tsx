// frontend/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// 1. Locate the root container
const container = document.getElementById("root");

if (!container) {
  // Fallback: Render a simple error message directly to the DOM
  // This prevents a blank white screen if the HTML structure is broken
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#d32f2f;">
      <div style="text-align:center;">
        <h2>Application Error</h2>
        <p>Could not find the root element. Please refresh the page or contact support.</p>
      </div>
    </div>
  `;
  throw new Error("Failed to find the root element (#root) in index.html.");
}

// 2. Create the root
const root = createRoot(container);

// 3. Render the App in Strict Mode
// StrictMode helps detect unsafe lifecycles and side effects during development
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
