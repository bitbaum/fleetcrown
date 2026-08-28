/**
 * Give a new site a FleetCrown project and a widget token.
 *
 *   npx tsx scripts/provision-widget.ts <slug> <title> <host>
 *
 * Prints ONLY the token to stdout, so `new-site.sh` can capture it. Everything
 * else goes to stderr.
 *
 * WHY THIS IS PART OF SPINNING UP A SITE
 *
 * The widget is the reason this studio is not a dev shop. The owner looks at
 * their own site, points at what they do not like, and an agent changes it —
 * without emailing the founder. A site shipped WITHOUT it is a site that
 * generates support requests to a person, which is the one thing the model
 * exists to avoid. So it is provisioned at birth, not "later".
 *
 * Idempotent: an existing project of the same name is reused, and an existing
 * token is returned rather than rotated — rotating would silently invalidate a
 * snippet already deployed on a live site.
 */
import { db } from '@/db';
import { entities, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { ENTITY_TYPE } from '@/lib/constants/statuses';
import { createProject } from '@/db/queries/projects';
import { upsertWidgetToken } from '@/db/queries/widget-tokens';

const [slug, title, host] = process.argv.slice(2);

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!slug || !title || !host) {
  die('usage: provision-widget.ts <slug> <title> <host>');
}

/**
 * The owner. FLEETCROWN_OWNER_EMAIL when set; otherwise the single user in the
 * database. Refuses to guess when there is more than one — picking an owner
 * wrong means the site's feedback lands in a stranger's inbox.
 */
async function resolveOwner(): Promise<string> {
  const email = process.env.FLEETCROWN_OWNER_EMAIL;
  if (email) {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (!row) die(`no user with email ${email}`);
    return row.id;
  }
  const all = await db.select({ id: users.id }).from(users).limit(2);
  if (all.length === 0) die('no users in the database');
  if (all.length > 1) die('more than one user — set FLEETCROWN_OWNER_EMAIL');
  return all[0].id;
}

async function main(): Promise<void> {
  const userId = await resolveOwner();

  let projectId: string;
  const existing = await db.query.entities.findFirst({
    where: and(
      eq(entities.userId, userId),
      eq(entities.name, title),
      eq(entities.type, ENTITY_TYPE.PROJECT)
    ),
    columns: { id: true },
  });

  if (existing) {
    projectId = existing.id;
    console.error(`↻ project "${title}" already exists (${projectId})`);
  } else {
    const created = await createProject(
      userId,
      {
        name: title,
        description: `Website at https://${host}`,
        // Owner from the environment, matching _box-env.sh — hardcoding it
        // here is what made a rename touch this file at all.
        gitUrl: `https://github.com/${process.env.GH_OWNER ?? 'bitbaum'}/${slug}`,
      },
      'new-site.sh'
    );
    projectId = created.id;
    console.error(`+ created project "${title}" (${projectId})`);
  }

  // Origins bound to this site's host, so a token leaked from the page cannot
  // be replayed from somewhere else.
  const token = await upsertWidgetToken(userId, projectId, {
    origins: [`https://${host}`],
  });
  if (!token) die('failed to mint a widget token');

  console.error(`✓ widget token bound to https://${host}`);
  process.stdout.write(token.token);
}

main()
  .then(() => process.exit(0))
  .catch(err => die(err instanceof Error ? err.message : String(err)));
