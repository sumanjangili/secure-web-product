// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "localhost",
    port: 5173,
    open: true,
    
    proxy: {
      // ✅ This MUST match the fetch path in LoginForm.tsx
      "/.netlify/functions": {
        target: "http://localhost:9999",
        changeOrigin: true,
        secure: false,
        // ✅ Add this to ensure path rewriting works correctly
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("proxy error", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            console.log("Sending Request to the Target:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            console.log("Received Response from the Target:", proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/components/__tests__/**/*.test.{js,ts,jsx,tsx}"],
  },
});
