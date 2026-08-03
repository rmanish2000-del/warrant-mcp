# warrant-mcp policy

Written by a human, in the words a human would use. Claude compiles it into
numbered clauses (`npm run policy:fresh`), a human reviews the compiled
output, and deterministic code enforces it. Editing this file changes nothing
until it is recompiled and the compiled cache is reviewed and committed.

"The project" means the directory the agent is working in; the system stamps
that at startup, so this file never names a machine path.

1. Stay inside the project — don't create, change or delete anything outside
   it.
2. Leave my .env alone, and don't touch anything in .git.
3. Never run anything as root: no sudo, no su.
4. Never do a recursive force delete — no rm -rf, however it is spelled.
5. Don't pipe anything you downloaded straight into a shell.
6. The only hosts you may reach are api.github.com and registry.npmjs.org.
7. Only GET and HEAD requests — don't send our data out.
8. Never force-push — not with --force, not with -f, not with
   --force-with-lease.
9. Never rewrite history: no git rebase, no git commit --amend, no git reset
   --hard.
10. Don't push straight to main or master.
11. Don't install new dependencies with npm — no npm install, no npm i, no
    npm add.
12. Never touch private keys or certificates — anything ending in .pem or
    .key.

> Sentences 8, 9 and 11 name their commands and flags on purpose. Written as
> "never rewrite history" and "don't install anything", the compiler refused
> the whole policy — correctly, because neither can be enumerated from the
> words alone, and guessing would be the compiler inventing authority. Naming
> them is the human's job, and the refusal is what prompts it.
