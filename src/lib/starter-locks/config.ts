/** Which starter ships a resolved lockfile, and under what path. One place so
 *  the generator, the template map and the drift test cannot disagree. */
export const STARTER_LOCK_TEMPLATE = "nextjs-tailwind" as const;
export const STARTER_LOCK_FILE = "pnpm-lock.yaml";
