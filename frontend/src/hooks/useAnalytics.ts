// src/hooks/useAnalytics.ts
import React, { useEffect, useCallback, useState } from "react";
import { ConsentManager } from "../lib/consent-manager";

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
      
      if (allowed) {
        console.log("✅ Analytics consent granted. Tracking enabled.");
        // Optional: Fire initial page view event here if needed
        // trackEvent('page_view', { path: window.location.pathname });
      } else {
        console.log("❌ Analytics consent denied. Tracking disabled.");
      }
    } catch (error) {
      console.error("Failed to check analytics consent:", error);
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
   * @param properties - Optional event properties
   */
  const trackEvent = useCallback((eventName: string, properties?: Record<string, any>) => {
    if (!isTracking) {
      // Silently ignore if not tracking
      return;
    }

    // Example implementation:
    // if (window.gtag) {
    //   window.gtag('event', eventName, properties);
    // }
    
    // Or send to your backend:
    // fetch('/.netlify/functions/log-analytics', {
    //   method: 'POST',
    //   body: JSON.stringify({ event: eventName, ...properties })
    // });

    console.log(`[Analytics] Event: ${eventName}`, properties);
  }, [isTracking]);

  return { isTracking, trackEvent };
};
