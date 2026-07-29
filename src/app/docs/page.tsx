import Link from "next/link";
import { BookOpen, Download, MessageSquare, Network, ShieldCheck } from "lucide-react";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";

export const metadata = {
  title: "Documentation",
  description: "Install FleetCrown, connect a runner, and operate agents safely.",
};

const guides = [
  {
    title: "Quickstart",
    body: "Go from a new account to your first supervised agent dispatch.",
    href: "/docs/quickstart",
    icon: BookOpen,
  },
  {
    title: "Install Fleet Runner",
    body: "Connect the local execution layer that lets agents work in your repositories.",
    href: "/download",
    icon: Download,
  },
  {
    title: "Feedback widget",
    body: "Put a feedback button on any site you run — reports become dispatchable fleet work.",
    href: "/docs/feedback-widget",
    icon: MessageSquare,
  },
  {
    title: "Architecture",
    body: "Understand the control plane, local runner, handoffs, and approval boundary.",
    href: "/whitepaper",
    icon: Network,
  },
  {
    title: "Operating safely",
    body: "Keep humans in control while Loki plans and agents execute scoped work.",
    href: "/philosophy",
    icon: ShieldCheck,
  },
] as const;

export default function DocsPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
        <div className="ui-public-eyebrow">Documentation</div>
        <h1 className="ui-public-page-title mt-4">Build with a supervised agent fleet</h1>
        <p className="ui-public-lede mt-6 max-w-2xl">
          Start small: connect one machine, one project, and one agent. FleetCrown keeps planning,
          dispatch, handoffs, and human approval in one operating loop.
        </p>
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {guides.map(({ title, body, href, icon: Icon }) => (
            <Link key={href} href={href} className="ui-public-surface-card !min-h-0">
              <Icon className="h-5 w-5 text-text-secondary" aria-hidden />
              <h2 className="ui-public-prose-strong mt-5 text-lg">{title}</h2>
              <p className="ui-public-surface-card-body">{body}</p>
              <span className="ui-public-link mt-5 inline-block">Open guide →</span>
            </Link>
          ))}
        </div>
      </main>
    </PublicSurface>
  );
}
