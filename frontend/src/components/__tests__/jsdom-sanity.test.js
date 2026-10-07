// src/components/__tests__/jsdom-sanity.test.ts
import { describe, it, expect, beforeEach } from "vitest";
describe("JSDOM Environment Sanity", () => {
    beforeEach(() => {
        // Ensure clean state before each test
        if (typeof window !== "undefined") {
            window.localStorage.clear();
        }
    });
    it("provides a valid window object", () => {
        expect(typeof window).toBe("object");
        expect(window.document).toBeDefined();
    });
    it("provides a functional localStorage mock", () => {
        // Verify localStorage exists
        expect(window.localStorage).toBeDefined();
        // Verify standard methods exist
        expect(typeof window.localStorage.getItem).toBe("function");
        expect(typeof window.localStorage.setItem).toBe("function");
        expect(typeof window.localStorage.removeItem).toBe("function");
        expect(typeof window.localStorage.clear).toBe("function");
        // Functional test: Set and get a value
        const testKey = "test-key";
        const testValue = "test-value";
        window.localStorage.setItem(testKey, testValue);
        expect(window.localStorage.getItem(testKey)).toBe(testValue);
        // Verify removal
        window.localStorage.removeItem(testKey);
        expect(window.localStorage.getItem(testKey)).toBeNull();
    });
});
