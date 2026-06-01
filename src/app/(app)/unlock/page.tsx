import { redirect } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneConfigured, isPrivateZoneUnlocked } from "@/lib/private-zone";
import { UnlockForm } from "@/components/private/UnlockForm";
import { PageLayout } from "@/components/ui/page-layout";

export const metadata = { title: "Unlock private zone" };

const PRIVATE_AREAS = [
  { label: "Memory", description: "Your knowledge graph — people, projects, decisions, conversations." },
  { label: "People", description: "Contacts, relationship health, conversation history." },
  { label: "Goals", description: "Active goals, milestones, progress." },
  { label: "Habits", description: "Daily streaks and 30-day heatmaps." },
  { label: "Events", description: "Deadlines and opportunities." },
  { label: "Money", description: "Subscriptions and monthly burn." },
];

type SearchParams = Promise<{ next?: string }>;

export default async function UnlockPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requirePageUserId();
  const { next } = await searchParams;
  const nextHref = sanitizeNext(next);

  // No PIN set → guide the user to Settings → Privacy.
  if (!(await isPrivateZoneConfigured(userId))) {
    return (
      <PageLayout title="Private zone is open" maxWidth="max-w-xl">
        <div className="ui-settings-section">
          <p className="text-sm text-text-secondary">
            You haven&apos;t set a PIN yet, so the private zone is unlocked by default.
            Set one in Settings → Privacy to gate Memory, People, Goals, Habits, Events, and Money behind a PIN.
          </p>
          <a href="/settings#privacy" className="ui-btn-primary mt-2 inline-flex">
            Open Settings → Privacy
          </a>
        </div>
      </PageLayout>
    );
  }

  // Already unlocked → skip the form, go where the user was headed.
  if (await isPrivateZoneUnlocked(userId)) {
    redirect(nextHref);
  }

  return (
    <PageLayout title="Unlock private zone" maxWidth="max-w-xl">
      <UnlockForm next={nextHref} areas={PRIVATE_AREAS} />
    </PageLayout>
  );
}

/**
 * Only allow same-origin destinations; reject anything starting with `//` or a
 * protocol so a crafted `?next=` cannot redirect the user off-site after a
 * successful unlock.
 */
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/today";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/today";
  return raw;
}
