import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UnsafeMerge,
  addMcpServer,
  addPreToolUseHook,
  removeMcpServer,
  removePreToolUseHook,
  serialize,
} from './settings.ts';
import type { HookEntry } from './settings.ts';

const ENTRY: HookEntry = {
  matcher: 'Bash|Write',
  hooks: [{ type: 'command', command: "WARRANT_MCP_POLICY='/v/p.json' node '/pkg/bin.mjs' hook", timeout: 60 }],
};

const OTHER_HOOK = {
  matcher: 'Bash',
  hooks: [{ type: 'command', command: 'echo somebody-elses-hook' }],
};

test('a settings file with unrelated keys keeps every one of them', () => {
  const before = {
    permissions: { allow: ['Bash(npm test)'] },
    model: 'claude-opus-5',
    hooks: { PreToolUse: [OTHER_HOOK], PostToolUse: [{ matcher: 'Write', hooks: [] }] },
  };
  const { settings, alreadyPresent } = addPreToolUseHook(before, ENTRY);
  assert.equal(alreadyPresent, false);
  assert.deepEqual(settings.permissions, before.permissions);
  assert.equal(settings.model, 'claude-opus-5');
  assert.deepEqual((settings.hooks as Record<string, unknown>).PostToolUse, before.hooks.PostToolUse);
  // Ours is appended after theirs, never in place of it.
  assert.deepEqual((settings.hooks as { PreToolUse: unknown[] }).PreToolUse, [OTHER_HOOK, ENTRY]);
});

test('init then remove restores the object exactly — the round trip is the promise', () => {
  const before = {
    permissions: { allow: ['Bash(npm test)'] },
    hooks: { PreToolUse: [OTHER_HOOK] },
  };
  const added = addPreToolUseHook(before, ENTRY).settings;
  const { settings: after, removed } = removePreToolUseHook(added, ENTRY);
  assert.equal(removed, true);
  assert.deepEqual(after, before);
});

test('remove leaves no empty containers when it created them', () => {
  const before = { model: 'claude-opus-5' };
  const added = addPreToolUseHook(before, ENTRY).settings;
  assert.ok('hooks' in added);
  const { settings: after } = removePreToolUseHook(added, ENTRY);
  assert.deepEqual(after, before, 'a file that had no hooks before must have none after');
});

test('remove touches nothing when warrant is not there', () => {
  const before = { hooks: { PreToolUse: [OTHER_HOOK] } };
  const { settings, removed } = removePreToolUseHook(before, ENTRY);
  assert.equal(removed, false);
  assert.deepEqual(settings, before);
});

test('running init twice is a no-op, not a duplicate', () => {
  const once = addPreToolUseHook({}, ENTRY);
  const twice = addPreToolUseHook(once.settings, ENTRY);
  assert.equal(twice.alreadyPresent, true);
  assert.deepEqual(twice.settings, once.settings);
});

test('a shape we cannot merge into is refused with a fix, not overwritten', () => {
  for (const bad of [
    { hooks: 'not-an-object' },
    { hooks: { PreToolUse: 'not-an-array' } },
    [1, 2, 3],
  ]) {
    assert.throws(
      () => addPreToolUseHook(bad, ENTRY),
      (error: unknown) => error instanceof UnsafeMerge && error.fix.length > 0,
    );
  }
});

test('an MCP config keeps other servers, and a name clash is refused rather than overwritten', () => {
  const server = { command: 'node', args: ['/pkg/bin.mjs', 'serve'] };
  const before = { mcpServers: { other: { command: 'python', args: ['x.py'] } } };
  const { settings } = addMcpServer(before, 'warrant', server);
  assert.deepEqual((settings.mcpServers as Record<string, unknown>).other, before.mcpServers.other);
  assert.deepEqual((settings.mcpServers as Record<string, unknown>).warrant, server);

  const clash = { mcpServers: { warrant: { command: 'something-else' } } };
  assert.throws(
    () => addMcpServer(clash, 'warrant', server),
    (error: unknown) => error instanceof UnsafeMerge && /will not overwrite/.test(error.fix),
  );

  const { settings: after, removed } = removeMcpServer(settings, 'warrant', server);
  assert.equal(removed, true);
  assert.deepEqual(after, before);
});

test('every file written is formatted one way, so a round trip is byte-stable', () => {
  const value = { a: 1, b: [2, 3] };
  assert.equal(serialize(value), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
  assert.equal(serialize(JSON.parse(serialize(value))), serialize(value));
});
