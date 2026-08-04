# The shapes that fail — and why refusing them is correct

Every rejection below was judged by one test: **can it be decided from the
action alone, with no filesystem reads, no cross-call state, and no model at
runtime?** If not, the compiler refuses the sentence, and the whole policy
with it — a sentence that silently compiled to nothing would read as
protection the user does not have.

These are properties of the architecture, not gaps awaiting a feature.
Sources: `demo/ten-sentences.md` (the M6 build's rejected-rules reasoning) and
`src/authoring/guidance.ts` (what review prints when each shape is refused).

## 1. Provenance — "Don't delete anything you didn't create."

The evaluator reads the proposed action and nothing else. Knowing who created
a file would mean reading the filesystem or keeping state across calls, and
the evaluator is pure by construction — a test scans the deciding modules'
imports to keep it that way.

**Rewrite:** name the places instead of their history.
> "Never delete anything inside vendor or node_modules."

## 2. Cost and judgement — "Don't do anything that costs money." / "Don't commit secrets."

What an endpoint charges, or whether a string is a secret, is world
knowledge. Deciding it at runtime means the model deciding at runtime — the
one thing this system exists to avoid.

**Rewrite:** name the endpoints and methods, or the concrete files.
> "The only hosts you may reach are api.github.com and registry.npmjs.org."
> "Never touch my .env, or anything ending in .pem or .key."

The narrowing from "secrets" to ".env, .pem, .key" loses generality, and
**that loss must be the user's informed choice** — never perform it silently.
Say what the general sentence would have needed, and let the user pick the
names.

## 3. Ask-me-first — "Check with me before anything destructive."

Needs a third verdict (an ESCALATE) and a human approval loop. This system
has exactly two verdicts, ALLOW and DENY, deliberately: two values are what
make the PreToolUse hook a hard veto instead of a conversation. (The sibling
`warrant` project has ESCALATE — for payments, with a human console. This one
refused it on purpose.)

**Rewrite:** decide which half is meant, and state it flatly.
> "Never delete anything outside the project." — or say nothing, and the
> action is allowed. There is no middle verdict to write toward.

## 4. Cross-action state — "Don't change more than ten files in one go."

The engine evaluates one action in isolation, deterministically. A counter
across calls would make identical inputs produce different verdicts at
different times, which breaks the determinism the whole product claim rests
on.

**Rewrite:** state the boundary as a place, not a count.
> "Only write inside src and tests."

## 5. Unnamed categories — "Never rewrite history." / "Don't install anything."

The *intent* is enforceable; the sentence is not, because the command words
are missing and the compiler is forbidden from inventing them. Guessing would
be the compiler granting itself authority — expanding "install anything" to a
list of package managers the user never mentioned.

**Rewrite:** the same intent with the commands named — naming them is the
user's job, and the compiler's refusal is what prompts it:
> "Never rewrite history: no git rebase, no git commit --amend, no git reset --hard."
> "Don't install new dependencies with npm — no npm install, no npm i, no npm add."

## 6. Patterns — "Never touch files matching *.secret.*"

A regex or glob is a small program, and a model-supplied program evaluated at
runtime is the model deciding at runtime with extra steps. The rule set is
pure data: exact names, exact endings, exact tokens.

**Rewrite:** plain endings or names.
> "Never touch anything ending in .secret.json."

## 7. Bundles — one sentence, two fates

"Never force-push, and don't delete anything you didn't create" contains one
expressible intent and one inexpressible one — and the sentence is refused
whole, taking the policy with it. Review's guidance handles bundles (every
matching topic contributes), but the authoring fix is upstream: **one intent
per sentence**, so a refusal points at exactly one problem.

## What refusal looks like, so you can read it calmly

`warrant-mcp review` prints, for each refused sentence: the sentence
verbatim, what the rule set *can* express in the same territory, and a
concrete rewrite to paste and edit. Nothing is written; the active policy is
untouched. The loop is: edit `.warrant/policy.md`, run review again.
