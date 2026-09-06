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
    // Keeps the server bundle lean: these are heavy and only ever used server-side.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default withNextIntl(nextConfig);
