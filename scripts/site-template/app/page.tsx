/**
 * The day-zero page.
 *
 * Every site this scaffold creates serves THIS until its owner replaces it, so
 * it is not scaffolding — it is the first thing a client sees after being told
 * their site is live, and for some of them the only page of ours they will ever
 * look at. It has to be good enough that they want to build the rest.
 *
 * Three jobs, in order:
 *   1. PROVE it works — the host, live, over TLS, before any claim is made.
 *      The receipts block below is the whole argument: a client can see the
 *      repository, the pipeline and the deploy, and none of it is a promise.
 *   2. Give ONE primary action, into FleetCrown, where they can actually build
 *      it. A site whose owner cannot change it without emailing a person is the
 *      dependency this scaffold exists to remove.
 *   3. Link OrangeCat SECONDARILY. It is where the project is public and
 *      followable; it is not where the building happens, so it is a text link
 *      and never the button.
 *
 * It stays plainly day zero ("is waiting for its first page") so it cannot be
 * mistaken for finished work.
 *
 * Everything it claims is gated on the thing being true — see WIDGET below.
 *
 * Written for diplodoctor on 2026-09-10 and promoted into the template on
 * 2026-09-11. It lived in that one repository for a day, and in that day the
 * next site — causius — was scaffolded and shipped to a real public address
 * with a note to the developer as its front page. A page written to be the
 * template is not the template until it is in the template.
 */
const FLEETCROWN = "https://fleetcrown.orangecat.ch";
const ORANGECAT = "https://orangecat.ch";

// Written by new-site.sh at scaffold time. Both are absent when the FleetCrown
// database was unreachable — provisioning is non-fatal by design — so each link
// degrades rather than rendering /projects/undefined.
const fcProject = process.env.NEXT_PUBLIC_FC_PROJECT_ID;
const ocProject = process.env.NEXT_PUBLIC_OC_PROJECT_ID;

const buildHref = fcProject ? `${FLEETCROWN}/projects/${fcProject}` : `${FLEETCROWN}/projects`;
const ocHref = ocProject ? `${ORANGECAT}/projects/${ocProject}` : null;

// WIDGET. The "change it from this page" claim is TRUE ONLY IF the widget is
// actually on the page, and layout.tsx renders that script on exactly this
// variable. Diplodoctor shipped with the claim and without the widget, because
// provisioning failed non-fatally and nothing tied the sentence to the fact.
// Gate the CLAIM on the same value that gates the SCRIPT, or it is marketing.
const hasWidget = Boolean(process.env.NEXT_PUBLIC_FC_WIDGET_TOKEN);

const RECEIPTS = [
  ["Host", "__HOST__"],
  ["Repository", "github.com/__WORKFLOW_OWNER__/__SLUG__"],
  ["Pipeline", "tested on every change, deployed on merge"],
  ["Certificate", "issued and renewed automatically"],
];

const STEPS = [
  {
    n: "01",
    title: "Say what you want",
    body: "Plain words, not a brief. What this is for, who it is for, and how it should feel.",
  },
  {
    n: "02",
    title: "An agent builds it",
    body: "It writes the code and opens a pull request you can read before anything goes live.",
  },
  {
    n: "03",
    title: "It ships itself",
    body: "Merged changes deploy to this address on their own. No handover, no invoice for a typo.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-shell flex-col px-6 py-10 sm:px-10 sm:py-14">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-caps text-fg-muted">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-live opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-live" />
          </span>
          <span className="sr-only">Live:</span>
          __HOST__
        </p>
        <a
          href={FLEETCROWN}
          className="font-mono text-xs uppercase tracking-caps text-fg-muted underline decoration-border-subtle underline-offset-4 transition-colors hover:text-fg-primary hover:decoration-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-fg"
        >
          Built with FleetCrown
        </a>
      </header>

      <div className="flex flex-1 flex-col justify-center py-14 sm:py-20">
        {/* Name and clause are separate elements, not one wrapped heading. As a
            single block the clause set at heading size, and "page." fell alone
            onto a third line — the kind of orphan that makes a page look
            unconsidered no matter how good the rest of it is. */}
        <h1 className="font-heading text-5xl font-semibold leading-[0.95] tracking-display text-fg-primary sm:text-7xl">
          __TITLE__
        </h1>
        <p className="mt-3 max-w-[24ch] font-heading text-2xl leading-[1.15] tracking-display text-fg-muted sm:text-4xl">
          is waiting for its first page.
        </p>

        <p className="mt-8 max-w-prose text-lg leading-relaxed text-fg-secondary">
          Everything underneath it already runs. What is missing is the part only you can decide:
          what this should say, and who it should say it to.
        </p>

        <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
          <a
            href={buildHref}
            className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-card bg-accent px-7 text-base font-medium text-accent-contrast transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-fg"
          >
            Build this site
            <span aria-hidden="true">&rarr;</span>
          </a>
          {ocHref && (
            <a
              href={ocHref}
              className="inline-flex min-h-12 items-center text-base text-fg-secondary underline decoration-border-subtle underline-offset-[6px] transition-colors hover:text-fg-primary hover:decoration-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-fg"
            >
              Follow it on OrangeCat
              <span aria-hidden="true" className="ml-1.5 text-accent-fg">
                &#8599;
              </span>
            </a>
          )}
        </div>
      </div>

      {/* Receipts. The point is that none of this is a promise — a client can
          click the repository and read it. This is what makes the page land. */}
      <dl className="grid gap-x-8 gap-y-4 border-t border-border-subtle py-10 sm:grid-cols-[10rem_1fr]">
        {RECEIPTS.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="font-mono text-xs uppercase tracking-caps text-accent-fg">{term}</dt>
            <dd className="-mt-2 font-mono text-sm text-fg-secondary sm:mt-0">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border-subtle pt-10">
        <ol className="grid gap-10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n}>
              <p className="font-mono text-xs uppercase tracking-caps text-accent-fg">{step.n}</p>
              <h2 className="mt-3 font-heading text-base font-semibold text-fg-primary">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{step.body}</p>
            </li>
          ))}
        </ol>

        {hasWidget && (
          <p className="mt-12 max-w-prose rounded-card bg-surface-raised px-5 py-4 text-sm leading-relaxed text-fg-secondary">
            You can also change it from here. Point at anything on this page, say what is wrong, and
            it becomes a pull request &mdash; the same one an agent would open.
          </p>
        )}
      </div>
    </main>
  );
}
