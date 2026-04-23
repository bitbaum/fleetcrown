/**
 * SSOT for subscription metadata that isn't in the DB.
 * Verify links, cancel links, free alternatives, and valid field values.
 */

export const VALID_FREQUENCIES = ["monthly", "annual", "quarterly", "weekly", "one-time"] as const;
export type SubscriptionFrequency = typeof VALID_FREQUENCIES[number];

/** Named frequency constants — use these for comparisons to avoid typos */
export const FREQUENCY = {
  MONTHLY:   "monthly",
  ANNUAL:    "annual",
  QUARTERLY: "quarterly",
  WEEKLY:    "weekly",
  ONE_TIME:  "one-time",
} as const satisfies Record<string, SubscriptionFrequency>;

export const VALID_CURRENCIES = ["CHF", "USD", "EUR", "GBP"] as const;
export type SubscriptionCurrency = typeof VALID_CURRENCIES[number];

export type SubscriptionMeta = {
  verifyUrl: string;
  cancelUrl: string;
  alternatives: string[];
  essential: boolean; // true = you probably need this
};

export const SUBSCRIPTION_META: Record<string, SubscriptionMeta> = {
  "Claude Max": {
    verifyUrl: "https://claude.ai/settings/billing",
    cancelUrl: "https://claude.ai/settings/billing",
    alternatives: ["Claude Free tier", "OpenRouter (pay-per-use)", "Self-hosted LLM (Ollama)"],
    essential: true,
  },
  "Salt Mobile": {
    verifyUrl: "https://www.salt.ch/en/my-account",
    cancelUrl: "https://www.salt.ch/en/my-account",
    alternatives: ["Yallo (from 15 CHF/mo)", "Wingo (from 25 CHF/mo)", "Lidl Connect (from 9 CHF/mo)"],
    essential: true,
  },
  "Grok xAI": {
    verifyUrl: "https://grok.com/settings",
    cancelUrl: "https://grok.com/settings",
    alternatives: ["X Free tier (limited Grok)", "Claude (already paying)", "ChatGPT Free"],
    essential: false,
  },
  "Google Cloud Platform": {
    verifyUrl: "https://console.cloud.google.com/billing",
    cancelUrl: "https://console.cloud.google.com/billing",
    alternatives: ["Vercel Free (already using)", "Fly.io Free tier", "Railway Free tier"],
    essential: false,
  },
  "SoundCloud Go+": {
    verifyUrl: "https://soundcloud.com/settings/account",
    cancelUrl: "https://soundcloud.com/settings/account",
    alternatives: ["SoundCloud Free", "Spotify Free", "YouTube Music Free"],
    essential: false,
  },
  "ChatGPT Plus": {
    verifyUrl: "https://chat.openai.com/account/subscription",
    cancelUrl: "https://chat.openai.com/account/subscription",
    alternatives: ["ChatGPT Free", "Claude (already paying)", "Grok Free on X"],
    essential: false,
  },
  "YouTube Premium": {
    verifyUrl: "https://www.youtube.com/paid_memberships",
    cancelUrl: "https://www.youtube.com/paid_memberships",
    alternatives: ["YouTube Free + uBlock Origin", "NewPipe (Android)", "FreeTube (Desktop)"],
    essential: false,
  },
  "Cursor Pro": {
    verifyUrl: "https://www.cursor.com/settings",
    cancelUrl: "https://www.cursor.com/settings",
    alternatives: ["Claude Code CLI (already have)", "VS Code + Copilot Free", "Cursor Free tier"],
    essential: false,
  },
  "iCloud Storage": {
    verifyUrl: "https://www.icloud.com/settings/",
    cancelUrl: "https://support.apple.com/en-us/108052",
    alternatives: ["Google Drive 15GB free", "Proton Drive free", "Local backup"],
    essential: false,
  },
  "Algoriddim djay": {
    verifyUrl: "https://www.algoriddim.com/support",
    cancelUrl: "https://support.apple.com/en-us/118428",
    alternatives: ["Mixxx (free, open source)", "VirtualDJ Free"],
    essential: false,
  },
};
