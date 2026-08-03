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
import { CACHE_PATH, readPolicyCache } from '../compiler/cache.ts';
import { handleCheckAction } from './handler.ts';
import { renderOutcome, toolResultText } from './present.ts';
import type { EvaluationContext } from '../engine/types.ts';

const log = (text: string) => process.stderr.write(`${text}\n`);

const cached = (() => {
  try {
    return readPolicyCache();
  } catch (cause) {
    log(`warrant-mcp: REFUSING TO START — ${(cause as Error).message}`);
    process.exit(1);
  }
})();
if (cached === null) {
  log(`warrant-mcp: REFUSING TO START — no compiled policy at ${CACHE_PATH}.`);
  log('The server never compiles. Run "npm run policy:fresh" once (needs ANTHROPIC_API_KEY),');
  log('review the compiled clauses, and start again.');
  process.exit(1);
}
const policy = cached.compiled;

const ctx: EvaluationContext = {
  workspaceRoot: process.env.WARRANT_MCP_WORKSPACE ?? process.cwd(),
  caseInsensitivePaths: process.platform === 'win32',
};

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

const server = new Server(
  { name: 'warrant-mcp', version: '0.0.0' },
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
  return { content: [{ type: 'text', text: toolResultText(outcome) }] };
});

await server.connect(new StdioServerTransport());
log(`warrant-mcp: serving ${policy.clauses.length} clauses (compiled ${cached.compiledAt} by ${cached.model})`);
log(`warrant-mcp: workspace ${ctx.workspaceRoot}`);
