import { redirect } from "next/navigation";
import { NAV } from "@/config/navigation";

/** Agents was a second roster. Control already is the roster; escalations land there. */
export default function AgentsRedirect() {
  redirect(NAV.control.href);
}
