# warrant-mcp policy

Human-written, plain English. This file is the source of truth; Claude compiles
it into numbered clauses (`npm run policy:fresh`), the human reviews the
compiled output, and deterministic code enforces it. Editing this file changes
nothing until it is recompiled and the compiled cache is reviewed.

The agent works inside one workspace directory (stamped by the system at
server start — the policy never names a machine path).

1. Delete files only inside the workspace. Anything outside it must not be
   deleted.
2. Never delete a .git directory or anything inside one, and never delete a
   file named .env, wherever it is.
3. Never run a shell command that invokes sudo or su.
4. Never run a recursive-force delete (rm -rf in any of its spellings).
5. Never pipe anything into a shell (| sh, | bash, and the like).
6. Send HTTP requests only to api.github.com and registry.npmjs.org. Every
   other host is refused.
7. Even to those hosts, only GET and HEAD requests are allowed.
