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
    <div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#d32f2f;background-color:#fff8f8;">
      <div style="text-align:center;padding:2rem;border:1px solid #d32f2f;border-radius:8px;">
        <h2 style="margin-top:0;">Application Error</h2>
        <p>Could not find the root element (#root). Please refresh the page or contact support.</p>
        <small>Error ID: root_missing</small>
      </div>
    </div>
  `;
  
  // Log to console for debugging
  console.error("[Main] Failed to find the root element (#root) in index.html.");
  
  // Throw to stop execution
  throw new Error("Failed to find the root element (#root) in index.html.");
}

// 2. Create the root
// We cast to HTMLElement because we verified it exists above
const root = createRoot(container as HTMLElement);

// 3. Render the App
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
