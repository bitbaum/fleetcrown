import { redirect } from "next/navigation";

// Duet was retired — "watch two agents' last prompt side by side" earned nothing
// over Terminal (live, interactive) + Agents (roster + comms). Redirect any old
// links/bookmarks to Agents rather than 404.
export default function DuetPage() {
  redirect("/agents");
}
