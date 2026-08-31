import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";

export const metadata = {
  title: "Privacy",
  description: "What FleetCrown collects, why, and what you can do about it.",
};

export default function PrivacyPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-3xl px-6 py-16 ui-public-prose">
        <h1 className="ui-public-title mb-2">Privacy</h1>
        <p className="ui-public-meta mb-12">Last updated 2026-06-03</p>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Plain English</h2>
          <p>
            FleetCrown is a personal project run by Mao Nakamoto. It is not yet a registered
            company. The product collects only what it needs to authenticate you, drive agents on
            your behalf, and let you sign in again on a different device.
          </p>
          <p>
            We don&apos;t sell your data, we don&apos;t share it with advertisers, and we don&apos;t
            have one. If you delete your account, your records are deleted with it.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">What we collect</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Account identity</strong> — GitHub username, email, avatar URL (only what the
              GitHub OAuth scope returns). Stored to identify you across sign-ins.
            </li>
            <li>
              <strong>Agent tokens</strong> — opaque tokens you generate from Settings → Agent
              tokens to authenticate Fleet Runner desktop installs. Stored hashed, not in plaintext.
            </li>
            <li>
              <strong>Project records you create</strong> — projects, prompts, goals, events,
              habits, subscriptions, people, memory entries. These are your data. We process them to
              render your dashboards and route agent dispatch.
            </li>
            <li>
              <strong>Agent run metadata</strong> — dispatch timestamps, outcomes, error states.
              Used to render the run history view and to recover from crashes.
            </li>
            <li>
              <strong>Operational logs</strong> — minimal request logs (path, status code, timing).
              No request bodies, no PII beyond the user ID the request was authenticated as.
              Retained 30 days for debugging.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">What we don&apos;t collect</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              No marketing / analytics tracking (no Google Analytics, no Meta Pixel, no LinkedIn
              tag).
            </li>
            <li>No session replay, no heatmaps, no behavioral analytics.</li>
            <li>
              No data from your local machine beyond what Fleet Runner explicitly syncs (project
              paths you register, agent outcomes). Your source code never leaves your computer.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Third parties we rely on</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Hetzner</strong> — provides the server that hosts the web application. Sees
              request metadata as any host would.{" "}
              <a
                href="https://www.hetzner.com/legal/privacy-policy"
                className="ui-public-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hetzner privacy policy
              </a>
              .
            </li>
            <li>
              <strong>GitHub</strong> — handles sign-in via OAuth. Sees the fact that you
              authenticated to FleetCrown.{" "}
              <a
                href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                className="ui-public-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub privacy statement
              </a>
              .
            </li>
            <li>
              <strong>Postgres</strong> — self-hosted database on our own server. Stores your
              records.
            </li>
          </ul>
          <p>
            We are not currently using any analytics, advertising, A/B testing, or marketing
            platforms. If we add any, this page will be updated and existing users notified by
            email.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Your rights</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Access</strong> — your dashboard already shows everything we hold about you.
            </li>
            <li>
              <strong>Export</strong> — open an issue or email and we&apos;ll send your records as
              JSON.
            </li>
            <li>
              <strong>Delete</strong> — Settings → Delete account purges your records.
            </li>
            <li>
              <strong>Correct</strong> — edit any field inline in the dashboard.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Contact</h2>
          <p>
            For privacy questions, open an issue at{" "}
            <a
              href="https://github.com/bitbaum/fleetcrown/issues"
              className="ui-public-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/bitbaum/fleetcrown/issues
            </a>{" "}
            or reach Mao Nakamoto via the address on the GitHub profile.
          </p>
        </section>

        <p className="ui-public-meta mt-16">
          This is a pre-incorporation product. When FleetCrown becomes a registered entity (planned
          as a subsidiary of bitbaum AG), this policy will be updated to reflect the corporate
          structure. Existing rights will not be reduced by that transition.
        </p>
      </main>
    </PublicSurface>
  );
}
