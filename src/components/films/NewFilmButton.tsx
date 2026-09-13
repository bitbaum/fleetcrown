"use client";

import { useRouter } from "next/navigation";
import { useAiForm } from "@fleet/ai-forms/react";
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO } from "@/config/film";
import { FILM_FORM } from "@/config/ai-forms";
import { postJson } from "@/lib/api/fetch";
import { Field } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";

/**
 * Start a film from an idea.
 *
 * Deliberately short: a title and a premise are enough to get a screenplay
 * written. Everything else — the look, the runtime, the clip ceiling — has a
 * working default and can be changed on the film itself, where the operator can
 * see what changing it did.
 */
export function NewFilmButton({ triggerLabel = "New film" }: { triggerLabel?: string }) {
  const router = useRouter();
  const form = useAiForm({ target: FILM_FORM.key, fields: FILM_FORM.fields });
  const { create, saving, error, setError } = useCreateMutation<
    Record<string, unknown>,
    { film?: { id: string } }
  >({
    request: (body) => postJson("/api/films", body),
    errorLabel: "film",
    // Straight into the new film: the next thing to do is write the screenplay,
    // and that lives on the detail page.
    onCreated: (data) => {
      if (data.film?.id) router.push(`/films/${data.film.id}`);
    },
  });

  const runtime = Number(form.text("targetRuntimeSeconds"));

  return (
    <ModalForm
      triggerLabel={triggerLabel}
      title="New film"
      submitLabel="Create film"
      savingLabel="Creating…"
      size="md"
      canSubmit={form.text("title").trim().length >= 2}
      saving={saving}
      error={error}
      onSubmit={() =>
        create({
          title: form.text("title").trim(),
          logline: form.text("logline").trim() || undefined,
          premise: form.text("premise").trim() || undefined,
          styleBible: form.text("styleBible").trim() || undefined,
          aspectRatio: form.text("aspectRatio") || undefined,
          targetRuntimeSeconds: Number.isFinite(runtime) && runtime > 0 ? runtime : undefined,
        })
      }
      onReset={() => {
        form.reset();
        setError(null);
      }}
      assist={form}
      assistPlaceholder="Describe the film and I'll fill this in…"
    >
      <Field label="Title" required aiTouched={form.isAiTouched("title")}>
        <input
          value={form.text("title")}
          onChange={(e) => form.setValue("title", e.target.value)}
          placeholder="e.g. The Letter"
          autoFocus
          className="ui-input"
        />
      </Field>

      <Field label="Logline" aiTouched={form.isAiTouched("logline")}>
        <input
          value={form.text("logline")}
          onChange={(e) => form.setValue("logline", e.target.value)}
          placeholder="One sentence: who wants what, and what's in the way"
          className="ui-input"
        />
      </Field>

      <Field label="Premise" aiTouched={form.isAiTouched("premise")}>
        <textarea
          value={form.text("premise")}
          onChange={(e) => form.setValue("premise", e.target.value)}
          placeholder="The idea, in prose. The screenplay gets written from this."
          rows={4}
          className="ui-input resize-none"
        />
      </Field>

      <Field
        label="Look & style — repeated in every shot prompt"
        aiTouched={form.isAiTouched("styleBible")}
      >
        <textarea
          value={form.text("styleBible")}
          onChange={(e) => form.setValue("styleBible", e.target.value)}
          placeholder="e.g. 16mm grain, cold daylight, muted palette, anamorphic flares"
          rows={2}
          className="ui-input resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Aspect ratio" aiTouched={form.isAiTouched("aspectRatio")}>
          <select
            value={form.text("aspectRatio") || DEFAULT_ASPECT_RATIO}
            onChange={(e) => form.setValue("aspectRatio", e.target.value)}
            className="ui-input"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Target runtime (s)" aiTouched={form.isAiTouched("targetRuntimeSeconds")}>
          <input
            type="number"
            min={1}
            value={form.text("targetRuntimeSeconds")}
            onChange={(e) => form.setValue("targetRuntimeSeconds", e.target.value)}
            placeholder="90"
            className="ui-input"
          />
        </Field>
      </div>
    </ModalForm>
  );
}
