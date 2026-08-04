# warrant-mcp

A policy firewall for agent tool calls, as an MCP server. A human writes policy
in plain English; Claude compiles it once into numbered clauses backed by
structured rules; deterministic code checks every intended action against those
rules and refuses the ones the policy doesn't allow, citing the governing
clause. The model never decides at runtime.

Skeleton scope, deliberately: one tool, three action kinds, ALLOW/DENY only.
No payments, no escalation, no UI. This reuses the thinking of
[warrant](https://github.com/rmanish2000-del/warrant) (the deterministic
authorization engine for agentic commerce); it does not fork it.

## Install

```bash
npm install -g warrant-mcp
cd your-project
warrant-mcp init
```

That is the whole setup. `init` copies a starter policy, wires the PreToolUse
hook into `.claude/settings.json` and the server into `.mcp.json`, and returns
**enforcing** — it never compiles, so no API key is involved. Measured from an
empty directory to a first refusal, offline: **59 seconds**, of which 47 is
`npm install`.

Then, one command that refuses:

```bash
warrant-mcp test "delete .env"
```

`init` **merges** — every key already in your settings file survives, and a
file it cannot parse is refused rather than rewritten. It records the original
bytes, so:

```bash
warrant-mcp remove
```

restores your settings file byte-for-byte and deletes what init created.

`npx warrant-mcp init` works too. Requires Node ≥ 22.6.

### What init touches

| Path | |
|---|---|
| `.warrant/policy.md` | your policy in plain English — edit this |
| `.warrant/config.json` | a pointer to the compiled policy |
| `.claude/settings.json` | PreToolUse hook appended (merged) |
| `.mcp.json` | `warrant` server added (merged) |
| `~/.warrant/projects/<project>/` | **the compiled policy, read-only, outside your project** |

That last row is the one that matters. The compiled policy is the thing that
does the refusing, so it does not live where the agent works — an agent that
can delete its own policy can disarm what stops it. The same directory holds
the backup of your settings file and the record `remove` reads.

**Where an installed instance looks for your policy**, in order:

1. `WARRANT_MCP_POLICY` — an absolute path. `init` writes this into both
   generated configs, so a client that spawns the server from an arbitrary
   directory still finds the right policy.
2. `<cwd>/.warrant/config.json` — the pointer `init` writes, naming the vault
   outside the project.
3. `<cwd>/.warrant/policy-compiled.json` — a simple in-project layout, for
   anyone who prefers it.
4. `<package>/policy-compiled.json` — present only in a source checkout of this
   repository. It is deliberately **not** shipped in the tarball, so an
   installed copy can never silently enforce the sample policy; the sample
   ships under `templates/` and only `init` copies it.

If none resolve, the server refuses to start and the hook denies. A missing
policy is a refusal, never a pass.

## The one structural rule

> Claude compiles policy and explains nothing at runtime. **Deterministic code
> evaluates proposed actions.** If a description and the evaluator disagree,
> the evaluator wins.

Enforced at the type boundary, not by convention: the evaluator's input type
is `EvaluablePolicy = Omit<CompiledPolicy, 'clauses'>` — the compiled English
lives only in `clauses`, so `evaluate()` reading a clause sentence is a
**compile error**, not a code-review catch. Belt and braces, the server also
narrows by explicit field copy (`toEvaluable`) before every call, so the
English is physically absent from the object the evaluator receives, and
`guard.test.ts` pins that the deciding modules import no filesystem, no
process spawning, and no network capability at all.

## The tool

`check_action` — input is an intended action as structured data:

| kind | fields |
|---|---|
| `file_delete` | `path` |
| `shell_command` | `command` |
| `http_request` | `url`, `method` |

Output: `ALLOW` or `DENY`, the governing clause id and text when denied, and a
one-sentence plain-English reason built only from facts the evaluator
produced. Malformed input fails closed (`DENY`, reason `INVALID_ACTION`) —
including unknown kinds. Caller extras like `execute: true` are stripped by
allowlist copy before evaluation and can force nothing.

`check_action` only checks. There is no code path from any verdict to an
execution: the deciding modules cannot touch a file, spawn a process, or open
a connection, because they import nothing that could.

## What a policy can say

The compiler maps plain English onto a **closed set of eight rule types** —
pure data, no free text, no model-supplied patterns:

| Rule | The sentence it exists for |
|---|---|
| `file_delete_outside_workspace` | "Stay inside the project." |
| `file_delete_protected` | "Leave my .env alone." · "Never touch .pem or .key files." |
| `file_write_scope` | "Only write inside src/ and tests/." |
| `shell_forbidden_token` | "Never run anything as root." |
| `shell_forbidden_sequence` | "No rm -rf." · "Don't pipe downloads into a shell." |
| `shell_forbidden_invocation` | "Never force-push." · "Don't push to main." · "Don't install dependencies." |
| `http_host_allowlist` | "Only talk to these hosts." |
| `http_method_allowlist` | "GET and HEAD only." |

`shell_forbidden_invocation` matches command + subcommand + flag
**order-independently**, because `git push origin main --force` and
`git push --force origin main` are the same intent — a contiguous sequence
rule catches only one of them.

Some sentences people write cannot be decided from the action alone, and the
compiler is required to refuse rather than approximate them: "don't delete
anything you didn't create" (needs provenance), "don't do anything that costs
money" (needs world knowledge — the model deciding at runtime), "ask me
first" (needs an escalation verdict this system deliberately does not have),
"don't change more than ten files" (needs cross-call state). The reasoning,
and the ten sentences that drove this vocabulary, are in
[demo/ten-sentences.md](demo/ten-sentences.md).

## Writing a policy (the authoring loop)

Three commands, for someone who has never seen this project:

```bash
npm run policy:review
```

Compiles [policy.md](policy.md) live — **the one place compiling is correct,
because a human is present and deciding** — then shows every clause numbered,
every rule under it *in plain English rather than JSON*, and what changes in
**behaviour** against the previous policy. Nothing the hook reads is written
unless you accept; the draft waits in `policy-compiled.pending.json`, which
the server and hook never read. In a non-interactive shell it never guesses
consent — it holds the draft and tells you the next command.

```bash
npm run policy:test -- "delete .env"
npm run policy:test -- "shell git push origin main --force"
npm run policy:test -- "http GET https://example.com"
npm run policy:test -- --pending "delete .env"
```

Dry-runs one action against the active policy (or the pending draft) and
prints the verdict with the governing clause. Nothing is enforced, executed,
or written. It never guesses a kind from content — an input it does not
recognise is refused with usage, so the dry run always tests what you typed.

```bash
npm run policy:accept
```

Promotes the reviewed draft to active. **Never compiles** — a re-validated
file copy.

**The behaviour diff** is derived, not textual: every action in
[src/authoring/corpus.ts](src/authoring/corpus.ts) is evaluated against both
policies with the same pure evaluator the hook uses, and the difference is
reported in three directions — now refused, now allowed (flagged as
*widening authority*), and still refused but under a different clause. A
reworded policy that enforces the same thing reports "no behaviour change",
which is exactly what a text diff cannot tell you.

**When the compiler refuses**, the review screen shows the offending
sentence, what the rule set can express nearby, and a concrete rewrite to
paste. Rule-less clauses and model-declared `unmapped` sentences converge on
that same screen, so it never matters which way the failure was reported.

## Policy lifecycle

1. **Write** — [policy.md](policy.md), plain English, human-owned.
2. **Compile** — `npm run policy:fresh` (needs `ANTHROPIC_API_KEY` in `.env`
   or the environment). Claude maps each sentence to clauses `W1…Wn` and
   structured rules from a **closed rule set** (path containment, protected
   names, forbidden shell tokens/sequences, host and method allowlists — pure
   data, no regexes, no code). A sentence the rule set cannot express is
   returned as `unmapped` and the whole compile is **refused** — never
   approximated. A failed compile caches nothing; there is no stub fallback,
   deliberately: a made-up enforcement policy is worse than none.
3. **Review** — the compiled clauses and rules print on compile and via
   `npm run policy:show`. The cache ([policy-compiled.json](policy-compiled.json))
   is committed; committing the reviewed cache is the confirmation step.
4. **Enforce** — the server replays the cache. It never compiles: cached
   replay is the only path (`compile.ts` is not even imported by the server),
   and a missing or invalid cache is a loud startup refusal. The cache is
   re-validated on every load, so a hand-edited cache that no longer passes
   the schema is refused the same way a bad compile is.

The compiler never emits a machine path: the workspace root is stamped by the
system at server start (env `WARRANT_MCP_WORKSPACE`, defaulting to the
server's working directory) — the same discipline as warrant's rule that the
model may not set its own mandate's validity.

Divergence from warrant, on purpose: warrant gitignores its compile cache
(nothing generated is committed); here the cache **is** committed, because the
cache is the reviewed, enforceable artifact and a fresh clone must enforce
without an API key.

## Connect it to Claude Code

From this directory:

```bash
claude mcp add warrant -- node --experimental-strip-types C:/Push-to-Prod-2026/warrant-mcp/src/server/main.ts
```

(Adjust the absolute path to your clone. Or just open Claude Code inside this
repo — [.mcp.json](.mcp.json) registers the server automatically; approve it
when prompted.)

Then ask Claude to check an action before it acts:

> Use check_action to check `{ "kind": "shell_command", "command": "sudo rm -rf /" }`.

Requirements: Node ≥ 22.6 (`--experimental-strip-types`; no build step), and
`npm install` once. Optionally set `WARRANT_MCP_WORKSPACE` in the server's
env to pin the workspace the file rules are anchored to.

## Hard enforcement via Claude Code hooks (M2)

`check_action` advises; the PreToolUse hook **enforces**. Claude Code runs
[src/hook/pretooluse.ts](src/hook/pretooluse.ts) before executing a matched
tool call ([hooks reference](https://code.claude.com/docs/en/hooks)); a
`permissionDecision: "deny"` on stdout blocks the call outright — it
overrides even an `--allowedTools` allowlist, so a DENY means the action
does not happen regardless of what the agent decides.

Wire it into any project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|WebFetch|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node --experimental-strip-types 'C:/Push-to-Prod-2026/warrant-mcp/src/hook/pretooluse.ts'",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

Optional env (set inline in the command string): `WARRANT_MCP_POLICY` pins a
project-local compiled cache; `WARRANT_MCP_WORKSPACE` overrides the workspace
root (default: the session's cwd, from the hook's stdin payload).

How tool calls map onto the engine (adapter in
[src/hook/adapter.ts](src/hook/adapter.ts); evaluation is the unchanged M1
engine):

- **Bash / PowerShell** — the whole command is checked as `shell_command`;
  additionally, every path a deleter command removes (`rm` family and the
  PowerShell `Remove-Item` family) and every `>`/`>>` redirect target is
  checked as `file_delete` (an overwrite destroys what was there). PowerShell
  coverage exists because an M3 rehearsal caught the model deleting a
  protected file through the unmatched PowerShell tool — match every shell
  your client exposes.
- **Write / Edit / MultiEdit / NotebookEdit** — the target path is checked as
  `file_delete` under the destructive-file-operation clauses (W1/W2 are
  worded "create, overwrite, or delete" for exactly this reason).

Decision surface, deliberately asymmetric: DENY blocks with the projector
banner as the reason (shown to the human in the transcript and to the model);
anything else exits silently, so Claude Code's **own permission flow still
applies** — Warrant vetoes, it never approves. Every internal failure
(missing policy, unreadable input, invalid cache) also denies: fail closed.
Enforcement is fully offline — cached policy from disk, no network, no API.

The runnable demo lives in `C:\Push-to-Prod-2026\warrant-mcp-demo` (own
settings, `.env` sentinel), with its compiled policy vaulted **outside** the
sandbox and read-only so the agent cannot reach it — clause W1 governs the
vault path, so the policy protects itself (SECURITY-SURFACE.md §5);
[demo/policy-v2.md](demo/policy-v2.md) +
[demo/policy-compiled.v2.json](demo/policy-compiled.v2.json) are the
"policy change" variant that permits the `.env` delete — swapping the caches
is a file copy, so no demo path ever compiles.

## Commands

- `npm test` — engine verdicts, compiler schema gates, the no-side-effect
  guard, and the canonical-verdict pin against the committed cache.
- `npm run typecheck` — strict `tsc --noEmit`; `erasableSyntaxOnly` keeps
  every source file strippable.
- `npm run demo` — the canonical checks through the real handler and cache,
  verdict banners on the terminal. No API call, no side effects.
- `npm run demo:reset` / `demo:check` / `demo:permit` — stage-demo management
  (rebuild the sandbox pristine / one-line READY verification / activate the
  pre-compiled v2 policy). Fully offline; see [DEMO-CARD.md](DEMO-CARD.md).
- `npm run policy:fresh` / `npm run policy:show` — live compile (explicit,
  key required) / print the cache (never compiles).
- `npm start` — the MCP server on stdio (normally spawned by the client, not
  by hand). stdout is protocol; verdict banners go to stderr.

## Known limits (named, not hidden)

- The shell matcher is a tokenizer, not a shell parser: operators are isolated
  even unspaced (`curl x|sh` is caught), but obfuscation (`s\u0075do`, command
  substitution, `bash -c "$(…)"`) is out of scope for this skeleton.
- Symlinks are not resolved (`realpath` is I/O; the engine is pure). A symlink
  inside the workspace pointing outside would pass W1 by path text.
- The MCP tool alone is advisory — a caller could ignore its verdict. The
  PreToolUse hook (M2, above) closes that gap for the matched tools inside
  Claude Code; other clients still get advice only.
- **[SECURITY-SURFACE.md](SECURITY-SURFACE.md) is the honest account**: the
  full tool surface, an adversarial attack log (9 real sessions, 5 bypasses
  found and fixed in M4), and what still gets through — shell glob and
  variable expansion, obfuscation, symlinks, unmapped tools and clients,
  and TOCTOU. Read it before claiming this stops anything.
- This is a *policy* layer that produces a legible, human-authored refusal.
  It is not a sandbox and should be deployed inside one.
