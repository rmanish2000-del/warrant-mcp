# Reddit

Two subreddits, two different posts. Do not post both on the same day, and do
not mention one in the other — no "x-post", no "also posted to". Each is written
for that room.

---

## r/ClaudeAI

Audience: people already running Claude Code, who will care that hooks can
hard-veto and that subagents inherit them. Practical, first-person.

### Title

```
PreToolUse hooks can hard-block a tool call. I built a permission layer on that, then spent a day finding six ways past it — and a seventh the next day, when I wrote the spec.
```

### Body

```
I gave Claude Code write access to a repo and realised I couldn't answer what it
was actually allowed to do. Approving every tool call by hand stops being review
after the fifth prompt; trusting it isn't a position.

So: rules in plain English, compiled once into numbered clauses, enforced by
deterministic code. The enforcement point is a PreToolUse hook — it gets the tool
call as JSON on stdin and can return permissionDecision: "deny", which per the
docs overrides even --allowedTools. On allow it exits silently, so your own
permission prompts still apply. It vetoes, it never approves.

Then I attacked it. Nine sessions, sandbox reset between each, every result from
an actual attempt rather than from reasoning about whether it would work.

Six got through:

- mv the protected file out of the workspace (my extractor knew rm, not mv)
- node -e "require('fs').unlinkSync('.env')" — my regex grabbed the outer
  double-quoted string and never saw the inner literal
- PowerShell Set-Content overwriting the file (I'd added PowerShell's deleters
  after an earlier miss, but not its writers)
- a third-party MCP server's delete_file tool — mcp__* was matched by nothing
- WebFetch to a host the policy doesn't allow
- rm -f * , which deleted the compiled policy and disarmed enforcement entirely

Two useful negatives: a subagent asked to do the delete WAS blocked, so hooks do
apply inside subagents — I'd assumed that but never checked. And asking for
`sudo rm -rf /var/www` never reached the hook at all, because Claude declined on
its own. I count that as untested, not safe, and it's why my demo commands are
boring housekeeping instead of anything that looks alarming.

The fix that mattered was inverting the default: instead of a denylist of
dangerous commands, anything not on a small reader allowlist gets every quoted
literal and path-shaped argument checked. Over-checking a path the policy allows
costs nothing; under-checking is a bypass.

The glob one is still open and I don't have a fix — the shell expands * after the
hook has decided.

A seventh turned up the day after those nine sessions, and not from attacking
it. I wrote the policy format up as a versioned spec, and having to state
exactly what a rule means found a bug a whole day of attacking hadn't. `git push --force` gets denied;
`git -c core.pager=cat push --force` doesn't, because the rule looks for the
subcommand in the first non-flag argument and `-c` parks its value there. Also
open on purpose: fixing it means knowing which flags of which commands take a
separate value, which the format doesn't carry and I'm not willing to have a
model supply at decision time.

Write-up with the transcripts, and the full list of what still gets through:
[link]

npm install -g warrant-mcp
```

---

## r/LocalLLaMA

Audience: more sceptical of anything model-shaped, more interested in the
architecture and in what is *not* the model's job. Lead with the determinism
boundary.

### Title

```
Agent permission layer where the model compiles the policy but never makes the runtime call — and the six ways I got past it anyway, plus one the spec found
```

### Body

```
The design constraint I started from: a model should never be the thing deciding
whether an action is allowed, because that decision isn't reproducible and isn't
auditable. But writing policy in a structured DSL by hand is miserable.

So the split is: a model compiles plain-English rules into numbered clauses
backed by structured rules, once, off to the side, and a human reviews the
output. After that it's a pure function. Same inputs, same verdict, no model in
the loop. The evaluator's input type is Omit<CompiledPolicy, 'clauses'>, so the
clause text isn't merely ignored at decision time — it's unreachable, and reading
it is a compile error rather than a code-review catch.

The rule set is closed and pure data: no free text, no model-supplied regex. If a
sentence can't be expressed as one of the rule types, the compiler refuses the
whole policy rather than approximating it. "Don't delete anything you didn't
create" gets refused, because provenance isn't visible in the action. So does
"don't do anything expensive" — that's world knowledge, i.e. the model deciding
at runtime with extra steps.

Enforcement is a hook that runs before the tool call and can veto it. No network,
no model, no compile at enforcement time — a missing policy is a refusal, not a
pass.

Then I spent a day attacking it in real sessions, nine of them, sandbox reset
between each. Six routes got through: mv out of the workspace, a target hidden in
nested quotes inside node -e, a PowerShell writer, a third-party MCP server's
delete tool, network egress through the client's own fetch tool, and a shell glob
that deleted the compiled policy itself.

Every one of those six reached a decision that was never made. The evaluator was
never wrong — the action just never got mapped into something it could see. The
holes live in the tool-mapping layer, which is an enumeration of somebody else's
surface, and enumeration has no completion proof.

Five are closed with regression tests. The glob is still open by construction:
the shell expands * after the hook has already decided, and working out what it
matches would mean reading the filesystem, which the deciding code deliberately
cannot do.

A seventh came the next day and breaks the pattern, which is why I'd rather lead
with it than bury it. Writing the format up as a versioned spec — stating
exactly what each rule type matches, so somebody could implement it in another
language — surfaced a bug nine attack sessions had missed. `git push --force` is denied.
`git -c core.pager=cat push --force` is not, because the subcommand test reads
the first non-flag argument and `-c` puts `core.pager=cat` there. That is not a
mapping gap; it's in the matcher, in a rule I wrote. It stays open because
closing it needs per-command knowledge of which flags take a separate value, and
the only thing that could supply that on demand is a model — the one component
this architecture keeps away from runtime decisions. So it's specified, and
pinned as a conformance case, which makes a fix a deliberate version bump.

Write-up, with the honest limits section: [link]

npm install -g warrant-mcp
```
