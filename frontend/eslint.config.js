// eslint.config.js
import eslint from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/**
 * Flat‑config export – an array of configuration objects.
 */
export default [
  /* ------------------------------------------------------------------
   * Global ignores – applied to every subsequent config block
   * ------------------------------------------------------------------ */
  {
    ignores: ["dist/**"],
  },

  /* ------------------------------------------------------------------
   * Global globals for every file
   * ------------------------------------------------------------------ */
  {
    languageOptions: {
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        crypto: "readonly",
        btoa: "readonly",
        atob: "readonly",
        fetch: "readonly",
        performance: "readonly",
        navigator: "readonly",
        // Console is needed for the `no‑undef` errors you saw
        console: "readonly",

        // Misc globals
        MessageChannel: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setImmediate: "readonly",
        queueMicrotask: "readonly",

        // Node globals (useful for config files, scripts, etc.)
        process: "readonly",
        __dirname: "readonly",
      },
    },
  },

  /* ------------------------------------------------------------------
   * Recommended core ESLint rules
   * ------------------------------------------------------------------ */
  eslint.configs.recommended,

  /* ------------------------------------------------------------------
   * TypeScript / React project files
   * ------------------------------------------------------------------ */
  {
    // Files this config applies to
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.{js,jsx}", // include plain JS if you ever need it
    ],

    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        // Use a dedicated tsconfig that excludes vite.config.ts
        project: "./tsconfig.eslint.json",
      },

      // Global variables
      globals: {
        // Vitest/Jest globals (if you use Vitest)
        test: "readonly",
        expect: "readonly",
        describe: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },

    plugins: {
      "@typescript-eslint": tseslint,
      react: reactPlugin,
      "react-hooks": reactHooks,
      // Uncomment if you install react-refresh
      // 'react-refresh': reactRefresh,
    },

    rules: {
      /* ---------- TypeScript‑ESLint rules ---------- */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      /* ---------- React rules ---------- */
      "react/react-in-jsx-scope": "off", // not needed with React 17+
      "react/prop-types": "off", // using TypeScript for props
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      /* ---------- Miscellaneous ---------- */
      "no-console": "off", // allow console.log in dev code (change to warn/error if desired)
      "no-undef": "error",
    },

    settings: {
      react: { version: "detect" },
    },
  },

  /* ------------------------------------------------------------------
   * Plain‑JS / Vite config files (no type‑information)
   * ------------------------------------------------------------------ */
  {
    files: ["*.js", "*.cjs", "*.mjs", "vite.config.ts"],

    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },

      globals: {
        // Node globals for config files
        process: "readonly",
        __dirname: "readonly",
      },
    },

    plugins: {
      react: reactPlugin,
    },

    rules: {
      // Turn off TypeScript‑only rules for plain JS files
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
];
