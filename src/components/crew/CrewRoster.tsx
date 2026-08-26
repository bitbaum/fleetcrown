"use client";

import { ExternalLink, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { deleteJson } from "@/lib/api/fetch";
import { ENGAGEMENT_LABEL } from "@/config/crew";
import type { CrewMember } from "@/db/queries/crew";
import { AddCrewButton } from "./AddCrewButton";

/**
 * The humans in the loop.
 *
 * A roster, not a directory: these are people the operator already knows, and
 * the only numbers on a card are about work — nobody is ranked, scored, or
 * listed for hire here. Listing belongs to robots (config/actors.ts), and this
 * page is the reason that boundary exists in the first place.
 */
export function CrewRoster({
  crew,
  onChanged,
  onAssign,
}: {
  crew: CrewMember[];
  onChanged: () => void;
  onAssign: (member: CrewMember) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="ui-kicker">In the loop · {crew.length}</h2>
        <AddCrewButton onCreated={onChanged} />
      </div>

      {crew.length === 0 ? (
        <div className="ui-empty-panel">
          <Users className="h-8 w-8" />
          <div className="text-base text-text-secondary">Nobody in the loop yet</div>
          <p className="max-w-sm text-center text-sm text-text-tertiary">
            Add the people you actually hand work to — a lawyer, a translator, a
            friend who makes calls. They stay in your own book; nothing is published.
          </p>
          <AddCrewButton onCreated={onChanged} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {crew.map((member) => (
            <CrewMemberCard
              key={member.id}
              member={member}
              onChanged={onChanged}
              onAssign={() => onAssign(member)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CrewMemberCard({
  member,
  onChanged,
  onAssign,
}: {
  member: CrewMember;
  onChanged: () => void;
  onAssign: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const rate = member.rate ? `${member.currency ? `${member.currency} ` : ""}${member.rate}` : "";

  return (
    <div className="ui-crew-member">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="ui-crew-member-name truncate">{member.name}</div>
          <div className="ui-crew-member-meta">
            {member.role && <span>{member.role}</span>}
            {member.engagement && <span>· {ENGAGEMENT_LABEL[member.engagement]}</span>}
            {rate && <span>· {rate}</span>}
            {member.availability && <span>· {member.availability}</span>}
          </div>
        </div>
        {member.waitingOnThem > 0 && (
          <span className="ui-tag ui-tag-warning shrink-0">{member.waitingOnThem} with them</span>
        )}
      </div>

      {member.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {member.skills.map((skill) => (
            <span key={skill} className="ui-crew-skill">{skill}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAssign} className="ui-btn-xs">Assign work</button>
        {member.orangecatProfile && (
          <a
            href={member.orangecatProfile}
            target="_blank"
            rel="noreferrer"
            className="ui-btn-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            OrangeCat
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // Leaves the roster only. The contact, their notes and every
              // assignment they ever did stay exactly where they are.
              await deleteJson(`/api/crew/${member.id}`);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
          className="ui-btn-xs ml-auto"
          aria-label={`Remove ${member.name} from the crew`}
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
      </div>

      {member.openTasks > 0 && (
        <p className="text-xs text-text-muted">
          {member.openTasks} open {member.openTasks === 1 ? "assignment" : "assignments"}
          {member.waitingOnThem === 0 ? " — all back with you" : ""}
        </p>
      )}
    </div>
  );
}
