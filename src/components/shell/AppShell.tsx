import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { AskIvyButton } from "./AskIvyButton";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-frame flex min-h-screen bg-surface-page text-text-primary">
      <Sidebar />
      <main className="app-main">
        {children}
      </main>
      <MobileNav />
      <AskIvyButton />
    </div>
  );
}
