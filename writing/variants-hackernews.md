# Hacker News

Submit as a link to the canonical URL (see `writing/README.md`), not as a text
post. Then post the comment below immediately, as the author.

## Title

```
I built a permission layer for AI agents, then spent a day breaking it
```

Under 80 characters. No "Show HN" — this is a post-mortem, and the submission
guidelines reserve Show HN for something people can try, which the post links to
anyway. No colon-subtitle, no numbers in the title; HN readers discount both.

## First comment (post as author, immediately after submitting)

```
Author here. Two things I'd flag before anyone reads it as a security claim.

First: the sixth route is still open, and it's a shell glob. `rm -f *` gets
expanded by the shell after my hook has already decided, so the hook sees the
literal `*` and nothing else. Working out what it matches would mean reading the
filesystem, and the deciding code deliberately imports no filesystem capability
(there's a test that greps those modules for node:fs and friends and fails if one
shows up). I don't have a fix for that class, only the observation that it
exists.

Second, and this is the part I'd want scrutinised: every one of these bypasses
reached a decision that was never made. The evaluator was never wrong. The
action just never got mapped into something it could see — a shell it didn't
know about, a target inside nested quotes, an MCP server nobody enumerated. The
tool-mapping layer is an enumeration of a surface the client owns and keeps
extending, and enumeration has no completion proof.

So it's a policy layer, not a sandbox, and it belongs inside one. The honest
limits are in SECURITY-SURFACE.md in the repo — including the two routes that
were blocked and the one the model refused on its own before I could test it,
which I count as untested rather than safe.

Happy to be told what else gets through. That's genuinely the useful reply.
```

Around 230 words. It concedes the weakest point in the first paragraph, which is
the only reliable way to survive the comment section.

## If it gets traction, expect these

- **"This is just a denylist with extra steps."** Partly fair for the shell rules,
  and worth conceding. The part that isn't: the invocation matching is
  order-independent, so `git push origin main --force` and
  `git push --force origin main` are the same rule rather than two entries — a
  string denylist catches one of them.
- **"Why not just sandbox it?"** You should. This is not an alternative to
  confinement; it produces a legible refusal that cites a clause a human wrote,
  which a seccomp profile does not.
- **"The model could rewrite the hook config."** Yes — I got a targeted `Edit`
  through that left it `{}`. Detection is possible; prevention needs settings the
  agent cannot write, which is a deployment decision, not a code one.
