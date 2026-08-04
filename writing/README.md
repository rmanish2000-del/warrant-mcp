# writing/

Nothing here is published. Every variant points at one address.

## The canonical version

```
https://github.com/rmanish2000-del/warrant-mcp/blob/main/writing/bypass-hunt.md
```

**The repo is the canonical home, not a blog platform.** Three reasons, in order
of how much they matter:

1. **The post's whole claim is that it is checkable.** It cites commit hashes,
   a test that scans five modules, a file called `SECURITY-SURFACE.md`. On the
   repo those are one click away and provably current. On dev.to they are
   assertions about a codebase somewhere else.
2. **The post will go stale, and here it goes stale visibly.** When a new bypass
   turns up, the honest thing is a commit next to the code it describes — not an
   edit to a blog post nobody re-reads.
3. **Nothing on a platform is load-bearing.** If dev.to changes its mind about
   canonical tags tomorrow, the address still works.

Cost of this choice, stated plainly: GitHub markdown has no comments, no
subscriber list, and worse typography than either blog platform. That is a real
loss and it is worth it, because the readers this post is for are the ones who
will open `SECURITY-SURFACE.md` next.

If the repo ever gets a documentation site, the canonical URL moves there and the
GitHub path redirects. Until then, do not set a canonical URL on any platform
that points at another platform.

## Files

| File | What it is |
|---|---|
| `bypass-hunt.md` | the post — canonical |
| `bypass-hunt-thread.md` | six posts, each under 280 characters |
| `bypass-hunt-150.md` | short version for aggregator submissions |
| `variants-hackernews.md` | title, author's first comment, likely objections |
| `variants-reddit.md` | r/ClaudeAI and r/LocalLLaMA — separate posts, no cross-post language |
| `variants-devto.md` | frontmatter and tags for dev.to and Hashnode |
| `PUBLISH-CARD.md` | the one page to follow on the day |
| `RESPONSES.md` | prepared answers for the questions that will actually come |

## Before publishing anything

- Re-run the three commands in the post's "Try it" section from an empty
  directory. Verified against the published package three times on 4 August 2026;
  verify again on the day, because the claim is about what a reader will
  experience, not about what once worked. The end-to-end time ranged 43–71s
  across runs, which is why the post gives a range rather than a figure.
- Check the bypass count in every variant still matches `SECURITY-SURFACE.md`.
  **Two separate numbers, and they must not be added together anywhere:** six
  routes got through in the nine adversarial sessions, of which five are closed;
  and one further route was found later while writing `SPEC.md`, by stating what
  a rule means rather than by attacking anything, and is open on purpose. Every
  variant that mentions the seventh must say where it came from — that origin is
  the interesting part, and folding it into "seven in nine sessions" would be a
  false sentence. An earlier draft of the post said five got through, which was
  also wrong; counts in this repo have drifted twice, so check rather than
  assume.
- Post the Hacker News comment yourself, immediately, as the author. A
  post-mortem submitted without the author present reads as a link drop.
