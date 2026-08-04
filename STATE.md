# State

Last updated 4 August 2026, at `warrant-mcp@0.2.3`. A status file, not a pitch.

## What this is

You write rules for an AI agent in plain English. Claude compiles them once,
off to the side, into numbered clauses backed by structured rules. Deterministic
code then checks every tool call against those clauses, and a Claude Code
`PreToolUse` hook blocks the ones the rules forbid, naming the clause that
decided.

## Verified

Each of these was run, not reasoned about.

- **Enforcement blocks.** Real Claude Code sessions asked to delete a protected
  file are refused, and the file is still there afterwards. Confirmed again on
  the published package from an empty directory.
- **The install path.** `npm install -g warrant-mcp`, `init`, a refusal —
  around a minute from nothing, most of it npm. `remove` restores a settings
  file byte-for-byte.
- **The plugin.** `claude plugin marketplace add` and `install` both work;
  the component inventory shows one skill and zero MCP servers.
- **The bypasses.** Nine adversarial sessions; six routes got through, five are
  closed with regression tests named for the attack that opened each. Full log
  in `SECURITY-SURFACE.md`.
- **Latency.** The decision is ~0.01ms. The Node process around it measured
  220–430ms median across three runs. `demo/bench.mjs` reproduces it.
- **The format is specified.** `SPEC.md` 0.1.0 defines the artifact, the
  matching semantics and the fail-closed rules; `spec/corpus.json` is 76
  language-agnostic checks that this repo runs against its own engine, so the
  document and the code cannot drift apart silently.
- **187 tests**, and `npm run typecheck` clean.

## Assumed, not verified

- **Every session and every timing ran on Windows.** macOS and Linux are
  untested. The agent reached for PowerShell because PowerShell was there; on
  another machine the same gaps sit behind different tool names.
- **The bypass list is not provably complete.** Enumerating someone else's tool
  surface has no completion proof. Two of the six found were coverage gaps,
  which is the best evidence that more exist.
- **The npm and marketplace listings are correct as written**, but nobody has
  installed either except me.

## Open

- **Shell glob and variable expansion.** `rm -f *` is expanded by the shell
  after the hook has decided. Structural: resolving it needs filesystem reads,
  and the deciding path imports no filesystem capability by design.
- **Windows-only testing**, as above.
- **A global flag taking a separate-word value defeats a subcommand rule.**
  `git -c core.pager=cat push --force` is allowed where `git push --force` is
  denied. Found while writing the spec, left unfixed on purpose, documented in
  `SPEC.md` §3.3.5 and `SECURITY-SURFACE.md` §4.9, and pinned by a conformance
  case so changing it has to be a deliberate spec bump.
- **Other MCP clients.** Enforcement is a Claude Code hook. Anything else gets
  the `check_action` tool, which advises and does not enforce.
- **The hook wiring is reachable from the workspace.** An agent with write
  access can edit `.claude/settings.json`. Detection is possible; prevention
  needs org-managed settings.

## Not done

- **Nothing is published.** The write-up in `writing/bypass-hunt.md` is
  finished and unpublished; the platform variants and publish card are on the
  `publishing` branch.
- **No users.** No installs beyond my own, no issues, no bypass reports.
- **No feedback.** Every design decision here is one person's judgement,
  checked against tests rather than against anyone's experience of using it.

## What that means for the next session

The next move is publishing, and it belongs to the founder. Everything after
that depends on what actual users say, and there are none yet — so building
more before then is guessing. If something here needs changing, prefer waiting
for a reason from outside this repository.
