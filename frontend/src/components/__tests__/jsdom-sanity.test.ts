// src/components/__tests__/jsdom-sanity.test.ts
test('jsdom provides window.localStorage', () => {
  // Vitest with `environment: "jsdom"` gives us a `window` object
  expect(typeof window).toBe('object');

  // `localStorage` should exist and have the standard methods
  expect(window.localStorage).toBeDefined();
  expect(typeof window.localStorage.getItem).toBe('function');
  expect(typeof window.localStorage.setItem).toBe('function');
});
