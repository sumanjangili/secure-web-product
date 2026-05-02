// src/components/__tests__/ConsentBanner.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ConsentBanner from "../ConsentBanner";

// Mock the crypto module
vi.mock("../lib/crypto", () => ({
  encrypt: vi.fn().mockResolvedValue("mocked-encrypted-value"),
  decrypt: vi.fn().mockResolvedValue('{"name":"test","email":"test@test.com"}'),
}));

describe("ConsentBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders consent banner with buttons when no consent is stored", () => {
    render(<ConsentBanner />);
    
    // Wait for the checking state to finish (component returns null while checking)
    // The component sets checking=false after the effect runs.
    // We need to wait for the banner to appear.
    expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();
    
    // Check for "Accept All" button
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
    
    // Check for "Reject Non-Essential" button (NOT "dismiss")
    expect(screen.getByRole("button", { name: /reject non-essential/i })).toBeInTheDocument();
  });

  it("hides banner after accepting consent", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    // Wait for banner to appear
    await waitFor(() => {
      expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    // Wait for the banner to disappear
    await waitFor(() => {
      expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
    });

    // Verify localStorage was set with the CORRECT KEY and JSON structure
    // The component saves JSON.stringify(consentData), not the encrypted value directly
    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.essential).toBe(true);
    expect(parsed.analytics).toBe(true);
    expect(parsed.version).toBe("1.0");
    
    // Note: The crypto mock is called internally, but the stored value is the JSON object,
    // not the result of encrypt(). If your component actually encrypts the JSON before saving,
    // then we would expect the encrypted string. 
    // Looking at your code: localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
    // It saves the PLAIN JSON, not the encrypted value.
    // If you intended to save the encrypted value, the component code needs to change.
    // Assuming current code is correct:
    expect(stored).toContain('"essential":true');
  });

  it("hides banner immediately when dismissed", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    // Wait for banner
    await waitFor(() => {
      expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();
    });

    // Click "Reject Non-Essential" (which calls handleDismiss -> handleSaveConsent(false))
    const rejectBtn = screen.getByRole("button", { name: /reject non-essential/i });
    await user.click(rejectBtn);

    // Banner should disappear
    await waitFor(() => {
      expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
    });

    // Verify localStorage was set with analytics: false
    const stored = localStorage.getItem("user_consent_v1");
    expect(JSON.parse(stored!).analytics).toBe(false);
  });

  it("does not render banner if consent is already stored", () => {
    // Set up existing consent with the correct key and version
    const existingConsent = {
      essential: true,
      analytics: true,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };
    localStorage.setItem("user_consent_v1", JSON.stringify(existingConsent));

    render(<ConsentBanner />);

    // The component should not render anything (returns null)
    expect(screen.queryByText(/we use cookies/i)).not.toBeInTheDocument();
  });
});
