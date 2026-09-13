# Films: screenplay → clips → film

**SSOT for the constants:** `src/config/film.ts`
**The slicer:** `src/lib/film/slice.ts` · **Tests:** `scripts/test/film-slice.ts`

## The problem this exists for

Generative video models cap a single generation at a few seconds. So a
90-second short is never one render — it is a dozen renders that have to agree
with each other about what the room looks like and where everyone is standing.

Writing the film as one prompt and hoping does not work. Writing it as a
screenplay and cutting the screenplay into clip-sized pieces does.

```
premise ──▶ screenplay ──▶ scenes ──▶ beats ──▶ SHOTS ──▶ prompts ──▶ clips ──▶ cut
         AI            AI                    arithmetic   pure       you       ffmpeg
```

## The division of labour

Everything a model is asked to do is a **judgement**. Everything mechanical is
**arithmetic**. The line between them is the whole design.

| Step | Who | Why |
|---|---|---|
| Premise → screenplay | model | Writing is judgement. |
| Screenplay → scenes + beats | model | Where a camera setup changes is judgement. |
| Beats → shots under the ceiling | **code** | The ceiling is a hard constraint. |
| Shot → generation prompt | **code** | Must be identical every time. |
| Shots → edit list + manifest | **code** | Arithmetic on a timeline. |

**The model is never asked to respect the clip limit.** Ask an LLM for "shots
under eight seconds" and it hands back a nine-second shot often enough to
matter — and a nine-second shot is not slightly wrong, it is a render that
fails or truncates a line mid-word. So the prompt asks for beats at a *natural*
length and says they will be cut to fit; `planShots()` does the cutting, on the
way into the database, so a shot that cannot be rendered cannot be stored.

## What the slicer gets right

1. **Even splits, never a runt.** Greedy splitting of a 25s beat at an 8s
   ceiling gives `8 / 8 / 8 / 1`, and that one-second clip is a flicker, not a
   shot. Four 6.25s shots is the same 25 seconds and four usable clips.
2. **Speech sets the floor.** A beat whose line takes nine seconds to say
   cannot be a six-second shot. Duration is raised to fit the dialogue
   (`WORDS_PER_SECOND`, plus a breath either side) *before* the beat is sliced.
3. **Dialogue travels with the split.** Split a beat with a line and the line
   is split too, at a sentence boundary. Otherwise both clips are generated
   with the whole speech in the prompt and the line is delivered twice.
4. **Continuity is written, not hoped for.** Every piece after the first is
   told to open on exactly the frame the previous one closed on.

## The clip ceiling is configuration

`FILM_MAX_CLIP_SECONDS` (default 8) — see `.env.example`. When a model raises
its limit, change the env var and re-run the breakdown; nothing in the codebase
needs editing.

Each film stores `max_clip_seconds` as a **snapshot** of the ceiling its shots
were sliced against. Raising the env var must not silently invalidate the shot
list of a film that is already half-generated, so adopting a new ceiling is an
explicit re-breakdown.

## Why every prompt repeats itself

A video model sees one shot and nothing else. It does not remember the clip
before it. So the film's look, the location, and the time of day are restated
in *every* prompt — from stored fields, so the phrasing is byte-identical
across forty shots. That is what `styleBible` on the film is for, and why
changing it is one edit rather than forty.

`promptOverride` on a shot beats the composed prompt, always. Someone who has
watched a take fail knows something the composer does not.

## Assembly

`/api/films/<id>/assembly` returns text and only text: the timeline, an ffmpeg
concat manifest, and the commands to run. **Nothing on the server runs ffmpeg
or fetches a clip** — the clips live wherever the operator put them, and a
server shelling out over user-supplied paths is a server with a
command-injection hole in it.

The manifest references *derived* file names (`shot-007.mp4`), never stored
URLs. That sidesteps the injection surface entirely and doubles as instructions:
it tells the operator what to save each download as.

An incomplete film still produces a manifest — a rough cut of the 38 shots you
have is useful while you wait on the other two — but it is labelled `ROUGH CUT`
and names what is missing. A rough cut that looks finished is the one failure
mode of that panel that costs real time.

## Demo sandbox

`films` is a demo-safe family (own tenant rows, nothing rendered or uploaded).
The two routes that spend model credit — `screenplay` and `breakdown` — carry
their own `denyDemoInHandler` call, for the same reason crew's publish route
does. See `src/config/demo.ts`.

## Not built

Clip generation itself. Shots carry a `clip_url` the operator fills in; no
provider is called and no key is required. The seam is `film_shots.clip_url`
plus `SHOT_STATUS` — a generator would write those two fields and nothing else
would change.
