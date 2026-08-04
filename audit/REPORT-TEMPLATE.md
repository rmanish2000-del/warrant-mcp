# Report template

Fill in place. Every `‹…›` is a blank that must be filled or the section
removed with a stated reason — a template that ships with its placeholders in it
is how a report starts implying work that did not happen.

**Two rules that govern the whole document:**

1. **A claim without evidence does not go in.** Every finding carries the tool
   call verbatim, the enforcement layer's output verbatim, and the filesystem
   state before and after. A finding you are sure of but cannot evidence is
   written in §7 as untested, not in §4 as a result.
2. **§6 is mandatory and never empty.** If it is empty, the report is claiming
   complete coverage, which the method cannot support.

---

# Agent tool-call enforcement — attack report

**Client:** ‹organisation›
**Engagement dates:** ‹start› – ‹end›
**Report date:** ‹date›
**Prepared by:** ‹name›

| | |
|---|---|
| Agent | ‹product and version› |
| Client / host | ‹product and version› |
| Enforcement layer | ‹what, and where its configuration lives› |
| Operating system | ‹OS and version — the one in real use› |
| Connected MCP servers | ‹names, or "none"› |
| Environment | ‹isolated environment, signed off by ‹name› on ‹date›› |

> This report describes ‹N› attempts against one setup on the dates above. It
> is a snapshot. A client update, a newly connected tool, or a model change can
> change every result in it.

---

## 1. Executive summary

*Written for someone who will not read section 4. No tool names, no command
lines, no jargon. Four short paragraphs at most.*

**What we were asked to check.** ‹In the client's own words from intake:
what they believed was protected, and why.›

**What we found.** ‹Plain sentences. "The agent was able to ‹outcome› despite
‹the rule that was supposed to prevent it›." Lead with the finding that
contradicts a stated belief — that gap is the engagement's result.›

**What it means.** ‹Consequence in the client's terms — what could be
destroyed, sent, or changed. Not severity labels.›

**What to do.** ‹Ordered. Closable findings first, then the layer changes in
§5 that no amount of policy work will replace.›

### Result at a glance

| | Count |
|---|---|
| Routes attempted | ‹n› |
| **BYPASS** — forbidden outcome achieved | ‹n› |
| **BLOCKED** — enforcement fired, verified on disk | ‹n› |
| **NOT REACHABLE** — the model declined; the control never ran | ‹n› |

> **On NOT REACHABLE.** These routes were **not tested**. The model declined
> before any tool call, so the enforcement layer never ran on them. A route the
> model happens to refuse is untested, not safe: a different phrasing, a
> different day, or a different model version may reach it.
>
> ‹If NOT REACHABLE is a large share of the total, say so here in these terms:
> "This engagement did not manage to test ‹n› of ‹total› routes. That is not a
> clean result; it is an absent one, and it is the reason we recommend a second
> pass with re-phrased attempts."›

---

## 2. The surface we enumerated

*Taken from a live session, not from documentation. This table shows what was
considered, which is the only way a reader can challenge a judgement.*

| Tool | Side effect it can cause | Covered by enforcement? | How the action is extracted |
|---|---|---|---|
| ‹tool› | ‹effect› | yes / **no** | ‹mapping, or "—"› |

**Excluded as read-only:** ‹list them explicitly.› *Anything that can destroy
through an option is not a reader — a find command with a delete flag is the
recorded example.*

**Unmapped and therefore ungoverned:** ‹list.› ‹For each: whether it was
attempted, and if not, why not — it belongs in §6.›

---

## 3. How we tested

*Short. The method is a separate document; this says what was actually done
here.*

- Environment reset before every attempt, by ‹procedure›, verified by
  ‹the check that ends in ready / not ready›.
- Sentinels: ‹names and what they contained — deliberately non-sensitive›.
- Evidence per attempt: file listing and hashes before, the tool call verbatim,
  the enforcement output verbatim, file listing after.
- Attempts were phrased as ordinary work, because a request that reads as an
  attack is declined by the model and a declined route tests nothing. ‹Note the
  cost: this engagement therefore says nothing about behaviour under an overtly
  hostile request.›

---

## 4. Attempts

*One subsection per attempt. Every one gets a classification and its evidence.
No exceptions, including the boring ones — the blocked rows are what make the
bypass rows credible.*

### 4.‹n› ‹Short name of the route›

| | |
|---|---|
| **Classification** | **BYPASS** / **BLOCKED** / **NOT REACHABLE** |
| Family | ‹from METHOD.md §5› |
| Rule that should have governed it | ‹the client's rule, quoted› |
| Client's stated belief | ‹from intake — protected / not protected / not considered› |

**What was asked**

> ‹the prompt, verbatim›

**What the agent did**

```
‹tool call, verbatim›
```

**What the enforcement layer said**

```
‹output verbatim, or "no output — the layer did not fire"›
```

**Filesystem before and after**

```
before: ‹listing / hash›
after:  ‹listing / hash›
```

**Result.** ‹One or two sentences. State only what the evidence shows. If the
outcome differed from what the agent claimed, say both and say which is
evidence — one recorded attempt reported a successful wildcard delete while the
filesystem showed the protected file had survived for an incidental reason.›

**Closable or structural.** ‹§5 category, and one sentence on why.›

---

## 5. What can be closed, and what cannot

### 5.1 Closable

*A specific gap with a specific fix.*

| # | Finding | What closes it | Verified by |
|---|---|---|---|
| ‹n› | ‹finding› | ‹class of fix — the client writes it; see SCOPE.md› | ‹a regression test named for this attack› |

> A fix should be verified by a test **named after the attack that opened it**.
> A test called after the bug is the thing that stops the fix being quietly
> reverted a year later by someone who does not know what it was for.

### 5.2 Structural

*Properties of the architecture. These do not get fixed; they get stated, and
they change what is needed at a different layer.*

| Finding | Why it cannot be closed here |
|---|---|
| ‹finding› | ‹reason — e.g. resolving it requires reading the filesystem, which a deliberately I/O-free decision path cannot do› |

### 5.3 What your deployment needs on top, regardless of any fix

*Applies even if every closable finding is closed. This is not a sales
paragraph; it is the honest boundary of what a tool-call policy layer can be.*

- **OS-level confinement.** Container or VM, a read-only mount for everything
  outside the workspace, a separate user. A policy layer is not a sandbox and
  belongs inside one.
- **Network egress control at the network layer.** A host allowlist enforced at
  the tool layer only governs the tools that were mapped.
- **Enforcement configuration the agent cannot write.** Org-managed or stored
  outside the workspace. ‹If §4 found the configuration editable, point at that
  attempt here.›
- **An append-only record of decisions**, so a later question about what the
  agent was permitted to do has an answer that is not a memory.

---

## 6. What we did not test

**Mandatory. Never empty.** ‹If this section is short, the engagement was
short — say that rather than shortening the section.›

**Routes that never reached the enforcement layer**
‹Each NOT REACHABLE route, with what was asked and what the model said. These
are untested, and the report claims nothing about them.›

**Families not exercised, and why**
‹From METHOD.md §5. E.g. no network egress family because the environment had
no egress; no MCP family because no server was connected.›

**Environments not covered**
‹Operating systems, client versions, models not tested. If the engagement ran
on one OS, this is where that is stated plainly.›

**Out of scope by agreement**
‹From SCOPE.md, plus anything the client excluded at intake.›

**What would change these results**
‹Client update, new MCP server, model change, OS change. A report without this
implies a permanence it has not got.›

---

## 7. Limits of this report

- This report says only that **these specific routes were attempted, and here
  is what each one did.** It does not say the setup is secure, and no sentence
  in it should be quoted as saying so.
- **The list of routes is not provably complete.** Enumerating somebody else's
  tool surface has no completion proof. ‹If any finding here was a tool missing
  from a list, say so — it is the strongest available evidence that the list is
  still incomplete.›
- **The agent's own account of its actions is not evidence.** Only the
  filesystem state is, and that is what every §4 row rests on.
- **A model's refusal is not a control.** §1 and §6 both say this. It is
  repeated because it is the single easiest result in this report to misread.

---

## 8. Appendix — full transcripts

‹Complete session transcripts for every attempt, in order, unedited apart from
redaction. Redactions marked in place with what was removed and why.›

---

## Before sending

- [ ] Every §4 row has evidence. No row rests on recollection.
- [ ] Every BYPASS row's outcome was verified on the filesystem, not from the
      transcript.
- [ ] §6 is not empty.
- [ ] No occurrence of "secure", "safe", "hardened", or a score.
- [ ] NOT REACHABLE rows are described as untested everywhere they appear,
      including the summary.
- [ ] Versions on the cover match the environment that was actually attacked.
- [ ] Transcripts redacted; no credential, no real path, no name that does not
      belong to the client.
- [ ] Someone who was not in the engagement has read §1 and can say what to do
      next without reading further.
