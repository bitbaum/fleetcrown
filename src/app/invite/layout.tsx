import type { Metadata } from "next";
import { APP_NAME } from "@/config/brand";
export const metadata: Metadata = { title: `Join ${APP_NAME}` };
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
