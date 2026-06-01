import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";

/**
 * Surfaces the locked state of the private zone on /today.
 *
 * Without this, a locked Today is a quiet collection of empty cards and
 * hidden chips — the user has no inviting prompt to unlock. The banner
 * names what's behind the gate and gives one clear action.
 */
export async function LockedZoneBanner() {
  const userId = await requirePageUserId();
  if (!(await isPrivateZoneLocked(userId))) return null;

  return (
    <Link href="/unlock" className="ui-locked-banner group">
      <div className="ui-locked-banner-icon">
        <Lock className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">Private zone is locked</div>
        <div className="mt-0.5 text-sm text-text-tertiary">
          Unlock to see goals, people, habits, events, money, and memory.
        </div>
      </div>
      <span className="ui-locked-banner-cta">
        Unlock
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
