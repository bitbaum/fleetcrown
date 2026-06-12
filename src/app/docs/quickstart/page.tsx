import Link from "next/link";
import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";

export const metadata = {
  title: "Quickstart — FleetCrown",
  description: "From zero to dispatching your first agent in 5 minutes.",
};

export default function QuickstartPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-3xl px-6 py-16 ui-public-prose">
        <h1 className="ui-public-title mb-2">Quickstart</h1>
        <p className="ui-public-meta mb-12">From zero to dispatching your first agent in 5 minutes.</p>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">1. Decide: web or desktop?</h2>
          <p>
            FleetCrown has two surfaces that share the same account and the
            same data:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Web</strong> (<Link href="/" className="ui-public-link">fleetcrown.orangecat.ch</Link>) — works in any browser. Best for monitoring fleets, reviewing handoffs, and dispatching when you&apos;re not at the agent&apos;s machine.
            </li>
            <li>
              <strong>Desktop</strong> (<Link href="/download" className="ui-public-link">Fleet Runner</Link>) — required if you want agents to actually run on this machine. Same UI as the web app, plus the local runtime that drives terminals and the OS notifications when runs finish.
            </li>
          </ul>
          <p>
            You can start with web and add the desktop app whenever you want
            local execution. They&apos;ll merge automatically as long as you
            sign in with the same account.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">2. Sign in</h2>
          <p>
            Visit <Link href="/sign-in" className="ui-public-link">/sign-in</Link> and sign in with GitHub. First time only: GitHub asks you to authorize FleetCrown. After that you land on the dashboard.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">3. Install Fleet Runner (if you want local execution)</h2>
          <ol className="list-decimal pl-6 space-y-3">
            <li>
              Visit <Link href="/download" className="ui-public-link">/download</Link>. The page auto-detects your OS.
            </li>
            <li>
              <strong>Linux</strong>: download the AppImage, then paste the one-line command on the page to mark it executable and launch. Or grab the .deb if you&apos;re on Ubuntu / Debian.
              <br />
              <strong>macOS</strong>: download the .dmg, drag Fleet Runner to Applications. First launch: control-click → Open (one-time Gatekeeper bypass — we aren&apos;t code-signed yet).
              <br />
              <strong>Windows</strong>: run the .exe. SmartScreen will warn — click &ldquo;More info&rdquo; → &ldquo;Run anyway&rdquo;.
            </li>
            <li>
              Fleet Runner opens to the same FleetCrown interface you saw in
              the browser. If your browser is signed in, the desktop app is
              signed in automatically (it shares cookies).
            </li>
            <li>
              Alternatively, from{" "}
              <Link href="/sign-in" className="ui-public-link">/sign-in</Link>
              {" "}→ Settings → Agent tokens, click{" "}
              <em>Open in Fleet Runner</em> to deep-link an auth token into
              the desktop app without copy-paste.
            </li>
          </ol>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">4. Install an agent CLI</h2>
          <p>
            Fleet Runner doesn&apos;t bundle the AI agent itself — it drives
            whatever agent CLI you install. Pick one:
          </p>
          <ul className="list-disc pl-6 space-y-3">
            <li>
              <strong>Claude Code</strong> (Anthropic) — recommended default.
              Install: <code className="text-xs">npm install -g @anthropic-ai/claude-code</code>. Sign in once with your Anthropic account.
            </li>
            <li>
              <strong>Grok CLI</strong> (xAI) — alternative. Install:{" "}
              <code className="text-xs">curl -fsSL https://x.ai/cli/install.sh | bash</code>
              . Set your <code className="text-xs">XAI_API_KEY</code>.
            </li>
          </ul>
          <p>
            You only need one. Zellij (the terminal session manager Fleet
            Runner uses internally) ships inside the app since v0.2.0 — no
            separate install.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">5. Register a project</h2>
          <p>
            In the dashboard, go to <strong>Projects</strong>. Add a project
            with a name and the absolute path to its directory on your machine.
            Fleet Runner uses this path to launch the agent in the right
            working directory.
          </p>
          <p>
            If you have <code className="text-xs">~/.config/agent-projects.conf</code> on
            disk, projects are picked up from there too — one per line, format:{" "}
            <code className="text-xs">tab-name|directory|adapter</code>.
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">6. Dispatch your first intent</h2>
          <p>
            Go to <strong>Control</strong>. Pick a project. Type a prompt or
            choose one of the built-in intents (e.g. &ldquo;next_best&rdquo;,
            &ldquo;quality&rdquo;, &ldquo;deploy_check&rdquo;). Hit dispatch.
          </p>
          <p>
            Fleet Runner opens a Zellij session in a new terminal, launches the
            agent inside, and tails its session output. When the agent writes
            its handoff (per Claude Code&apos;s session.md convention),
            Fleet Runner ingests it and surfaces an OS notification:{" "}
            <em>&ldquo;agent idle — done: X, next: Y, health: good.&rdquo;</em>
          </p>
        </section>

        <section className="space-y-4 mb-12">
          <h2 className="ui-public-prose-h2">7. Watch from anywhere</h2>
          <p>
            The same dashboard works from your phone (web) while a long agent
            runs on your laptop. Status, handoffs, and the ability to cancel a
            run are all live — useful when you&apos;re not at the machine.
          </p>
        </section>

        <section className="space-y-4 mb-10 pt-4 border-t border-white/10">
          <h2 className="ui-public-prose-h2">Need help?</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <a href="https://github.com/maonakamoto/fleetcrown/issues" className="ui-public-link" target="_blank" rel="noopener noreferrer">
                Open a GitHub issue
              </a>{" "}
              — bugs, feature requests, or questions.
            </li>
            <li>
              <Link href="/roadmap" className="ui-public-link">Roadmap</Link>{" "}
              — what&apos;s shipping next.
            </li>
            <li>
              <Link href="/whitepaper" className="ui-public-link">Whitepaper</Link>{" "}
              — the bigger architecture and product thesis.
            </li>
          </ul>
        </section>
      </main>
    </PublicSurface>
  );
}
