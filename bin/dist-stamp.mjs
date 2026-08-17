/**
 * The dist/ staleness check.
 *
 * bin/warrant-mcp.mjs prefers dist/ when it exists, because an installed copy
 * cannot run TypeScript (Node refuses to strip types under node_modules). In a
 * source checkout that preference is a trap: a dist/ left behind by an old
 * `npm pack` silently wins over newer src/, and the reader debugs code that is
 * not the code they are looking at. That cost a real debugging session on
 * 2026-08-14 — a 10-day-old dist/ shadowed src/ through a full green gate.
 *
 * The fix is detection, not resolution order: prepack stamps dist/ with the
 * commit it was built from, and this module compares that stamp against the
 * checkout's current HEAD. On mismatch the launcher FAILS LOUD, naming both
 * commits — it never silently falls through to src/, because a fallback that
 * guesses is the same trap wearing better clothes.
 *
 * An installed package has no .git, so an installed copy never fails here.
 * HEAD is resolved by reading .git directly — no process is spawned.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * The .git directory for a checkout root, following the `gitdir:` pointer a
 * linked worktree uses. Returns null when the root is not a git checkout.
 */
function gitDirOf(root) {
  const dotGit = join(root, '.git');
  if (!existsSync(dotGit)) return null;
  if (statSync(dotGit).isDirectory()) return dotGit;
  const pointer = readFileSync(dotGit, 'utf8').match(/^gitdir: (.+)$/m);
  if (pointer === null) return null;
  const target = pointer[1].trim();
  return isAbsolute(target) ? target : join(root, target);
}

/** One ref, looked up loose then packed. Returns a sha or null. */
function refSha(gitDir, ref) {
  const loose = join(gitDir, ref);
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  const packed = join(gitDir, 'packed-refs');
  if (existsSync(packed)) {
    for (const line of readFileSync(packed, 'utf8').split('\n')) {
      if (line.endsWith(` ${ref}`)) return line.slice(0, line.indexOf(' '));
    }
  }
  return null;
}

/**
 * The commit sha this checkout is at, or null when it cannot be established
 * (not a checkout, or a git state this reader does not understand). Null means
 * "unknown", never "clean" — the caller skips the check rather than guessing.
 */
export function resolveHead(root) {
  const gitDir = gitDirOf(root);
  if (gitDir === null) return null;
  const headPath = join(gitDir, 'HEAD');
  if (!existsSync(headPath)) return null;
  const head = readFileSync(headPath, 'utf8').trim();
  if (!head.startsWith('ref: ')) return head === '' ? null : head; // detached
  const ref = head.slice('ref: '.length);
  const direct = refSha(gitDir, ref);
  if (direct !== null) return direct;
  // A linked worktree keeps refs in the main repository's git dir.
  const commonPath = join(gitDir, 'commondir');
  if (existsSync(commonPath)) {
    const common = readFileSync(commonPath, 'utf8').trim();
    return refSha(isAbsolute(common) ? common : join(gitDir, common), ref);
  }
  return null;
}

/**
 * @returns {{ok: true} | {ok: false, message: string}} — ok when dist/ is
 * provably current, when there is no checkout to compare against (an installed
 * copy), or when HEAD cannot be established (unknown is not stale). Not ok when
 * the stamp is missing or names a different commit than HEAD.
 */
export function checkDistStamp(packageRoot) {
  const head = resolveHead(packageRoot);
  if (head === null) return { ok: true };

  const stampPath = join(packageRoot, 'dist', 'build-stamp.json');
  let stamp = null;
  if (existsSync(stampPath)) {
    try {
      stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
    } catch {
      stamp = null; // an unreadable stamp is treated as no stamp
    }
  }

  if (stamp !== null && stamp.commit === head) return { ok: true };

  const builtFrom =
    stamp === null
      ? 'unknown — dist/ has no build stamp, so it predates stamping'
      : `${stamp.commit} (built ${stamp.builtAt})`;
  return {
    ok: false,
    message: `warrant-mcp: dist/ is stale and will not be run.

  dist/ was built from : ${builtFrom}
  this checkout is at  : ${head}

  dist/ wins over src/ when it exists, so running it now would silently execute
  old code. Rebuild it, or remove it and run from source:

    npm run build        # rebuild and restamp dist/ from the current source
    rm -rf dist/         # or remove it — a checkout runs src/ directly

`,
  };
}
