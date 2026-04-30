// src/hooks/useAnalytics.ts
import { useEffect, useCallback, useState } from "react";
import { ConsentManager } from "../lib/consent-manager";

// Extend Window interface if using Google Analytics (optional)
declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, any>) => void;
  }
}

interface AnalyticsProperties {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Custom hook to manage analytics tracking based on user consent.
 * 
 * Usage:
 * const { isTracking, trackEvent } = useAnalytics(userSessionKey);
 * 
 * if (isTracking) {
 *   trackEvent('button_click', { element: 'signup_btn' });
 * }
 */
export const useAnalytics = (userSessionKey: string | undefined) => {
  const [isTracking, setIsTracking] = useState(false);

  const checkConsent = useCallback(async () => {
    if (!userSessionKey) {
      setIsTracking(false);
      return;
    }

    try {
      const allowed = await ConsentManager.isAllowed("analytics", userSessionKey);
      setIsTracking(allowed);
      
      // Only log in development mode
      if (import.meta.env.VITE_DEBUG_MODE === "true") {
        if (allowed) {
          console.log("[Analytics] Consent granted. Tracking enabled.");
        } else {
          console.log("[Analytics] Consent denied. Tracking disabled.");
        }
      }
    } catch (error) {
      console.error("[Analytics] Failed to check consent:", error);
      setIsTracking(false);
    }
  }, [userSessionKey]);

  useEffect(() => {
    // Initial check
    checkConsent();

    // Subscribe to consent changes
    const unsubscribe = ConsentManager.subscribe(checkConsent);

    return () => {
      unsubscribe();
    };
  }, [checkConsent]);

  /**
   * Helper function to track an event only if consent is granted.
   * @param eventName - The name of the event (e.g., 'button_click')
   * @param properties - Optional event properties (strings, numbers, booleans only)
   */
  const trackEvent = useCallback((eventName: string, properties?: AnalyticsProperties) => {
    if (!isTracking) {
      // Silently ignore if not tracking (GDPR compliance)
      return;
    }

    // Sanitize properties: ensure only primitive types are sent
    const sanitizedProps: AnalyticsProperties = {};
    if (properties) {
      Object.keys(properties).forEach((key) => {
        const val = properties[key];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          sanitizedProps[key] = val;
        }
      });
    }

    // Example implementation: Google Analytics (uncomment if needed)
    // if (window.gtag) {
    //   window.gtag('event', eventName, sanitizedProps);
    // }
    
    // Or send to your backend (encrypted/anonymized):
    // fetch('/.netlify/functions/log-analytics', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ event: eventName, ...sanitizedProps })
    // });

    // Debug log only in development
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
      console.log(`[Analytics] Event: ${eventName}`, sanitizedProps);
    }
  }, [isTracking]);

  return { isTracking, trackEvent };
};
