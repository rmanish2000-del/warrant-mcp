# PUBLISH CARD

One page. Follow it top to bottom. Nothing here is published yet.

---

## The canonical link

```
https://github.com/rmanish2000-del/warrant-mcp/blob/main/writing/bypass-hunt.md
```

Every platform points here. Never set a canonical URL that points at another
platform. Reasoning is in `writing/README.md`.

## Before you post anything — 5 minutes

- [ ] Run the three commands in the post's "Try it" section from an empty
      directory. If any of them fails today, stop; the post's central promise is
      that a stranger can reproduce a refusal.
- [ ] Open the canonical link in a logged-out browser. If it 404s, the repo is
      private again.
- [ ] Confirm the numbers still match `SECURITY-SURFACE.md`. **Two numbers, kept
      apart:** nine sessions, six got through, five closed, one open by
      construction — **plus** one further route found later while writing
      `SPEC.md`, not by attacking, also open on purpose. Never add them into
      "seven in nine sessions"; every mention of the seventh states that the
      spec found it.

---

## Order to post in, and why

**1. Hacker News, on a weekday morning US Eastern.**

First because it is the only audience that will read the limitations section, and
their objections are the ones worth fixing before a larger audience sees it. If
HN finds a hole in the argument, you want to know that before the Reddit posts
are live, not after.

**2. Reddit r/ClaudeAI, the next day.**

Second because it is the friendliest room — people already running Claude Code —
so it is the best place to be if HN went badly and you need a calmer read.

**3. Reddit r/LocalLLaMA, two or three days later.**

Last, and spaced out. Posting both subreddits the same day reads as
broadcasting, and the two bodies are deliberately different posts. Never mention
one in the other.

**dev.to / Hashnode: any time after HN.** They are archives, not events. Set the
canonical URL, leave `published: false` until you actually want it live.

**Skip the thread entirely if HN goes badly.** It is the most promotional
artifact and the least informative one.

---

## Hacker News

**Title** (paste exactly):

```
I built a permission layer for AI agents, then spent a day breaking it
```

**URL:** the canonical link above.

**Then immediately post the comment in `variants-hackernews.md`** as the author.
Do not wait to see how it lands first. A post-mortem submitted with no author in
the thread reads as a link drop.

## Reddit

Titles and bodies are in `variants-reddit.md` — two separate posts, written for
two different rooms. Paste them as they are. Do not add "x-post from", do not
link one to the other.

## dev.to / Hashnode

Frontmatter in `variants-devto.md`. Body is `bypass-hunt.md` **minus its H1**
(both platforms render the title from frontmatter). Turn `SECURITY-SURFACE.md`
into a real link — off GitHub it is just a filename.

---

## The first hour

Prepared answers for the predictable questions are in `RESPONSES.md`. Read it
once before posting, not during.

**Reply to:**

- Anyone who names a bypass you have not seen. Thank them, ask for the exact
  command or tool call, and say you will add it to the log. This is the single
  best thing that can happen in the thread.
- Anyone asking how it behaves in a case you actually tested. You have the
  answers; give the specific one, not the general claim.
- Anyone pointing out a factual error. Concede it in the first sentence, fix it,
  say you fixed it.

**Do not reply to:**

- "Why not just use X" where X is a sandbox. The post already says it belongs
  inside one. Answering again looks defensive.
- Anything about the name, the language, or the choice of Node.
- Anyone hostile in a way that is not about the work. One non-answer is fine;
  a second reply is a thread you have chosen to be in.
- Downvote complaints. Never.

**The one thing that must never be argued about:**

**Never argue that something is secure.** Not once, not partially, not "well, in
practice". The moment you defend the strength of the boundary you have swapped a
credible post-mortem for a weak security claim, and you will lose — because the
post itself lists seven ways past it. If pushed: *"It's a policy layer, not a
sandbox — it belongs inside one, and the list of what still gets through is in
the repo."* Then stop.

**Under pressure, twice on the same point: concede the specific, hold the
general. Never argue three exchanges deep.**

---

## If someone finds a bypass in the comments

Use this, adapted to their case:

```
That works — thank you. I hadn't tested that route.

Adding it to SECURITY-SURFACE.md as found-by-[their handle], and I'll say
whether it's closable or structural once I've tried it rather than guessing now.

This is exactly the failure mode in the post: the tool-mapping layer is an
enumeration of somebody else's surface, and enumeration has no completion
proof. Finding another one is evidence for the argument, not against it.
```

Then actually do it — add the row, credit them, push. A promise kept in public is
worth more than the bypass cost you.

**If they are wrong**, say so plainly and show the command you ran:

```
I tried that and it was blocked — here's the output. [paste]

If you're seeing something different, tell me your OS and the exact tool call
and I'll dig in.
```

**If you cannot tell whether they are right**, say that. "I don't know, let me
try it" is a stronger answer than a confident wrong one, and this post's whole
standing rests on being the kind of person who says it.

---

## What not to say, anywhere

Never: "secure", "can't be bypassed", "fully autonomous", "the model decides",
"nothing can get through", "production ready", or any number you did not measure
that day. Never name a private platform or employer.
