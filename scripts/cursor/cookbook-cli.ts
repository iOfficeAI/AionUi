#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type ParsedArgs = {
  prompt: string;
  model?: string;
  cwd?: string;
  extraArgs: string[];
  showHelp: boolean;
};

function printHelp(): void {
  // Keep this wrapper tiny: it only normalizes common options and forwards to cursor-agent.
  console.log(`AionUi built-in Cursor Cookbook CLI wrapper

Usage:
  bun run cursor:cookbook -- --prompt "fix failing tests"
  bun run cursor:cookbook -- "refactor src/process/services/FooService.ts"

Options:
  --prompt, -p <text>    Task prompt for cursor-agent
  --model, -m <model>    Model name passed to cursor-agent
  --cwd <path>           Working directory for cursor-agent (default: current dir)
  --help, -h             Show help

Pass-through:
  Any additional flags are forwarded to cursor-agent unchanged.
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  let prompt = '';
  let model: string | undefined;
  let cwd: string | undefined;
  let showHelp = false;
  const extraArgs: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      showHelp = true;
      continue;
    }

    if (token === '--prompt' || token === '-p') {
      prompt = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (token === '--model' || token === '-m') {
      model = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--cwd') {
      cwd = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      extraArgs.push(token);
      continue;
    }

    if (!prompt) {
      prompt = token;
    } else {
      extraArgs.push(token);
    }
  }

  return { prompt, model, cwd, extraArgs, showHelp };
}

function ensureCursorAgentInstalled(): void {
  const result = spawnSync('cursor-agent', ['--version'], { stdio: 'ignore' });
  if (!result || result.status !== 0) {
    console.error('cursor-agent is not installed or not in PATH.');
    console.error('Install guide: https://docs.cursor.com/en/cli/github-actions');
    process.exit(1);
  }
}

function ensureApiKey(): void {
  if (process.env.CURSOR_API_KEY) return;
  console.error('CURSOR_API_KEY is required.');
  console.error('Create one at: https://cursor.com/settings/integrations');
  process.exit(1);
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.showHelp) {
    printHelp();
    return;
  }

  if (!parsed.prompt) {
    console.error('Missing prompt. Use --prompt "..." or provide a positional prompt.');
    printHelp();
    process.exit(1);
  }

  ensureCursorAgentInstalled();
  ensureApiKey();

  const args = ['-p', parsed.prompt];
  if (parsed.model) {
    args.push('--model', parsed.model);
  }
  args.push(...parsed.extraArgs);

  const child = spawn('cursor-agent', args, {
    stdio: 'inherit',
    cwd: parsed.cwd ? resolve(parsed.cwd) : process.cwd(),
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main();
