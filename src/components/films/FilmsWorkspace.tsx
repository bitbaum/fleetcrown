"use client";

import Link from "next/link";
import { Clapperboard } from "lucide-react";
import {
  FILM_STATUS_HINT,
  FILM_STATUS_LABEL,
  FILM_STATUS_TONE,
  formatRuntime,
} from "@/config/film";
import type { FilmRow } from "@/db/queries/films";
import { NewFilmButton } from "./NewFilmButton";

/**
 * The film list.
 *
 * One line per film answering the only question worth asking from here: how far
 * from finished is it. "18 of 24 shots" is that answer; a status word alone is
 * not, because "shooting" covers both the first clip and the second-to-last.
 */
export function FilmsWorkspace({ films }: { films: FilmRow[] }) {
  if (films.length === 0) {
    return (
      <div className="ui-empty-panel">
        <Clapperboard className="h-8 w-8" aria-hidden />
        <div className="ui-empty-title">No films yet</div>
        <p className="ui-empty-helper max-w-md text-center">
          Write the screenplay first. It gets broken into scenes, then into shots short enough for a
          video model to actually render, and the clips go back together in order.
        </p>
        <NewFilmButton triggerLabel="Start a film" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewFilmButton />
      </div>
      <div className="space-y-2">
        {films.map((film) => (
          <Link key={film.id} href={`/films/${film.id}`} className="ui-panel-interactive block">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base text-text-primary">{film.title}</span>
              <span className={`ui-tag-${FILM_STATUS_TONE[film.status]}`}>
                {FILM_STATUS_LABEL[film.status]}
              </span>
              <span className="ml-auto text-sm text-text-tertiary">
                {film.shotCount > 0
                  ? `${film.readyShotCount}/${film.shotCount} shots · ${formatRuntime(film.plannedRuntimeSeconds)}`
                  : FILM_STATUS_HINT[film.status]}
              </span>
            </div>
            {film.logline && (
              <p className="mt-1 text-sm text-text-secondary line-clamp-2">{film.logline}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
