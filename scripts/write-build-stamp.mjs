/**
 * Stamp dist/ with the source state it was built from — run by prepack, after
 * tsc. The stamp is what lets bin/dist-stamp.mjs answer "is this dist/ the
 * current source?" instead of guessing; see that file for why guessing is the
 * trap. The stamp ships in the tarball (files includes dist/), which is
 * harmless: an installed copy has no .git, so it is never compared there.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { resolveHead } from '../bin/dist-stamp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const commit = resolveHead(root);
if (commit === null) {
  // Building outside a checkout (e.g. from an unpacked tarball): nothing to
  // stamp against, and nothing will ever check — but say so rather than write
  // a stamp that looks authoritative.
  process.stderr.write('write-build-stamp: not a git checkout, writing a null stamp\n');
}
const stamp = { commit, builtAt: new Date().toISOString() };
writeFileSync(join(root, 'dist', 'build-stamp.json'), `${JSON.stringify(stamp, null, 2)}\n`);
process.stdout.write(`dist/build-stamp.json: ${commit ?? 'null'}\n`);
