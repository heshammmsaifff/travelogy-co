import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Points the plugin at our request-scoped i18n config (see src/shared/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/shared/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Hotel photos, banners and documents are all served from Cloudinary (CLAUDE.md §8).
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Enables forbidden()/unauthorized(), so a page the user lacks permission
    // for renders a proper "no access" screen instead of a 404 that would
    // leave a staff member unsure whether they mistyped the URL.
    authInterrupts: true,
  },
};

export default withNextIntl(nextConfig);
