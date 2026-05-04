"use client";

import { APP_LOCALE } from "@/lib/constants";

export function Greeting({ name }: { name: string }) {
  const now = new Date();
  const hour = now.getHours();

  let greeting: string;
  if (hour < 5) greeting = `Good night, ${name}`;
  else if (hour < 12) greeting = `Good morning, ${name}`;
  else if (hour < 17) greeting = `Good afternoon, ${name}`;
  else if (hour < 21) greeting = `Good evening, ${name}`;
  else greeting = `Good night, ${name}`;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">{greeting}</h1>
      <p className="mt-1 text-base text-text-secondary">
        {now.toLocaleDateString(APP_LOCALE, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
    </div>
  );
}
