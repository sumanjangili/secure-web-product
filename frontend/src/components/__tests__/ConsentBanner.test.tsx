// src/components/__tests__/ConsentBanner.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ConsentBanner from "../ConsentBanner";

// Mock the ConsentManager to avoid actual network calls during tests
vi.mock("../../lib/consent-manager", () => ({
  ConsentManager: {
    getConsent: vi.fn().mockResolvedValue(null),
    saveConsent: vi.fn().mockResolvedValue(undefined),
    isAllowed: vi.fn().mockResolvedValue(false),
    notifyConsentUpdated: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

// Mock fetch globally to prevent actual network requests
global.fetch = vi.fn();

describe("ConsentBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    
    // Mock fetch to resolve successfully by default
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ essential: true, analytics: false, timestamp: new Date().toISOString(), version: "1.0" }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // BASIC FUNCTIONALITY TESTS
  // =========================================================================

  it("renders consent banner with buttons when no consent is stored", async () => {
    render(<ConsentBanner />);
    
    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });
    
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject non-essential/i })).toBeInTheDocument();
  });

  it("hides banner after accepting consent", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(screen.queryByText(/cookie preferences/i)).not.toBeInTheDocument();
    });

    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.essential).toBe(true);
    expect(parsed.analytics).toBe(true);
    expect(parsed.version).toBe("1.0");
  });

  it("hides banner immediately when dismissed", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const rejectBtn = screen.getByRole("button", { name: /reject non-essential/i });
    await user.click(rejectBtn);

    await waitFor(() => {
      expect(screen.queryByText(/cookie preferences/i)).not.toBeInTheDocument();
    });

    const stored = localStorage.getItem("user_consent_v1");
    expect(JSON.parse(stored!).analytics).toBe(false);
  });

  it("does not render banner if consent is already stored", () => {
    const existingConsent = {
      essential: true,
      analytics: true,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };
    localStorage.setItem("user_consent_v1", JSON.stringify(existingConsent));

    render(<ConsentBanner />);

    return waitFor(() => {
      expect(screen.queryByText(/cookie preferences/i)).not.toBeInTheDocument();
    });
  });

  it("shows error message when save consent fails", async () => {
    const user = userEvent.setup();
    
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/could not save consent/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // XSS PROTECTION TESTS
  // =========================================================================

  it("sanitizes user input to prevent XSS attacks", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Simulate malicious input that could be stored/displayed
    const maliciousPayload = '<script>alert("XSS")</script>';
    
    // Mock localStorage to return malicious data
    Object.defineProperty(window, "localStorage", {
      value: {
        ...window.localStorage,
        getItem: vi.fn().mockReturnValue(JSON.stringify({
          essential: true,
          analytics: true,
          timestamp: new Date().toISOString(),
          version: "1.0",
          userInput: maliciousPayload, // Malicious data
        })),
      },
      writable: true,
    });

    // Re-render with malicious data
    render(<ConsentBanner />);
    
    await waitFor(() => {
      const element = screen.queryByText(/cookie preferences/i);
      // Element should render, but script tags should NOT be executed
      // The malicious string should be escaped, not rendered as HTML
      expect(element).toBeInTheDocument();
    });

    // Verify no script tags are in the DOM
    const scripts = document.querySelectorAll("script");
    expect(scripts.length).toBe(0); // No injected scripts
  });

  it("prevents HTML injection in error messages", async () => {
    const user = userEvent.setup();
    
    // Mock fetch to return error with malicious content
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '<img src=x onerror=alert("XSS")>' }),
    });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/could not save consent/i)).toBeInTheDocument();
    });

    // Verify no img tags or event handlers are in the DOM
    const images = document.querySelectorAll("img[src='x']");
    expect(images.length).toBe(0);
  });

  // =========================================================================
  // CSRF PROTECTION TESTS
  // =========================================================================

  it("includes CSRF token in consent save requests", async () => {
    const user = userEvent.setup();
    
    // Mock a CSRF token in the document
    const csrfMeta = document.createElement("meta");
    csrfMeta.name = "csrf-token";
    csrfMeta.content = "test-csrf-token-12345";
    document.head.appendChild(csrfMeta);

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    // Verify fetch was called with CSRF token
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = fetchCall[1];
    
    expect(options.headers).toBeDefined();
    expect(options.headers).toHaveProperty("X-CSRF-Token", "test-csrf-token-12345");
    
    // Clean up
    document.head.removeChild(csrfMeta);
  });

  it("includes credentials for cookie-based authentication", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = fetchCall[1];
    
    expect(options.credentials).toBe("include");
  });

  it("handles CSRF token expiration gracefully", async () => {
    const user = userEvent.setup();
    
    // Mock fetch to return 403 (CSRF failure)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "CSRF token mismatch" }),
    });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    // Should show error, not crash
    await waitFor(() => {
      expect(screen.getByText(/could not save consent/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // RACE CONDITION TESTS
  // =========================================================================

  it("handles rapid consecutive button clicks without errors", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Rapidly click accept button multiple times
    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    
    // Simulate 5 rapid clicks
    for (let i = 0; i < 5; i++) {
      await user.click(acceptBtn);
    }

    // Should not throw errors
    await waitFor(() => {
      expect(screen.queryByText(/cookie preferences/i)).not.toBeInTheDocument();
    });

    // Should only have one consent record
    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();
    
    // Verify only one save operation occurred (debounced/throttled)
    const saveCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(saveCalls).toBeLessThanOrEqual(2); // Allow for initial + one retry
  });

  it("handles concurrent consent updates from multiple sources", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Simulate two simultaneous consent updates
    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    const rejectBtn = screen.getByRole("button", { name: /reject non-essential/i });

    // Click both buttons nearly simultaneously
    await Promise.all([
      user.click(acceptBtn),
      user.click(rejectBtn),
    ]);

    // Should complete without errors
    await waitFor(() => {
      expect(screen.queryByText(/cookie preferences/i)).not.toBeInTheDocument();
    });

    // Should have valid consent data (last write wins, but no corruption)
    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed.essential).toBe(true); // Essential should always be true
    expect(typeof parsed.analytics).toBe("boolean"); // Should be valid boolean
  });

  it("prevents multiple banner instances from rendering simultaneously", async () => {
    // Render two banners at once (simulating bug)
    const { unmount } = render(<ConsentBanner />);
    const { container } = render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getAllByText(/cookie preferences/i).length).toBeLessThanOrEqual(1);
    });

    // Only one banner should be visible
    const banners = container.querySelectorAll('[data-testid="consent-banner"]');
    expect(banners.length).toBeLessThanOrEqual(1);

    unmount();
  });

  it("handles network timeout during consent save", async () => {
    const user = userEvent.setup();
    
    // Mock fetch that hangs then rejects
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
    );

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole("button", { name: /accept all/i });
    await user.click(acceptBtn);

    // Should handle timeout gracefully
    await waitFor(() => {
      expect(screen.getByText(/could not save consent/i)).toBeInTheDocument();
    }, { timeout: 6000 });
  });

  // =========================================================================
  // ADDITIONAL SECURITY TESTS
  // =========================================================================

  it("validates consent data structure before saving", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Mock localStorage to return malformed data
    Object.defineProperty(window, "localStorage", {
      value: {
        ...window.localStorage,
        getItem: vi.fn().mockReturnValue("invalid-json"),
      },
      writable: true,
    });

    // Component should handle this gracefully
    render(<ConsentBanner />);
    
    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Should still show banner (malformed = no valid consent)
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
  });

  it("prevents consent bypass via localStorage manipulation", async () => {
    // Try to bypass consent by setting invalid data
    localStorage.setItem("user_consent_v1", JSON.stringify({
      essential: false, // Should always be true
      analytics: true,
      version: "999.0", // Invalid version
    }));

    render(<ConsentBanner />);

    // Component should detect invalid consent and show banner again
    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });

    // Banner should still be visible because consent is invalid
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
  });
});
