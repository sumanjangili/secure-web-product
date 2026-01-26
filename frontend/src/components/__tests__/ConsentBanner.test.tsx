// src/components/__tests__/ConsentBanner.test.tsx
/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import ConsentBanner from "../ConsentBanner";

test("renders consent banner with button", () => {
  render(<ConsentBanner />);

  // Verify the banner text is present
  expect(screen.getByText(/we use cookies/i)).toBeInTheDocument();

  // Verify the Accept button exists (instead of “Got it”)
  const acceptBtn = screen.getByRole("button", { name: /accept/i });
  expect(acceptBtn).toBeInTheDocument();

  // (Optional) you could also verify the Dismiss button exists
  const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
  expect(dismissBtn).toBeInTheDocument();
});
