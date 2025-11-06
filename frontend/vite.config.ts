// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// -----------------------------------------------------------------
// Vite configuration
// -----------------------------------------------------------------
export default defineConfig({
  plugins: [react()],

  // -------------------------------------------------------------
  // Development server (optional, but handy)
  // -------------------------------------------------------------
  server: {
    port: 5173,
    open: true,
  },

  // -------------------------------------------------------------
  // Build options – production bundle goes into `dist/`
  // -------------------------------------------------------------
  build: {
    outDir: 'dist',
    sourcemap: false,
  },

  // -------------------------------------------------------------
  // Vitest configuration (so `npm test` works)
  // -------------------------------------------------------------
  test: {
    globals: true,               // make `test`, `expect`, etc. global
    environment: 'jsdom',        // DOM environment for React components
    setupFiles: ['./src/setupTests.ts'], // optional – we’ll create this next
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
  },
});
