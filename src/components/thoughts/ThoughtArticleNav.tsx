import Link from "next/link";
import type { ThoughtMeta } from "@/lib/thoughts-content";

export function ThoughtArticleNav({
  previous,
  next,
  related,
}: {
  previous: (ThoughtMeta & { body: string }) | null;
  next: (ThoughtMeta & { body: string }) | null;
  related: Array<ThoughtMeta & { body: string }>;
}) {
  return (
    <div className="space-y-4">
      {(previous || next) && (
        <div className="grid gap-4 md:grid-cols-2">
          {next ? (
            <Link href={`/thoughts/${next.slug}`} className="ui-card-shell-raised block space-y-2 p-5 transition hover:bg-surface-raised">
              <div className="ui-kicker">Newer</div>
              <h3 className="text-lg font-medium text-text-primary">{next.title}</h3>
              <p className="text-sm text-text-secondary">{next.summary}</p>
            </Link>
          ) : <div />}
          {previous ? (
            <Link href={`/thoughts/${previous.slug}`} className="ui-card-shell-raised block space-y-2 p-5 transition hover:bg-surface-raised">
              <div className="ui-kicker">Older</div>
              <h3 className="text-lg font-medium text-text-primary">{previous.title}</h3>
              <p className="text-sm text-text-secondary">{previous.summary}</p>
            </Link>
          ) : <div />}
        </div>
      )}

      {related.length > 0 && (
        <div className="ui-card-shell-raised space-y-4 p-5 md:p-6">
          <div className="ui-kicker">Related</div>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((article) => (
              <Link key={article.slug} href={`/thoughts/${article.slug}`} className="ui-card-shell block space-y-2 p-4 transition hover:bg-surface-raised">
                <h3 className="text-base font-medium text-text-primary">{article.title}</h3>
                <p className="text-sm text-text-secondary">{article.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
