# dev.to / Hashnode

Both accept markdown with frontmatter. The body is `bypass-hunt.md` as written —
it needs no rewriting for this audience, which is the point of writing it plainly
in the first place. What changes is the frontmatter and the canonical link.

## dev.to frontmatter

Paste above the body. dev.to reads `canonical_url` and renders a "Originally
published at" line, which is what keeps the repo as the one address.

```yaml
---
title: I built a permission layer for AI agents, then spent a day breaking it
published: false
description: Nine sessions attacking my own PreToolUse hook. Six routes got through, five are closed, the sixth is open by construction — and a seventh turned up the next day, found by writing the format up as a spec rather than by attacking it.
tags: ai, security, typescript, opensource
canonical_url: https://github.com/rmanish2000-del/warrant-mcp/blob/main/writing/bypass-hunt.md
cover_image:
---
```

`published: false` on purpose — publish nothing until a human flips it.

Four tags is dev.to's maximum. `ai` and `security` are where this belongs;
`typescript` brings the readers who will actually look at the code;
`opensource` is the weakest of the four and the one to swap if a better fit turns
up. Deliberately not `mcp` — the tag exists but is thin, and a tag with no
audience is a wasted slot.

No cover image. A generated banner on a post-mortem reads as marketing and costs
more credibility than it buys.

## Hashnode frontmatter

Hashnode uses a different key set. `slug` should match the dev.to path so links
stay legible.

```yaml
---
title: "I built a permission layer for AI agents, then spent a day breaking it"
subtitle: "Six ways past my own hook, five fixes, and a seventh the spec found"
slug: permission-layer-for-ai-agents-bypasses
canonicalUrl: https://github.com/rmanish2000-del/warrant-mcp/blob/main/writing/bypass-hunt.md
tags: artificial-intelligence, security, typescript, developer-tools
enableToc: true
---
```

`enableToc` earns its place here: the post has nine sections and Hashnode's
sidebar makes "What still gets through" and the addendum reachable without
scrolling, which are the two sections most worth reaching.

The slug no longer carries a count. Nothing is published yet, so this is free to
change now — and it is worth changing, because a number in a URL is a promise
that the number will not move. It moved once already.

## Body

Use `bypass-hunt.md` verbatim, minus its H1 — both platforms render the title
from frontmatter, so leaving the H1 in produces it twice.

One edit for both: the post refers to `SECURITY-SURFACE.md` by filename. Off
GitHub that is not a link, so make it one:

```
[SECURITY-SURFACE.md](https://github.com/rmanish2000-del/warrant-mcp/blob/main/SECURITY-SURFACE.md)
```

The same applies to the commit hashes `663b164` and `f424373` — either link them
to the commits or leave them bare, but do not leave them looking clickable when
they are not.
