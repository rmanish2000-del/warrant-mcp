# Prepared answers

For the questions that will actually come. Every answer points at a file where
one exists. Short on purpose — a long reply reads as defensive, and under
pressure the shortest true answer wins.

Rule that governs all of them: **never argue that it is secure.** The post lists
seven ways past it. Defending the boundary trades a credible post-mortem for a
weak security claim.

---

### "Why not just sandbox it?"

> You should. This isn't an alternative to confinement — the post says it belongs
> inside one, and SECURITY-SURFACE.md §4 says what a real deployment needs on top:
> OS-level confinement, an egress proxy, hook settings the agent can't write.
>
> What a sandbox doesn't give you is a refusal that cites a clause you wrote in
> English. seccomp can stop the write; it can't tell you which of your rules
> stopped it, and it can't be changed by editing a sentence.

Do not answer this twice. If it comes again, the first answer stands.

---

### "The model could just not call the tool."

> Right, and that's why the MCP tool isn't the enforcement point. The first
> version was exactly that — an oracle the agent could ask — and it enforced
> nothing.
>
> Enforcement is a PreToolUse hook. It runs whether or not the agent wants it to,
> and per the docs a hook deny overrides even `--allowedTools`. The MCP tool is
> still there for an agent that wants to ask before acting, but nothing depends
> on it choosing to.

If they push: subagents inherit the hook too — that was one of the two routes
that came back blocked, and I'd assumed it rather than checked until then.

---

### "This is security theatre."

> Partly fair, and worth being precise about which part.
>
> It's theatre if you read it as a boundary — it isn't one. Six routes got past
> it during the build and one of those is still open; a seventh turned up the
> next day when I wrote the spec, and that one is open on purpose too. It's not theatre
> as a policy layer: the refusals are deterministic, they cite the clause that
> caused them, and the list of what still gets through is in the repo rather
> than in a footnote.
>
> The honest version of the claim is: this raises the cost of an unintended
> destructive action and makes the intended boundary legible. It does not stop a
> determined attacker, and I'd rather say that than have you find it.

The strongest move here is agreeing with the half that's true before defending
the half that isn't.

---

### "Why a closed rule set instead of regex?"

> Because a regex from the model is a program from the model, and then the model
> is deciding at runtime with extra steps. The whole point of the split is that
> it compiles the policy once, off to the side, and a human reviews the output —
> after that it's a pure function over structured data.
>
> The cost is real: a sentence the rule set can't express gets the whole policy
> refused rather than approximated. `demo/ten-sentences.md` has the ten sentences
> that shaped the vocabulary, including four that are deliberately unexpressible
> — provenance, cost, approval, and anything needing state across calls.

If they ask what the rules are: eight types, listed in the README.

---

### "So `git -c core.pager=cat push --force` just works? That's a trivial fix."

The question the addendum invites. Do not get defensive — it is the best
question anyone can ask about the post.

> It does work, yes, and the post says so with the three commands that show it.
> `--no-pager` is denied because it consumes nothing; `-c` isn't, because its
> value lands in the position the rule reads the subcommand from.
>
> It isn't trivial, and that's the interesting part. The fix needs a table of
> which flags of which commands take a separate value — `git -c` does,
> `git --no-pager` doesn't, and `docker`, `npm` and `kubectl` each have their
> own. The format carries no per-command knowledge, and the one thing that could
> produce that table on demand is a model, which is precisely what isn't allowed
> near a runtime decision. A partial table would be worse than none: a rule that
> fires on some spellings and silently not others.
>
> So it's specified, and pinned as a conformance case any implementation has to
> reproduce. That makes fixing it a version bump, in the open, rather than a
> matcher edit nobody notices.

If they offer a fix: take it seriously and say so. A contributed
command-to-flags table with a stated scope is genuinely the way this closes, and
it is issue-shaped. Do not promise a timeline.

If they say "you should have caught that": agree. Nine attack sessions did not,
and writing the spec did — which is the argument the addendum makes.

---

### "What happens on macOS or Linux?"

> Honestly: untested. Every one of the nine sessions ran on Windows, and that
> shaped the results — the agent reached for PowerShell because PowerShell was
> there. The post says so.
>
> The engine is pure path and string work, so the verdicts should be identical.
> The part I can't promise is coverage: the mapping layer enumerates tools, and I
> don't know which tools an agent reaches for first on a Mac. That's exactly the
> class every bypass so far has come from.
>
> A report from either is worth more to me than one from Windows.

Do not guess at specifics here. "Untested" is the whole answer.

---

### "How is this different from Claude Code's own permissions?"

> They solve different halves. Claude Code asks you, per call, in the moment.
> This decides from a rule you wrote once, and tells you which rule decided.
>
> Concretely: the built-in flow is a prompt you answer — and by the fifth one
> it's a reflex, which isn't review. A policy is written when you're thinking
> clearly, reviewed once, then applied identically every time with no human in
> the loop and no model in the loop.
>
> They compose rather than compete. On allow the hook exits silently, so your own
> permission prompts still apply. It vetoes; it never approves.

If they mention `--allowedTools`: a hook deny overrides it, which is the point —
the allowlist says what the agent may reach for, the policy says what it may do.

---

## One I cannot answer from the repo

State the gap rather than improvising.

**"Does it work with Cursor / Windsurf / Cline / any non-Claude-Code client?"**

> No — and not in a fixable-this-week way. Enforcement is a Claude Code
> PreToolUse hook, so a client without an equivalent pre-execution veto gets the
> MCP tool, which is advice. "Coverage is per-tool and per-client" in the limits
> section is exactly this.

**"What's the performance cost?"** — measured, so give the number

> The decision is free — about 0.01ms with the policy in memory, across all
> three action kinds, over 20,000 iterations each.
>
> What you pay for is that the hook is a separate Node process per matched tool
> call. End to end that came out at 220–430ms median across three runs on a busy
> Windows laptop, and about half of that was `node -e 0` — Node starting at all.
> The p95 tail reaches into the seconds when the machine is loaded, and I'd
> rather say that than quote the median alone.
>
> `demo/bench.mjs` in the repo is the script, so you can get your own number
> rather than trusting mine.

If they say that's slow: agree, and be specific about what it isn't. It is per
*matched* tool call, it sits behind a model round trip that takes seconds
anyway, and roughly half of it is Node rather than warrant. If they say it should
be a long-running process instead of a spawn — that is the right instinct and
the honest answer is that the hook contract is a process invocation, so it would
need a resident helper, which does not exist today.

Never invent a number. The post's only measured figures are a range because they
drifted between runs.
