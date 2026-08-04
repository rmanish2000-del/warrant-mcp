# warrant-mcp

**Write the rules for your AI agent once, in plain English. Every tool call is
checked against them, and the ones your rules forbid do not run.**

An agent can already decide what to do. It cannot prove it was allowed to.
Today that leaves two options: approve every tool call by hand, or trust the
agent. warrant-mcp is the layer in between.

**Here for the Claude Skill?** It lives in this repo:
[Writing a policy with Claude](#writing-a-policy-with-claude) — two commands
to install, no npm needed.

---

## Sixty seconds

```bash
npm install -g warrant-mcp
cd your-project
warrant-mcp init
```

`init` returns **enforcing**. No API key, nothing compiled, nothing to paste.

Now watch it refuse something:

```bash
warrant-mcp test "delete .env"
```

```
  DENY   clause W2
      W2 — Do not touch the .env file or anything inside the .git directory.
      Refused under clause W2: the file is named ".env", which is protected.

  Dry run: nothing was enforced, executed, or written.
```

Then open Claude Code in that directory and ask it to delete `.env`. The agent
will genuinely try; the hook blocks the tool call before it executes, and the
file is still there afterwards.

**Around a minute from an empty directory to that first refusal**, and almost
all of it is `npm install`. Four runs on the same Windows laptop came in between
43 and 71 seconds end to end, with the install accounting for 37 to 60 of that;
`init` and the check are a few seconds each. Your machine will differ. Nothing
after the install waits on a network or a model.

Changed your mind?

```bash
warrant-mcp remove
```

Your settings file comes back byte-for-byte and everything `init` created is
deleted. Try things you can undo.

---

## What just happened

1. You write rules in plain English — `.warrant/policy.md`.
2. Claude compiles them **once, off stage**, into numbered clauses backed by
   structured rules, and refuses to guess where a sentence is ambiguous.
3. Deterministic code evaluates every proposed action against those clauses and
   returns allow or deny, naming the clause that decided.
4. A Claude Code `PreToolUse` hook turns a deny into a hard block — the tool
   call never runs, and the deny overrides even an `--allowedTools` allowlist.
5. **The model never makes the runtime call.** Claude compiles the policy; code
   decides. The evaluator's input type does not even carry the clause text, so
   a model-written sentence structurally cannot reach a decision — that is a
   compile error, not a convention.

**The compiled policy lives outside your project** — `~/.warrant/projects/<project>/`,
read-only — because an agent that can delete the policy governing it can disarm
the thing that stops it, and out there the policy's own "stay inside the
project" clause guards it.

---

## Changing the rules

Edit `.warrant/policy.md` in your own words, then:

```bash
warrant-mcp review     # compiles, shows every clause and what changes in behaviour
warrant-mcp accept     # adopt it
```

`review` is the **only** command that calls the model, and it is the only one
that needs `ANTHROPIC_API_KEY`. Enforcement never compiles — not at startup,
not per call, not ever. It shows you each clause in plain English, and then
what actually changes: which previously-allowed actions are now refused and
which refusals are now permitted, derived by running a fixed corpus through
both policies rather than by diffing text. Nothing the hook reads is written
until you accept.

If a sentence cannot be expressed as an enforceable rule, the compiler refuses
**the whole policy** and tells you what it can express nearby. A sentence that
silently compiled to nothing would read as protection you do not have.

---

## What a policy can say

Eight closed rule types — pure data, no free text, no model-supplied patterns:

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

Some things people write cannot be decided from the action alone, and the
compiler refuses them rather than approximating: *"don't delete anything you
didn't create"* (needs provenance the evaluator does not have), *"don't do
anything expensive"* (needs world knowledge — the model deciding at runtime),
*"ask me first"* (needs a third verdict this deliberately does not have),
*"don't change more than ten files"* (needs state across calls). The ten
sentences that shaped this vocabulary are in
[demo/ten-sentences.md](demo/ten-sentences.md).

### The format is specified separately

[SPEC.md](SPEC.md) — **version 0.1.0**, versioned independently of this package
— defines the compiled artifact, the exact matching semantics of all eight rule
types, clause precedence, the fail-closed requirements, and what the format
deliberately cannot express. Enforcement is explicitly out of its scope: a hook
is one client's mechanism, not part of the format.

**This repository is the reference implementation**, not the definition. Where
the spec and this code disagree, the spec is what an implementer should trust
and the disagreement is a bug here. [`spec/corpus.json`](spec/corpus.json) is the
arbiter — 76 language-agnostic checks, run by this repo's own test suite, so
this implementation cannot drift from the document without going red. **A second
implementation would be welcome**: it is the only real evidence that the spec is
precise enough to deserve the name, and the corpus is the only referee either
side needs. [`spec/README.md`](spec/README.md) is the porting guide.

---

## Limitations — read this before relying on it

**This is a policy layer, not a sandbox. It should be deployed inside one.**

Nine adversarial sessions were run against its own hook, sandbox reset between
attempts, every result from an actual attempt rather than from reasoning about
one. **Six got through. Five are closed**, each with a regression test named for
the attack that opened it. **The sixth is open by construction:** `rm -f *`
deleted the compiled policy itself and took enforcement off duty. It is
mitigated, not fixed — the compiled policy now lives in a read-only vault
outside the project, where the policy's own "stay inside the project" clause
guards it, so the same attack is refused and cites that clause. The glob is
still expanded after the decision, and that has no fix here.

A seventh was found later, while writing [SPEC.md](SPEC.md) rather than by
attacking anything, and is deliberately still open — see the last bullet below.

These classes remain open by construction, and are properties of the
architecture rather than bugs awaiting a patch:

- **Shell glob and variable expansion.** The hook sees `rm -f *`; the shell
  expands it after the decision. Same for `$VAR`, command substitution and
  `xargs`. Any command with implicit targets — `git clean -fdx`, `make clean` —
  is in this class. Deciding what a glob will match means reading the
  filesystem, and the deciding path deliberately imports no filesystem
  capability at all.
- **Obfuscation.** Base64, string concatenation inside an interpreter
  (`'.'+'env'`), homoglyphs and self-writing scripts defeat a tokenizer. The
  checks raise the cost; they do not close the class.
- **Symlinks.** Path text is compared, never resolved, so a symlink inside the
  project pointing out of it passes the workspace clause.
- **Coverage is per-tool and per-client.** Only Claude Code tool calls are
  hooked. A new tool, another MCP client, an unusual field name, or a process
  that outlives the session are all outside. Two of the six routes found were
  exactly this shape, which is the best evidence that the list above is not
  exhaustive.
- **Network egress is only as good as the mapping.** Tool-driven fetches are
  covered; an MCP server's own outbound calls are not.
- **TOCTOU.** The check runs before execution; the world can change in between.
- **Enforcement is a Claude Code hook.** Any other MCP client gets the
  `check_action` tool, which advises and does not enforce — an agent that does
  not call it is not constrained by it.
- **It costs a process per matched tool call.** The decision itself is about
  0.01ms, but the hook is a separate Node process, so end to end it measured
  220–430ms median across three runs on a busy Windows laptop — roughly half of
  that being Node starting at all, and a p95 tail into the seconds when the
  machine is loaded. Measure your own with `node demo/bench.mjs`.
- **The model's own refusals are not enforcement.** A route the model declines
  is untested, not safe.
- **The hook configuration is a file in your project**, so an agent with write
  access can edit it. Org-managed settings are the real answer.
- **A global flag with a separate-word value displaces the subcommand.**
  `git -c core.pager=cat push --force` slips a rule that denies
  `git push --force`, because `core.pager=cat` lands where the subcommand was
  expected; `git --no-pager push --force` is denied, because that flag consumes
  nothing. Closing it needs per-command knowledge of which flags take values —
  knowledge this format does not carry and a model may not supply at runtime —
  so it is specified in [SPEC.md](SPEC.md) §3.3.5 and pinned by a conformance
  case, making any fix a deliberate version bump rather than a silent change.

A real deployment wants OS-level confinement, an egress proxy enforcing the
host list at the network layer, hook settings the agent cannot edit, and an
append-only record of verdicts. The full attack log and reasoning are in
[SECURITY-SURFACE.md](SECURITY-SURFACE.md), unsoftened. How the six routes
were actually found, session by session — and how the seventh was found the
next day by writing the spec instead:
[writing/bypass-hunt.md](writing/bypass-hunt.md).

---

## The record, and reading it

Every tool call the hook checks appends one line to an append-only record that
lives beside the compiled policy — outside your project, so the clause that
protects the policy protects its record too. Then:

```bash
warrant-mcp report
```

One `.html` file. Open it offline: the stylesheet, the script and the data are
all inside it, and the page makes **no network request at all** when it opens.
Nothing is uploaded, no server starts, and the record itself is only ever read.

It is built around the four questions an auditor actually asks — what was
attempted and what happened, what was refused and by which clause, what is
repeating, and when behaviour changed because the policy did. A dense sortable
table is the centre of it; filters AND together and every active one shows as a
chip you can remove, with a running count of what they hide, so a filtered view
can never be mistaken for the whole picture. The filter state lives in the URL
fragment, so you can send someone exactly what you were looking at. Clauses that
never fired are listed too — a rule nobody has tripped is either dead weight or
untested.

`--since 7d` narrows the window and the page says how much it excluded.
`--out <path>` puts it somewhere else.

**Treated as public.** The rendered bytes are scanned for credential shapes,
home directories and login names *before* anything is written; if it would leak,
the command refuses and no file is created. Paths are rewritten first — your
workspace to `.`, your home to `~`, anyone else's login name to `<user>`.

The record is best-effort on purpose: a failure to write can never turn a
refusal into a pass, so the report tells you it is evidence of what was decided
rather than proof that everything decided was recorded.

---

## The MCP tool

Beyond the hook, warrant exposes one tool, `check_action`, so an agent can ask
before acting:

| kind | fields |
|---|---|
| `file_delete` | `path` |
| `shell_command` | `command` |
| `http_request` | `url`, `method` |

It returns `ALLOW` or `DENY` with the governing clause and a one-sentence
reason. It only checks — there is no code path from any verdict to an
execution, because the deciding modules import nothing that could touch a file,
spawn a process, or open a connection. Malformed input fails closed. The hook
is what makes a refusal binding; the tool is how an agent can ask politely.

---

## Writing a policy with Claude

The package ships a Claude Skill, [skills/warrant-policy-author](skills/warrant-policy-author/SKILL.md),
that teaches Claude the authoring craft: a short interview, sentences shaped
for the closed rule set, and the failure shapes above explained rather than
just avoided. `init` offers to install it into your project's
`.claude/skills/` (opt-in — say yes at the prompt, or pass `init --skill`;
an existing folder of the same name is never overwritten, and `remove` takes
away exactly what was installed). You can also copy or link the folder by
hand. The skill writes policy text only — it never enforces anything,
and it never claims a sentence will compile. `warrant-mcp review` is the
authority; if review refuses, the refusal is right.

What that looks like in practice. The sentence people write first:

> Don't touch secrets, never rewrite history, and don't install anything.

Three real intents, and the compiler refuses the whole policy: "secrets" is
a judgement call, and neither "history" nor "anything" names a command it is
allowed to guess. The same intents as the skill writes them, after one
question about your stack:

> 1. Leave my .env alone, and never touch anything ending in .pem or .key.
> 2. Never rewrite history: no git rebase, no git commit --amend, no git
>    reset --hard.
> 3. Don't install new dependencies with npm — no npm install, no npm i, no
>    npm add.

Same protections, now decidable from the words alone. That is the craft the
skill packages: naming things is the human's authority to exercise, and the
skill's job is to ask for the names — and to explain, when a sentence cannot
work, why the boundary is where it is.

### Or install it as a plugin

This repository is also a Claude Code plugin marketplace. Two commands, no
npm install:

```
/plugin marketplace add rmanish2000-del/warrant-mcp
/plugin install warrant-policy-author@warrant-mcp
```

You get exactly the skill above — the same folder this repo ships, no
separate copy to drift. The plugin deliberately does **not** wire the MCP
server or the enforcement hook: both need a per-project compiled policy that
only `warrant-mcp init` can set up (vault, settings backup, exact undo), and
a hook without a policy would deny everything. Write the policy with the
skill; enforce it with `warrant-mcp init`.

## Where the policy is looked for

1. `WARRANT_MCP_POLICY` — an absolute path. `init` writes this into both
   generated configs, so a client spawning the server from any directory finds
   the right policy.
2. `.warrant/config.json` — the pointer `init` writes, naming the vault.
3. `.warrant/policy-compiled.json` — a simple in-project layout, if you prefer.
4. The package's own copy — only present in a source checkout; never shipped,
   so an installed copy cannot silently enforce the sample.

If none resolve, the server refuses to start and the hook denies. A missing
policy is a refusal, never a pass.

## What `init` touches

| Path | |
|---|---|
| `.warrant/policy.md` | your policy — edit this |
| `.warrant/config.json` | pointer to the compiled policy |
| `.claude/settings.json` | hook appended, **merged** — your other settings survive |
| `.mcp.json` | `warrant` server added, merged |
| `~/.warrant/projects/<project>/` | the compiled policy (read-only), your settings backup, the undo record `remove` reads, and `record/` — the authorization record |

A settings file it cannot parse is refused, not rewritten.

---

## Commands

| | |
|---|---|
| `warrant-mcp init` | wire up this project — no API key; `--skill` also installs the policy-authoring skill |
| `warrant-mcp remove` | undo it, restoring settings byte-for-byte |
| `warrant-mcp test "<action>"` | dry-run one action; nothing is enforced or written |
| `warrant-mcp report` | render the record as one local HTML file — `--since 7d`, `--out <path>` |
| `warrant-mcp review` | compile the policy and show what changes (needs an API key) |
| `warrant-mcp accept` | adopt the reviewed draft — never compiles |
| `warrant-mcp serve` | the MCP server on stdio (a client spawns this) |
| `warrant-mcp hook` | the PreToolUse entry (a hook config spawns this) |

Requires Node ≥ 22.6. `npx warrant-mcp init` works without installing.

## Development

```bash
npm test        # 227 tests, including the SPEC.md conformance corpus
npm run typecheck
npm run demo    # the canonical checks with verdict banners, fully offline
```

TypeScript, strict, no build step for development — the source runs directly
under `--experimental-strip-types`. The published package ships compiled
JavaScript in `dist/`, because Node refuses to strip types under
`node_modules`; the emit is pure type erasure, so it cannot change a verdict.

## Prior work

The deterministic authorization engine and the plain-English-to-clauses
approach come from an earlier project of mine,
[warrant](https://github.com/rmanish2000-del/warrant), built for a payments
hackathon on 1–2 August 2026. warrant-mcp is a separate repository that applies
that thinking to agent tool calls; it does not fork or vendor that codebase.

The core build — M1 through M7, ending with 77 tests, the MCP server, hook
enforcement, the adversarial audit and the authoring loop — is tagged
`m7-complete-2026-08-03`. Everything after it is packaging and documentation:

```bash
git log m7-complete-2026-08-03..HEAD
```

## License

MIT — see [LICENSE](LICENSE).
