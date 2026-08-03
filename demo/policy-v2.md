# warrant-mcp policy — demo variant v2

The M2/M3 demo's "policy change": identical to [policy.md](../policy.md)
except sentence 2 no longer names .env — so the delete v1 refuses is
permitted here. Compiled off stage like any policy; the demo swaps the
compiled caches, so no demo path ever compiles.

"The project" means the directory the agent is working in; the system stamps
that at startup, so this file never names a machine path.

1. Stay inside the project — don't create, change or delete anything outside
   it.
2. Don't touch anything in .git.
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
