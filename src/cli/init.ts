/**
 * `warrant-mcp init` — make a project ready to enforce.
 *
 * Creates `.warrant/` in the current directory with a starter policy and its
 * compiled cache, then prints the two pieces of configuration that wire it up.
 * It copies; it never compiles. A fresh install can therefore enforce
 * immediately, with no API key, exactly like a fresh clone of the repo.
 *
 * Nothing here is written outside the current directory, and nothing already
 * present is overwritten unless --force is passed.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { readPolicyCache } from '../compiler/cache.ts';
import {
  PACKAGE_ROOT,
  PROJECT_DIR_NAME,
  TEMPLATE_POLICY_COMPILED,
  TEMPLATE_POLICY_SOURCE,
  projectDir,
  projectPolicyCompiled,
  projectPolicySource,
} from '../config/paths.ts';

const out = (text = '') => process.stdout.write(`${text}\n`);
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';
const colour = process.stdout.isTTY ?? false;
const paint = (code: string, text: string) => (colour ? `${code}${text}${OFF}` : text);

const fwd = (path: string): string => path.replace(/\\/g, '/');

const cwd = resolve(process.cwd());
const force = process.argv.includes('--force');

const dir = projectDir(cwd);
const policySource = projectPolicySource(cwd);
const policyCompiled = projectPolicyCompiled(cwd);
const launcher = fwd(resolve(PACKAGE_ROOT, 'bin', 'warrant-mcp.mjs'));

if (!existsSync(TEMPLATE_POLICY_SOURCE) || !existsSync(TEMPLATE_POLICY_COMPILED)) {
  out(`warrant-mcp: the starter policy is missing from the installed package (${PACKAGE_ROOT}).`);
  out('This copy is incomplete — reinstall it.');
  process.exit(1);
}

const existing = [policySource, policyCompiled].filter((path) => existsSync(path));
if (existing.length > 0 && !force) {
  out(`${PROJECT_DIR_NAME}/ already exists in ${cwd}:`);
  for (const path of existing) out(`  ${relative(cwd, path)}`);
  out('');
  out('Nothing was changed. Re-run with --force to overwrite, or edit the policy and run');
  out('  warrant-mcp review');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
copyFileSync(TEMPLATE_POLICY_SOURCE, policySource);
copyFileSync(TEMPLATE_POLICY_COMPILED, policyCompiled);

// Validate what was just written, rather than trusting the copy.
const cached = readPolicyCache(policyCompiled);
if (!cached) {
  out('warrant-mcp: the copied policy did not validate. Nothing is enforcing. Reinstall.');
  process.exit(1);
}

out();
out(paint(GREEN + BOLD, `  Created ${PROJECT_DIR_NAME}/ in ${cwd}`));
out();
out(`    ${relative(cwd, policySource)}            the policy, in your words — edit this`);
out(`    ${relative(cwd, policyCompiled)}   the compiled clauses — what is actually enforced`);
out();
out(`  ${cached.compiled.clauses.length} clauses, ${cached.compiled.rules.length} rules, compiled ${cached.compiledAt}.`);
out(`  ${paint(DIM, 'This is a starter policy. Read it before you rely on it.')}`);
out();
out(paint(BOLD, '  1 — Check what it will refuse, without enforcing anything:'));
out();
out('       warrant-mcp test "delete .env"');
out('       warrant-mcp test "shell rm -rf build"');
out('       warrant-mcp test "http GET https://example.com"');
out();
out(paint(BOLD, '  2 — Expose it to an agent as an MCP tool — .mcp.json:'));
out();
out(
  JSON.stringify(
    {
      mcpServers: {
        warrant: {
          command: 'node',
          args: [launcher, 'serve'],
          env: { WARRANT_MCP_POLICY: fwd(policyCompiled) },
        },
      },
    },
    null,
    2,
  )
    .split('\n')
    .map((line) => `       ${line}`)
    .join('\n'),
);
out();
out(paint(BOLD, '  3 — Make a refusal a hard block — .claude/settings.json:'));
out();
out(
  JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|WebFetch|mcp__.*',
            hooks: [
              {
                type: 'command',
                command: `WARRANT_MCP_POLICY='${fwd(policyCompiled)}' node '${launcher}' hook`,
                timeout: 60,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  )
    .split('\n')
    .map((line) => `       ${line}`)
    .join('\n'),
);
out();
out(`  ${paint(DIM, 'Both configs name the policy by absolute path, so a client may spawn')}`);
out(`  ${paint(DIM, 'warrant-mcp from any directory and still find yours.')}`);
out();
out(paint(BOLD, '  Then: edit the policy, and run  warrant-mcp review'));
out(`  ${paint(DIM, 'Review is the one command that calls the model. Enforcement never compiles.')}`);
out();
