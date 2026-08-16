# Keeping Fleet Runner current on Linux

**SSOT: `scripts/install-fleet-runner.sh`.** Install it once and the box stays on
the latest published release without anyone touching it.

```bash
./scripts/install-fleet-runner.sh            # install/upgrade + wire the units
./scripts/install-fleet-runner.sh --status   # installed vs. published
./scripts/install-fleet-runner.sh --update   # what the timer runs
```

`--install` writes three systemd **user** units (no sudo, no root):

| Unit | Role |
|---|---|
| `fleet-runner.service` | runs the app; `ExecStart` points at a **stable symlink**, never a version |
| `fleet-runner-update.service` | oneshot: check → download → verify → extract → swap → restart |
| `fleet-runner-update.timer` | daily, `Persistent=true`, plus 10 min after login |

Check on it with `systemctl --user list-timers fleet-runner-update.timer` and
`journalctl --user -u fleet-runner-update.service`. Every run says what it did,
including "already current — nothing to do".

## Why the in-app updater is not enough on Linux

Fleet Runner bundles electron-updater (`desktop/src/main/index.ts`). It works —
it checks, it downloads, it notifies. It just could not *apply* anything on a
real box, and the failure was invisible: the app posted "Fleet Runner v0.8.12
ready" and stayed on 0.8.11 for twelve days. Four independent causes, each one
sufficient on its own:

1. **The install was an extracted directory.** `detectInstallFormat()` returns
   `'unknown'` for that, and on Linux electron-updater can only self-apply an
   AppImage. So it chose the `.deb` asset…
2. **…which needs `sudo dpkg -i`.** Electron cannot escalate from userspace, so
   the download parked in `~/.cache/fleet-runner-updater/pending/` forever.
3. **The systemd unit hardcoded the version in the path**
   (`ExecStart=…/FleetRunner-0.8.11/fleet-runner`). Even a perfect self-update
   would have been reverted on the next boot.
4. **The box cannot run an AppImage at all.** AppImage type-2 needs `libfuse2`
   (`libfuse.so.2`); this machine has only libfuse3, so pointing the unit at an
   AppImage crash-loops with *"AppImages require FUSE to run"*.

Cause 4 is the one that bites during diagnosis, because the usual FUSE probe
lies: `./Fleet-Runner.AppImage --appimage-offset` **succeeds without libfuse2** —
it only reads the ELF header and never mounts. `/dev/fuse` existing and
`fusermount3` being on `PATH` prove nothing either. The only honest check is
`ldconfig -p | grep libfuse.so.2`, or actually launching the thing.

## The design that results

Download the AppImage, verify its sha512 against `latest-linux.yml`, then
**extract** it (`--appimage-extract` needs no FUSE, so this works on every Linux
box regardless of libfuse generation) into `~/Applications/fleet-runner-<version>/`,
and flip `~/Applications/FleetRunner` to point at it.

- **The symlink is the record of what is installed.** No version file to drift
  from the tree it describes — `readlink` is the answer.
- **The swap is atomic** (`ln` beside, then `mv -T` over). `ln -sfn` alone
  leaves a window with no symlink, and systemd starting in that window fails.
- **Nothing touches the symlink until the download is checksum-verified and the
  extracted tree is confirmed to contain a runnable binary.** A failed update
  leaves the running version alone.
- **One previous build is kept** (~350 MB) so rollback is one command:
  `ln -sfnT fleet-runner-<old> ~/Applications/FleetRunner && systemctl --user restart fleet-runner`.

The timer, not the app, is what applies updates. It does not depend on the app
being healthy, on a quit hook winning a race against `SIGTERM`, or on sudo.

## Verifying it actually works

Do not trust "the timer is enabled". Force the real path:

```bash
# pretend an older build is current, then run the unit exactly as the timer does
ln -sfnT fleet-runner-<old> ~/Applications/FleetRunner
systemctl --user start fleet-runner-update.service
journalctl --user -u fleet-runner-update.service --since -5min
```

Expect: `update: <old> → <new>` · `checksum verified` · `extracting…` ·
`installed <new>` · `restarted fleet-runner.service`. Then confirm the app
agrees — the Control banner reads `app v<new>`, and a second run of the unit
must say `already current`.
