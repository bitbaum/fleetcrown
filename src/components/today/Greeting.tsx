"use client";

import { DEFAULT_USER_NAME } from "@/lib/constants";

export function Greeting() {
  const now = new Date();
  const hour = now.getHours();

  let greeting: string;
  if (hour < 5) greeting = `Good night, ${DEFAULT_USER_NAME}`;
  else if (hour < 12) greeting = `Good morning, ${DEFAULT_USER_NAME}`;
  else if (hour < 17) greeting = `Good afternoon, ${DEFAULT_USER_NAME}`;
  else if (hour < 21) greeting = `Good evening, ${DEFAULT_USER_NAME}`;
  else greeting = `Good night, ${DEFAULT_USER_NAME}`;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">{greeting}</h1>
      <p className="mt-1 text-base text-text-secondary">
        {now.toLocaleDateString("en-CH", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
    </div>
  );
}
