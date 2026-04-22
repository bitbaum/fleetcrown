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
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{greeting}</h1>
      <p className="text-sm md:text-base text-white/40 mt-1">
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
