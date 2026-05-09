import type { Metadata } from "next";
export const metadata: Metadata = { title: "Beacon" };
export default function BeaconLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
