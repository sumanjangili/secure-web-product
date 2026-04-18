// frontend/vitest.setup.ts
import { beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom";

// ---------------------------------------------------------
// MOCK: Intercept crypto module for all tests
// ---------------------------------------------------------
vi.mock("./src/lib/crypto", () => ({
  encrypt: vi.fn().mockResolvedValue("mocked-encrypted-value"),
  decrypt: vi.fn().mockResolvedValue('{"name":"test","email":"test@test.com"}'),
}));

/**
 * Very small in‑memory implementation of the Web Storage API.
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
  (globalThis as any).localStorage = new SimpleMemoryStorage();
  (globalThis as any).localStorage = (globalThis as any).localStorage;
});

afterEach(() => {
  (globalThis as any).localStorage.clear();
  // Reset mocks after each test to ensure isolation
  vi.restoreAllMocks();
});
