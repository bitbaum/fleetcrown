import type { MetadataRoute } from "next";
import { APP_URL } from "@/config/brand";

// Next.js file-convention robots policy. Allow crawling of the marketing
// surface (landing, whitepaper, thoughts, public profiles, auth pages) and
// disallow everything under the app shell + API + Next internals.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/control",
          "/today",
          "/projects",
          "/system",
          "/memory",
          "/goals",
          "/people",
          "/money",
          "/habits",
          "/events",
          "/prompts",
          "/settings",
          "/history",
          "/onboarding",
          "/setup",
          "/sign-out",
          "/beacon/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
