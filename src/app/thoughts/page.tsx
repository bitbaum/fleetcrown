import Link from "next/link";
import { PageLayout } from "@/components/ui/page-layout";
import { listThoughts } from "@/lib/thoughts-content";

export default function ThoughtsPage() {
  const articles = listThoughts();
  const featured = articles.find((a) => a.featured) ?? articles[0];
  const rest = articles.filter((a) => a.slug !== featured?.slug);

  return (
    <PageLayout title="Thoughts" subtitle="Essays on architecture, execution systems, and project momentum" maxWidth="max-w-6xl">
      <div className="space-y-6">{/* unchanged visual layout */}
        {featured && <Link href={`/thoughts/${featured.slug}`} className="ui-panel-raised block space-y-4 p-6 md:p-8 hover:bg-surface-raised transition"><p className="ui-kicker">Featured</p><h2 className="text-2xl md:text-3xl font-medium text-text-primary leading-tight">{featured.title}</h2><p className="text-base md:text-lg text-text-secondary leading-relaxed">{featured.excerpt}</p></Link>}
        <div className="grid gap-4 md:grid-cols-2">{rest.map((a)=><Link key={a.slug} href={`/thoughts/${a.slug}`} className="ui-panel-raised block space-y-3 p-5 md:p-6 hover:bg-surface-raised transition"><h3 className="text-xl font-medium text-text-primary">{a.title}</h3><p className="text-base text-text-secondary">{a.summary}</p></Link>)}</div>
      </div>
    </PageLayout>
  );
}
