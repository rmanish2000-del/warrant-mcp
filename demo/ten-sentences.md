# Ten sentences a real engineer would write

Written first, judged second — these are phrased the way people actually talk
about their repos, not reverse-engineered from the rule set. The verdicts in
the right column are what the **M5 schema** (six rule types: out-of-workspace,
protected names, forbidden token, forbidden sequence, host allowlist, method
allowlist) could do with them.

| # | Sentence | M5 verdict |
|---|---|---|
| 1 | "Stay inside this project — don't create, change or delete anything outside it." | **expressible** (`file_delete_outside_workspace`) |
| 2 | "Leave my .env alone and don't touch anything in .git." | **expressible** (`file_delete_protected`) |
| 3 | "Never run anything as root." | **expressible** (`shell_forbidden_token`: sudo, su) |
| 4 | "Never do a recursive force delete." | **expressible** (`shell_forbidden_sequence`) |
| 5 | "Don't pipe anything you downloaded straight into a shell." | **expressible** (`shell_forbidden_sequence`) |
| 6 | "Only talk to api.github.com and the npm registry — nowhere else." | **expressible** (`http_host_allowlist`) |
| 7 | "Never force-push and never rewrite history." | **unmapped** — see below |
| 8 | "Don't push straight to main." | **unmapped** |
| 9 | "Don't install new dependencies." | **unmapped** |
| 10 | "Never touch private keys or certificates — anything ending in .pem or .key." | **unmapped** |

Two more that people write constantly, kept deliberately in the list because
they are the interesting failures:

| # | Sentence | Verdict |
|---|---|---|
| 11 | "Only write inside src/ and tests/ — the rest of the repo is read-only to you." | **unmapped** in M5; **expressible after M6** |
| 12 | "Don't delete anything you didn't create." | **unmapped, and staying that way** — see "Rejected" |

## Why 7–9 failed, concretely

`shell_forbidden_sequence` matches **contiguous** tokens. Real invocations put
their flags anywhere:

```
git push --force origin main      ← ["git","push","--force"] matches
git push origin main --force      ← same intent, no contiguous match
git push -u origin main --force-with-lease
npm i --save-dev left-pad         ← "npm i" is not "npm install"
```

Enumerating every ordering as a sequence is exactly the blocklist arms race
M4 warned about. The gap is structural: the vocabulary had no way to say
*"this command, this subcommand, with this flag anywhere in the line."*

## Rejected — and why rejection is the right answer

Judged by one test: **can it be decided from the action alone, with no
filesystem reads and no model at runtime?**

- **"Don't delete anything you didn't create."** Requires provenance the
  engine does not have and must not acquire — it would mean reading the
  filesystem or keeping cross-call state, and the evaluator is pure by
  construction (`guard.test.ts` forbids the imports that would allow it).
- **"Don't do anything that costs money."** Requires knowing what an endpoint
  charges. That is world knowledge, i.e. the model deciding at runtime — the
  one thing this system exists to avoid.
- **"Ask me before anything destructive."** Needs an ESCALATE verdict and a
  human approval loop. Explicitly out of scope since M1; the two-value
  ALLOW/DENY contract is what makes the hook a hard veto.
- **"Don't change more than ten files in one go."** Requires cross-call state.
  The engine evaluates one action in isolation, deterministically; a counter
  would make the same input produce different verdicts at different times.
- **"Don't commit secrets."** The general form is undecidable — "secret" is a
  judgement. The concrete form ("never `git add .env`") *is* expressible, and
  that substitution must be the human's choice at compile review, not a
  silent narrowing by the compiler.
- **Model-supplied regexes or globs for paths.** Would collapse the "pure
  data, no free text" guarantee: a regex is a program, and a compiled program
  from the model is the model deciding at runtime with extra steps.
