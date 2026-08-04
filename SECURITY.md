# Security

## What this is, before you report anything

warrant-mcp is a **policy layer, not a sandbox.** It produces a legible refusal
citing a clause a human wrote; it does not confine a process. It is meant to be
deployed inside OS-level confinement, and the things it cannot stop are listed
in [SECURITY-SURFACE.md](SECURITY-SURFACE.md) §4 — shell glob and variable
expansion, obfuscation, symlinks, per-tool coverage gaps, TOCTOU.

**Anything already on that list is not a vulnerability report.** It is a
documented limit, and I would rather you told me about a new one.

## Report publicly by default

Most bypasses should be a public
[bypass report](../../issues/new?template=bypass.yml). The whole project runs on
publishing what gets through, and a bypass in the open is worth more than one in
my inbox.

## Report privately if it is one of these

Email **rmanish2000@gmail.com** with `warrant-mcp security` in the subject:

- A way past enforcement that leaves **no trace the user would notice** — the
  hook appearing to run while the action goes through anyway.
- Anything that makes warrant-mcp **cause harm it would not otherwise cause**:
  the hook itself deleting, exfiltrating or executing something. The deciding
  path imports no filesystem, process or network capability precisely so this
  class should be impossible; if you have broken that, it matters.
- A **supply-chain problem** with the published npm package — a tampered
  tarball, a dependency compromise, a published artifact that does not match
  this repository.

Include what the bypass report template asks for. I will confirm receipt within
a week; I am one person, not a security team, and I would rather say that than
imply a rota that does not exist.

## What I will do

1. Reproduce it, and say either way.
2. Fix it if it is closable, with a regression test named for the attack.
3. Publish it in `SECURITY-SURFACE.md` once a fix ships — or, if it is not
   closable, publish it anyway with the limitation stated plainly. Nothing stays
   private permanently; the list of what gets through is the point.
4. Credit you, unless you ask me not to.

## Supported versions

The latest published version on npm. This is a young project with a single
maintainer; there are no backports.
