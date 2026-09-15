import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Received vs Sent.
 *
 * Feedback has two sides and the product only ever showed one. /feedback is
 * every report addressed TO your projects; /feedback/sent is every report YOU
 * filed on somebody else's site. They are different relationships, not a filter
 * over one list — the first is work you owe people, the second is work you are
 * owed — so they are separate destinations under one heading rather than a chip
 * on the inbox.
 *
 * Both tabs always render, including for an account with nothing on one side.
 * A tab that appears only once it has contents is a feature nobody discovers.
 */
export function FeedbackTabs({ active }: { active: "received" | "sent" }) {
  const tabs = [
    { key: "received" as const, href: "/feedback", label: "Received" },
    { key: "sent" as const, href: "/feedback/sent", label: "Sent" },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn("ui-tab", active === tab.key && "ui-tab-active")}
          aria-current={active === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
