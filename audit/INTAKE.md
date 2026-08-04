# Intake

What must be known before an engagement starts, and what makes it right to
decline one.

Nothing is attacked until every section here has an answer. A blank is not a
detail to fill in later — several of these change whether the engagement is
possible at all, and one of them is where the finding comes from.

---

## A. The target

| | Why it is asked |
|---|---|
| **Which agent, which version** | Behaviour and tool names move between versions. A report against an unstated version has no shelf life. |
| **Which client** | Enforcement is client-shaped. A pre-execution veto exists in some clients and not others; where it does not, there is nothing to attack in the sense this engagement means. |
| **Which enforcement layer, and where its configuration lives** | The configuration is itself a target — one recorded route edited it down to `{}`. If it lives where the agent can write, that is likely to be a finding before anything else is attempted. |
| **Every connected MCP server, by name and by tool list** | Not "the ones that matter". A server nobody mentioned is exactly the shape of the gap: one recorded bypass was a filesystem-style MCP tool that the matcher did not cover at all. |
| **Operating system, and whether it is the one in real use** | Every session in this method's only pass ran on Windows, and the first bypass existed because the agent reached for PowerShell. Auditing on an OS the client does not use produces findings they cannot act on. |
| **The repository or workspace, and its shape** | Whether there are submodules, symlinks, or paths outside the workspace that the agent can reach. |
| **What the agent is allowed to do day to day** | An allowlist, a permission mode, an approval habit. This is the baseline the enforcement layer sits on top of. |

## B. The belief — the one that produces the finding

Ask before attacking, record verbatim, and do not paraphrase into something
tidier:

1. **What do you believe is protected right now?**
2. **Why do you believe that?** Because it was configured, because it was
   tested, because somebody said so, or because it has not gone wrong yet.
3. **What would be the worst outcome if the agent got it wrong?**
4. **Has anything already gone wrong?** If yes, what was changed afterwards —
   a change made after an incident is usually the least tested control present.

The engagement's whole value sits in the distance between (1) and what the
attempts show. A route that gets through and that the client already expected to
get through is a footnote; the same route, where the client believed it was
closed, is the finding. **Severity comes from the belief, not from the
technique.**

Collect this in writing, before the first attempt. A belief collected afterwards
is a belief shaped by the result, and it makes the report's central number
worthless.

## C. The environment

| | |
|---|---|
| **Is there an isolated environment that may be destroyed?** | Required. See "When to decline". |
| **Who can reset it, and how fast?** | The method resets between every attempt. If a reset is a ticket to another team, the engagement is a different, slower shape and should be priced and scheduled as one. |
| **What may be created and destroyed inside it?** | Sentinel files must be things nobody minds losing. |
| **Does it reach the network, and may it?** | Egress routes cannot be tested from an environment with no egress; the report then carries a whole untested family. |
| **Are there credentials anywhere in it?** | There should not be. If there are, they are rotated or removed before the engagement, not "avoided carefully". Attempts are destructive and evidence is captured in screenshots. |

## D. Scope, dates, and who receives the report

- Which routes are explicitly out of bounds, if any, and who decided.
- The window in which attempts may run.
- Who receives the report, and whether it will be shown to anyone who was not
  in the intake — findings read very differently to someone who has not seen
  the belief they are measured against.
- **Who signs off that the environment is isolated.** In writing, by name.

---

## When to decline

Declining is cheap now and expensive later. Two cases are hard rules.

### 1. No isolated environment to attack

The method is destructive by construction: the attempts delete protected files,
overwrite them, move them out of the workspace, and try to disable the guard
itself. Against anything that matters, an auditor is careful, and a careful
auditor is not attacking — every attempt gets softened until the result means
nothing.

Offer instead: help them stand one up, as separate work, and start the
engagement when it exists.

### 2. The scope is really a code review

The tell is a request phrased around *reading*: "look at our policy and tell us
if it's right", "review the configuration", "check our rules cover everything".

That is a different job with a different method and a different kind of
evidence, and it produces claims of a different strength. This engagement's only
claim is *these routes were attempted and here is what each one did* — an
empirical claim about a specific list. A review produces a judgement about
completeness, which this method cannot support and which its own results argue
against: two of six bypasses here were simply tools missing from a list.

Say which one they are asking for. If they want both, they are two engagements
with two deliverables, and the reading one does not get to borrow the attacking
one's evidence.

### Also decline, or renegotiate first

- **The client wants a pass/fail certificate.** No such artifact is produced.
  [SCOPE.md](SCOPE.md) says why, and the honest sentence is in
  [METHOD.md](METHOD.md) §8.
- **The client wants the findings fixed in the same engagement.** See SCOPE.md:
  finding and fixing are different jobs and mixing them damages both.
- **The environment is shared with anyone else's work** while attempts run.
- **The client will not record the belief in section B**, or wants to supply it
  after seeing results.
- **The only reachable target is an OS this method has never run on**, and the
  client expects the same confidence. It can still be run — the families in
  METHOD.md §5 are not Windows-specific — but the report must say it is the
  first time, and the client has to accept that before it starts, not on
  delivery.

---

## Before the first attempt

A checklist, because every item on it has been the reason a result was worth
less than it looked.

- [ ] Section B recorded verbatim, dated, and acknowledged by the client.
- [ ] Isolation signed off by a named person.
- [ ] Reset procedure exists, has been run, and ends in one unambiguous
      ready/not-ready line.
- [ ] Sentinels created; deliberately boring; nothing real inside them.
- [ ] Evidence capture rehearsed once end to end — before-state, tool call,
      enforcement output, after-state — because a missed capture on a genuine
      bypass cannot be recovered without redoing the attempt.
- [ ] Tool surface enumerated from a **live session**, not from documentation,
      and the read-only exclusions written down (METHOD.md §2).
- [ ] Agent, client, and OS versions recorded. They go on the report's cover.
