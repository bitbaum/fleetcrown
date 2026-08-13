"use client";

import { APP_LOCALE } from "@/lib/constants";
import { useLocalNow } from "@/hooks/use-local-now";

/**
 * The greeting depends on the READER's clock, which the server does not have.
 *
 * This used to call `new Date()` during render. A "use client" component is
 * still server-rendered for the initial HTML, so the box (UTC) produced the
 * markup and the browser (Europe/Zurich) produced something different on
 * hydration — React #418 on every /today load, which the responsive audit
 * caught at all four viewports. Worse than the warning: the first paint was
 * WRONG, greeting a Zurich evening with "Good afternoon".
 *
 * So the time-derived text is computed after mount (see `useLocalNow`). The
 * server renders a greeting that is true at every hour and a date line held at
 * its final height, which keeps the layout stable through the swap.
 */
function greetingFor(hour: number, name: string): string {
  if (hour < 5) return `Good night, ${name}`;
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  if (hour < 21) return `Good evening, ${name}`;
  return `Good night, ${name}`;
}

export function Greeting({ name }: { name: string }) {
  const now = useLocalNow();

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
        {now ? greetingFor(now.getHours(), name) : `Hello, ${name}`}
      </h1>
      <p className="mt-1 text-base text-text-secondary">
        {now
          ? now.toLocaleDateString(APP_LOCALE, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : /* Non-breaking space holds the line box so the date arriving after
               mount does not shift the cards below it. */
            " "}
      </p>
    </div>
  );
}
