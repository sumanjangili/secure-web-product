// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "node:url";

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
        // Match the port shown in Netlify CLI log (9999)
        target: "http://localhost:9999", 
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
    assetsInlineLimit: 4096,
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{js,ts,jsx,tsx}", "tests/**/*.test.{js,ts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "coverage", "**/*.d.ts"],
    },
    deps: {
      inline: ["vitest", "vitest-environment-jsdom"],
    },
  },
});
