import { auth } from "@/auth";
import { DEFAULT_USER_ID, DEFAULT_USER_NAME } from "@/lib/constants";

export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  return session?.user?.id ?? DEFAULT_USER_ID;
}

export async function getCurrentUserName(): Promise<string> {
  const session = await auth();
  return session?.user?.name ?? DEFAULT_USER_NAME;
}
