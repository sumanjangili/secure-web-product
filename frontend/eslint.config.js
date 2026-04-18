// frontend/eslint.config.js
import js from "@eslint/js";
// REMOVED: import globals from "globals"; (We define them manually now)
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
      "no-undef": "error",
    },
    settings: {
      react: { version: "detect" },
    },
  },
);
