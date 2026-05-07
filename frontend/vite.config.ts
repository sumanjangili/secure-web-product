// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: "localhost",
    port: 5173,
    open: true,
    proxy: {
      "/.netlify/functions": {
        target: "http://localhost:9999",
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, _res) => {
            console.log("Proxy Error:", err);
          });
          proxy.on("proxyReq", (proxyReq, req, _res) => {
            // Log request method and URL for debugging
            console.log("→ Proxying:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req, _res) => {
            // Log response status for debugging
            console.log("← Received:", proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false, // Security: Disable source maps in production
    minify: "esbuild", // Faster builds
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
    // Ensure assets are hashed for cache busting
    assetsInlineLimit: 4096,
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{js,ts,jsx,tsx}",
      "tests/**/*.test.{js,ts,jsx,tsx}"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "coverage", "**/*.d.ts"],
    },
    // Ensure Vitest handles ES modules correctly
    deps: {
      inline: ["vitest", "vitest-environment-jsdom"],
    },
  },
});
