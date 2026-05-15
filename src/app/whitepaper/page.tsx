import fs from "fs";
import path from "path";
import Link from "next/link";
import type { Metadata } from "next";
import { PublicSurface } from "@/components/public/PublicSurface";
import { parseThoughtBlocks } from "@/lib/thoughts-content";

export const metadata: Metadata = {
  title: "Whitepaper — Cockpit",
  description: "A technical architecture for sustained autonomous execution across many projects simultaneously.",
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: raw };
  const header = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body };
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export default function WhitepaperPage() {
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "whitepaper.md"), "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const blocks = parseThoughtBlocks(body);
  const title = meta.title ?? "Whitepaper";
  const subtitle = meta.subtitle ?? "";
  const version = meta.version ?? "0.1";
  const publishedAt = meta.publishedAt ?? "";

  return (
    <PublicSurface
      right={(
        <Link href="/sign-in" className="ui-public-nav-action">
          Get started →
        </Link>
      )}
    >
      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-32 pt-16 sm:px-10">
        {/* Header */}
        <div className="mb-16 border-b border-white/[0.08] pb-12">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-1 font-mono text-xs text-white/40">
              WHITEPAPER
            </span>
            <span className="font-mono text-xs text-white/25">v{version}</span>
            {publishedAt && (
              <span className="font-mono text-xs text-white/25">{publishedAt}</span>
            )}
          </div>
          <h1 className="mb-5 font-bold tracking-tight text-white" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-lg leading-relaxed text-white/40 sm:text-xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Body */}
        <article className="space-y-8">
          {blocks.map((block, i) => {
            switch (block.type) {
              case "h2":
                return (
                  <h2 key={i} className="pt-6 text-2xl font-semibold tracking-tight text-white/90" style={{ letterSpacing: "-0.02em" }}>
                    {block.text}
                  </h2>
                );
              case "h3":
                return (
                  <h3 key={i} className="pt-2 text-lg font-semibold text-white/80">
                    {block.text}
                  </h3>
                );
              case "p":
                return (
                  <p
                    key={i}
                    className="text-base leading-[1.8] text-white/50"
                    dangerouslySetInnerHTML={{ __html: renderInline(block.text) }}
                  />
                );
              case "blockquote":
                return (
                  <blockquote key={i} className="border-l-2 border-white/20 pl-6">
                    {block.text.map((line, j) => (
                      <p key={j} className="text-base italic leading-relaxed text-white/35">{line}</p>
                    ))}
                  </blockquote>
                );
              case "ul":
                return (
                  <ul key={i} className="space-y-2 pl-4">
                    {block.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-3 text-base leading-relaxed text-white/45">
                        <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-white/25" />
                        <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                      </li>
                    ))}
                  </ul>
                );
              case "ol":
                return (
                  <ol key={i} className="space-y-2 pl-4">
                    {block.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-3 text-base leading-relaxed text-white/45">
                        <span className="shrink-0 font-mono text-xs text-white/25 mt-1">{j + 1}.</span>
                        <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                      </li>
                    ))}
                  </ol>
                );
              case "code":
                return (
                  <div key={i} className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.04] p-5">
                    {block.lang && (
                      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-white/20">{block.lang}</p>
                    )}
                    <pre className="font-mono text-sm leading-relaxed text-white/60">
                      <code>{block.text}</code>
                    </pre>
                  </div>
                );
              default:
                return null;
            }
          })}
        </article>

        {/* Footer CTA */}
        <div className="mt-24 border-t border-white/[0.08] pt-16 text-center">
          <p className="mb-2 text-sm font-medium text-white/60">Ready to close the execution gap?</p>
          <p className="mb-8 text-sm text-white/30">Start using Cockpit as your builder operating system.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/sign-in" className="ui-public-primary-action">
              Get started →
            </Link>
            <Link href="/" className="ui-public-nav-action px-6 py-2.5 text-sm">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </PublicSurface>
  );
}
