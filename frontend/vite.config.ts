// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // -------------------------------------------------------------
  // Development Server Configuration
  // -------------------------------------------------------------
  server: {
    host: "localhost", // CRITICAL: Forces localhost binding to avoid network interface detection errors
    port: 5173,
    open: true,
  },

  // -------------------------------------------------------------
  // Build Configuration
  // -------------------------------------------------------------
  build: {
    outDir: "dist",
    sourcemap: false, // Disable sourcemaps for production to reduce bundle size
  },

  // -------------------------------------------------------------
  // Vitest Testing Configuration
  // -------------------------------------------------------------
  test: {
    globals: true, // Make 'test', 'expect', etc. globally available
    environment: "jsdom", // Simulate browser environment for React components
    setupFiles: ["./vitest.setup.ts"], // Load mocks and global setup
    include: ["src/components/__tests__/**/*.test.{js,ts,jsx,tsx}"],
  },
});
