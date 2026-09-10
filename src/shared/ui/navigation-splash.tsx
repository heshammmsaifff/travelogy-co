"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { SplashScreen } from "./splash-screen";

/**
 * Dispatches an event to manually show the splash screen (e.g., during programmatic navigation).
 */
export function startAppLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:loading-start"));
  }
}

/**
 * Dispatches an event to manually hide the splash screen.
 */
export function stopAppLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:loading-stop"));
  }
}

/**
 * Global navigation listener that displays the Travelogy SplashScreen during:
 * 1. Initial page load (mount)
 * 2. Client-side route transitions between different pages
 */
export function NavigationSplash() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial load state: brief splash on first open
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Route navigation state: splash when clicking links between pages
  const [isNavigating, setIsNavigating] = useState(false);

  const navigationStartTime = useRef<number>(0);
  const currentPathRef = useRef<string>("");

  // Dismiss initial splash after brief mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Track initial path
  useEffect(() => {
    currentPathRef.current = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
  }, []);

  // When pathname or searchParams change, navigation has completed
  useEffect(() => {
    const newPath = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    if (newPath !== currentPathRef.current) {
      currentPathRef.current = newPath;

      // Keep splash visible for at least 260ms to prevent jarring flicker
      const elapsed = Date.now() - navigationStartTime.current;
      const remaining = Math.max(0, 260 - elapsed);

      const timer = setTimeout(() => {
        setIsNavigating(false);
      }, remaining);

      return () => clearTimeout(timer);
    } else {
      setIsNavigating(false);
    }
  }, [pathname, searchParams]);

  // Intercept clicks on internal navigation links
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      // Ignore modified clicks (cmd, ctrl, shift, alt) or non-left clicks
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const targetAttr = anchor.getAttribute("target");

      // Ignore hash anchors, javascript: links, external targets, and downloads
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        targetAttr === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);

        // Ignore external domains
        if (targetUrl.origin !== currentUrl.origin) {
          return;
        }

        // Only handle standard web protocols
        if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
          return;
        }

        // Ignore clicks leading to the exact same page & search query
        if (
          targetUrl.pathname === currentUrl.pathname &&
          targetUrl.search === currentUrl.search
        ) {
          return;
        }

        // Valid route navigation initiated
        navigationStartTime.current = Date.now();
        setIsNavigating(true);
      } catch {
        // Invalid URL, ignore
      }
    };

    const handleCustomStart = () => {
      navigationStartTime.current = Date.now();
      setIsNavigating(true);
    };

    const handleCustomStop = () => {
      setIsNavigating(false);
    };

    document.addEventListener("click", handleAnchorClick, { capture: true });
    window.addEventListener("app:loading-start", handleCustomStart);
    window.addEventListener("app:loading-stop", handleCustomStop);

    return () => {
      document.removeEventListener("click", handleAnchorClick, { capture: true });
      window.removeEventListener("app:loading-start", handleCustomStart);
      window.removeEventListener("app:loading-stop", handleCustomStop);
    };
  }, []);

  // Safety fallback: auto-dismiss after 6s in case navigation hangs or is cancelled
  useEffect(() => {
    if (!isNavigating) return;
    const safetyTimer = setTimeout(() => {
      setIsNavigating(false);
    }, 6000);
    return () => clearTimeout(safetyTimer);
  }, [isNavigating]);

  const shouldShow = isInitialLoading || isNavigating;

  return (
    <AnimatePresence mode="wait">
      {shouldShow && <SplashScreen key="global-splash-screen" />}
    </AnimatePresence>
  );
}
