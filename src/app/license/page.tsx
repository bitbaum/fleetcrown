import { PublicSurface } from "@/components/public/PublicSurface";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";

export const metadata = {
  title: "License",
  description: "How FleetCrown source and binaries may be used.",
};

export default function LicensePage() {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-3xl px-6 py-16 ui-public-prose">
        <h1 className="ui-public-title mb-2">License</h1>
        <p className="ui-public-meta mb-12">Source-available, personal-use friendly.</p>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Plain English</h2>
          <p>
            FleetCrown is a personal project by Mao Nakamoto, source-available on GitHub. You can
            read the code, run it locally, and use the hosted product for free for personal and
            small-team work. Commercial redistribution, repackaging, or running it as a competing
            hosted service requires a separate agreement.
          </p>
          <p>
            This will be replaced by a standard open-source license when the project incorporates
            and adopts a definitive license. Until then, the terms below apply.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">You may</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Read, fork, and modify the source code at{" "}
              <a
                href="https://github.com/bitbaum/fleetcrown"
                className="ui-public-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/bitbaum/fleetcrown
              </a>
              .
            </li>
            <li>Run your own instance for personal use or for use by a team you are part of.</li>
            <li>Submit pull requests, file issues, and discuss the project publicly.</li>
            <li>
              Use the released binaries (AppImage, .deb, .dmg, .exe) to run Fleet Runner on your
              computer.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">You may not, without separate written agreement</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Operate FleetCrown as a hosted service for third parties (e.g. spin up a FleetCrown
              clone and sell access to it).
            </li>
            <li>
              Repackage the binaries or source as a different branded product and distribute that
              product to others.
            </li>
            <li>
              Use the &ldquo;FleetCrown&rdquo; name or brand for a derivative product without
              permission.
            </li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Third-party software</h2>
          <p>
            FleetCrown bundles open-source dependencies including but not limited to Electron,
            React, Next.js, Tailwind, Drizzle, and Zellij. Each is governed by its own license,
            included in the source tree under <code>node_modules/</code> for the JavaScript
            ecosystem and in the released Fleet Runner binary&apos;s LICENSES files for the native
            components. The terms on this page do not override those upstream licenses.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="ui-public-prose-h2">Questions</h2>
          <p>
            For licensing questions or to request commercial usage rights, open an issue at{" "}
            <a
              href="https://github.com/bitbaum/fleetcrown/issues"
              className="ui-public-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/bitbaum/fleetcrown/issues
            </a>{" "}
            or email Mao Nakamoto via the address on the GitHub profile.
          </p>
        </section>

        <p className="ui-public-meta mt-16">
          Final licensing terms will be set at incorporation. Current contributors and users are
          explicitly grandfathered — anything you can do today, you will be able to keep doing.
        </p>
      </main>
    </PublicSurface>
  );
}
