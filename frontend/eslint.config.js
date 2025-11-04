// frontend/eslint.config.js
import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

/* ---------- GLOBAL DEFINITIONS ---------- */
// Browser globals (read‑only)
const browserGlobals = {
  alert: true,
  console: true,
  document: true,
  window: true,
  btoa: true,
  atob: true,
};

// Vitest/Jest globals for test files
const vitestGlobals = {
  test: true,
  it: true,
  describe: true,
  expect: true,
  beforeAll: true,
  afterAll: true,
  beforeEach: true,
  afterEach: true,
};

export default [
  /* -------------------------------------------------
   * Base config – applies ONLY to source files that
   *    belong to the TypeScript project (src/** and vite.config.ts)
   * ------------------------------------------------- */
  {
    // NOTE: we *exclude* the config file itself by restricting the pattern
    files: ['src/**/*.{js,ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: ['./tsconfig.json'],          // points to the tsconfig that includes src/**
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,                  // make browser globals known
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ----- TypeScript rules -----
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // ----- React rules -----
      'react/react-in-jsx-scope': 'off', // new JSX transform
      'react/prop-types': 'off',        // we rely on TS for props
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ----- Fast Refresh (Vite dev) -----
      'react-refresh/only-export-components': 'warn',
    },
  },

  /* -------------------------------------------------
   * Test‑file config – adds Vitest globals for
   *    any file under __tests__ or ending with .test.*
   * ------------------------------------------------- */
  {
    files: [
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      '**/*.test.{js,jsx,ts,tsx}',
    ],
    languageOptions: {
      // Inherit parser/options from the base config, just extend globals
      globals: {
        ...browserGlobals, // keep browser globals available in tests
        ...vitestGlobals, // add Vitest/Jest globals
      },
    },
    // No extra plugins/rules needed – they are inherited from the first block
  },

  /* -------------------------------------------------
   * Fallback – catch‑all for any other files (e.g. this config itself)
   *    We deliberately *don’t* set a parser here, so ESLint will treat them
   *    as plain JavaScript and won’t try to apply the TypeScript project.
   * ------------------------------------------------- */
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    // No languageOptions – defaults to the built‑in ESLint parser (no TS project)
    // This block can stay empty; it simply prevents the parser error.
  },

  /* -------------------------------------------------
   * Core ESLint recommended rules (optional but useful)
   * ------------------------------------------------- */
  js.configs.recommended,
];
