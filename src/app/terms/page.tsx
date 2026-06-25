import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";

export const metadata = {
  title: "Terms",
  description: "What FleetCrown promises, what it doesn't, and what's expected from you.",
};

export default function TermsPage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-3xl px-6 py-16 ui-public-prose">
        <h1 className="ui-public-title mb-2">Terms of use</h1>
        <p className="ui-public-meta mb-12">Last updated 2026-06-03</p>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Honest framing</h2>
          <p>
            FleetCrown is a pre-incorporation product run by Mao Nakamoto.
            It is provided as-is, free of charge, under active development.
            These terms exist so the relationship is clear; they will be
            replaced with a proper agreement when the product is offered as a
            paid service by an incorporated entity.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Your account</h2>
          <p>
            You authenticate via GitHub OAuth. By signing in you confirm you are
            the owner of that GitHub account. Don&apos;t share your sign-in
            credentials or agent tokens — anyone with a valid token can dispatch
            agents on the machine the token is installed on.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Acceptable use</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Use FleetCrown to coordinate AI agents on your own projects, your
              employer&apos;s projects (if authorized), and other work you have
              the right to operate on.
            </li>
            <li>
              Don&apos;t use FleetCrown to launch agents against systems you
              don&apos;t have permission to modify — this is a control plane,
              not an attack platform.
            </li>
            <li>
              Don&apos;t abuse the platform by automating it for purposes that
              break the terms of the AI providers your agents call (Anthropic,
              xAI, etc.). Their terms apply to your use of their models through
              FleetCrown.
            </li>
            <li>
              Don&apos;t attempt to compromise other users&apos; data or
              infrastructure. The project is open about its boundaries; report
              vulnerabilities (see Security below) rather than exploit them.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">What you keep</h2>
          <p>
            You own your data — projects, prompts, agent outputs, dashboards,
            everything you create. We hold it on your behalf so the product can
            function. You can export or delete it at any time (see{" "}
            <a href="/privacy" className="ui-public-link">Privacy</a>).
          </p>
          <p>
            The FleetCrown source code is published under the license shown at{" "}
            <a href="/license" className="ui-public-link">/license</a>.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">No warranty</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; without warranty of any
            kind, express or implied. The maintainer is not liable for damages
            arising from use of the service — including but not limited to lost
            data, lost time, incorrect agent output, or interactions with
            third-party AI providers. Use it because it&apos;s useful, not
            because someone promised you a service level.
          </p>
          <p>
            Agent dispatch invokes external AI providers using your API keys.
            FleetCrown is not responsible for charges incurred against those
            keys — set your own quotas with each provider.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Security disclosure</h2>
          <p>
            If you find a security issue, please{" "}
            <strong>do not file a public GitHub issue.</strong> Reach Mao
            Nakamoto via the email address on the GitHub profile with
            &ldquo;FleetCrown security&rdquo; in the subject. We&apos;ll
            acknowledge within 72 hours.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Changes</h2>
          <p>
            These terms may be updated; the &ldquo;last updated&rdquo; date at
            the top reflects the current version. Material changes will be
            announced via the release notes feed and, where we have your
            email, by email.
          </p>
        </section>
      </main>
    </PublicSurface>
  );
}
