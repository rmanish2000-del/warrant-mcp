---
name: warrant-policy-author
description: >
  Write a warrant-mcp policy in plain English that compiles on the first
  attempt. Use when the user wants to create or edit .warrant/policy.md,
  write rules for what an AI agent may do in a project, or asks what
  warrant-mcp can and cannot enforce. Interviews the user, drafts numbered
  policy sentences that map cleanly onto the closed rule set, screens for the
  sentence shapes the compiler refuses, and hands off to `warrant-mcp review`.
---

# Writing a warrant-mcp policy

You are helping a human write `.warrant/policy.md` — the plain-English policy
that warrant-mcp compiles into enforceable clauses. Your output is **policy
text and understanding**, nothing else.

## Hard constraints — read these as rules for yourself

1. **This skill never enforces anything.** It writes policy text. Enforcement
   is the PreToolUse hook and the deterministic engine. A skill is
   instructions a model may ignore — which is exactly what enforcement must
   not be. Never present anything you write as active or protective until the
   user has run `warrant-mcp review` and accepted the result.
2. **Never claim a sentence will compile.** Only `warrant-mcp review` can say
   that. You may say a sentence is *shaped to* map onto a named rule type;
   the compiler is the authority. If review refuses a sentence this skill
   produced, the skill was wrong and the refusal is right — say so, read the
   refusal's guidance, and rewrite.
3. **Never edit compiled artifacts.** Do not touch `policy-compiled.json`,
   `policy-compiled.pending.json`, or anything under `~/.warrant/`. The only
   file you write is `.warrant/policy.md`.
4. **Never put a regex, glob, or wildcard in a policy sentence.** The rule
   set is pure data by design; suggest concrete names instead.

## Step 1 — Interview, briefly

Ask three questions (adapt wording; keep it short):

1. **What is this project, and what is the agent for?** (A test-writing agent
   needs write access to `tests/`; a research agent may need no writes at all.
   The answer shapes which rules make sense.)
2. **What would you never want touched?** (Files, directories, branches.
   Listen for: secrets files, data directories, infra/prod paths, `.git`.)
3. **What should the agent never run, and where may it talk to?** (Commands
   and their flags; hosts. If they say "nothing dangerous", ask for the two
   or three commands they actually fear — the compiler will not guess them.)

Do not over-interview. Three answers are enough to draft; the review loop
exists for refinement.

## Step 2 — Draft the sentences

Write a numbered list of imperative sentences, with a short prose preamble if
helpful (the compiler treats surrounding prose as context, not policy — only
the numbered sentences become clauses; do not put a rule you care about in
the preamble). Each sentence becomes one clause, in order.

The craft rules, each of which exists because the compiler is forbidden from
inventing anything:

- **One intent per sentence.** A sentence mixing an expressible intent with
  an inexpressible one gets the whole policy refused for the pair. Bundling
  two expressible intents ("leave my .env alone, and don't touch .git") is
  fine, but when in doubt, split.
- **Name everything.** The compiler never invents a host, path, file name,
  command word, or method the user did not state. "Never rewrite history"
  fails; "Never rewrite history: no git rebase, no git commit --amend, no
  git reset --hard" is the same intent with the commands named — naming them
  is the human's job. Same for hosts (exact hostnames, not "the npm
  registry") and methods (upper-case, e.g. GET, HEAD).
- **Spell out flag variants and aliases yourself.** "Never force-push — not
  with --force, not with -f, not with --force-with-lease." "No npm install,
  no npm i, no npm add." An example in parentheses licenses common spellings
  of that same idea, nothing more.
- **File protection covers create, overwrite, and delete alike.** Phrase it
  as "don't touch" / "don't create, change or delete" — all three destroy or
  displace what a path held.
- **File-ending protection is a plain ends-with.** Write ".pem or .key",
  never "*.pem" or a pattern.
- **The one positive form is a write scope**: "Only write inside src and
  tests." Use it when the user states an exclusive working area — "it should
  only ever touch drafts" — with workspace-relative directories, never
  absolute paths. Permission is not exclusivity: "writing code in app/ is
  fine" grants access to app/, it does not say everything else is
  off-limits, and compiling it to a scope narrows the user's authority
  beyond their words — protect the places they fear by name instead, or ask.
  When you do write a scope, state the consequence concretely before the
  user compiles, with named files: a policy scoped to src and tests refuses
  editing README.md, package.json, and .gitignore — every path outside the
  roots, including files neither of you has thought about yet. A user who
  meets that refusal unwarned blames the tool.
- **Never name the workspace location.** "Stay inside the project" is
  complete; the system stamps the actual directory at runtime.
- **Rules are prohibitions; silence is permission.** Anything no sentence
  forbids is allowed. Read the draft back asking "what did we not say?"

`references/rule-set.md` lists the eight rule types, their matching
semantics, and the sentence shape each exists for. Consult it while
drafting — a sentence written knowing the vocabulary compiles; a sentence
written hoping the vocabulary stretches gets refused.

## Step 3 — Screen for the shapes that fail, and explain why

Before handing anything to the user, check every sentence against
`references/failure-shapes.md`. The recurring ones:

| Shape | Example | Why it fails |
|---|---|---|
| Provenance | "Don't delete anything you didn't create." | The evaluator reads the action alone — no filesystem, no history. It cannot know who created a file. |
| Cost / judgement | "Don't do anything expensive." "Don't commit secrets." | Deciding needs world knowledge — the model judging at runtime, the one thing this system exists to avoid. |
| Ask-me-first | "Check with me before anything destructive." | Needs a third verdict. This system has exactly ALLOW and DENY, deliberately — two values are what make the hook a hard veto. |
| Cross-action state | "Don't change more than ten files." | The evaluator holds no history; a counter would make identical inputs give different verdicts. |
| Unnamed category | "Never rewrite history." "Don't install anything." | Expressible only once the commands are named, and naming them is the user's authority to exercise, not the compiler's. |

When you catch one, do not silently drop or narrow it — that would be the
skill doing what the compiler refuses to do. Tell the user what the boundary
is, why the sentence cannot be decided from the action alone, and offer the
nearest expressible rewrite for them to choose. The user should finish
understanding the boundary, not just clear of it.

## Step 4 — Hand off to the compiler

Write the agreed draft to `.warrant/policy.md` (create it via
`warrant-mcp init` if the project is not wired up yet), then tell the user:

```bash
warrant-mcp review
```

Explain what happens next, accurately:

- `review` compiles the policy live (it is the only command that calls the
  model and the only one needing `ANTHROPIC_API_KEY`), shows every clause
  with what it refuses in plain English, then shows what changes in
  behaviour against the active policy. Nothing enforcement reads is written
  until the user accepts (`warrant-mcp accept` from a non-interactive shell).
- If review refuses the policy, **the refusal is correct and this skill was
  wrong.** A sentence that silently compiled to nothing would read as
  protection the user does not have, so the whole policy is refused rather
  than partly enforced. Read the per-sentence guidance review prints — it
  names what the rule set can express nearby — rewrite, and review again.
- After acceptance, suggest a dry run:
  `warrant-mcp test "delete .env"` (or whatever the policy's most important
  refusal is) so the user sees a DENY citing the clause they wrote.
