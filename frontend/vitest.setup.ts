// frontend/vitest.setup.ts
import { beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom";

// ---------------------------------------------------------
// MOCK: Intercept crypto module for all tests
// ---------------------------------------------------------
// Ensure the path is relative to the project root (frontend/)
// If src/lib/crypto.ts exists, this path is correct.
vi.mock("./src/lib/crypto", () => ({
  encrypt: vi.fn().mockResolvedValue("mocked-encrypted-value"),
  decrypt: vi.fn().mockResolvedValue('{"name":"test","email":"test@test.com"}'),
}));

/**
 * Simple in-memory implementation of the Web Storage API.
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

beforeEach(() => {
  // Replace global localStorage with our mock
  (globalThis as any).localStorage = new SimpleMemoryStorage();
  // Optional: Also mock sessionStorage if your app uses it
  (globalThis as any).sessionStorage = new SimpleMemoryStorage();
});

afterEach(() => {
  // Clear storage
  (globalThis as any).localStorage?.clear();
  (globalThis as any).sessionStorage?.clear();
  
  // Reset all mocks to ensure test isolation
  vi.restoreAllMocks();
});
