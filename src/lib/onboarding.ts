import { normalizeUsername } from "@/lib/username";

/** Suggest a handle from OAuth name or email local-part. */
export function suggestUsername(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  if (name?.trim()) {
    const fromName = normalizeUsername(name.trim().replace(/\s+/g, "-"));
    if (fromName.length >= 2) return fromName.slice(0, 40);
  }
  if (email?.trim()) {
    const local = email.split("@")[0] ?? "";
    const fromEmail = normalizeUsername(local);
    if (fromEmail.length >= 2) return fromEmail.slice(0, 40);
  }
  return "";
}

export function hasValidUsername(username: string | null | undefined): boolean {
  if (!username?.trim()) return false;
  const normalized = normalizeUsername(username);
  return normalized.length >= 2 && /^[a-z0-9-]+$/.test(normalized);
}

export function isOnboardingComplete(user: {
  username: string | null | undefined;
  onboardedAt: Date | null | undefined;
}): boolean {
  return user.onboardedAt != null && hasValidUsername(user.username);
}
