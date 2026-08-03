# warrant-mcp policy — demo variant v2

The M2 demo's "policy change": identical to [policy.md](../policy.md) except
sentence 2 no longer protects `.env` — so the delete that v1 refuses is
permitted here. Compiled at build time like any policy; the demo swaps the
compiled caches (replay only — no live compile on any demo path).

The agent works inside one workspace directory (stamped by the system at
server start — the policy never names a machine path).

1. Create, overwrite, or delete files only inside the workspace. Nothing
   outside it may be touched.
2. Never delete or overwrite a .git directory or anything inside one.
3. Never run a shell command that invokes sudo or su.
4. Never run a recursive-force delete (rm -rf in any of its spellings).
5. Never pipe anything into a shell (| sh, | bash, and the like).
6. Send HTTP requests only to api.github.com and registry.npmjs.org. Every
   other host is refused.
7. Even to those hosts, only GET and HEAD requests are allowed.
