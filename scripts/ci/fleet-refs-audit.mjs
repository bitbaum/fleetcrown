#!/usr/bin/env node
/**
 * Fleet-wide audit: no workflow may reference an owner that GitHub only
 * REDIRECTS to, and no file may name a retired handle.
 *
 * This exists because the same outage happened three times in three days:
 *
 *   2026-08-26  the account `maonakamoto` was renamed to `catomean`
 *   2026-08-28  the repos moved to the organisation `bitbaum`
 *   ...and the 2026-08-27 repair, which pointed everything at `catomean`,
 *      was itself killed by the second move about ten hours later.
 *
 * Every time, every merge and every deploy stopped, and every time nothing
 * looked wrong. GitHub follows a rename or transfer for the REST API and for
 * git remotes — `gh api repos/<old>/dotfiles` answers, `git clone` works,
 * `git push` works. The Actions `uses:` resolver is the one consumer that does
 * NOT follow it. A run dies before any step exists: zero jobs, no log, and a
 * bare "This run likely failed because of a workflow file issue".
 *
 * Pull requests stay GREEN, CLEAN and MERGEABLE throughout, because the
 * workflow that would report the failure is the one that cannot start. Work
 * simply stops shipping and nothing is marked broken.
 *
 * THE CHECK: ask REST what each referenced repo is really called. That is
 * exactly the discrepancy — REST resolves the redirect and returns the
 * canonical `full_name`, Actions does not resolve it at all. Disagreement means
 * the workflow is already broken, whether or not it has run yet.
 *
 * A static allowlist cannot do this: after a rename the workflow file and the
 * allowlist hold the same stale name and agree with each other.
 *
 * Generalised from orangecat's per-repo check to cover the WHOLE org, because a
 * per-repo copy only protects repos that already have CI — petvity's deploy was
 * broken for exactly that reason, and had no auto-merge.yml to notice.
 */

import { retiredHandleMatches, USES } from './fleet-refs-audit-lib.mjs';

const ORG = process.env.FLEET_ORG || 'bitbaum';
const RETIRED = (process.env.RETIRED_HANDLES || 'maonakamoto').split(',').map(s => s.trim()).filter(Boolean);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) { console.log('[fleet-refs-audit] no token — skipping'); process.exit(0); }

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
               'user-agent': 'fleet-refs-audit' },
  });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null };
};

const canonical = new Map();     // "owner/repo" -> canonical full_name | null
async function resolve(slug) {
  if (canonical.has(slug)) return canonical.get(slug);
  const r = await api(`/repos/${slug}`);
  const v = r.ok ? r.body.full_name : (r.status === 404 ? null : undefined);
  canonical.set(slug, v);
  return v;
}

const repos = [];
for (let page = 1; ; page++) {
  const r = await api(`/orgs/${ORG}/repos?per_page=100&type=all&page=${page}`);
  if (!r.ok) { console.error(`::error::cannot list ${ORG} repos (HTTP ${r.status})`); process.exit(1); }
  repos.push(...r.body.filter(x => !x.archived));
  if (r.body.length < 100) break;
}

const stale = [], retired = [], unreadable = [];
let checkedRepos = 0, checkedFiles = 0;

for (const repo of repos) {
  const dir = await api(`/repos/${repo.full_name}/contents/.github/workflows?ref=${repo.default_branch}`);
  if (!dir.ok) {
    // 404 == no workflows dir (fine). Anything else == we could not look, which
    // is NOT the same as "clean" and must never be reported as a pass.
    if (dir.status !== 404) unreadable.push(`${repo.full_name} (HTTP ${dir.status})`);
    continue;
  }
  checkedRepos++;
  for (const f of dir.body.filter(x => x.type === 'file' && /\.ya?ml$/.test(x.name))) {
    const file = await api(`/repos/${repo.full_name}/contents/.github/workflows/${f.name}?ref=${repo.default_branch}`);
    if (!file.ok) { unreadable.push(`${repo.full_name}/${f.name} (HTTP ${file.status})`); continue; }
    const text = Buffer.from(file.body.content, 'base64').toString('utf8');
    checkedFiles++;

    // See fleet-refs-audit-lib.mjs: comments and this audit's own
    // RETIRED_HANDLES declaration are excluded, because neither is a
    // reference that needs correcting. Line-level, not file-level: an
    // earlier version of this fix exempted this whole file by repo+filename
    // (SELF_REPO/SELF_WORKFLOW), which stops working the moment this
    // tooling moves to a different repo — already planned, see
    // bitbaum/fleet — and silently re-opens the exact bug it fixed.
    for (const h of retiredHandleMatches(text, RETIRED)) {
      retired.push(`${repo.full_name}/.github/workflows/${f.name} names "${h}" in a live line`);
    }
    for (const [, owner, name] of text.matchAll(USES)) {
      const slug = `${owner}/${name}`;
      const real = await resolve(slug);
      if (real === undefined) { unreadable.push(`${slug} (lookup failed)`); continue; }
      if (real === null) {
        stale.push(`${repo.full_name}/.github/workflows/${f.name}: uses ${slug} — DOES NOT EXIST`);
      } else if (real !== slug) {
        stale.push(`${repo.full_name}/.github/workflows/${f.name}: uses ${slug} — canonical is ${real} (Actions will NOT follow this)`);
      }
    }
  }
}

console.log(`[fleet-refs-audit] ${checkedRepos} repos, ${checkedFiles} workflow files, ${canonical.size} distinct refs`);

// A floor: if the sweep silently stops seeing repos, "0 problems" is not a pass.
const FLOOR = Number(process.env.MIN_REPOS || 10);
if (checkedRepos < FLOOR) {
  console.error(`::error::only ${checkedRepos} repos had workflows (floor ${FLOOR}) — this audit is not seeing the fleet`);
  process.exit(1);
}

for (const u of [...new Set(unreadable)]) console.log(`::warning::could not check ${u}`);
for (const s of stale)   console.log(`::error::${s}`);
for (const r of retired) console.log(`::error::${r}`);

if (stale.length || retired.length) {
  console.error(`\nFAIL: ${stale.length} redirect-only reference(s), ${retired.length} retired-handle reference(s).`);
  process.exit(1);
}
console.log('OK: every workflow reference names its canonical owner.');
