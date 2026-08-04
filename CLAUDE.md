# CLAUDE.md

Guidance for Claude Code working in this repository. Written in the same
spirit as the sibling `warrant` repo's CLAUDE.md: decisions recorded once so
the next session does not re-derive them — or quietly undo them.

## Product

**warrant-mcp** — a policy firewall for agent tool calls. A human writes
policy in plain English; Claude compiles it **once, off stage** into numbered
clauses backed by structured rules; deterministic code checks every intended
action and refuses what the policy does not allow, citing the governing
clause; a Claude Code PreToolUse hook makes that refusal a **hard block**.

> Claude compiles policy. **Deterministic code decides.** The hook makes a
> DENY mean the action does not happen.

This is a skeleton by design: two verdicts (ALLOW / DENY), three action kinds,
one MCP tool. No payments, no ESCALATE, no UI, no accounts.

## Relationship to the `warrant` repo

`C:\Push-to-Prod-2026\warrant` is the proven deterministic authorization
engine for agentic commerce. It is **reference only**: read it to understand
the model (type-level guarantee, cached replay, clause citation, fail closed).
It has never been modified by this project and must not be — verify with
`git status` there, and with its own invariant `git diff submission..HEAD -- src/`.

What was reused: the thinking. What was deliberately diverged:

| | warrant | warrant-mcp | why |
|---|---|---|---|
| compile cache | gitignored | **committed** | the reviewed cache is the enforceable artifact; a fresh clone must enforce without an API key |
| compile failure | labelled stub fallback | **no fallback, fail loud** | a recording must survive an outage; a made-up enforcement policy is worse than none |
| verdicts | ALLOW / ESCALATE / DENY | **ALLOW / DENY only** | two values are what make the hook a hard veto |

## Architecture

- **Toolchain** — TypeScript strict, no build step *for development*
  (`--experimental-strip-types`, Node ≥ 22.6). `erasableSyntaxOnly` is
  load-bearing: source must stay strippable.
- **The published package is different, and has to be.** Node refuses to strip
  types under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so
  an installed copy would not run at all. `prepack` emits `dist/` via
  `tsconfig.build.json` and the tarball ships that. Because `erasableSyntaxOnly`
  is on, the emit is pure type erasure — there is no transform that could change
  a verdict. `bin/warrant-mcp.mjs` runs `dist/` when it exists and `src/` when it
  does not, so a checkout and an install behave identically.
- **`src/engine/`** — pure evaluation. No clock, no I/O, no network, no
  process spawning. Everything arrives as a parameter.
- **`src/compiler/`** — the only place the Anthropic SDK is imported. The
  server and the hook never import it.
- **`src/hook/`** — `pretooluse.ts` (the stdin/stdout boundary) plus a pure
  `adapter.ts` that maps Claude Code tool calls onto action kinds.
- **`src/server/`** — MCP stdio server (`main.ts`), pure `handler.ts`,
  presentation in `present.ts`.
- **`src/authoring/`** — review-time only: rules→English, behaviour-diff
  corpus, unmapped guidance, CLI phrase parsing. **Never imported by the
  engine, handler or hook.**
- **`src/cli/`** — system boundaries: the only files that read the clock, the
  environment, or spawn anything.
- **`src/config/`** — where things live and how warrant merges into files it
  does not own. `settings.ts` is pure JSON merging, so the promise that a
  user's settings survive is testable without touching a disk.

## Invariants

Violating any of these breaks the product claim, not just a test.

1. **The evaluator is authoritative.** The model never decides at runtime.
2. **Clause English is unreachable by the evaluator** — `EvaluablePolicy =
   Omit<CompiledPolicy, 'clauses'>`, plus `toEvaluable()` explicit field copy
   so the English is physically absent at runtime too. A compile error, not a
   convention.
3. **The rule set is closed, and pure data.** No free text, no model-supplied
   regex or glob. A sentence the rules cannot express is returned `unmapped`
   and the **whole policy is refused** — never approximated.
4. **Cached replay is the only enforcement path.** The server and hook never
   compile; a missing or invalid cache is a loud refusal. The cache is
   re-validated on every load.
5. **Fail closed everywhere.** Malformed action, unreadable hook input,
   invalid cache, unknown rule → DENY.
6. **A DENY performs no side effect.** The deciding modules import no
   filesystem, process-spawning or network capability — `guard.test.ts`
   enforces this by scanning their source. Do not add such an import; do not
   weaken the scanner when its own prose trips it (reword the comment).
7. **The hook vetoes, never approves.** On ALLOW it exits silently so Claude
   Code's own permission flow still applies.
8. **Nothing compiles on a demo path.** `policy:review` is the one place a
   live compile is correct — a human is present and deciding.
9. **Determinism.** Identical inputs, identical verdict, always.
10. **`init` merges, never overwrites, and is exactly undoable.** It backs up
    the original bytes of every file it modifies; `remove` restores them
    byte-for-byte. A file it cannot parse is refused, not rewritten.
11. **The compiled policy never lives inside the project it governs.** `init`
    vaults it under `~/.warrant/projects/<project>/`, read-only. Putting it
    back in the workspace would undo M5 and reopen M4 attack 8.

## What is deliberately NOT claimed

Read [SECURITY-SURFACE.md](SECURITY-SURFACE.md) before saying this stops
anything. Still open by construction: shell glob and variable expansion,
obfuscation, symlinks, implicit-target commands (`git clean -fdx`), unmapped
tools/clients, TOCTOU. The hook config itself (`.claude/settings.json`) is
editable by an agent — mitigated by read-only plus tamper detection in
`demo:check`, which is **detection, not prevention**; the real fix is
org-managed settings.

**This is a policy layer, not a sandbox. It should be deployed inside one.**

Two hard-won lessons, both found by attacking the thing in real sessions:

- **Coverage is per-tool.** The M3 PowerShell hole and the M4 `mcp__*` hole
  were the same shape. When adding coverage, match every shell and every
  mutating tool the client exposes.
- **Extraction errs toward checking too much.** A checked path the policy
  permits stays permitted; an unchecked one is a bypass. Readers are
  allowlisted so refusal sentences stay true (`cat .env` is not a destructive
  operation); `find` is deliberately not a reader.

## Demo discipline

- Beats, prompts and expected banners are pinned in [DEMO-CARD.md](DEMO-CARD.md).
  Beat 1 cites **W2**, beat 2 cites **W4** — keep those clause positions when
  editing `policy.md`, or update the card.
- **Demo commands must look benign to the model.** A scary-looking command
  gets refused by the model before the hook fires and Warrant gets no credit.
  That is why the beats are "delete the leftover .env" and "remove scratch
  junk-dir", not `sudo rm -rf /`.
- `file_write_scope` is **not** in the demo policy on purpose: scoping writes
  to `src/`+`tests/` would deny the root `.env` delete and break beat 3.
- The stage sandbox (`../warrant-mcp-demo`) and the policy vault
  (`../warrant-policy-vault`) live outside this repo. The vault is outside the
  sandbox so **clause W1 governs it** — the policy protects itself.

## Commands

- `npm test` — full suite (currently **99 tests**). New test files must be
  added to the script's explicit list; discovery is deliberate, not globbed.
- `npm run typecheck` — `tsc --noEmit`, strict.
- `npm run policy:review` / `policy:accept` / `policy:test -- "<action>"` —
  the authoring loop. Review is the only command that compiles (needs
  `ANTHROPIC_API_KEY`); accept is a re-validated file copy.
- `npm run demo:reset` / `demo:check` / `demo:permit` — stage management.
  `demo:check` ends in exactly one READY / NOT READY line.
- `npm run demo` — canonical checks with banners, fully offline.
- `npm start` — the MCP server on stdio (normally spawned by the client).

## Conventions

- **Never `git add -A`.** Name every path.
- **Never read, print or echo `.env`.** Secrets stay in the environment.
- **The npm token lives in the user-level `~/.npmrc` and nowhere else.** It is
  never committed, never pasted into a chat, never echoed, and never read back —
  not even partially. To publish, the human sets it once in their own terminal
  with `npm config set //registry.npmjs.org/:_authToken=<token>`; verification is
  `npm whoami`, which prints a username and not a secret. A repo-level `.npmrc`
  is gitignored precisely so a token cannot arrive there by accident.
- `attack-fixtures/` holds an adversarial file-deleting MCP server used to
  test hook coverage. It is gitignored and must never ship as product code.
- `policy-compiled.pending.json` is a transient review draft; the server and
  hook never read it.
- Current compile: **12 clauses, 14 rules**, `claude-opus-5`, prompt v1.2.0. The same
  pair is copied to `templates/` for `warrant-mcp init`; `paths.test.ts` pins that they
  match, because the root copy is not shipped and the template is.
- Published as **`warrant-mcp`** on npm (MIT). `warrant` was taken.
- Remote: `github.com/rmanish2000-del/warrant-mcp` — **private**. It becomes public only
  by an explicit decision at submission, never as a side effect of a push. A full-history
  scan across all commits found no secrets before the first push; re-run it before any
  change of visibility.
