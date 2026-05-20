import type { Metadata } from "next";
import { APP_NAME } from "@/config/brand";
// `absolute` bypasses the root layout's "%s — Cockpit" template so this renders
// literally as "Join Cockpit" instead of "Join Cockpit — Cockpit".
export const metadata: Metadata = { title: { absolute: `Join ${APP_NAME}` } };
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
