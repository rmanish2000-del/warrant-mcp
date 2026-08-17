/**
 * A deliberately stale dist/ must make bin/ FAIL LOUD, naming both commits —
 * never silently run old code, never silently fall through to src/.
 *
 * This pins the 2026-08-14 defect: a 10-day-old dist/ shadowed src/ through a
 * full green gate, because bin/ prefers dist/ when it exists and nothing asked
 * whether it was current. The gate was green precisely because tests run src/
 * directly — only the launcher takes the dist/ arm, so only a launcher-level
 * test can see the trap. These tests build a miniature installed-or-checkout
 * package in a temp dir and run the real launcher against it as a child
 * process.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const BIN = fileURLToPath(new URL('../../bin/warrant-mcp.mjs', import.meta.url));
const STAMP_MODULE = fileURLToPath(new URL('../../bin/dist-stamp.mjs', import.meta.url));

const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);

interface Fixture {
  readonly root: string;
  readonly launcher: string;
}

/**
 * A miniature package: the real launcher, a dist/ that exists (so the dist/
 * arm is taken), and optionally a .git pointing HEAD at NEW_SHA.
 */
function fixture(options: {
  git: boolean;
  stampCommit: string | null; // null = write no stamp at all
}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'warrant-dist-stamp-'));
  mkdirSync(join(root, 'bin'));
  copyFileSync(BIN, join(root, 'bin', 'warrant-mcp.mjs'));
  copyFileSync(STAMP_MODULE, join(root, 'bin', 'dist-stamp.mjs'));
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'warrant-mcp', version: '0.0.0-fixture' })}\n`,
  );
  mkdirSync(join(root, 'dist', 'server'), { recursive: true });
  writeFileSync(join(root, 'dist', 'server', 'main.js'), 'process.exit(0);\n');
  if (options.stampCommit !== null) {
    writeFileSync(
      join(root, 'dist', 'build-stamp.json'),
      `${JSON.stringify({ commit: options.stampCommit, builtAt: '2026-08-04T03:02:39.000Z' })}\n`,
    );
  }
  if (options.git) {
    mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), `${NEW_SHA}\n`);
  }
  return { root, launcher: join(root, 'bin', 'warrant-mcp.mjs') };
}

function run(f: Fixture): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [f.launcher, '--version'], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('a stale dist/ in a checkout fails loud, naming both commits', () => {
  const f = fixture({ git: true, stampCommit: OLD_SHA });
  const { status, stderr } = run(f);
  assert.equal(status, 1);
  assert.match(stderr, /dist\/ is stale/);
  assert.ok(stderr.includes(OLD_SHA), 'names the commit dist/ was built from');
  assert.ok(stderr.includes(NEW_SHA), 'names the commit the checkout is at');
  assert.match(stderr, /npm run build/);
});

test('a dist/ with no stamp at all, in a checkout, also fails loud', () => {
  const f = fixture({ git: true, stampCommit: null });
  const { status, stderr } = run(f);
  assert.equal(status, 1);
  assert.match(stderr, /no build stamp/);
  assert.ok(stderr.includes(NEW_SHA));
});

test('a current dist/ runs', () => {
  const f = fixture({ git: true, stampCommit: NEW_SHA });
  const { status, stdout, stderr } = run(f);
  assert.equal(status, 0, `expected success, stderr was:\n${stderr}`);
  assert.equal(stdout.trim(), '0.0.0-fixture');
});

test('an installed copy (no .git) never fails the staleness check', () => {
  // A stranger's install has a stamp but nothing to compare it against; the
  // check must skip, not guess.
  const f = fixture({ git: false, stampCommit: OLD_SHA });
  const { status, stdout } = run(f);
  assert.equal(status, 0);
  assert.equal(stdout.trim(), '0.0.0-fixture');
});
