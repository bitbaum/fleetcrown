import { redirect } from "next/navigation";

export default async function DigestsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; project?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.window) qs.set("window", params.window);
  if (params.project) qs.set("project", params.project);
  const tail = qs.toString();
  redirect(tail ? `/activity?${tail}` : "/activity");
}
