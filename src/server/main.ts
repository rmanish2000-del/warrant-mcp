/**
 * The warrant-mcp server: stdio MCP transport exposing one tool, check_action.
 *
 * System boundary — the only file that reads the environment, loads the
 * cache, or owns a transport. Startup loads the cached, human-reviewed
 * compile and refuses loudly if it is missing or invalid; the server never
 * compiles (the API client is not even imported here). stdout carries the
 * MCP protocol; every human-facing line goes to stderr.
 */
import process from 'node:process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readPolicyCache } from '../compiler/cache.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT, noPolicyMessage, resolvePolicy, resolveRecordDir } from '../config/paths.ts';
import { observeDecision } from '../record/observe.ts';
import { handleCheckAction } from './handler.ts';
import { renderOutcome, toolResultText } from './present.ts';
import type { EvaluationContext } from '../engine/types.ts';

const log = (text: string) => process.stderr.write(`${text}\n`);

const located = resolvePolicy(process.cwd(), process.env);
if (located === null) {
  log('warrant-mcp: REFUSING TO START —');
  for (const line of noPolicyMessage(process.cwd()).split('\n')) log(`  ${line}`);
  process.exit(1);
}
const cached = (() => {
  try {
    return readPolicyCache(located.path);
  } catch (cause) {
    log(`warrant-mcp: REFUSING TO START — ${(cause as Error).message}`);
    process.exit(1);
  }
})();
if (cached === null) {
  log(`warrant-mcp: REFUSING TO START — no compiled policy at ${located.path}.`);
  log('The server never compiles. Author one with "warrant-mcp init", then');
  log('"warrant-mcp review" — and start again once it is accepted.');
  process.exit(1);
}
const policy = cached.compiled;

const ctx: EvaluationContext = {
  workspaceRoot: process.env.WARRANT_MCP_WORKSPACE ?? process.cwd(),
  caseInsensitivePaths: process.platform === 'win32',
};

/** Beside the policy — outside the workspace whenever the policy is vaulted. */
const recordDir = resolveRecordDir(located, process.env);

const CHECK_ACTION_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['file_delete', 'shell_command', 'http_request'],
      description: 'The kind of action the agent intends to take.',
    },
    path: { type: 'string', description: 'file_delete — the path to delete (absolute, or relative to the workspace).' },
    command: { type: 'string', description: 'shell_command — the full command string.' },
    url: { type: 'string', description: 'http_request — the full URL.' },
    method: { type: 'string', description: 'http_request — the HTTP method (GET, POST, …).' },
  },
  required: ['kind'],
} as const;

// The version a client sees is the package's own, read once at startup rather
// than hardcoded — a server that misreports its version is a small lie that
// costs a debugging session.
const { version } = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };

const server = new Server(
  { name: 'warrant-mcp', version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'check_action',
      description:
        'Check an intended action against the confirmed policy before performing it. ' +
        'Returns ALLOW or DENY; a DENY cites the governing clause. This tool only ' +
        'checks — it never performs the action, and neither may you when it denies.',
      inputSchema: CHECK_ACTION_INPUT_SCHEMA,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  if (request.params.name !== 'check_action') {
    return {
      content: [{ type: 'text', text: `unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }
  const outcome = handleCheckAction(policy, ctx, request.params.arguments ?? {});
  log(renderOutcome(outcome, process.stderr.isTTY ?? false));
  // The advisory path is recorded too, marked as such: a report that showed
  // only hook decisions would understate what the agent asked about.
  observeDecision({
    recordDir,
    policy,
    source: 'tool',
    tool: 'check_action',
    action: request.params.arguments ?? {},
    verdict: outcome.verdict,
    at: new Date(),
  });
  return { content: [{ type: 'text', text: toolResultText(outcome) }] };
});

await server.connect(new StdioServerTransport());
log(`warrant-mcp: serving ${policy.clauses.length} clauses (compiled ${cached.compiledAt} by ${cached.model})`);
log(`warrant-mcp: policy ${located.path} [${located.source}]`);
log(`warrant-mcp: workspace ${ctx.workspaceRoot}`);
