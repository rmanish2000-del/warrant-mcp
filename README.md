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

## Commands

- `npm test` — engine verdicts, compiler schema gates, the no-side-effect
  guard, and the canonical-verdict pin against the committed cache.
- `npm run typecheck` — strict `tsc --noEmit`; `erasableSyntaxOnly` keeps
  every source file strippable.
- `npm run demo` — the canonical checks through the real handler and cache,
  verdict banners on the terminal. No API call, no side effects.
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
- `check_action` is advisory infrastructure: it refuses to *approve* actions,
  and performs none itself — but it cannot physically stop a caller that
  ignores the verdict. Wiring it into an enforcing harness (hooks) is the
  obvious next milestone.
