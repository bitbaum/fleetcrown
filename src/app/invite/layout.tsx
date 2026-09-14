import type { Metadata } from "next";
import { APP_NAME } from "@/config/brand";
// `absolute` bypasses the root layout's "%s — Loki" template so this renders
// literally as "Join Loki" instead of "Join Loki — Loki".
export const metadata: Metadata = { title: { absolute: `Join ${APP_NAME}` } };
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
