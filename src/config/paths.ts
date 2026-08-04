/**
 * Where an installed warrant-mcp looks for things.
 *
 * The rule, plainly, in precedence order:
 *
 *   1. `WARRANT_MCP_POLICY`            — an explicit absolute path. This is what
 *                                        `warrant-mcp init` writes into the MCP and
 *                                        hook configs, so a client that spawns the
 *                                        server from an arbitrary directory still
 *                                        finds the right policy.
 *   2. `<cwd>/.warrant/policy-compiled.json`
 *                                      — the project-local convention. `init`
 *                                        creates it; the authoring commands read
 *                                        and write it.
 *   3. `<package>/policy-compiled.json`
 *                                      — present only in a source checkout. It is
 *                                        deliberately NOT shipped in the npm
 *                                        tarball, so an installed copy can never
 *                                        silently enforce the sample policy. The
 *                                        sample ships under `templates/` instead,
 *                                        and only `init` copies it.
 *
 * If none resolve, the caller refuses. A missing policy is a loud refusal, never
 * a pass — the same rule the engine has had since M1.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The installed package's own root — resolved from this file, never from the cwd. */
export const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The starter policy an installed instance copies on `init`. Ships in the tarball. */
export const TEMPLATE_POLICY_SOURCE = join(PACKAGE_ROOT, 'templates', 'policy.md');
export const TEMPLATE_POLICY_COMPILED = join(PACKAGE_ROOT, 'templates', 'policy-compiled.json');

/** The policy-authoring skill `init` offers to copy — opt-in only. Ships in the tarball. */
export const TEMPLATE_SKILL_DIR = join(PACKAGE_ROOT, 'skills', 'warrant-policy-author');
export const projectSkillsRoot = (cwd: string): string => join(resolve(cwd), '.claude', 'skills');
export const projectSkillDir = (cwd: string): string => join(projectSkillsRoot(cwd), 'warrant-policy-author');

/** The per-project directory. Everything a user owns lives here, next to their code. */
export const PROJECT_DIR_NAME = '.warrant';

export const projectDir = (cwd: string): string => join(resolve(cwd), PROJECT_DIR_NAME);
export const projectPolicySource = (cwd: string): string => join(projectDir(cwd), 'policy.md');
export const projectPolicyCompiled = (cwd: string): string => join(projectDir(cwd), 'policy-compiled.json');
/** The reviewed-but-not-accepted draft. The server and the hook never read it. */
export const projectPolicyPending = (cwd: string): string => join(projectDir(cwd), 'policy-compiled.pending.json');

/** A project's pointer file. Says where its compiled policy actually lives. */
export const projectConfig = (cwd: string): string => join(projectDir(cwd), 'config.json');

/**
 * The vault — where the compiled policy lives, OUTSIDE the project the agent
 * works in. M4 attack 8 deleted a compiled policy that sat inside the
 * workspace; M5 moved it out, and the reason it works is that the policy's own
 * "stay inside the project" clause then governs the vault path. Putting it back
 * inside the project would undo that, so `init` never does.
 *
 * One directory per project, under the user's home, named after the project so
 * a human can find it, hashed so two projects with the same basename cannot
 * collide.
 */
export const vaultRoot = (home: string): string => join(home, '.warrant', 'projects');

export function vaultFor(projectPath: string, home: string): string {
  const full = resolve(projectPath);
  const digest = createHash('sha256').update(full.toLowerCase()).digest('hex').slice(0, 10);
  const label = basename(full).replace(/[^A-Za-z0-9._-]/g, '-') || 'project';
  return join(vaultRoot(home), `${label}-${digest}`);
}

export const vaultPolicy = (vault: string): string => join(vault, 'policy-compiled.json');
export const vaultManifest = (vault: string): string => join(vault, 'warrant-install.json');

export type PolicySource = 'env' | 'vault' | 'project' | 'package';

export interface PolicyLocation {
  readonly path: string;
  readonly source: PolicySource;
}

/**
 * Resolve the compiled policy an enforcing process should use. Pure apart from
 * `existsSync`; both the clock and the environment arrive as parameters so this
 * stays testable.
 */
export function resolvePolicy(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): PolicyLocation | null {
  const explicit = env.WARRANT_MCP_POLICY;
  if (explicit !== undefined && explicit.trim().length > 0) {
    return { path: isAbsolute(explicit) ? explicit : resolve(cwd, explicit), source: 'env' };
  }
  // A project initialised by `warrant-mcp init` carries a pointer to its vault.
  const pointer = projectConfig(cwd);
  if (existsSync(pointer)) {
    try {
      const parsed = JSON.parse(readFileSync(pointer, 'utf8')) as { policy?: unknown };
      if (typeof parsed.policy === 'string' && parsed.policy.trim().length > 0) {
        const target = isAbsolute(parsed.policy) ? parsed.policy : resolve(cwd, parsed.policy);
        if (existsSync(target)) return { path: target, source: 'vault' };
      }
    } catch {
      // A corrupt pointer is not a licence to guess. Fall through, and the
      // caller refuses with the message below.
    }
  }

  const project = projectPolicyCompiled(cwd);
  if (existsSync(project)) return { path: project, source: 'project' };
  const bundled = join(PACKAGE_ROOT, 'policy-compiled.json');
  if (existsSync(bundled)) return { path: bundled, source: 'package' };
  return null;
}

/**
 * Where the authorization record lives: beside the compiled policy that
 * produced it.
 *
 * That placement is the whole point. When the policy is vaulted (the layout
 * `init` creates), the record is outside the workspace too, so the same clause
 * that stops an agent deleting its policy stops it editing its own audit trail.
 * A project-local policy keeps its record project-local — the user chose a
 * simpler layout and gets the weaker guarantee that comes with it.
 *
 * Two locations are refused rather than guessed:
 * - a source checkout's bundled policy (`source: 'package'`), because writing a
 *   record into the installed package directory would be writing to somebody
 *   else's files;
 * - no policy at all, because there are no decisions to record.
 */
export const RECORD_DIR_NAME = 'record';

export const recordDirFor = (policyPath: string): string => join(dirname(policyPath), RECORD_DIR_NAME);

export function resolveRecordDir(
  policy: PolicyLocation | null,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const explicit = env.WARRANT_MCP_RECORD;
  if (explicit !== undefined && explicit.trim().length > 0) return resolve(explicit);
  if (policy === null || policy.source === 'package') return null;
  return recordDirFor(policy.path);
}

/** The sentence a refusing process prints when nothing resolved. One place, one wording. */
export function noPolicyMessage(cwd: string): string {
  return [
    `no compiled policy found for ${resolve(cwd)}.`,
    'Looked at, in order:',
    '  $WARRANT_MCP_POLICY',
    `  ${projectConfig(cwd)}  (the pointer "warrant-mcp init" writes)`,
    `  ${projectPolicyCompiled(cwd)}`,
    '',
    'Fix: run "warrant-mcp init" in this directory. It needs no API key and takes',
    'a second. Nothing compiles at enforcement time, so a missing policy is a',
    'refusal rather than a pass.',
  ].join('\n');
}
