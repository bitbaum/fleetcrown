import { redirect } from "next/navigation";
import { NAV } from "@/config/navigation";

/** Atlas was a second catalog. Live URL and down-state live on Projects. */
export default function AtlasRedirect() {
  redirect(NAV.projects.href);
}
