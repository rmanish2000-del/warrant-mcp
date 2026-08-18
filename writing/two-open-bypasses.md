# The two open bypasses, and why the count is two

The post says seven routes were found and **two are still open**. This is the
answer to the reader who asks *which two* — named, dated, and reconciled against
the full attack log in
[`SECURITY-SURFACE.md`](https://github.com/rmanish2000-del/warrant-mcp/blob/main/SECURITY-SURFACE.md),
which is the primary record. Nothing here is a new claim; every row traces to
that file or to a regression test in the repository.

## The two, in full

### Open route 1 — shell glob expansion (`rm -f *`)

**What it is.** The hook inspects a shell command as text, before the shell runs
it. When the command contains a glob like `*`, the shell expands it into a list
of filenames *after* the hook has already decided — so the hook sees the literal
`*` and nothing else. A rule that would refuse `rm -f secrets.pem` cannot fire on
`rm -f *`, because at decision time there is no `secrets.pem` in the command, only
the star.

**Found.** During the nine adversarial sessions of 2026-08-03 (attack 8 in the
log), by the author, attacking the hook directly. `rm -f *` in the sandbox
deleted both compiled-policy caches; `.env` survived only because bash's `*`
skips dotfiles, which is luck, not protection.

**Why it is open — a design constraint.** Working out what `*` matches means
reading the filesystem, and the deciding modules deliberately import no
filesystem capability at all; a test scans those five modules for `node:fs` and
fails if one appears. Resolving the glob would mean giving the decision path the
exact capability the architecture forbids it. There is no fix inside this design.

**What it enables today.** An agent (or a careless command) can destroy files a
protected-path rule names, by reaching them through a glob rather than by name.
The compiled policy itself is no longer among the reachable targets — since M5 it
lives in a read-only vault outside the workspace, where clause W1 governs it — so
the glob can no longer *disarm* enforcement, but it can still delete workspace
files the policy meant to protect.

**What would close it.** Only the layer underneath: a sandbox or filesystem
permissions that stop the deletion regardless of how the path was written. This
is why the post's one-line thesis is "a policy layer, not a sandbox — deploy it
inside one." Warrant makes the refusal legible; it does not replace confinement.

### Open route 2 — a global flag with a separate value displaces the subcommand (`git -c …`)

**What it is.** The `shell_forbidden_invocation` rule matches its `subcommands`
list against the *first non-flag argument* of a command. `git -c
core.pager=cat push --force` puts `core.pager=cat` in that position, so a rule
forbidding `git push --force` never sees `push` where it looks and does not fire.
`git --no-pager push --force` *is* denied, because that flag consumes no value —
the difference is entirely whether the flag takes a separate-word argument.

**Found.** On 2026-08-04, by the author, **not by an attack** — by writing the
policy format up as a versioned specification. Stating precisely what the rule
means surfaced the gap. The origin is the point: the interesting failure was
found by specifying, not by fuzzing.

**Why it is open — a pending decision, not an unbounded cost.** Closing it means
knowing, per command, which flags take a separate value (so the matcher can skip
past them to the real subcommand). This format carries no such per-command
knowledge, and the one thing that could supply it on demand is a model, which is
exactly what is not allowed near a runtime decision. So it is documented instead:
specified in [SPEC.md](https://github.com/rmanish2000-del/warrant-mcp/blob/main/SPEC.md)
§3.3.5 and pinned by the conformance case
`invocation-separate-word-flag-value-displaces-the-subcommand`. That pin makes any
future fix a deliberate spec version bump rather than a silent matcher edit.

**What it enables today.** A forbidden invocation can be slipped past its rule by
prefixing a value-taking global flag — `git -c`, and the same shape on any tool
whose CLI has value-taking globals. The rule still catches the plain form and the
no-value-flag form.

**What would close it.** A per-command table of which flags take values, encoded
as data in the spec and every conforming implementation, adopted through a spec
bump. It is a known, bounded piece of work being deferred deliberately, not an
open research problem like route 1.

## The seven-row reconciliation

The post counts **seven routes found**: six surfaced in the nine attack sessions,
and a seventh by writing the spec. Five are closed, each with a regression test
named for the attack that opened it (`src/hook/adapter.test.ts`). Two are open.

| # | Route | How found | Status | Closed by |
|---|---|---|---|---|
| 1 | `mv .env` out of the workspace | session (2026-08-03) | **closed** | clause W2 · test `M4 bypass 1` |
| 2 | `node -e "…unlinkSync('.env')"` | session (2026-08-03) | **closed** | clause W2 · test `M4 bypass 2` |
| 3 | PowerShell `Set-Content .env` | session (2026-08-03) | **closed** | clause W2 · test `M4 bypass 3` |
| 4 | third-party MCP `delete_file` | session (2026-08-03) | **closed** | clause W2 · test `M4 bypass 4` |
| 5 | `WebFetch` to a disallowed host | session (2026-08-03) | **closed** | clause W6 · test `M4 bypass 5` |
| 6 | `rm -f *` glob | session (2026-08-03) | **OPEN** | design constraint — see Open route 1 |
| 7 | `git -c … push --force` | writing the spec (2026-08-04) | **OPEN** | pending spec bump — see Open route 2 |

Five closed, two open. The count reconciles.

## Why it is two and not three — the honesty caveat

`SECURITY-SURFACE.md` §2 numbers **eleven** rows, not seven, and the difference is
where an honest reader will push. Four of those eleven were never bypasses:
routes 4 and 6 were blocked on the first try, route 9 the model refused on its
own (counted as untested, not safe), and route 10 was a post-M5 check that the
vault holds. Those are not "routes that got through," so they are not among the
seven.

One row is the genuine edge: **§2 route 11 — an agent edited `.claude/settings.json`
down to `{}`**, removing the hook wiring. That *did* get through (a full-file
`Write` was refused by Claude Code's own classifier; a narrower `Edit` succeeded).
It is **not counted among the seven**, and this is the one classification a
reader deserves stated out loud:

- It is not a failure of the evaluator or the tool-mapping — it is that the hook's
  *configuration file* lives inside the workspace, where an agent with write
  access can reach it. That is a property of where the config lives, i.e. a
  deployment fact, which is why the repo files it under M5 "protecting the policy
  itself / the hook wiring" rather than among the attack-hunt routes.
- It is **mitigated, not closed**: the file is written read-only and `demo:check`
  compares it byte-for-byte so tampering shows as `NOT READY`. That is detection
  plus a speed bump — nothing forbids `chmod`, so it is not prevention. The real
  fix is org-managed or user-level settings the agent cannot write, a deployment
  decision the code cannot make from inside the workspace.
- The post discloses it plainly regardless of the count: *"The hook configuration
  is a file in the project. An agent with write access can edit it — I got a
  targeted Edit through that left it `{}`. Detection is possible; prevention needs
  org-managed settings I do not control."*

So: **two open among the seven hunt routes** (glob, `git -c`), with a third
not-fully-prevented surface — the hook-config edit — disclosed as a deployment
limitation rather than counted as a bypass. A reader who counts "everything an
agent can still do to defeat this" should read three, and the post gives them all
three; a reader counting "routes found in the hunt that remain open" reads two.
The two numbers describe two different questions, and neither is hidden.
