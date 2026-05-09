import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sign Out" };
export default function SignOutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
