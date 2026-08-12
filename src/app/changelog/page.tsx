import { redirect } from "next/navigation";

// /changelog used to re-export the Releases page wholesale, serving identical
// content on two URLs. /releases is the canonical URL; this route only
// forwards so old links and bookmarks keep working.
export default function ChangelogRedirect() {
  redirect("/releases");
}
