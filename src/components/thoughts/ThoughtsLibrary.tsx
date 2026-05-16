"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, BookOpen } from "lucide-react";
import type { ThoughtMeta } from "@/lib/thoughts-content";

type ThoughtArticle = ThoughtMeta & { body: string };

function formatMeta(article: ThoughtArticle) {
  const parts = [article.publishedAt, `${article.readingTimeMin} min`].filter(Boolean);
  return parts.join(" · ");
}

export function ThoughtsLibrary({
  articles,
  tags,
}: {
  articles: ThoughtArticle[];
  tags: string[];
}) {
  const featured = articles.find((article) => article.featured) ?? articles[0] ?? null;
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (activeTag !== "all" && !article.tags.includes(activeTag)) return false;
      if (!normalized) return true;
      const haystack = [article.title, article.summary, article.excerpt, article.tags.join(" ")]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [activeTag, articles, query]);

  const featuredVisible =
    featured && filtered.some((a) => a.slug === featured.slug) ? featured : null;
  const rest = filtered.filter((a) => a.slug !== featuredVisible?.slug);

  return (
    <div className="space-y-6">
      {/* Featured essay — leads the page, first thing visible */}
      {featuredVisible && (
        <Link
          href={`/thoughts/${featuredVisible.slug}`}
          className="ui-card-shell-raised block space-y-4 p-6 transition hover:bg-surface-raised md:p-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-kicker">Featured</span>
            <span className="ui-badge">{formatMeta(featuredVisible)}</span>
          </div>
          <h2 className="text-2xl font-medium leading-tight text-text-primary md:text-3xl">
            {featuredVisible.title}
          </h2>
          <p className="text-base leading-relaxed text-text-secondary md:text-lg">
            {featuredVisible.excerpt}
          </p>
          <div className="flex flex-wrap gap-2">
            {featuredVisible.tags.map((tag) => (
              <span key={tag} className="ui-tag ui-tag-neutral">
                {tag}
              </span>
            ))}
          </div>
        </Link>
      )}

      {/* Search + count + horizontal-scroll tag strip */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search essays"
              className="ui-input pl-12"
            />
          </div>
          <span className="shrink-0 text-sm text-text-tertiary">
            {filtered.length} of {articles.length}
          </span>
        </div>

        {/* Single scrollable row — no wrapping */}
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTag("all")}
            className={`shrink-0 ${activeTag === "all" ? "ui-chip-filter-active" : "ui-chip-filter"}`}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`shrink-0 ${activeTag === tag ? "ui-chip-filter-active" : "ui-chip-filter"}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ui-empty-panel py-12 text-text-secondary">
          <BookOpen className="h-8 w-8 text-text-tertiary" />
          <div className="text-lg text-text-primary">No essays match this filter</div>
          <p className="max-w-md text-sm text-text-tertiary">
            Try a broader search or switch topics.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rest.map((article) => (
            <Link
              key={article.slug}
              href={`/thoughts/${article.slug}`}
              className="ui-card-shell-raised block space-y-2 p-5 transition hover:bg-surface-raised md:p-6"
            >
              <span className="ui-badge">{formatMeta(article)}</span>
              <h3 className="text-xl font-medium text-text-primary">{article.title}</h3>
              <p className="text-sm text-text-secondary">{article.summary}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
