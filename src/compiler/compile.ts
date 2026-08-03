/**
 * Live policy compile against the Anthropic API. Called from exactly one
 * place: the `policy:fresh` CLI. The MCP server never imports this module —
 * enforcement runs on the cached, human-reviewed compile only.
 *
 * Failure semantics: fail loud, never stub. warrant needed a labelled
 * fallback because a recording had to survive an API outage; an enforcement
 * policy must not — a made-up policy enforcing nothing in particular is worse
 * than no policy. API unavailable, model refusal, schema violation, or
 * unmapped sentences all end the compile with an error and leave the
 * existing cache untouched.
 */
import Anthropic from '@anthropic-ai/sdk';
import { COMPILER_PROMPT_VERSION, COMPILER_SYSTEM_PROMPT } from './prompt.ts';
import { parseCompiledPolicy, POLICY_JSON_SCHEMA } from './schema.ts';
import type { ModelCompiledPolicy } from './schema.ts';

export const COMPILER_MODEL = 'claude-opus-5';

export interface CompileSuccess {
  readonly compiled: ModelCompiledPolicy;
  /** The model that actually served the response. */
  readonly model: string;
  /** The exact JSON text the model produced. */
  readonly raw: string;
  readonly promptVersion: string;
}

export interface CompileOptions {
  /** Injectable for tests; defaults to a client resolving ANTHROPIC_API_KEY from the environment. */
  readonly client?: Anthropic;
  /** Summarized reasoning, streamed while the model works. */
  readonly onThinking?: (chunk: string) => void;
  /** The structured output's own text as it streams. */
  readonly onText?: (chunk: string) => void;
}

export async function compilePolicy(
  policyText: string,
  options: CompileOptions = {},
): Promise<CompileSuccess> {
  const client = options.client ?? new Anthropic();

  const stream = client.messages.stream({
    model: COMPILER_MODEL,
    max_tokens: 16_000,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: POLICY_JSON_SCHEMA },
    },
    system: COMPILER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: policyText }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') options.onThinking?.(event.delta.thinking);
      else if (event.delta.type === 'text_delta') options.onText?.(event.delta.text);
    }
  }

  const finalMessage = await stream.finalMessage();
  if (finalMessage.stop_reason === 'refusal') {
    throw new Error('model declined the compile request — nothing was cached');
  }
  const raw = finalMessage.content
    .filter((block): block is { type: 'text'; text: string } & typeof block => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (raw.length === 0) {
    throw new Error(`model returned no structured output (stop_reason: ${finalMessage.stop_reason})`);
  }

  // Fail closed from here: schema violations and unmapped sentences propagate
  // as CompilerRejection; the CLI shows them and caches nothing.
  const compiled = parseCompiledPolicy(raw);
  return { compiled, model: finalMessage.model, raw, promptVersion: COMPILER_PROMPT_VERSION };
}
