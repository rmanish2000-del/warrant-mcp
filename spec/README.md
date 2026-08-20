# The conformance suite

[`corpus.json`](corpus.json) is the arbiter for [SPEC.md](../SPEC.md) 0.1.0. It
is data, not TypeScript, so an implementation in any language can be checked
against exactly the cases the reference implementation is checked against.

## The format

```jsonc
{
  "specVersion": "0.1.0",
  "cases": [
    {
      "id": "outside-workspace-parent-escape",  // unique, stable
      "spec": "3.3.1",                          // the SPEC.md section it pins
      "description": "…",                       // why the case exists
      "context": { "workspaceRoot": "/ws", "caseInsensitivePaths": false },
      "rules": [ { "clause": "W1", "rule": { "type": "file_delete_outside_workspace" } } ],
      "action": { "kind": "file_delete", "path": "../secrets.txt" },
      "expect": { "decision": "DENY", "clause": "W1" }
    }
  ]
}
```

- `rules` is the `rules` member of a compiled artifact (SPEC.md §3.1). Clause
  text is deliberately absent: the evaluation contract never sees it (§4.1), so
  the corpus does not supply it.
- `action` is passed to your implementation **as it appears**, untrusted and
  unvalidated. Some cases are not valid actions at all — that is the point.
- `expect.clause` is `null` for `ALLOW` and for `INVALID_ACTION`.
- `expect.reason` is present only on invalid-action cases, where it is
  `"INVALID_ACTION"`.
- Evidence strings are **not** specified and are not compared. Two conformant
  implementations may word a refusal differently.

## Running it against your implementation

For each case:

1. Order `rules` by ascending clause number — `W1`, `W2`, … `W10` — as
   **numbers**, preserving the given order among rules sharing a clause
   (SPEC.md §4.5).
2. Evaluate `action` against those rules under `context`.
3. Assert `decision`, and the governing clause, match `expect`.

Roughly seventy lines in most languages. The reference runner is
[`src/spec/conformance.test.ts`](../src/spec/conformance.test.ts).

## Paths

Absolute paths are written POSIX-style. Resolve them with your platform's own
path resolution: on Windows `/ws` resolves onto the current drive, so the
resolved strings differ from POSIX — but every case's *verdict* is the same on
both, which is why none of the expectations mention a resolved path.

Resolution must be **lexical** (SPEC.md §4.3). Do not call the filesystem: none
of these paths exist, and a case like `src/../notes.txt` must still collapse.

Case sensitivity comes from `context.caseInsensitivePaths`, never from the host
filesystem. A case that sets it `false` must be evaluated case-sensitively on
macOS and Windows too. Shell matching is separately and always case-insensitive
(SPEC.md §3.3.4) — one case pins exactly that split.

## Coverage

73 checks: every rule type, both verdicts, the invalid-action path, clause
precedence, and the boundary cases that a naive implementation gets wrong —
name-prefix directories, non-contiguous token sequences, substring versus
whole-token matching, suffixes that are not extensions, and the documented
subcommand-position weakness in §3.3.5.

The reference runner additionally fails if a rule type exists in the schema
with no case here, so the corpus cannot silently fall behind the format.

## Adding a case

A case earns its place by pinning something an implementer could plausibly get
wrong. State the SPEC.md section, and if the case documents a weakness rather
than a desirable behaviour, say so in the description — as
`invocation-separate-word-flag-value-displaces-the-subcommand` does.

If a case here and SPEC.md disagree, **SPEC.md is right** and the case is the
bug. If SPEC.md and the reference implementation disagree, the implementation
is the bug — please open an issue.
