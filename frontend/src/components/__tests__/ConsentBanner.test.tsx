// src/components/__tests__/ConsentBanner.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ConsentBanner from "../ConsentBanner";

// Import the module - this will be replaced by the mock below
import * as fetchHelperModule from "../../lib/fetch-helper";

// 1. Mock the ConsentManager
vi.mock("../../lib/consent-manager", () => ({
  ConsentManager: {
    getConsent: vi.fn().mockResolvedValue(null),
    saveConsent: vi.fn().mockResolvedValue(undefined),
    isAllowed: vi.fn().mockResolvedValue(false),
    notifyConsentUpdated: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

// 2. Mock the fetch-helper module - MUST come BEFORE any imports that use it
vi.mock("../../lib/fetch-helper", () => ({
  secureFetchJson: vi.fn()
}));

describe("ConsentBanner", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to get the typed mock function
  const getMock = () => vi.mocked(fetchHelperModule.secureFetchJson);

  it("renders consent banner with buttons when no consent is stored", async () => {
    const mockFn = getMock();
    const errorObj: any = new Error("Not authenticated");
    errorObj.status = 401;
    
    // Mock the GET call to fail (triggering the banner)
    mockFn.mockRejectedValue(errorObj);

    render(<ConsentBanner />);
    
    await waitFor(() => {
      expect(screen.getByText(/cookie preferences/i)).toBeInTheDocument();
    });
    
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject non-essential/i })).toBeInTheDocument();
  });

  it("hides banner after accepting consent", async () => {
    const mockFn = getMock();
    
    // Sequence: 
    // 1. GET call fails (shows banner)
    // 2. SAVE call succeeds (hides banner)
    mockFn.mockRejectedValueOnce({ status: 401, message: "Not authenticated" }); 
    mockFn.mockResolvedValueOnce({ success: true }); 

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
    const mockFn = getMock();
    
    mockFn.mockRejectedValueOnce({ status: 401 }); 
    mockFn.mockResolvedValueOnce({ success: true }); 

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
    const mockFn = getMock();
    
    mockFn.mockRejectedValueOnce({ status: 401 }); 
    mockFn.mockRejectedValueOnce({ status: 500, data: { error: "Server Error" } }); 

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
});
