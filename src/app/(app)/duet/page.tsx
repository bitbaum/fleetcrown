import { redirect } from "next/navigation";
import { NAV } from "@/config/navigation";

// Duet was retired — "watch two agents' last prompt side by side" earned nothing
// over Terminal (live, interactive) + Control (roster + escalations).
export default function DuetPage() {
  redirect(NAV.control.href);
}
