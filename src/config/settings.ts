/**
 * Merging warrant into a config file somebody else owns.
 *
 * Pure functions over parsed JSON — no I/O, so the merge is testable and the
 * only thing that touches disk is the CLI. The rule these enforce: **every key
 * the user already had survives**, in place, and warrant only ever appends its
 * own entry. A settings file is somebody's working environment; a tool that
 * clobbers it has not earned the right to be installed.
 */

export interface HookCommand {
  readonly type: 'command';
  readonly command: string;
  readonly timeout: number;
}

export interface HookEntry {
  readonly matcher: string;
  readonly hooks: readonly HookCommand[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep structural equality over JSON — enough to recognise our own entry again. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface MergeResult {
  readonly settings: Json;
  /** True when the identical entry was already there — init is then a no-op, not a duplicate. */
  readonly alreadyPresent: boolean;
}

/** The shape of the file we cannot safely merge into, and why. */
export class UnsafeMerge extends Error {
  readonly fix: string;
  constructor(message: string, fix: string) {
    super(message);
    this.name = 'UnsafeMerge';
    this.fix = fix;
  }
}

/**
 * Add a PreToolUse hook, preserving everything else. Existing hooks — including
 * other PreToolUse entries — are kept and ours is appended after them.
 */
export function addPreToolUseHook(existing: unknown, entry: HookEntry): MergeResult {
  const settings: Json = existing === undefined ? {} : structuredClone(existing) as Json;
  if (!isObject(settings)) {
    throw new UnsafeMerge(
      'the settings file is not a JSON object',
      'open it, make the top level an object like { "hooks": { … } }, then run init again',
    );
  }

  const hooksValue = settings.hooks ?? {};
  if (!isObject(hooksValue)) {
    throw new UnsafeMerge(
      '"hooks" exists but is not an object',
      'make "hooks" an object like { "PreToolUse": [ … ] }, then run init again',
    );
  }
  const hooks: Json = { ...hooksValue };

  const preValue = hooks.PreToolUse ?? [];
  if (!Array.isArray(preValue)) {
    throw new UnsafeMerge(
      '"hooks.PreToolUse" exists but is not an array',
      'make "hooks.PreToolUse" an array of hook entries, then run init again',
    );
  }

  if (preValue.some((candidate) => sameJson(candidate, entry))) {
    return { settings, alreadyPresent: true };
  }

  hooks.PreToolUse = [...preValue, entry];
  settings.hooks = hooks;
  return { settings, alreadyPresent: false };
}

export interface RemoveResult {
  readonly settings: Json;
  readonly removed: boolean;
}

/**
 * Take our entry back out and leave no trace: empty containers we would have
 * created are dropped, so a file that had no `hooks` before has none after.
 */
export function removePreToolUseHook(existing: unknown, entry: HookEntry): RemoveResult {
  if (!isObject(existing)) return { settings: {}, removed: false };
  const settings = structuredClone(existing) as Json;

  const hooksValue = settings.hooks;
  if (!isObject(hooksValue)) return { settings, removed: false };
  const hooks: Json = { ...hooksValue };

  const preValue = hooks.PreToolUse;
  if (!Array.isArray(preValue)) return { settings, removed: false };

  const kept = preValue.filter((candidate) => !sameJson(candidate, entry));
  if (kept.length === preValue.length) return { settings, removed: false };

  if (kept.length > 0) hooks.PreToolUse = kept;
  else delete hooks.PreToolUse;

  if (Object.keys(hooks).length > 0) settings.hooks = hooks;
  else delete settings.hooks;

  return { settings, removed: true };
}

/** Same discipline for `.mcp.json`: append one server, touch nothing else. */
export function addMcpServer(existing: unknown, name: string, server: Json): MergeResult {
  const config: Json = existing === undefined ? {} : structuredClone(existing) as Json;
  if (!isObject(config)) {
    throw new UnsafeMerge(
      'the MCP config is not a JSON object',
      'open it, make the top level an object like { "mcpServers": { … } }, then run init again',
    );
  }
  const serversValue = config.mcpServers ?? {};
  if (!isObject(serversValue)) {
    throw new UnsafeMerge(
      '"mcpServers" exists but is not an object',
      'make "mcpServers" an object keyed by server name, then run init again',
    );
  }
  if (sameJson(serversValue[name], server)) return { settings: config, alreadyPresent: true };
  if (serversValue[name] !== undefined) {
    throw new UnsafeMerge(
      `an MCP server called "${name}" is already configured with different settings`,
      `rename or remove that server in the config, then run init again — warrant will not overwrite it`,
    );
  }
  config.mcpServers = { ...serversValue, [name]: server };
  return { settings: config, alreadyPresent: false };
}

export function removeMcpServer(existing: unknown, name: string, server: Json): RemoveResult {
  if (!isObject(existing)) return { settings: {}, removed: false };
  const config = structuredClone(existing) as Json;
  const serversValue = config.mcpServers;
  if (!isObject(serversValue)) return { settings: config, removed: false };
  if (!sameJson(serversValue[name], server)) return { settings: config, removed: false };

  const servers: Json = { ...serversValue };
  delete servers[name];
  if (Object.keys(servers).length > 0) config.mcpServers = servers;
  else delete config.mcpServers;
  return { settings: config, removed: true };
}

/** How every file this tool writes is formatted. One place, so remove can round-trip. */
export const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
