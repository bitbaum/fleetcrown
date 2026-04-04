import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AskIvyButton } from "./AskIvyButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#0f1117] text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>
      <MobileNav />
      <AskIvyButton />
    </div>
  );
}
