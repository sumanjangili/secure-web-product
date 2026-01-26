// vitest.setup.ts
import { beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

/**
 * Very small in‑memory implementation of the Web Storage API.
 * It mimics the methods that our component (and the sanity test) use.
 */
class SimpleMemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? this.store[key]
      : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

/**
 * Before every test we install the mock on both `window` and the global scope.
 * After each test we clear it so tests stay isolated.
 */
beforeEach(() => {
  // Attach to the JSDOM `window` (available because we run with environment: 'jsdom')
  // @ts-ignore – JSDOM may not have a typed `localStorage` property yet.
  (globalThis as any).localStorage = new SimpleMemoryStorage();
  // Also expose it as a global variable (the component uses the bare identifier)
  // This mirrors what a real browser does: `localStorage` is a property of the global object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).localStorage = (globalThis as any).localStorage;
});

afterEach(() => {
  // Reset the storage after each test to avoid cross‑test leakage.
  (globalThis as any).localStorage.clear();
});
