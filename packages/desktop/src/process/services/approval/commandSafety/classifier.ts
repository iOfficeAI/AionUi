/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { checkPathArgument } from './paths';
import type {
  CommandSafetyClassification,
  CommandSafetyContext,
  CommandSafetyDecision,
  CommandSafetyHazard,
} from './types';

const ALLOW_ONCE_COMMANDS = new Set([
  'ls',
  'pwd',
  'echo',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'rg',
  'find',
  'which',
  'where',
  'date',
  'whoami',
  'id',
  'uname',
]);

const MANUAL_COMMANDS = new Set(['env', 'printenv']);

const PATH_READ_COMMANDS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find']);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm',
  'del',
  'remove-item',
  'mv',
  'move',
  'cp',
  'copy',
  'mkdir',
  'new-item',
  'touch',
  'chmod',
  'chown',
  'sudo',
  'kill',
  'pkill',
  'killall',
]);

const GIT_MUTATING = new Set(['push', 'commit', 'checkout', 'merge', 'rebase', 'reset']);

const PACKAGE_MANAGERS = new Set([
  'npm',
  'yarn',
  'pnpm',
  'bun',
  'pip',
  'pip3',
  'cargo',
  'apt',
  'apt-get',
  'brew',
  'gem',
]);

const PACKAGE_INSTALL_FLAGS = new Set(['install', 'i', 'add', 'uninstall', 'remove', 'rm', 'update', 'upgrade']);

const SHELL_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'python', 'python3', 'node', 'perl', 'ruby']);

type ParsedSegment = {
  text: string;
  baseCommand: string | null;
  args: string[];
};

function normalizeBaseCommand(token: string): string {
  const base = token.split('/').pop() ?? token;
  return base.toLowerCase();
}

function tokenizeSegment(segment: string): ParsedSegment {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  const baseCommand = tokens.length > 0 ? normalizeBaseCommand(tokens[0]) : null;
  return { text: segment.trim(), baseCommand, args: tokens.slice(1) };
}

function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let parenDepth = 0;
  let braceDepth = 0;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      current += ch;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (ch === '{') braceDepth += 1;
    if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);

    if ((ch === ';' || ch === '&' || ch === '|') && parenDepth === 0 && braceDepth === 0) {
      if (ch === '|' && command[i + 1] === '|') {
        if (current.trim()) segments.push(current.trim());
        return segments.length > 0 || current.trim() ? [...segments, current.trim()].filter(Boolean) : [];
      }
      if (ch === '&' && command[i + 1] === '&') {
        if (current.trim()) segments.push(current.trim());
        return segments.length > 0 || current.trim() ? [...segments, current.trim()].filter(Boolean) : [];
      }
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (ch === '|' || ch === '&') {
        return segments;
      }
      continue;
    }

    current += ch;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

function detectStructuralHazards(command: string): CommandSafetyHazard[] {
  const hazards: CommandSafetyHazard[] = [];

  if (/>>?/.test(command)) {
    hazards.push({ kind: 'redirection_write', detail: 'Output redirection detected' });
  }

  if (/\$\([^)]*\)/.test(command) || /`[^`]+`/.test(command)) {
    hazards.push({ kind: 'command_substitution', detail: 'Command substitution detected' });
  }

  if (/\$\{[^}]+\}/.test(command)) {
    hazards.push({ kind: 'dynamic_path', detail: 'Parameter expansion detected' });
  }

  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ';') {
      hazards.push({ kind: 'chain', detail: 'Command chaining detected' });
      break;
    }
    if (ch === '&' && command[i + 1] === '&') {
      hazards.push({ kind: 'chain', detail: 'Command chaining detected' });
      break;
    }
    if (ch === '|' && command[i + 1] === '|') {
      hazards.push({ kind: 'chain', detail: 'Command chaining detected' });
      break;
    }
    if (ch === '|') {
      hazards.push({ kind: 'pipe', detail: 'Pipe detected' });
      break;
    }
  }

  const pipeToShell = /\|\s*(sh|bash|zsh|dash|fish)\b/i.test(command);
  const curlPipeShell =
    /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh|dash|fish)\b/i.test(command) ||
    /\b(curl|wget)\b[^|]*\|\s*(python|python3|node|perl|ruby)\b/i.test(command);
  if (pipeToShell || curlPipeShell) {
    hazards.push({ kind: 'pipe_to_shell', detail: 'Pipe to shell interpreter detected' });
  }

  return hazards;
}

function isPackageInstallCommand(baseCommand: string | null, args: string[]): boolean {
  if (!baseCommand || !PACKAGE_MANAGERS.has(baseCommand)) return false;
  return args.some((arg) => PACKAGE_INSTALL_FLAGS.has(arg.toLowerCase()));
}

function isGitMutatingCommand(baseCommand: string | null, args: string[]): boolean {
  if (baseCommand !== 'git') return false;
  return args.some((arg) => GIT_MUTATING.has(arg.toLowerCase()));
}

function isMutatingCurlWget(baseCommand: string | null, args: string[]): boolean {
  if (baseCommand !== 'curl' && baseCommand !== 'wget') return false;
  return args.some((arg) => {
    const lower = arg.toLowerCase();
    return lower === '-o' || lower === '--output' || lower.startsWith('-o') || lower.startsWith('--output');
  });
}

function isDestructiveCommand(baseCommand: string | null, args: string[]): boolean {
  if (!baseCommand) return false;
  if (DESTRUCTIVE_COMMANDS.has(baseCommand)) return true;
  if (isGitMutatingCommand(baseCommand, args)) return true;
  if (isPackageInstallCommand(baseCommand, args)) return true;
  if (isMutatingCurlWget(baseCommand, args)) return true;
  return false;
}

function isTimeCommand(baseCommand: string | null): boolean {
  return baseCommand === 'time';
}

function isManualCommand(baseCommand: string | null): boolean {
  if (!baseCommand) return false;
  if (MANUAL_COMMANDS.has(baseCommand)) return true;
  return isTimeCommand(baseCommand);
}

function findFindHazards(baseCommand: string | null, args: string[]): CommandSafetyHazard[] {
  if (baseCommand !== 'find') return [];
  const hazards: CommandSafetyHazard[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i].toLowerCase();
    if (arg === '-exec' || arg === '-execdir') {
      hazards.push({ kind: 'find_exec', detail: 'find -exec is not allowed' });
    }
    if (arg === '-delete') {
      hazards.push({ kind: 'find_delete', detail: 'find -delete is not allowed' });
    }
  }
  return hazards;
}

function collectPathHazards(workspaceRoot: string, args: string[]): CommandSafetyHazard[] {
  const hazards: CommandSafetyHazard[] = [];
  for (const arg of args) {
    const hazard = checkPathArgument(workspaceRoot, arg);
    if (hazard) hazards.push(hazard);
  }
  return hazards;
}

function classifySegment(
  segment: ParsedSegment,
  context: CommandSafetyContext
): { decision: CommandSafetyDecision; hazards: CommandSafetyHazard[]; reasons: string[] } {
  const hazards: CommandSafetyHazard[] = [];
  const reasons: string[] = [];
  const { baseCommand, args } = segment;

  hazards.push(...findFindHazards(baseCommand, args));

  if (baseCommand && PATH_READ_COMMANDS.has(baseCommand)) {
    hazards.push(...collectPathHazards(context.workspaceRoot, args));
  }

  if (isDestructiveCommand(baseCommand, args)) {
    hazards.push({
      kind: 'destructive_command',
      detail: `Destructive or mutating command: ${baseCommand ?? 'unknown'}`,
    });
  }

  if (hazards.some((h) => h.kind === 'find_exec' || h.kind === 'find_delete' || h.kind === 'destructive_command')) {
    return {
      decision: 'deny',
      hazards,
      reasons: hazards.map((h) => h.detail),
    };
  }

  if (
    hazards.some(
      (h) =>
        h.kind === 'secret_path' ||
        h.kind === 'external_path' ||
        h.kind === 'dynamic_path' ||
        h.kind === 'redirection_write' ||
        h.kind === 'command_substitution' ||
        h.kind === 'pipe_to_shell' ||
        h.kind === 'chain' ||
        h.kind === 'pipe'
    )
  ) {
    return {
      decision: 'deny',
      hazards,
      reasons: hazards.map((h) => h.detail),
    };
  }

  if (isManualCommand(baseCommand)) {
    return {
      decision: 'manual',
      hazards,
      reasons: [`Manual review required for ${baseCommand}`],
    };
  }

  if (baseCommand && ALLOW_ONCE_COMMANDS.has(baseCommand)) {
    if (PATH_READ_COMMANDS.has(baseCommand) && args.length === 0) {
      return {
        decision: 'manual',
        hazards,
        reasons: [`${baseCommand} requires workspace-contained path arguments`],
      };
    }
    if (PATH_READ_COMMANDS.has(baseCommand) && hazards.length > 0) {
      return {
        decision: 'deny',
        hazards,
        reasons: hazards.map((h) => h.detail),
      };
    }
    return {
      decision: 'allow_once',
      hazards,
      reasons: [`Safe read-only command: ${baseCommand}`],
    };
  }

  if (baseCommand && SHELL_INTERPRETERS.has(baseCommand)) {
    return {
      decision: 'deny',
      hazards: [...hazards, { kind: 'unknown_command', detail: `Shell interpreter invocation: ${baseCommand}` }],
      reasons: [`Shell interpreter invocation denied: ${baseCommand}`],
    };
  }

  return {
    decision: 'deny',
    hazards: [
      ...hazards,
      { kind: 'unknown_command', detail: `Unknown or unlisted command: ${baseCommand ?? 'empty'}` },
    ],
    reasons: [`Unknown command; default deny: ${baseCommand ?? 'empty'}`],
  };
}

function mergeDecision(current: CommandSafetyDecision, next: CommandSafetyDecision): CommandSafetyDecision {
  const rank: Record<CommandSafetyDecision, number> = { deny: 3, manual: 2, allow_once: 1 };
  return rank[next] > rank[current] ? next : current;
}

export function classifyShellCommand(command: string, context: CommandSafetyContext): CommandSafetyClassification {
  const trimmed = command.trim();
  const structuralHazards = detectStructuralHazards(trimmed);

  if (structuralHazards.length > 0) {
    const denyKinds = new Set([
      'chain',
      'pipe',
      'redirection_write',
      'command_substitution',
      'pipe_to_shell',
      'dynamic_path',
    ]);
    const hasDeny = structuralHazards.some((h) => denyKinds.has(h.kind));
    return {
      decision: hasDeny ? 'deny' : 'manual',
      command: trimmed,
      baseCommand: null,
      hazards: structuralHazards,
      reasons: structuralHazards.map((h) => h.detail),
    };
  }

  const segments = splitCommandSegments(trimmed);
  if (segments.length === 0) {
    return {
      decision: 'deny',
      command: trimmed,
      baseCommand: null,
      hazards: [{ kind: 'unknown_command', detail: 'Empty command' }],
      reasons: ['Empty command; default deny'],
    };
  }

  let decision: CommandSafetyDecision = 'allow_once';
  const allHazards: CommandSafetyHazard[] = [];
  const allReasons: string[] = [];
  let baseCommand: string | null = null;

  for (const segmentText of segments) {
    const segment = tokenizeSegment(segmentText);
    if (!baseCommand) baseCommand = segment.baseCommand;
    const result = classifySegment(segment, context);
    decision = mergeDecision(decision, result.decision);
    allHazards.push(...result.hazards);
    allReasons.push(...result.reasons);
  }

  return {
    decision,
    command: trimmed,
    baseCommand,
    hazards: allHazards,
    reasons: allReasons,
  };
}

export function extractCommandFromPermissionPatterns(patterns: string[]): string | null {
  if (patterns.length === 0) return null;
  return patterns.join(' ').trim() || null;
}

export function classifyPermissionCommand(
  patterns: string[],
  context: CommandSafetyContext
): CommandSafetyClassification | null {
  const command = extractCommandFromPermissionPatterns(patterns);
  if (!command) return null;
  return classifyShellCommand(command, context);
}
