/**
 * Rules in plain English, for the human reviewing a compile.
 *
 * Display only, and structurally so: this module is never imported by the
 * engine, the handler, or the hook. It reads compiled rules and produces
 * sentences; nothing here can influence a verdict. The wording is written by
 * hand, not by the model — the review screen must describe what the
 * evaluator will actually do, and only code can promise that.
 */
import type { Rule } from '../engine/types.ts';

const list = (values: readonly string[]): string => {
  if (values.length === 0) return '';
  if (values.length === 1) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
};

const quoted = (values: readonly string[]): string => list(values.map((value) => `"${value}"`));

/** One sentence saying exactly what this rule refuses. */
export function describeRule(rule: Rule): string {
  switch (rule.type) {
    case 'file_delete_outside_workspace':
      return 'Refuses creating, overwriting or deleting anything outside the project directory.';
    case 'file_delete_protected': {
      const parts: string[] = [];
      if (rule.segments.length > 0) parts.push(`anything inside a directory named ${quoted(rule.segments)}`);
      if (rule.basenames.length > 0) parts.push(`any file named ${quoted(rule.basenames)}`);
      if ((rule.suffixes ?? []).length > 0) parts.push(`any file whose name ends in ${quoted(rule.suffixes ?? [])}`);
      return `Refuses creating, overwriting or deleting ${list(parts)}.`;
    }
    case 'file_write_scope':
      return `Refuses creating, overwriting or deleting anything outside ${quoted(rule.allowedRoots)} (relative to the project directory).`;
    case 'shell_forbidden_token':
      return `Refuses any shell command containing the word ${quoted(rule.tokens)}.`;
    case 'shell_forbidden_sequence':
      return `Refuses any shell command containing ${list(rule.sequences.map((sequence) => `"${sequence.join(' ')}"`))} — the words must be next to each other.`;
    case 'shell_forbidden_invocation': {
      const subject = rule.subcommands.length > 0 ? `"${rule.command} ${list(rule.subcommands)}"` : `"${rule.command}"`;
      const conditions: string[] = [];
      if (rule.anyFlag.length > 0) conditions.push(`${quoted(rule.anyFlag)} appears anywhere in the command`);
      if (rule.anyArgument.length > 0) conditions.push(`${quoted(rule.anyArgument)} appears as an argument`);
      return conditions.length === 0
        ? `Refuses ${subject} in any form.`
        : `Refuses ${subject} when ${list(conditions)} — in any argument order.`;
    }
    case 'http_host_allowlist':
      return `Refuses any HTTP request to a host other than ${quoted(rule.hosts)}.`;
    case 'http_method_allowlist':
      return `Refuses any HTTP request whose method is not ${quoted(rule.methods.map((method) => method.toUpperCase()))}.`;
  }
}
