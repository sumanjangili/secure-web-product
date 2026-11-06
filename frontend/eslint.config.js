// frontend/eslint.config.js
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";

// Define globals explicitly
const browserGlobals = {
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
  console: "readonly",
  MessageChannel: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setImmediate: "readonly",
  queueMicrotask: "readonly",
  // ✅ ADDED: timers used by LoginForm lockout countdown
  setInterval: "readonly",
  clearInterval: "readonly",
};

const nodeGlobals = {
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  require: "readonly",
  module: "readonly",
  exports: "readonly",
};

const testGlobals = {
  test: "readonly",
  expect: "readonly",
  describe: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  vi: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.local",
      "scripts/*-demo.ts",
      "scripts/*-demo.js",
      "coverage/**",
      ".netlify/**",
      "*.tgz",
      "*.tar.gz",
      "*.zip",
      ".eslintignore",
    ],
  },

  {
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        TextEncoder: "readonly",
    TextDecoder: "readonly",
      },
    },
  },

  js.configs.recommended,

  {
    files: [
      "vite.config.ts",
      "vitest.setup.ts",
      "scripts/*.ts",
      "scripts/*.js",
      "*.config.ts",
      "*.config.js",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: false,
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        ...nodeGlobals,
        ...testGlobals,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react: reactPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/prop-types": "off",
      "no-console": "off",
    },
  },

  {
    files: [
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        allowDefaultProject: ["src/**/*.ts", "src/**/*.tsx"],
      },
      globals: {
        ...browserGlobals,
        ...testGlobals,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react: reactPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-empty-function": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-console": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },

  // ADDED: flat-config override — base JS rules that duplicate TypeScript's
  // own checks are disabled for TS files (must come AFTER the src block).
  // - no-undef: TS compiler owns undefined-global detection; ESLint's rule
  //   doesn't know TS ambient types, hence the React/setInterval false positives.
  // - no-unused-vars: duplicated by @typescript-eslint/no-unused-vars above,
  //   which is the variant that honors ^_ ignore patterns.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": "error", // keep — TS doesn't check this; empty catches were a real finding
    },
  },
);
