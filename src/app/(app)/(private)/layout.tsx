import { PrivatePinGate } from "@/components/shared/PrivatePinGate";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <PrivatePinGate>{children}</PrivatePinGate>;
}
