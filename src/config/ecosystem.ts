const DEFAULT_ORANGECAT_ORIGIN = "https://www.orangecat.ch";

function readPublicUrl(name: string, fallback: string): URL {
  const value = process.env[name] ?? fallback;
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

const orangeCatOrigin = readPublicUrl(
  "NEXT_PUBLIC_ORANGECAT_URL",
  DEFAULT_ORANGECAT_ORIGIN,
);
const fleetCrownOrigin = readPublicUrl(
  "NEXT_PUBLIC_FLEETCROWN_URL",
  "https://fleetcrown.orangecat.ch",
);

function orangeCatPage(path: string): string {
  return new URL(path, orangeCatOrigin).toString();
}

/**
 * Public cross-product links live here so navigation, support, and project
 * surfaces cannot drift onto different OrangeCat entities.
 */
export const ECOSYSTEM = {
  owner: "Mao Nakamoto",
  orangeCat: {
    title: "OrangeCat",
    projectId:
      process.env.NEXT_PUBLIC_ORANGECAT_PROJECT_ID ??
      "cb093f00-8745-4579-98df-050ebfb37181",
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
  support: {
    lightningAddress:
      process.env.NEXT_PUBLIC_ECOSYSTEM_LIGHTNING_ADDRESS ??
      "orangecat@getalby.com",
    bitcoinAddress:
      process.env.NEXT_PUBLIC_ECOSYSTEM_BITCOIN_ADDRESS ??
      "bc1q3hh4yklcmwtpnqmxyksw36yedg7zyfy6tzzqwz",
  },
} as const;

/** Public page for any OrangeCat project id — one definition, so surfaces that
 *  link to a published project cannot disagree about the URL shape. */
export function orangeCatProjectUrl(projectId: string): string {
  return orangeCatPage(`/projects/${projectId}`);
}

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
