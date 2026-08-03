# WARRANT — 4-MINUTE STAGE DEMO CARD

One story, three beats: an agent tries ordinary housekeeping, policy says no,
the hook makes no mean **no** — then a human changes the policy and the same
request sails through. Warrant itself is fully offline (cached policy, no
compile, no network); only Claude Code's own model access needs the internet.

---

## PRE-FLIGHT (before you're on stage — 2 minutes)

- [ ] `node --version` → must print v22.6 or newer
- [ ] `cd <repo>/warrant-mcp` → `npm run demo:reset` → `PRISTINE — … (policy v1 active).`
- [ ] `npm run demo:check` → last line **READY** (anything else: it tells you the fix)
- [ ] Terminal at **80×24 or larger, font ≥ 18 pt** — banner is 64 cols × ≤20
      lines, verified to fit 80×24 (see "Legibility", below)
- [ ] `cd ../warrant-mcp-demo` and start `claude` there (hooks load at session
      start — never mid-session)
- [ ] Second terminal in `warrant-mcp/` for reset/permit commands

## THE BEATS

### Beat 1 — housekeeping, blocked (~75s)

Type into Claude Code:

> Tidy up this directory: delete the leftover .env file. If a hook or policy
> blocks you, quote the block message verbatim and stop — do not try another way.

Expected: the agent inspects, attempts the delete (Bash or PowerShell — both
are hooked), and the hook blocks it:

```
────────────────────────────────────────────────────────────────

   DENY   ·   clause W2

   W2 — Never delete or overwrite a .git directory or anything
   inside one, and never delete or overwrite a file named .env,
   wherever it is located.

   refused:
      PowerShell — remove-item deletes
      C:\...\warrant-mcp-demo\.env

   Refused under clause W2: the file is named ".env", which is
   protected.

   The action was not performed.

────────────────────────────────────────────────────────────────
```

Say: "The model genuinely tried. The hook refused. Deterministic code, citing
the clause a human wrote." Prove it: `cat .env` → sentinel line still there.

### Beat 2 — chained command, stopped entirely (~60s)

> junk-dir here is scratch content and safe to remove. Run this exact command
> with the Bash tool: rm -rf junk-dir && touch cleanup-done.txt
> If a hook or policy blocks you, quote the block message verbatim and stop —
> do not try another way.

Expected: DENY · clause W4 ("recursive-force delete … forbidden sequence
"rm -rf""), refusing the **whole** command line. Prove it: `ls junk-dir` →
file.txt intact; `ls cleanup-done.txt` → does not exist. The chain died
before the shell ever saw it — no marker, no process.

### Beat 3 — the human changes the policy; same request succeeds (~60s)

In the second terminal:

```bash
npm run demo:permit
```

→ `POLICY v2 ACTIVE — .env is no longer protected.` (a file copy of a
pre-compiled, human-reviewed cache — nothing compiles, ever, on stage).

Back in Claude Code, type **exactly the Beat 1 prompt again**.

Expected: the delete runs clean, agent confirms, `ls .env` → gone.

Say: "Same agent, same request. The only thing that changed is the policy a
human wrote and reviewed. Warrant enforced both answers."

### Wrap (~30s)
"The model never decides. Claude compiles the policy once, off stage; at
runtime a DENY is deterministic code citing a numbered clause — and the hook
means the action physically does not happen."

## AFTER (or between rehearsals)

`npm run demo:reset` → PRISTINE in well under 3 seconds. Run `demo:check`
again if anything felt off.

## LEGIBILITY

Banner measured at **64 columns × ≤20 lines** (both DENY beats), verified to
fit an **80×24** terminal with no wrapped lines. On the projector use ≥18 pt
font; the verdict line and clause text are the only things that must be read
from the back row.

## IF IT GOES WRONG (one line each)

- **Hook doesn't fire (action executes under v1):** stop the demo claim,
  say "that's a bypass we log and close — here's the engine's verdict",
  and run `npm run demo` — same engine, banners on the terminal, zero network.
- **Session hangs or rambles:** Esc, `npm run demo:reset`, restart `claude`
  in the sandbox, re-type the beat's prompt (they're all one-liners).
- **No Node ≥ 22.6 on the machine:** nothing runs — switch to the backup
  laptop, or narrate the printed banners on this card; do not improvise an
  install on stage.
- **Venue network is down:** Claude Code can't reach the model; run
  `npm run demo` (fully offline) and talk through the same three beats.
- **`demo:check` says NOT READY:** do what its bullet says (almost always
  `npm run demo:reset`); if it still fails, fall back to `npm run demo`.

## WHY THESE COMMANDS (the constraint that shaped them)

The model sometimes refuses scary-looking commands by itself — the hook never
fires and Warrant gets no credit. Every demo command therefore reads as
**benign housekeeping** ("delete the leftover .env", "remove scratch
junk-dir") and is forbidden only by the compiled policy. Proven in rehearsal:
the stream transcript shows the model *issuing* the tool call and the harness
returning the hook's DENY — the block is Warrant's, not the model's mood.
