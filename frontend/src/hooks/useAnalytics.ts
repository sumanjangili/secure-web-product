// src/hooks/useAnalytics.ts
import { useEffect, useCallback, useState, useRef } from "react";
import { ConsentManager } from "../lib/consent-manager";

declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, any>) => void;
  }
}

interface AnalyticsProperties {
  [key: string]: string | number | boolean | undefined;
}

export const useAnalytics = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const consentCheckRef = useRef(false);

  const checkConsent = useCallback(async () => {
    if (consentCheckRef.current) {
      return;
    }
    
    consentCheckRef.current = true;
    
    try {
      const allowed = await ConsentManager.isAllowed("analytics");
      setIsTracking(allowed);
      
      if (import.meta.env.VITE_DEBUG_MODE === "true") {
        console.log(`[Analytics] Consent: ${allowed ? 'granted' : 'denied'}`);
      }
    } catch (error) {
      console.error("[Analytics] Consent check failed:", error);
      setIsTracking(false);
    } finally {
      consentCheckRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConsent();
    const unsubscribe = ConsentManager.subscribe(checkConsent);
    return () => unsubscribe();
  }, [checkConsent]);

  const trackEvent = useCallback((eventName: string, properties?: AnalyticsProperties) => {
    if (isLoading || !isTracking) {
      return;
    }

    // Validate event name
    if (!/^[a-z_]+$/.test(eventName)) {
      console.warn('[Analytics] Invalid event name:', eventName);
      return;
    }

    // Enhanced sanitization
    const sanitizedProps: AnalyticsProperties = {};
    if (properties) {
      Object.keys(properties).forEach((key) => {
        if (!/^[a-zA-Z0-9_]+$/.test(key)) {
          return;
        }
        
        const val = properties[key];
        if (typeof val === 'string') {
          const sanitized = val.substring(0, 500).replace(/[<>]/g, '');
          if (sanitized.length > 0) {
            sanitizedProps[key] = sanitized;
          }
        } else if (typeof val === 'number' && isFinite(val) && Math.abs(val) < 1e15) {
          sanitizedProps[key] = val;
        } else if (typeof val === 'boolean') {
          sanitizedProps[key] = val;
        }
      });
    }

    // Debug logging with safety
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
      const safeProps = Object.fromEntries(
        Object.entries(sanitizedProps).filter(([k]) => !k.includes('token') && !k.includes('secret'))
      );
      console.log(`[Analytics] Event: ${eventName}`, safeProps);
    }
  }, [isTracking, isLoading]);

  return { isTracking, trackEvent, isLoading };
};
