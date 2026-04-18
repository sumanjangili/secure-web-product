import { jsx as _jsx } from "react/jsx-runtime";
// src/components/__tests__/ConsentBanner.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ConsentBanner from "../ConsentBanner";
// Mock the crypto module BEFORE importing the component
// Path is relative to this file: src/components/__tests__/ -> ../lib/crypto
vi.mock("../lib/crypto", () => ({
    encrypt: vi.fn().mockResolvedValue("mocked-encrypted-value"),
    decrypt: vi.fn().mockResolvedValue('{"name":"test","email":"test@test.com"}'),
}));
// We do NOT import 'encrypt' here anymore to avoid resolution issues.
// We will verify the mock was called by checking localStorage or using vi.mocked if needed later.
describe("ConsentBanner", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });
    it("renders consent banner with buttons when no consent is stored", () => {
        render(_jsx(ConsentBanner, {}));
        expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    });
    it("hides banner after accepting consent", async () => {
        const user = userEvent.setup();
        render(_jsx(ConsentBanner, {}));
        expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();
        const acceptBtn = screen.getByRole("button", { name: /accept/i });
        await user.click(acceptBtn);
        // Wait for the async operation to complete
        await waitFor(() => {
            expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
        });
        // Verify localStorage was set with the mocked value
        expect(localStorage.getItem("consent")).toBe("mocked-encrypted-value");
    });
    it("hides banner immediately when dismissed", async () => {
        const user = userEvent.setup();
        render(_jsx(ConsentBanner, {}));
        const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
        await user.click(dismissBtn);
        expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
    });
    it("does not render banner if consent is already stored", () => {
        localStorage.setItem("consent", "already-accepted");
        render(_jsx(ConsentBanner, {}));
        expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
    });
});
