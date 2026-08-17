# Thread version — six posts

Companion to `bypass-hunt.md`. Each post is under 280 characters.

---

**1/6**

I built a permission layer for AI coding agents, then spent a day attacking it
in real sessions.

Six routes got through. Five are closed.

Then a seventh turned up the next day, and not from an attack. Two are still
open.

---

**2/6**

The first one found me.

Rehearsing a demo, the agent deleted a protected file using PowerShell. My
matcher listed Bash. The hook never ran.

Nothing clever happened. It picked a reasonable tool for a Windows box, and my
coverage had a hole shaped like it.

---

**3/6**

So I hunted: nine sessions, sandbox reset between each, every result from an
actual attempt.

Through: mv out of the workspace. A target hidden in nested quotes in node -e.
PowerShell Set-Content. A third-party MCP server's delete tool. WebFetch to an
unlisted host.

---

**4/6**

Two were the same mistake: a denylist of dangerous commands.

So I inverted it. Anything not on a small reader allowlist gets every quoted
literal and path-shaped argument checked.

Over-checking costs nothing. Under-checking is a bypass.

---

**5/6**

One attack deleted the compiled policy itself, disarming enforcement. It now
lives outside the workspace, where the policy's own first clause guards it.

What still gets through is in the repo: glob expansion, obfuscation,
symlinks, per-tool coverage.

---

**6/6**

The seventh I found by writing the spec, not by attacking it.

git push --force → denied.
git -c core.pager=cat push --force → allowed: the flag's value lands where the
subcommand should be.

Open on purpose, pinned as a conformance case.

npm install -g warrant-mcp
