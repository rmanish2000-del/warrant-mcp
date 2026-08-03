/**
 * Compile cache — one file at the repo root, committed. Cached replay is the
 * default: the server and every CLI read this file and never call the API.
 * Only `npm run policy:fresh` (an explicit human command) may write it.
 * The server never compiles — a missing or invalid cache is a loud startup
 * refusal, not a trigger for a live compile.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CompiledPolicy } from '../engine/types.ts';
import { parseCompiledPolicy } from './schema.ts';

/** Resolved from this file's location, not the process cwd — MCP clients spawn servers from arbitrary directories. */
export const CACHE_PATH = fileURLToPath(new URL('../../policy-compiled.json', import.meta.url));

export interface CachedPolicy {
  /** The plain-English policy text that was compiled. */
  readonly policyText: string;
  /** The validated compiled policy. */
  readonly compiled: CompiledPolicy;
  /** The model that served the compile. */
  readonly model: string;
  readonly promptVersion: string;
  /** ISO timestamp stamped by the CLI at write time — the cache's only clock read. */
  readonly compiledAt: string;
}

export function writePolicyCache(cache: CachedPolicy, path: string = CACHE_PATH): void {
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

/**
 * Read and re-validate the cache. Validation runs on every load, not only at
 * compile time — a hand-edited cache that no longer passes the schema is
 * refused the same way a bad compile is (fail closed).
 */
export function readPolicyCache(path: string = CACHE_PATH): CachedPolicy | null {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CachedPolicy;
  if (typeof parsed?.policyText !== 'string' || typeof parsed?.compiledAt !== 'string' || !parsed?.compiled) {
    throw new Error(`${path} exists but is not a policy cache — delete it and run "npm run policy:fresh"`);
  }
  const revalidated = parseCompiledPolicy(JSON.stringify(parsed.compiled));
  return { ...parsed, compiled: { clauses: revalidated.clauses, rules: revalidated.rules } };
}
