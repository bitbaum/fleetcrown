export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-shell flex-col justify-center px-6 py-24">
      <h1 className="font-heading text-4xl font-semibold tracking-display text-fg-primary sm:text-6xl">
        __TITLE__
      </h1>
      <p className="mt-6 max-w-prose text-lg leading-relaxed text-fg-secondary">
        This is a new site scaffolded by <code className="font-mono text-sm">new-site.sh</code>.
        Replace this page, and change the tokens in{" "}
        <code className="font-mono text-sm">app/globals.css</code> — shipping in the default palette
        is the one thing a bespoke site must not do.
      </p>
      <p className="mt-10 font-mono text-xs uppercase tracking-caps text-fg-muted">__HOST__</p>
    </main>
  );
}
