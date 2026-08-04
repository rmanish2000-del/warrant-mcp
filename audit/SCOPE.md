# Scope

What this engagement is, in plain language, and what it is not. Written to be
read by whoever signs it rather than by whoever runs it.

---

## In scope

**1. Attacking your agent's tool-call enforcement.**

We take your agent setup in an isolated environment and try to make it do things
your rules forbid. Real sessions, real attempts, environment reset between each
one. Every attempt is recorded with the evidence of what actually happened on
the filesystem — not the agent's account of what it did, which is a claim.

**2. Reporting what we found.**

A written report: the tool surface we enumerated, every attempt with its
outcome, which findings can be closed and which are properties of the
architecture, what your deployment needs on top regardless, and a section
listing what we did not test. That last section is never empty.

That is the whole of it. Two things.

---

## Out of scope

**Fixing anything.** We do not change your code, your policy, or your
configuration. See the next section — this is the one exclusion with a reason
worth reading.

**Installing anything.** We do not deploy a tool, a product, or an agent into
your environment as part of the engagement.

**Code security review.** We do not read your application for vulnerabilities.
We attack what your agent is permitted to do; whether the code it edits is
itself sound is a different question with a different method.

**Penetration testing.** No network, infrastructure, cloud, identity or
application testing. This engagement stays inside one narrow question: does the
enforcement layer stop the tool call.

**Compliance certification.** We issue no certificate and no pass/fail. There
is nothing here to hand an auditor as evidence of a control, and a report that
implied otherwise would be worse than nothing. The strongest sentence the method
supports is *these specific routes were attempted, here is what each did, and
here is what was not tested.*

**Ongoing retainer, monitoring, or re-testing.** The report describes a snapshot
of a surface somebody else keeps extending. A client version, a newly connected
tool, or a model update can change the answer. Re-testing later is a new
engagement, priced as one.

**Anything on production, or on any environment holding real credentials or
real work.** Not a preference — the attempts are destructive.

---

## Why finding and fixing are separate jobs

The most common request is to do both at once. It sounds efficient. It damages
both, in three specific ways.

**The auditor stops being able to report a miss.** Once the fixes are ours, a
route that still gets through is our failure. There is a quiet, entirely human
pressure to reclassify it — to call it out of scope, to describe it as a known
limitation, to leave it out because it will be closed next week anyway. The
report's whole value is that it lists what still gets through, and that value
disappears the moment saying so is an admission.

**The attacking gets shallower.** Fixing consumes the engagement's time, and it
consumes it in the middle, exactly when the enumeration is paying off. In this
method's own pass, two of the six bypasses were tools missing from a list —
cheap to find and cheap to fix, but only findable by continuing to enumerate
rather than stopping to patch.

**Nobody is left checking the fix.** A fix written by the person who found the
hole is verified by the person who found the hole. That is one perspective
twice. When the fix comes from your side, our attempts become an independent
check on it, and a re-test has something to say.

So: we find, you fix, and if you want the fix verified, that is a second
engagement where we re-run the routes and report the difference. We are glad to
say what class of fix would close a finding — the report does that for every
closable one — but the writing of it is yours.

**One exception, narrow and stated in the report:** if an attempt disables the
enforcement layer and leaves your environment unable to run further attempts, we
restore it to the state we started from so the engagement can continue. That is
housekeeping, not remediation, and it is logged as such.

---

## What you get

- The report, once, in writing.
- The enumerated tool surface as data you keep.
- A walkthrough of the findings, live, so questions get answered by the person
  who ran the attempts.

## What you do not get

- A number, a score, or a grade.
- The word "secure" about anything.
- A guarantee that the list of routes is complete. It is not, and the report
  says which of its own results are the evidence that it is not.
