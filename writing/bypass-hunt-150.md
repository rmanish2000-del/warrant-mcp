# 150-word version — link aggregators

Companion to `bypass-hunt.md`.

---

**I built a permission layer for AI agents, then spent a day breaking it**

A coding agent with write access raises a question I could not answer: what is
it allowed to do? Approving every call by hand becomes a reflex, and a reflex is
not a control.

So: rules in plain English, compiled once into numbered clauses, enforced by
deterministic code through a PreToolUse hook that vetoes the tool call before it
runs.

Then I attacked it. Nine sessions, sandbox reset between each, every result from
an actual attempt. Six got through — mv out of the workspace, a target hidden
in nested quotes, a third-party MCP server's delete tool. One deleted the
compiled policy, disarming enforcement.

A seventh came the next day, not from those sessions: writing the format as a
spec exposed a matching bug nine attacks missed.

The write-up covers each, the fix that mattered, and what still gets through.
