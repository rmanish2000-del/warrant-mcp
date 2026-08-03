/**
 * Turns what a human types on the command line into a structured action.
 *
 *   policy:test "delete .env"
 *   policy:test "shell rm -rf build"
 *   policy:test "http GET https://example.com"
 *   policy:test '{"kind":"file_delete","path":".env"}'
 *
 * Pure parsing, and deliberately literal: it never guesses a kind from
 * content. An input it does not recognise returns an error string, and the
 * caller surfaces it — the dry-run must never silently test something other
 * than what was typed.
 */
export interface PhraseError {
  readonly error: string;
}

const USAGE = [
  'delete <path>            e.g. delete .env',
  'write <path>             (same check as delete — an overwrite destroys what was there)',
  'shell <command…>         e.g. shell git push origin main --force',
  'http <METHOD> <url>      e.g. http GET https://example.com',
  '<json>                   e.g. {"kind":"http_request","url":"https://x","method":"GET"}',
].join('\n    ');

export function parsePhrase(input: string): unknown | PhraseError {
  const text = input.trim();
  if (text.length === 0) return { error: `nothing to test.\n  Usage:\n    ${USAGE}` };

  if (text.startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch (cause) {
      return { error: `that looks like JSON but does not parse: ${(cause as Error).message}` };
    }
  }

  const [head, ...rest] = text.split(/\s+/);
  const verb = head?.toLowerCase();
  const remainder = rest.join(' ');

  if (verb === 'delete' || verb === 'write' || verb === 'overwrite') {
    if (remainder.length === 0) return { error: `"${verb}" needs a path, e.g. ${verb} .env` };
    return { kind: 'file_delete', path: remainder };
  }
  if (verb === 'shell' || verb === 'run' || verb === 'bash') {
    if (remainder.length === 0) return { error: `"${verb}" needs a command, e.g. ${verb} rm -rf build` };
    return { kind: 'shell_command', command: remainder };
  }
  if (verb === 'http' || verb === 'fetch') {
    const [method, url] = rest;
    if (method === undefined || url === undefined) {
      return { error: `"${verb}" needs a method and a URL, e.g. ${verb} GET https://example.com` };
    }
    return { kind: 'http_request', url, method };
  }
  return {
    error: `don't know how to test "${head}".\n  Usage:\n    ${USAGE}`,
  };
}

export const isPhraseError = (value: unknown): value is PhraseError =>
  typeof value === 'object' && value !== null && typeof (value as PhraseError).error === 'string';
