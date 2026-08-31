"use client";

import Link from "next/link";
import type { RobotWithAttributes } from "@/db/queries/robots";
import { MARKET_OFFERS, MARKET_OFFER_LABEL, ROBOT_CLASS_LABEL } from "@/config/actors";

export function RobotCard({ robot }: { robot: RobotWithAttributes }) {
  const classLabel = robot.robotClass ? ROBOT_CLASS_LABEL[robot.robotClass] : "Robot";
  const spec = [robot.make, robot.model].filter(Boolean).join(" · ");
  const offers = MARKET_OFFERS.filter((offer) => robot.market[offer]);

  return (
    <Link
      href={`/robots/${robot.id}`}
      className="ui-card-shell block w-full p-4 text-left transition-colors hover:bg-surface-raised md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="truncate text-lg font-medium text-text-primary md:text-xl"
            title={robot.name}
          >
            {robot.name}
          </div>
          <div
            className="mt-1 truncate text-base text-text-secondary"
            title={[classLabel, spec].filter(Boolean).join(" · ")}
          >
            {[classLabel, spec].filter(Boolean).join(" · ")}
          </div>
          {robot.description && (
            <p className="mt-2 line-clamp-2 text-sm text-text-tertiary">{robot.description}</p>
          )}
        </div>
      </div>
      {offers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {offers.map((offer) => (
            <span key={offer} className="ui-tag">
              {MARKET_OFFER_LABEL[offer]}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
