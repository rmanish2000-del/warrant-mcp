# The closed rule set — what a policy sentence can become

Eight rule types, pure data, no free text, no model-supplied patterns. Every
policy sentence must compile into one or more of these or the whole policy is
refused. Source of truth: `src/compiler/schema.ts` (the schema the model is
constrained to) and `src/authoring/describe.ts` (the exact English the review
screen shows for each rule). If this file and the schema ever disagree, the
schema wins.

## File rules

### `file_delete_outside_workspace`
- **The sentence it exists for:** "Stay inside the project — don't create,
  change or delete anything outside it."
- Carries **no path**. The system stamps the workspace at runtime; a policy
  that named a machine path would break the moment the project moved.
- Despite the name, the whole `file_delete_*` family governs destructive file
  operations generally: deleting, overwriting, **and creating** — all three
  destroy or displace what the path held.

### `file_delete_protected`
- **The sentence it exists for:** "Leave my .env alone." / "Don't touch
  anything in .git." / "Never touch anything ending in .pem or .key."
- Three fields, any may be empty but not all three:
  - `segments` — directory names ("anything inside a directory named .git")
  - `basenames` — exact file names (".env")
  - `suffixes` — file-name endings (".pem") — **plain ends-with, never a
    wildcard or pattern**
- Protection applies wherever the name appears, at any depth.

### `file_write_scope`
- **The sentence it exists for:** "Only write inside src and tests — the
  rest of the repo is read-only to you."
- The one **positive** form, and the broadest rule in the set: everything
  outside the named roots is refused. Concretely, a policy scoped to `src`
  and `tests` refuses editing `README.md`, `package.json`, and `.gitignore`
  — the refusal lands on files the user has not thought about yet, so name
  that consequence to them before they compile.
- Exclusivity, not permission, is the trigger: "only ever touch drafts"
  licenses a scope; "writing in app/ is fine" licenses nothing beyond
  access — compiling permission into a scope narrows the user's authority
  beyond their words.
- One field: `allowedRoots`, the writable directories. Roots are
  **workspace-relative** — an absolute root is a schema rejection.

## Shell rules

### `shell_forbidden_token`
- **The sentence it exists for:** "Never run anything as root: no sudo, no su."
- Single forbidden command words (`tokens`), matched anywhere in the command.

### `shell_forbidden_sequence`
- **The sentence it exists for:** "Never do a recursive force delete — no
  rm -rf." / "Don't pipe anything you downloaded straight into a shell."
- Matches **contiguous** token sequences only (`sequences`): `["rm","-rf"]`,
  `["|","sh"]`.
- **The trap:** real invocations put flags anywhere.
  `git push origin main --force` escapes a `["git","push","--force"]`
  sequence. For command+subcommand+flag intents, the invocation rule below is
  the right tool; sequences are for genuinely adjacent idioms.

### `shell_forbidden_invocation`
- **The sentences it exists for:** "Never force-push — not with --force, not
  with -f, not with --force-with-lease." / "Don't push straight to main or
  master." / "Don't install new dependencies with npm — no npm install, no
  npm i, no npm add."
- Fields: `command` (e.g. `git`), `subcommands` (first non-flag argument,
  e.g. `["push"]` — empty means any), `anyFlag` (fires if any listed flag
  appears **anywhere**, order-independent), `anyArgument` (any listed
  non-flag argument, e.g. `["main","master"]`).
- This is why the policy sentence must name the flag's long **and** short
  forms and the subcommand's aliases: the compiler emits the spellings the
  user's words cover and adds none.

## HTTP rules

### `http_host_allowlist`
- **The sentence it exists for:** "The only hosts you may reach are
  api.github.com and registry.npmjs.org."
- Exactly the hostnames the policy names (`hosts`) — the compiler never adds
  one, so write real hostnames, not descriptions ("the npm registry" names
  nothing).

### `http_method_allowlist`
- **The sentence it exists for:** "Only GET and HEAD requests — don't send
  our data out."
- Upper-case method names (`methods`).

## Cross-cutting facts worth designing around

- **Clauses are numbered W1, W2, … in sentence order**, one per policy
  sentence. Order the list so the most important protections read first —
  refusals cite the clause number.
- **Every clause must yield at least one rule.** A clause the model cannot
  back with a rule is the same failure as an unmapped sentence: the whole
  policy is refused. There is no such thing as a decorative sentence inside
  the numbered list — put commentary in the surrounding prose instead.
- **Prohibitions only.** Anything no rule forbids is allowed. Under-writing
  the policy silently weakens it; the compiler is instructed to prefer
  refusing a sentence over compiling it weakly.
