import Link from "next/link";
import { BookOpen, Compass, Rss } from "lucide-react";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { listThoughts } from "@/lib/thoughts-content";

export default function ThoughtNotFound() {
  const articles = listThoughts();
  const latest = articles.slice(0, 5);

  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <div className="relative z-10 mx-auto max-w-3xl space-y-8 px-6 pb-24 pt-16 sm:px-10">
        <div className="ui-card-shell-raised flex flex-col items-center gap-4 px-8 py-10 text-center">
          <Compass className="h-12 w-12 text-text-muted" aria-hidden />
          <h1 className="text-2xl font-medium text-text-primary">Essay not found</h1>
          <p className="max-w-lg text-base leading-relaxed text-text-secondary md:text-lg">
            That slug is not in the library yet. If you followed a fresh link, the deploy may still
            be rolling out — check again in a minute, or browse what is live below.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Link href="/thoughts" className="ui-btn-primary inline-flex items-center gap-2 px-5 py-2.5">
              <BookOpen className="h-4 w-4" aria-hidden />
              All essays
            </Link>
            <a href="/rss.xml" className="ui-btn-chip inline-flex items-center gap-1.5">
              <Rss className="h-3.5 w-3.5" aria-hidden />
              RSS
            </a>
          </div>
        </div>

        {latest.length > 0 && (
          <section className="ui-card-shell space-y-4 p-6">
            <h2 className="text-lg font-medium text-text-primary">Latest in the library</h2>
            <ul className="space-y-3">
              {latest.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={`/thoughts/${article.slug}`}
                    className="block rounded-lg px-3 py-2 transition-colors hover:bg-surface-raised"
                  >
                    <div className="font-medium text-text-primary">{article.title}</div>
                    {article.summary && (
                      <p className="mt-1 text-sm text-text-secondary line-clamp-2">{article.summary}</p>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      {article.publishedAt} · {article.readingTimeMin} min
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PublicSurface>
  );
}
