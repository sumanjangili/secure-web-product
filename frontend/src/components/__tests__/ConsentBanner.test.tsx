// src/components/__tests__/ConsentBanner.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ConsentBanner from "../ConsentBanner";
import { ApiError, secureFetchJson } from "../../lib/fetch-helper";

// 1. Mock the ConsentManager (component may not exercise every method,
//    but mocking keeps the test hermetic regardless).
vi.mock("../../lib/consent-manager", () => ({
  ConsentManager: {
    getConsent: vi.fn(),
    saveConsent: vi.fn(),
    isAllowed: vi.fn(),
    notifyConsentUpdated: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}));

// 2. PARTIAL mock of fetch-helper — keep the REAL ApiError and getErrorMessage
//    (the components do `error instanceof ApiError` and call getErrorMessage),
//    and replace only secureFetchJson.
vi.mock("../../lib/fetch-helper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/fetch-helper")>();
  return {
    ...actual,
    secureFetchJson: vi.fn(),
  };
});

describe("ConsentBanner", () => {
  const user = userEvent.setup();
  const mockFetch = vi.mocked(secureFetchJson);

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Default: every request fails auth-wise → component is fail-open,
    // so the banner always renders. Individual tests override per-call.
    mockFetch.mockRejectedValue(new ApiError("Not authenticated", 401));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders consent banner with buttons when no consent is stored", async () => {
    render(<ConsentBanner />);

    // Component is fail-open: a failed consent check shows the banner
    await waitFor(() => {
      expect(screen.getByTestId("consent-banner")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject non-essential/i })).toBeInTheDocument();
  });

  it("hides banner after accepting consent", async () => {
    // Sequence:
    // 1. GET (consent check) fails → banner shows (fail-open)
    // 2. POST (save) succeeds → banner hides
    mockFetch
      .mockRejectedValueOnce(new ApiError("Not authenticated", 401))
      .mockResolvedValueOnce({ success: true });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("consent-banner")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("accept-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
    });

    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!) as { essential: boolean; analytics: boolean; version: string };
    expect(parsed.essential).toBe(true);
    expect(parsed.analytics).toBe(true);
    expect(parsed.version).toBe("1.0");
  });

  it("hides banner immediately when dismissed", async () => {
    mockFetch
      .mockRejectedValueOnce(new ApiError("Not authenticated", 401))
      .mockResolvedValueOnce({ success: true });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("consent-banner")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("reject-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
    });

    const stored = localStorage.getItem("user_consent_v1");
    expect(stored).toBeTruthy();
    expect((JSON.parse(stored!) as { analytics: boolean }).analytics).toBe(false);
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
      expect(screen.queryByTestId("consent-banner")).not.toBeInTheDocument();
    });
  });

  it("shows error message when save consent fails", async () => {
    // 1. GET fails → banner shows
    // 2. POST fails with an ApiError carrying NO usable message string,
    //    so getErrorMessage falls through to the component's fallback
    //    ("Could not save consent. Please try again.") — which is exactly
    //    the UX path a user hits when the server returns an opaque error.
    mockFetch
      .mockRejectedValueOnce(new ApiError("Not authenticated", 401))
      .mockRejectedValue(new ApiError("Internal Server Error", 500));

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("consent-banner")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("accept-button"));

    await waitFor(() => {
      expect(screen.getByText(/could not save consent/i)).toBeInTheDocument();
    });
  });
});
