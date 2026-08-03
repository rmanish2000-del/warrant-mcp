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
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The installed package's own root — resolved from this file, never from the cwd. */
export const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The starter policy an installed instance copies on `init`. Ships in the tarball. */
export const TEMPLATE_POLICY_SOURCE = join(PACKAGE_ROOT, 'templates', 'policy.md');
export const TEMPLATE_POLICY_COMPILED = join(PACKAGE_ROOT, 'templates', 'policy-compiled.json');

/** The per-project directory. Everything a user owns lives here, next to their code. */
export const PROJECT_DIR_NAME = '.warrant';

export const projectDir = (cwd: string): string => join(resolve(cwd), PROJECT_DIR_NAME);
export const projectPolicySource = (cwd: string): string => join(projectDir(cwd), 'policy.md');
export const projectPolicyCompiled = (cwd: string): string => join(projectDir(cwd), 'policy-compiled.json');
/** The reviewed-but-not-accepted draft. The server and the hook never read it. */
export const projectPolicyPending = (cwd: string): string => join(projectDir(cwd), 'policy-compiled.pending.json');

export type PolicySource = 'env' | 'project' | 'package';

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
  const project = projectPolicyCompiled(cwd);
  if (existsSync(project)) return { path: project, source: 'project' };
  const bundled = join(PACKAGE_ROOT, 'policy-compiled.json');
  if (existsSync(bundled)) return { path: bundled, source: 'package' };
  return null;
}

/** The sentence a refusing process prints when nothing resolved. One place, one wording. */
export function noPolicyMessage(cwd: string): string {
  return [
    `no compiled policy found for ${resolve(cwd)}.`,
    `Looked at: $WARRANT_MCP_POLICY, then ${projectPolicyCompiled(cwd)}.`,
    'Run "warrant-mcp init" to create one. Nothing compiles at enforcement time,',
    'so a missing policy is a refusal rather than a pass.',
  ].join('\n');
}
