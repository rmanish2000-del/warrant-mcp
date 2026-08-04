# Worked example — the canonical policy, annotated

This is warrant-mcp's own policy (`policy.md` in the repository, 12 clauses,
14 rules as compiled). Each sentence is annotated with the rule type it is
shaped for and the craft decision it embodies. Use it as a template for
register and specificity, not as a policy to copy blindly — Step 1's
interview exists because every project protects different things.

> "The project" means the directory the agent is working in; the system
> stamps that at startup, so this file never names a machine path.

*(That preamble is context, not a clause — the compiler reads only the
numbered sentences as policy.)*

1. **"Stay inside the project — don't create, change or delete anything
   outside it."**
   → `file_delete_outside_workspace`. No path named; the trio
   "create, change or delete" states the full destructive family.

2. **"Leave my .env alone, and don't touch anything in .git."**
   → `file_delete_protected` (basename `.env`, segment `.git`). A bundle of
   two *expressible* intents — safe, because both halves land in the same
   rule type.

3. **"Never run anything as root: no sudo, no su."**
   → `shell_forbidden_token`. Both spellings named by the user.

4. **"Never do a recursive force delete — no rm -rf, however it is
   spelled."**
   → `shell_forbidden_sequence`. A genuinely adjacent idiom; "however it is
   spelled" licenses the common orderings of the same idea (`rm -fr`,
   `rm -r -f`), nothing more.

5. **"Don't pipe anything you downloaded straight into a shell."**
   → `shell_forbidden_sequence` (`["|","sh"]`, `["|","bash"]`, …). The other
   legitimate sequence use.

6. **"The only hosts you may reach are api.github.com and
   registry.npmjs.org."**
   → `http_host_allowlist`. Exact hostnames. "The npm registry" would name
   nothing the compiler is allowed to resolve.

7. **"Only GET and HEAD requests — don't send our data out."**
   → `http_method_allowlist`. The clause after the dash is motivation, and
   compiles to nothing extra — the enforceable part is the method list.

8. **"Never force-push — not with --force, not with -f, not with
   --force-with-lease."**
   → `shell_forbidden_invocation` (`git push` + anyFlag). Long and short
   forms both named, because the compiler emits only the spellings the
   user's words cover.

9. **"Never rewrite history: no git rebase, no git commit --amend, no git
   reset --hard."**
   → three `shell_forbidden_invocation` rules under one clause. Written as
   just "never rewrite history", the compiler refused the whole policy —
   correctly. The named version is the same intent with the user's
   authority made explicit.

10. **"Don't push straight to main or master."**
    → `shell_forbidden_invocation` (`git push` + anyArgument
    `["main","master"]`). Argument-position matching, order-independent.

11. **"Don't install new dependencies with npm — no npm install, no npm i,
    no npm add."**
    → `shell_forbidden_invocation` (`npm` + subcommand aliases). Aliases
    named by the user; "don't install anything" alone was refused.

12. **"Never touch private keys or certificates — anything ending in .pem
    or .key."**
    → `file_delete_protected` (suffixes). Plain endings, no wildcards. This
    is the honest narrowing of "don't touch secrets" — chosen by the human,
    not by the compiler.

## Two structural notes from the same build

- **Clause numbers are addresses.** Refusals cite W2, W4, …; if some other
  document or demo depends on a particular clause number, reordering the
  list moves the address.
- **Write scope interacts with everything at the root.** This policy has no
  `file_write_scope` on purpose: scoping writes to `src/` + `tests/` would
  also refuse touching the root `.env` — which this project's demo needed to
  be governed by clause 2, not by a scope rule. When a user asks for both a
  write scope and root-level file rules, walk through what the scope already
  covers.
