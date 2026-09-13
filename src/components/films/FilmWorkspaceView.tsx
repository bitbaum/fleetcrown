"use client";

import { useCallback, useMemo, useState } from "react";
import { FILM_STATUS_LABEL, FILM_STATUS_TONE, formatRuntime, isUsableShot } from "@/config/film";
import { getJson } from "@/lib/api/fetch";
import type { Film, FilmScene, FilmShot } from "@/db/schema";
import { AssemblyPanel } from "./AssemblyPanel";
import { ScreenplayPanel } from "./ScreenplayPanel";
import { ShotCard, type ShotScene } from "./ShotCard";

const NO_SCENE: ShotScene = { heading: null, location: null, timeOfDay: null, synopsis: null };

/**
 * One film, in the order the work actually happens: screenplay at the top,
 * the shots it was cut into below, and the assembly last.
 *
 * The shot list is grouped by scene because that is the unit that shares a
 * setting — when eleven shots all look wrong in the same way, the fix is one
 * scene's location, not eleven prompts.
 */
export function FilmWorkspaceView({
  initialFilm,
  initialScenes,
  initialShots,
}: {
  initialFilm: Film;
  initialScenes: FilmScene[];
  initialShots: FilmShot[];
}) {
  const [film, setFilm] = useState(initialFilm);
  const [scenes, setScenes] = useState(initialScenes);
  const [shots, setShots] = useState(initialShots);

  const refresh = useCallback(async () => {
    const data = await getJson<{ film: Film; scenes: FilmScene[]; shots: FilmShot[] }>(
      `/api/films/${initialFilm.id}`,
    ).catch(() => null);
    if (!data) return;
    setFilm(data.film);
    setScenes(data.scenes);
    setShots(data.shots);
  }, [initialFilm.id]);

  const onShotChanged = useCallback((updated: FilmShot) => {
    setShots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const grouped = useMemo(() => {
    const byScene = new Map<string, FilmShot[]>();
    const loose: FilmShot[] = [];
    for (const shot of shots) {
      if (!shot.sceneId) loose.push(shot);
      else byScene.set(shot.sceneId, [...(byScene.get(shot.sceneId) ?? []), shot]);
    }
    return { byScene, loose };
  }, [shots]);

  const ready = shots.filter((s) => isUsableShot(s.status, s.clipUrl)).length;
  const runtime = shots.reduce((sum, s) => sum + s.durationSeconds, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`ui-tag-${FILM_STATUS_TONE[film.status]}`}>
          {FILM_STATUS_LABEL[film.status]}
        </span>
        {shots.length > 0 && (
          <span className="text-sm text-text-secondary">
            {ready}/{shots.length} shots have clips · {formatRuntime(runtime)} · {scenes.length}{" "}
            scene{scenes.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto text-sm text-text-tertiary">{film.aspectRatio}</span>
      </div>

      {film.logline && <p className="text-base text-text-secondary">{film.logline}</p>}

      <ScreenplayPanel
        film={film}
        shotCount={shots.length}
        onFilmChanged={setFilm}
        onBrokenDown={refresh}
      />

      {shots.length > 0 && (
        <div className="space-y-5">
          {scenes.map((scene) => {
            const sceneShots = grouped.byScene.get(scene.id) ?? [];
            if (sceneShots.length === 0) return null;
            return (
              <section key={scene.id} className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="ui-micro-label">
                    {scene.heading ??
                      [scene.location, scene.timeOfDay].filter(Boolean).join(" — ") ??
                      `Scene ${scene.ordinal}`}
                  </h2>
                  <span className="text-sm text-text-tertiary">
                    {sceneShots.length} shot{sceneShots.length === 1 ? "" : "s"}
                  </span>
                </div>
                {scene.synopsis && <p className="text-sm text-text-secondary">{scene.synopsis}</p>}
                <div className="space-y-3">
                  {sceneShots.map((shot) => (
                    <ShotCard
                      key={shot.id}
                      filmId={film.id}
                      shot={shot}
                      scene={scene}
                      film={film}
                      onChanged={onShotChanged}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {grouped.loose.length > 0 && (
            <section className="space-y-3">
              <h2 className="ui-micro-label">Unplaced shots</h2>
              {grouped.loose.map((shot) => (
                <ShotCard
                  key={shot.id}
                  filmId={film.id}
                  shot={shot}
                  scene={NO_SCENE}
                  film={film}
                  onChanged={onShotChanged}
                />
              ))}
            </section>
          )}

          <AssemblyPanel filmId={film.id} />
        </div>
      )}
    </div>
  );
}
