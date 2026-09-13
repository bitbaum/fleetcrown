const DEFAULT_ORANGECAT_ORIGIN = "https://www.orangecat.ch";

function readPublicUrl(name: string, fallback: string): URL {
  const value = process.env[name] ?? fallback;
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

const orangeCatOrigin = readPublicUrl("NEXT_PUBLIC_ORANGECAT_URL", DEFAULT_ORANGECAT_ORIGIN);
const fleetCrownOrigin = readPublicUrl(
  "NEXT_PUBLIC_FLEETCROWN_URL",
  "https://fleetcrown.orangecat.ch",
);
const solonOrigin = readPublicUrl("NEXT_PUBLIC_SOLON_URL", "https://solon.orangecat.ch");

function orangeCatPage(path: string): string {
  return new URL(path, orangeCatOrigin).toString();
}

/**
 * Public cross-product links live here so navigation, support, and project
 * surfaces cannot drift onto different OrangeCat entities.
 */
export const ECOSYSTEM = {
  owner: "Cato",
  orangeCat: {
    title: "OrangeCat",
    projectId:
      process.env.NEXT_PUBLIC_ORANGECAT_PROJECT_ID ?? "cb093f00-8745-4579-98df-050ebfb37181",
    profileUrl: orangeCatPage("/profile/mao-nakamoto"),
    siteUrl: orangeCatOrigin.toString(),
  },
  fleetCrown: {
    title: "FleetCrown",
    projectId:
      process.env.NEXT_PUBLIC_FLEETCROWN_ORANGECAT_PROJECT_ID ??
      "8130c927-114a-45b7-8cc2-99efd5224025",
    siteUrl: fleetCrownOrigin.toString(),
  },
  solon: {
    title: "Solon",
    siteUrl: solonOrigin.toString(),
  },
  support: {
    lightningAddress:
      process.env.NEXT_PUBLIC_ECOSYSTEM_LIGHTNING_ADDRESS ?? "orangecat@getalby.com",
    bitcoinAddress:
      process.env.NEXT_PUBLIC_ECOSYSTEM_BITCOIN_ADDRESS ??
      "bc1q3hh4yklcmwtpnqmxyksw36yedg7zyfy6tzzqwz",
  },
} as const;

export const ECOSYSTEM_LINKS = {
  mao: ECOSYSTEM.orangeCat.profileUrl,
  orangeCat: orangeCatPage(`/projects/${ECOSYSTEM.orangeCat.projectId}`),
  fleetCrown: orangeCatPage(`/projects/${ECOSYSTEM.fleetCrown.projectId}`),
} as const;

/** Backwards-compatible shape for existing FleetCrown money surfaces. */
export const ORANGECAT_INTEGRATION = {
  customer: ECOSYSTEM.fleetCrown.title,
  owner: ECOSYSTEM.owner,
  orangeCat: {
    title: ECOSYSTEM.orangeCat.title,
    projectUrl: ECOSYSTEM_LINKS.orangeCat,
    profile: ECOSYSTEM_LINKS.mao,
  },
  fleetCrown: {
    title: ECOSYSTEM.fleetCrown.title,
    projectUrl: ECOSYSTEM_LINKS.fleetCrown,
    site: ECOSYSTEM.fleetCrown.siteUrl,
  },
  wallet: {
    btc: ECOSYSTEM.support.bitcoinAddress,
    lightning: ECOSYSTEM.support.lightningAddress,
  },
  relation: "FleetCrown is a customer of OrangeCat through the shared entity graph.",
  note: "OrangeCat is the public funding layer; FleetCrown is the building layer.",
} as const;

/**
 * What OrangeCat can do for a FleetCrown operator, in one place.
 *
 * SSOT because two very different consumers say it and must not disagree: the
 * handoff/publish surfaces in `src/components/integrations`, and Loki's
 * capability preface (`src/lib/loki-core.ts`), which is a grounding contract —
 * Loki has been wrong about what a neighbouring system can do before, and the
 * fix each time was to bind it to a fact rather than to prose.
 *
 * NOTE THE BOUNDARY. These are OrangeCat's capabilities, not FleetCrown's and
 * not Loki's. Loki cannot render a video; it can tell the operator where one
 * gets rendered.
 */
export const ORANGECAT_CAPABILITIES = {
  studioUrl: orangeCatPage("/studio"),
  lines: [
    'OrangeCat has a Studio that renders video, music, longform writing and artwork, and revises it from plain-language notes ("the middle drags", "colder light") rather than settings.',
    "Video, music and artwork there run on the operator's own AI provider key; writing runs on OrangeCat's free models.",
    "Work still being made is financed on OrangeCat as a project; finished work is sold as a product, settled in Bitcoin with no platform cut.",
  ],
} as const;
