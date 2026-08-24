/**
 * The other public sites this fleet builds and runs.
 *
 * Why this exists: Atlas measured the fleet's own link graph and found 13 of 15
 * live sites with no inbound link from anywhere else on the fleet — each one
 * reachable only by someone who already knew its URL. Atlas could name them but
 * not fix them. This list is the fix: one real, crawlable anchor per site.
 *
 * It renders in the PUBLIC FOOTER, on the homepage, deliberately. The Atlas
 * probe reads outbound links from the requested page only, so a list parked on
 * a sub-page would close the gap in appearance while leaving it open in fact —
 * and a search crawler treats the two the same way.
 *
 * Hand-maintained rather than read from `user_projects`: this is FleetCrown's
 * own editorial statement about the fleet it runs, shown identically to every
 * visitor. The project table is per-user, so deriving this would put one
 * account's private registry on a page that every account shares.
 *
 * `name` and `blurb` are each site's OWN words, taken from the title and
 * meta description it serves. Nothing here describes a site in terms it does
 * not use about itself.
 */

export type FleetSite = {
  /** The site's own name, as it titles itself. */
  name: string;
  url: string;
  /** One line, condensed from the site's own meta description. */
  blurb: string;
};

/**
 * Ordered by name. FleetCrown itself is absent on purpose — a site does not
 * need a link to where the reader already is.
 */
export const FLEET_SITES: readonly FleetSite[] = [
  {
    name: "OrangeCat",
    url: "https://orangecat.ch",
    blurb: "Fund, lend, invest, and coordinate with any identity.",
  },
  {
    name: "WG Zuhause",
    url: "https://aoz-wohnen.orangecat.ch",
    blurb: "Gemeinsam wohnen — kompatibilitätsbasierte Wohnplatzierung.",
  },
  {
    name: "Botsmann",
    url: "https://botsmann.orangecat.ch",
    blurb: "Private AI that works with your own documents.",
  },
  {
    name: "DataCat",
    url: "https://datacat.orangecat.ch",
    blurb: "KI-gestützter Formular-Editor für jede Branche.",
  },
  {
    name: "evig",
    // revampit.orangecat.ch 301s here; link the canonical host directly so the
    // registry does not depend on a redirect it does not own.
    url: "https://evig.orangecat.ch",
    blurb: "Refurbished IT kaufen und Reparaturwerkstätten finden.",
  },
  {
    name: "Kivvi",
    url: "https://kivvi.orangecat.ch",
    blurb: "Open-Source-ERP für Kreislaufbetriebe.",
  },
  {
    name: "Petvity",
    url: "https://petvity.orangecat.ch",
    blurb: "Track your pet's health, vets, sitters and essentials.",
  },
  {
    name: "PrintCraft",
    url: "https://printcraft.orangecat.ch",
    blurb: "Turn photos into artwork printed on real surfaces.",
  },
  {
    name: "Reparaturbonus Zürich",
    url: "https://reparaturbonus.orangecat.ch",
    blurb: "Werkstatt finden und den Reparaturbonus der Stadt nutzen.",
  },
  {
    name: "Revamp-IT",
    url: "https://revamp-info.orangecat.ch",
    blurb: "Transparentes Fundraising: Finanzen, Wirkung, Strategie.",
  },
  {
    name: "Nordbahn Lost & Found",
    url: "https://sbb.orangecat.ch",
    blurb: "Verlorene Gegenstände melden — Konzeptdemo.",
  },
  {
    name: "Solon",
    url: "https://solon.orangecat.ch",
    blurb: "Bitcoin-native governance for the digital age.",
  },
  {
    name: "Surf Your Life",
    url: "https://surf-your-life.orangecat.ch",
    blurb: "Psychiatry-led burnout recovery in Zürich.",
  },
  {
    name: "Vita",
    url: "https://vitareba.orangecat.ch",
    blurb: "Metabolische Psychiatrie und systemische Longevity, Zürich.",
  },
] as const;
