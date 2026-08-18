# Changelog

Only what changes a verdict or what a stranger installs. Full history is git.

## 0.2.6 — 2026-08-19

- **Fix: Windows-style absolute paths escaped containment on POSIX hosts.**
  `C:\elsewhere\x`, `C:/elsewhere/x` and UNC `\\server\share` paths are absolute
  under Windows rules, but a POSIX host's path resolution read them as relative
  text and placed them *beneath* the workspace — so `file_delete_outside_workspace`
  and `file_write_scope` saw them as inside and never denied. They are now
  recognised as absolute on every platform and fail closed when they cannot be
  placed inside the workspace. Found by running the test suite on Linux for the
  first time (the dev machine is Windows, where the host path rules masked it);
  written up as "the eighth" in `writing/bypass-hunt.md`.
- Regression coverage for the class in `src/engine/hardening.test.ts` (drive
  letters, UNC, backslash separators, plus homoglyph hostnames, mixed-case
  tokens/methods, oversized commands, malformed policy/action fail-closed) and a
  traversal-shaped MCP tool-name case in `src/hook/adapter.test.ts`. Suite is
  243 tests, green on ubuntu and windows.
- CI added: matrix (ubuntu + windows, Node 22.x) on every PR and push to main —
  the run that caught this class.
- README: the eighth route added to the Limitations section.

## 0.2.5 — 2026-08-17

- README-only: removed a folded bypass count ("seven routes known") that the
  repository's own counting rule forbids; the seventh route is counted apart
  from the six because it was found by writing the spec, not by attacking.
  Code identical to 0.2.4.

## 0.2.4 — 2026-08-17

- First published build containing the authorization record (`decisions.jsonl`),
  `warrant-mcp report`, and `SPEC.md` + the conformance corpus. **0.2.3
  documented these and did not contain them** — it was published three source
  commits before they existed, so `warrant-mcp report` answered
  `unknown command` on the installed copy. Recorded here plainly because a
  version string that covered two different trees is worth saying out loud once.
- Bypass disclosure dated from commit evidence (sessions 2026-08-03, the
  spec-found route 2026-08-04).

## 0.2.3 — 2026-08-04

- Baseline of the published package: engine, compiler, hook, MCP server, init /
  remove / review / accept / test, the write-scope rule teaching, and the
  committed compile cache.
