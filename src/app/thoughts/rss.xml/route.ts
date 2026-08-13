import { redirect } from "next/navigation";

// Convenience alias: /thoughts/rss.xml → /rss.xml. Feed readers commonly
// probe the section path; one canonical feed URL, one implementation.
export const dynamic = "force-static";

export function GET() {
  redirect("/rss.xml");
}
