/**
 * How the assistant stack actually fits together.
 *
 * One product. Four names people confuse. This file is the SSOT so the
 * People page, Loki, and docs cannot tell different stories.
 */
export const ASSISTANT_STACK = {
  fleetcrown: {
    name: "FleetCrown",
    role: "The product — your private book, Control, Today, robots, and the UI you click.",
  },
  loki: {
    name: "Loki",
    role: "The in-app assistant. Talk to your fleet in /loki. It reads this book. It does not send messages until you unfreeze send.",
  },
  openclaw: {
    name: "OpenClaw",
    role: "The local agent workspace — WhatsApp/Telegram contact book, memory files, and the gateway Loki can share a brain with.",
  },
  hermes: {
    name: "Hermes",
    role: "A CLI agent adapter for running tasks. Not your address book. Not Loki.",
  },
} as const;

export const CONTACT_IMPORT_GUIDE = [
  {
    id: "google",
    title: "Google Contacts (best for emails)",
    how: "contacts.google.com → Export → Google CSV → Import address book on this page.",
  },
  {
    id: "apple",
    title: "Apple Contacts",
    how: "Select people → File → Export vCard → Import address book.",
  },
  {
    id: "openclaw",
    title: "OpenClaw book (already here)",
    how: "WhatsApp names and aliases from your OpenClaw workspace. Sync to pull any new ones.",
  },
] as const;
