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
          "/robots",
          "/money",
          "/habits",
          "/events",
          "/prompts",
          "/settings",
          "/activity",
          "/history",
          "/decisions",
          "/digests",
          "/onboarding",
          "/setup",
          "/sign-out",
          "/beacon/",
          "/feedback",
          // Tokenized report pages. The token in the path IS the credential, so
          // a crawled one is a leaked one — it would sit in an index, in a
          // referrer, and in whatever republishes the crawl. The page also
          // carries `robots: noindex, nofollow` itself, because a crawler that
          // ignores this file is exactly the crawler this matters for.
          // Listing the prefix here discloses nothing: no token appears in it.
          "/f/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
