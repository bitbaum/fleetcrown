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
    title: "Google Contacts (best — company, title, phone, email)",
    how: "contacts.google.com → Export → Google CSV → Import address book. Picking the file writes it. No 3,000 accept clicks.",
  },
  {
    id: "apple",
    title: "Apple Contacts",
    how: "Select people → File → Export vCard → Import address book.",
  },
  {
    id: "openclaw",
    title: "OpenClaw book",
    how: "WhatsApp/Telegram names already here, plus notes from the workspace. Sync writes new fields onto matching people.",
  },
] as const;
