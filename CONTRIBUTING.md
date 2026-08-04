# Contributing

## Found a way past it? That is the most useful thing you can send.

warrant-mcp is a policy layer, not a sandbox, and the holes live in the layer
that maps tool calls onto checkable actions — an enumeration of a surface the
client owns and keeps extending. Enumeration has no completion proof, so every
bypass someone finds is evidence about the shape of the ones nobody has found
yet.

Six routes got past it during the build. Five are closed, one is still open, and
all of them are in [SECURITY-SURFACE.md](SECURITY-SURFACE.md), unsoftened.
Yours will go in the same table with your name on it.

**Open a [bypass report](https://github.com/rmanish2000-del/warrant-mcp/issues/new?template=bypass.yml).** If it is
serious enough that a public issue would be irresponsible — a way past
enforcement that works without the user noticing — see
[SECURITY.md](SECURITY.md) instead.

### What I need to reproduce it

The template asks for these; it fails to reproduce without them:

- **What you asked the agent**, in your words. Not a summary — the actual prompt,
  because the phrasing changes which tool it reaches for.
- **What it actually ran**: the tool name and the arguments. If your client shows
  the tool call, paste it.
- **What the hook did**: nothing, denied, or something else. "Nothing happened"
  is a complete and useful answer.
- **What ended up on disk** afterwards.
- **OS, Node version, warrant-mcp version, and MCP client.** All the recorded
  attacks so far ran on Windows, which shaped them — the agent reached for
  PowerShell because PowerShell was there. macOS and Linux are genuinely
  untested, so a report from either is worth more than one from Windows.
- **Your policy**, or the clause you expected to fire. `.warrant/policy.md` is
  fine to paste; do not paste anything secret.

### What happens next

1. I try to reproduce it exactly as written, and say so either way. If I cannot,
   I will ask for the missing piece rather than close it.
2. If it reproduces, it goes into `SECURITY-SURFACE.md` credited to you —
   including if it turns out to be structural and I cannot fix it. The list of
   what still gets through is the honest part of this project, and it is only
   honest if it is complete.
3. If it is closable, the fix comes with a regression test named for the attack.
   That is the existing convention: see the `M4 bypass 1` … `M4 bypass 5` tests
   in `src/hook/adapter.test.ts`.

I would rather publish a bypass I cannot fix than quietly own an unlisted one.

## A policy sentence that would not compile

Not a bug — [tell me about it](https://github.com/rmanish2000-del/warrant-mcp/issues/new?template=policy.yml). The
compiler refuses a whole policy rather than approximate a sentence it cannot
express, which is deliberate, but every refusal is either a gap in the rule
vocabulary or a case where refusing is correct and the guidance should say so
better. Both are worth hearing about; `demo/ten-sentences.md` is where that
thinking is recorded.

## Code changes

Open an issue first for anything beyond a typo — this repository has invariants
that are not obvious from the code, and they are written down in
[CLAUDE.md](CLAUDE.md). The ones that will bite a well-meaning patch:

- The evaluator never sees clause English. That is a type-level guarantee, not a
  convention.
- The deciding modules import no filesystem, process-spawning or network
  capability. A test scans their source and fails if one appears; do not weaken
  it to make a change fit.
- Nothing compiles at enforcement time. A missing policy is a refusal, not a
  pass.

`npm test` and `npm run typecheck` before pushing. New test files go in the
`test` script's explicit list — discovery is deliberate, not globbed.
