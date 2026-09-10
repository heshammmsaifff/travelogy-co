import { SplashScreen } from "@/shared/ui/splash-screen";

/**
 * Root suspense streaming loading component for all routes under /[locale].
 * Displays the Travelogy SplashScreen during SSR streaming and page suspension.
 */
export default function Loading() {
  return <SplashScreen />;
}
