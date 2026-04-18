import { jsx as _jsx } from "react/jsx-runtime";
// frontend/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
const container = document.getElementById("root");
if (!container) {
    throw new Error("Failed to find the root element. Check index.html.");
}
const root = createRoot(container);
root.render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
