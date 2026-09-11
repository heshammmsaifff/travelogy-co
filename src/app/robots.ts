import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://travelogy.co";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/ar", "/en", "/ar/about", "/en/about", "/ar/terms", "/en/terms", "/ar/privacy", "/en/privacy"],
        disallow: [
          "/admin",
          "/admin/*",
          "/agent",
          "/agent/*",
          "/driver",
          "/driver/*",
          "/api/*",
          "/*/admin/*",
          "/*/agent/*",
          "/*/driver/*",
          "/*/ui-kit",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
