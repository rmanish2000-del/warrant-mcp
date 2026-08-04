# This worktree: the publishing workstream

You are in `warrant-mcp-publishing`, a linked git worktree of the warrant-mcp
repository. **This directory owns the `publishing` branch and nothing else.**
The main worktree (`../warrant-mcp`) owns `main` — never switch, reset, or
commit over there from a session working here. The full rule is in the main
tree's CLAUDE.md, "Parallel sessions: one directory, one branch, one owner".

## What this workstream is

Everything needed to publish the bypass-hunt post, kept off `main` so a
stranger browsing the repo sees the post, not the apparatus.

## The files, and which one is truth

| File | Role |
|---|---|
| `writing/bypass-hunt.md` (on **`main`**, not here) | **The canonical post.** The public URL every variant points at: `https://github.com/rmanish2000-del/warrant-mcp/blob/main/writing/bypass-hunt.md`. Edit it on `main`, in the main worktree. |
| `writing/bypass-hunt.md` (this branch's copy) | **Stale by 6 lines — do not edit, do not publish from it.** It predates the final consistency pass on main. Treat main's copy as the only text. |
| `writing/PUBLISH-CARD.md` | The one-page runbook: pre-flight checks, platform order, exact titles. Follow it top to bottom. |
| `writing/RESPONSES.md` | Prepared answers for the first hour of comments. |
| `writing/variants-hackernews.md` | HN submission — goes **first**, weekday morning US Eastern. |
| `writing/variants-reddit.md` | r/ClaudeAI next day; r/LocalLLaMA two-three days later. Two different posts; never cross-mention. |
| `writing/variants-devto.md` | dev.to / Hashnode archive copy — any time after HN, canonical URL set, `published: false` until wanted. |
| `writing/bypass-hunt-thread.md` | Five-post thread — **skip entirely if HN goes badly.** |
| `writing/bypass-hunt-150.md` | 131-word aggregator blurb. |
| `writing/README.md` | Why the repo (not a blog platform) is the canonical home. |

## Publishing order, compressed

HN first (its objections are the ones worth fixing early) → r/ClaudeAI next
day → r/LocalLLaMA after a two-three day gap → dev.to/Hashnode whenever, as
archives. Pre-flight in PUBLISH-CARD.md is mandatory: reproduce the post's
"Try it" commands from an empty directory, open the canonical link logged
out, and re-check the numbers against `SECURITY-SURFACE.md` on `main`
(nine sessions, six got through, five closed, one still open).

## Nothing here is published

As of this note (2026-08-04), nothing has been posted anywhere. The next
action in this workstream is the founder posting to HN per the card.
