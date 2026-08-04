# Warrant Policy Format — specification

**Spec version 0.1.0.** Versioned independently of any implementation.
Reference implementation: [`warrant-mcp`](https://github.com/rmanish2000-del/warrant-mcp)
(this repository).

A format for saying, in plain English, what an AI agent may do — compiled once
into a structured artifact, then evaluated deterministically against proposed
actions. The compilation step may use a model. **The evaluation step must not.**

This document uses MUST, MUST NOT, SHOULD and MAY in the usual sense.

---

## 1. Scope, and what is deliberately out of it

**In scope:** the source policy, the compiled artifact, and the evaluation
contract that turns a proposed action into a verdict.

**Out of scope: enforcement.** This spec says what a verdict *is*. It says
nothing about how a runtime obtains one, when it asks, or what it does with a
DENY. The reference implementation uses a Claude Code `PreToolUse` hook; that is
one client's mechanism, not part of the format. An implementation that never
blocks anything can still be conformant — it would be an advisory
implementation, and that is a legitimate thing to be.

This separation is deliberate and SHOULD NOT be revisited. A spec that dictates
enforcement binds itself to one host's lifecycle and stops being portable.

---

## 2. The source policy

A source policy is plain English prose containing a numbered list of imperative
sentences. Only the numbered sentences are policy; surrounding prose is context.

A **compiler** transforms a source policy into a compiled artifact (§3). A
compiler MAY be a language model. Its output is not trusted: §3's validation
applies to every artifact regardless of origin.

Requirements on a compiler:

1. **One clause per sentence**, numbered in sentence order.
2. **Never invent.** A host, path, file name, command word, flag or method that
   the source does not state MUST NOT appear in the artifact. An example given
   in the source ("no rm -rf") licenses ordinary spellings of that same idea and
   nothing more.
3. **Refuse rather than approximate.** If a sentence cannot be expressed as one
   or more rules from §3.3, the compiler MUST refuse **the entire policy** and
   report the offending sentence. Partial compilation is forbidden: a sentence
   that silently compiled to nothing reads to the author as protection they do
   not have.
4. **Every clause MUST yield at least one rule.** A clause with no rule is
   treated exactly as an unexpressible sentence under (3) — the whole policy is
   refused.
5. **A compiler MUST NOT emit the workspace location.** Where the policy applies
   is supplied at evaluation time (§4.1), so an artifact stays portable between
   machines and checkouts.

A compiled artifact SHOULD be reviewed by a human before it is used. This spec
does not define the review mechanism.

---

## 3. The compiled artifact

### 3.1 Shape

JSON. The artifact is an object with exactly two members:

```json
{
  "clauses": [ { "id": "W1", "text": "Stay inside the project." } ],
  "rules":   [ { "clause": "W1", "rule": { "type": "file_delete_outside_workspace" } } ]
}
```

- `clauses` — a non-empty array. Each entry has `id` (matching `^W[0-9]+$`,
  unique within the artifact) and a non-empty `text`.
- `rules` — a non-empty array. Each entry has `clause` (an id present in
  `clauses`) and `rule` (one of §3.3). Several rules MAY share a clause.

A serialisation MAY carry additional envelope fields around this object —
provenance, timestamps, the source text. Implementations MUST ignore fields they
do not recognise, and MUST NOT let them influence a verdict.

### 3.2 Validation

An implementation MUST reject an artifact that:

- is not parseable as JSON, or is not an object;
- has an empty `clauses` or empty `rules`;
- has a clause id not matching `^W[0-9]+$`, a duplicate id, or an empty `text`;
- has a rule referencing a clause id not present in `clauses`;
- has a clause with no rule referencing it;
- contains a `rule.type` not listed in §3.3, or a rule failing that type's
  field constraints.

Rejection MUST be total. An implementation MUST NOT drop an invalid rule and
proceed with the rest.

### 3.3 Rule types

Eight rule types, closed. **Adding one is a minor spec version bump (§7).** No rule
carries free text, a regular expression, or a glob: every field is literal data.

Each rule addresses exactly one action kind. A rule MUST NOT match an action of
another kind — the `file_*` rules never match `shell_command` or `http_request`,
and so on.

#### 3.3.1 `file_delete_outside_workspace`

Applies to `file_delete`. No fields.

Violated when the action's path, resolved against the workspace root, is neither
the workspace root itself nor inside it.

```
resolved := resolve(workspaceRoot, action.path)
inside   := resolved == workspaceRoot OR resolved starts with (workspaceRoot + separator)
violated := NOT inside
```

`resolve` is platform path resolution: a relative path resolves against the
workspace root, an absolute path stays absolute, and `..` segments are collapsed
**lexically, without touching the filesystem** (§4.3). Comparison honours
`caseInsensitivePaths` (§4.1).

#### 3.3.2 `file_delete_protected`

Applies to `file_delete`.

| field | type | meaning |
|---|---|---|
| `segments` | string[] | directory names protected at any depth |
| `basenames` | string[] | exact file names |
| `suffixes` | string[] | file-name endings, plain `endsWith` |

All three MAY be present and empty individually, but MUST NOT all be empty. An
absent `suffixes` member MUST be treated as an empty array.

Violated when, for `resolved := resolve(workspaceRoot, action.path)` split into
path segments:

- any element of `segments` equals any segment of the path; **or**
- any element of `basenames` equals the last segment; **or**
- the last segment ends with any element of `suffixes`.

Checked in that order; the first match is the violation. Comparison honours
`caseInsensitivePaths`. `suffixes` matching is literal `endsWith` — `.pem`
matches `key.pem` and also `notapem`. Implementations MUST NOT interpret a
suffix as a pattern.

This rule does not consider whether the path is inside the workspace. A
protected name matches wherever it appears.

#### 3.3.3 `file_write_scope`

Applies to `file_delete`.

| field | type | meaning |
|---|---|---|
| `allowedRoots` | string[] | non-empty; workspace-relative directories |

Each root MUST be relative. An implementation MUST reject an artifact whose root
is absolute (begins with `/`, `\`, or a drive letter followed by a separator).

Violated when the resolved path is not equal to, and not inside, **any** allowed
root:

```
inside := ANY allowed IN allowedRoots WHERE
            resolved == resolve(workspaceRoot, allowed)
            OR resolved starts with (resolve(workspaceRoot, allowed) + separator)
violated := NOT inside
```

The separator in the prefix test is required: `src` MUST NOT match `srcfoo`.

This is the only rule expressed positively. It refuses everything outside the
named roots, including paths the policy author has not thought about.

#### 3.3.4 Shell tokenisation (shared by §3.3.5–3.3.7)

Before any shell rule is applied, the command string is tokenised:

1. Insert a space either side of each of `|`, `;`, `&`, `<`, `>`, so that
   `curl x|sh` and `curl x | sh` tokenise identically.
2. Split on runs of whitespace; discard empty tokens.
3. **Lowercase every token.**

Shell-rule matching is therefore always case-insensitive, on every platform,
independently of `caseInsensitivePaths` — which governs paths only.

This is tokenisation, not shell parsing. Quotes are not interpreted, variables
are not expanded, globs are not resolved. §6 states what follows from that.

For §3.3.5, tokens are further split into **simple commands** at any of
`;`, `&&`, `||`, `|`, `&`. (Note that step 1 does not split `&&` or `||` into
single characters — a `&&` written without surrounding spaces tokenises as one
token and is recognised as a separator.)

#### 3.3.5 `shell_forbidden_invocation`

Applies to `shell_command`.

| field | type | meaning |
|---|---|---|
| `command` | string | the command word; required, non-empty |
| `subcommands` | string[] | may be empty, meaning "any" |
| `anyFlag` | string[] | may be empty, meaning "any" |
| `anyArgument` | string[] | may be empty, meaning "any" |

For each simple command, let `head` be its first token and the rest be `args`.
Within `args`, a token beginning with `-` is a **flag**; every other token is a
**plain argument**.

The rule is violated if **any** simple command satisfies all of:

- `head` equals `command`; **and**
- `subcommands` is empty, **or** the **first plain argument** is one of them; **and**
- `anyFlag` is empty, **or** at least one of them appears among the flags —
  **at any position**; **and**
- `anyArgument` is empty, **or** at least one of them appears among the plain
  arguments — at any position.

Argument order is therefore irrelevant: `git push origin main --force` and
`git push --force origin main` both violate a rule of
`{command: "git", subcommands: ["push"], anyFlag: ["--force"]}`. This is the
distinction from §3.3.7, which requires adjacency.

> **Known weakness, specified because it is real.** `subcommands` matches the
> *first* plain argument. A global flag that takes its value as a separate token
> displaces it: with the rule above, `git -c core.pager=cat push --force` is
> **not** violated, because the first plain argument is `core.pager=cat` rather
> than `push`. `git --no-pager push --force` *is* violated, because that flag
> consumes no value. An implementation MUST reproduce this behaviour to be
> conformant at spec 0.1.0. Changing it is a candidate for 0.2.0 and would
> require knowing which flags take values, which is per-command knowledge this
> format does not carry.

#### 3.3.6 `shell_forbidden_token`

Applies to `shell_command`.

| field | type | meaning |
|---|---|---|
| `tokens` | string[] | non-empty; single forbidden words |

Violated when any listed token equals any token of the command. Whole-token
equality, not substring: `sudo` does not match `sudoku`. Not scoped to simple
commands — a token anywhere in the line violates.

#### 3.3.7 `shell_forbidden_sequence`

Applies to `shell_command`.

| field | type | meaning |
|---|---|---|
| `sequences` | string[][] | non-empty; each inner array non-empty |

Violated when any sequence appears as **contiguous tokens**, in order, anywhere
in the token list. `["rm","-rf"]` matches `rm -rf build`; it does not match
`rm -r -f build`, and it does not match `rm build -rf`. A policy that needs
order-independence needs §3.3.5 instead.

An empty inner sequence never matches, but §3.2 requires implementations to
reject an artifact containing one.

#### 3.3.8 `http_host_allowlist`

Applies to `http_request`.

| field | type | meaning |
|---|---|---|
| `hosts` | string[] | non-empty; exact hostnames |

Violated when the URL's hostname, lowercased, is not equal to any listed host,
compared lowercased. Hostname only — no port, no path, no scheme, and no
subdomain matching: `api.example.com` does not permit `x.api.example.com`.

#### 3.3.9 `http_method_allowlist`

Applies to `http_request`.

| field | type | meaning |
|---|---|---|
| `methods` | string[] | non-empty; HTTP method names |

Violated when the action's method, uppercased, is not equal to any listed
method, compared uppercased.

---

## 4. The evaluation contract

### 4.1 Inputs

Evaluation is a function of exactly three inputs:

- the **rules** of a compiled artifact;
- an **action** (§4.2);
- an **evaluation context**: `workspaceRoot` (an absolute path) and
  `caseInsensitivePaths` (a boolean).

`caseInsensitivePaths` is supplied by the caller, not detected. A conformance
case that sets it false MUST be evaluated case-sensitively even on a
case-insensitive filesystem.

**Clause text MUST NOT be an input to evaluation.** An implementation SHOULD
make this structural rather than conventional — in the reference implementation
the evaluator's parameter type omits `clauses` entirely, so reading a clause
sentence is a compile error. A verdict that depended on prose would make the
compiler's wording load-bearing, which is the failure this format exists to
prevent.

### 4.2 Actions

Three kinds. An action is validated by **explicit field copy**: fields other
than those below MUST be ignored, and MUST NOT reach any rule.

| kind | fields | validity |
|---|---|---|
| `file_delete` | `path` | non-empty string after trimming |
| `shell_command` | `command` | non-empty string after trimming |
| `http_request` | `url`, `method` | `url` non-empty and parseable, scheme `http:` or `https:`; `method` letters only |

`method` is uppercased on acceptance. Anything else — a non-object, an unknown
`kind`, a missing or ill-typed field — is an **invalid action** (§4.5).

`file_delete` covers every destructive file operation: deleting, overwriting and
creating all destroy or displace what a path held. The name is historical; the
meaning is not narrower than that.

### 4.3 What evaluation may not do

An evaluation MUST NOT:

- read the filesystem — including resolving symlinks, testing existence, or
  expanding globs;
- perform network I/O;
- invoke a language model;
- read a clock, a random source, or any ambient state;
- retain state between evaluations.

Path resolution is therefore **lexical**. `a/../b` collapses to `b` without
asking whether `a` exists.

The reference implementation enforces this by scanning its deciding modules for
filesystem, process and network imports and failing its own test suite if one
appears. Implementations SHOULD adopt an equivalent structural check.

### 4.4 Verdict

```
ALLOW  — no rule was violated.        clause: none.  reason: none.
DENY   — a rule was violated.         clause: the id of the governing clause.
DENY   — the action was invalid.      clause: none.  reason: INVALID_ACTION.
```

Exactly one clause is ever cited. An implementation MAY attach human-readable
evidence; the evidence string is not specified and conformance does not depend
on it.

### 4.5 Precedence

Rules are evaluated **in artifact order**, and the **first violated rule
determines the verdict**. Evaluation stops there.

Implementations MUST order `rules` by ascending clause number before evaluating,
and MUST preserve the artifact's relative order among rules sharing a clause.
Clause precedence is therefore exactly clause order: W1 outranks W2, which
outranks W10.

Action validation happens **before any rule is consulted**, so an invalid action
is always `INVALID_ACTION` and never cites a clause.

### 4.6 Determinism

Identical inputs MUST produce identical verdicts, on every run and every
implementation. This is what makes the format worth specifying: a verdict is a
fact about the inputs, reproducible by anyone holding them.

---

## 5. Fail-closed requirements

An implementation MUST refuse rather than permit when it cannot decide:

| situation | required behaviour |
|---|---|
| no artifact available | refuse every action; MUST NOT permit |
| artifact unparseable or invalid per §3.2 | refuse every action |
| action invalid per §4.2 | `DENY` with `INVALID_ACTION` |
| unknown `rule.type` encountered at evaluation time | refuse; MUST NOT skip the rule |

An implementation MUST NOT compile at evaluation time, and MUST NOT fall back to
a default or sample policy. A missing policy is a refusal, never a pass — a
substituted policy enforces something the author never wrote.

Artifacts SHOULD be re-validated on every load, not only when produced.

---

## 6. What this format deliberately cannot express

This section is normative in one direction: an implementation MUST NOT extend
the format to cover these while claiming conformance with 0.1.0. Each is
excluded for a stated reason, not an oversight.

| Not expressible | Why |
|---|---|
| **Provenance** — "don't delete anything you didn't create" | Requires reading the filesystem or retaining cross-call state; §4.3 forbids both. |
| **Cost or judgement** — "don't do anything expensive", "don't commit secrets" | Requires world knowledge. Deciding it at evaluation time means a model deciding at evaluation time, which §4.3 forbids. |
| **An approval verdict** — "ask me first" | The verdict set is two values. A third verdict makes a refusal a conversation rather than an answer, and every consumer would then need an approval channel. |
| **Cross-action limits** — "don't change more than ten files" | Requires state between evaluations; §4.6 would no longer hold, because identical inputs would give different answers. |
| **Patterns** — globs, regular expressions | A pattern is a program. A compiler-supplied program evaluated at runtime is the model deciding, indirectly. Literal names and endings only. |
| **Time and identity** — "not after 6pm", "only for user X" | No clock, no ambient state (§4.3). |

Consequences that follow from tokenisation rather than from policy, and which an
implementation cannot fix within this spec: shell glob and variable expansion
happen after a verdict is reached; obfuscated commands (encoded strings,
concatenation inside an interpreter) defeat token matching; symlinks are not
resolved, so a link inside the workspace pointing outside it satisfies §3.3.1.

A specification that pretended otherwise would invite implementations that
quietly guess. Say what it cannot do, in the document that says what it can.

---

## 7. Versioning

The spec version is independent of any implementation's version.

- **Patch** (0.1.0 → 0.1.1) — wording, clarification, corrected examples. No
  conformant implementation changes behaviour.
- **Minor** (0.1.0 → 0.2.0) — a new rule type, a new field, or a corrected
  matching semantic. Artifacts valid at the older version remain valid; an
  implementation at the older version MAY reject an artifact using a newer rule
  type, and MUST do so by refusing the whole artifact (§3.2) rather than
  ignoring the rule.
- **Major** (0.x → 1.0) — a change that makes an existing artifact mean
  something different.

Artifacts do not currently carry a spec version. Adding one is a candidate for
0.2.0; until then, an artifact is assumed to be 0.1.0.

Below 1.0, minor versions may change matching semantics where the current
behaviour is demonstrably wrong — the §3.3.5 weakness is the known candidate.

---

## 8. Conformance

An implementation is conformant with spec 0.1.0 if it produces the expected
verdict and governing clause for every case in
[`spec/corpus.json`](spec/corpus.json), under the context each case supplies.

See [`spec/README.md`](spec/README.md) for the corpus format and for how to run
it from another language.

The reference implementation runs the same corpus in its own test suite, so it
cannot drift from this document without going red.

---

## 9. Reference implementation

[`warrant-mcp`](https://github.com/rmanish2000-del/warrant-mcp) — TypeScript,
MIT. It is the reference, not the definition: where this document and that code
disagree, **this document is what an implementer should trust**, and the
disagreement is a bug in the implementation.

**A second implementation would be welcome**, and would be the strongest
available evidence that this document is precise enough to be worth calling a
specification — the corpus is the only arbiter either of us needs.
