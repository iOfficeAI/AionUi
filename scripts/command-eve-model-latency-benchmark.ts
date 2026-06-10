#!/usr/bin/env tsx
/**
 * Command EVE local model latency benchmark.
 *
 * Measures the real latency of local model providers before we decide whether
 * Ollama, the Command EVE OpenAI shim, MLX, or a separate L1 quick lane should
 * own a runtime path. The script writes a JSON receipt so "fast enough" stays
 * evidence-backed.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

type Provider = 'ollama' | 'openai';

type Target = {
  id: string;
  provider: Provider;
  baseUrl: string;
  model: string;
  context: number;
};

type Result = Target & {
  ok: boolean;
  sample: number;
  promptChars: number;
  outputChars: number;
  firstTokenMs?: number;
  totalMs?: number;
  error?: string;
};

type Args = {
  samples: number;
  timeoutMs: number;
  maxTokens: number;
  prompt: string;
  output: string;
  targets: Target[];
};

const DEFAULT_MODEL = 'command-eve-gemma4-e4b-64k:latest';
const DEFAULT_CONTEXT = 65_536;
const DEFAULT_PROMPT = 'Antworte nur mit einem kurzen Satz: Command EVE ist bereit.';

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index >= 0) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return inline?.slice(flag.length + 1);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumber(name: string, fallback: number): number {
  const value = Number(readArg(name));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseTargets(): Target[] {
  const provider = readArg('provider') as Provider | undefined;
  const model = readArg('model') || DEFAULT_MODEL;
  const context = parseNumber('context', DEFAULT_CONTEXT);
  const baseUrl = readArg('base-url');

  if (provider || baseUrl || readArg('model')) {
    const selectedProvider = provider || 'openai';
    return [
      {
        id: readArg('id') || `${selectedProvider}:${model}`,
        provider: selectedProvider,
        baseUrl: normalizeBaseUrl(
          baseUrl || (selectedProvider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:25811/v1')
        ),
        model,
        context,
      },
    ];
  }

  const targets: Target[] = [
    {
      id: 'ollama-native-e4b-64k',
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model,
      context,
    },
    {
      id: 'command-eve-openai-shim-e4b-64k',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:25811/v1',
      model,
      context,
    },
  ];

  const mlxBaseUrl = process.env.COMMAND_EVE_MLX_BASE_URL;
  const mlxModel = process.env.COMMAND_EVE_MLX_MODEL;
  if (mlxBaseUrl && mlxModel) {
    targets.push({
      id: 'mlx-openai-compatible',
      provider: 'openai',
      baseUrl: normalizeBaseUrl(mlxBaseUrl),
      model: mlxModel,
      context,
    });
  }

  return targets;
}

function parseArgs(): Args {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(`Usage:
  npm run command-eve:bench:models -- [options]

Options:
  --provider ollama|openai     Provider to test. Defaults to built-in target matrix.
  --base-url URL               Provider base URL. OpenAI URLs should include /v1.
  --model MODEL                Model name. Default: ${DEFAULT_MODEL}
  --context N                  Context length. Default: ${DEFAULT_CONTEXT}
  --samples N                  Samples per target. Default: 1
  --timeout-ms N               Request timeout. Default: 120000
  --max-tokens N               Max generated tokens. Default: 64
  --prompt TEXT                Prompt to send.
  --output PATH                JSON receipt path.

MLX:
  Set COMMAND_EVE_MLX_BASE_URL and COMMAND_EVE_MLX_MODEL to include an
  OpenAI-compatible MLX server in the default target matrix.
`);
    process.exit(0);
  }

  return {
    samples: parseNumber('samples', 1),
    timeoutMs: parseNumber('timeout-ms', 120_000),
    maxTokens: parseNumber('max-tokens', 64),
    prompt: readArg('prompt') || DEFAULT_PROMPT,
    output:
      readArg('output') ||
      path.join(process.cwd(), 'scripts', 'benchmark-results', 'command-eve-model-latency-latest.json'),
    targets: parseTargets(),
  };
}

function textFromOpenAiChunk(line: string): string {
  if (!line.startsWith('data:')) return '';
  const raw = line.slice('data:'.length).trim();
  if (!raw || raw === '[DONE]') return '';
  const parsed = JSON.parse(raw) as {
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
  };
  return parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
}

function textFromOllamaLine(line: string): string {
  const parsed = JSON.parse(line) as { message?: { content?: string }; response?: string };
  return parsed.message?.content || parsed.response || '';
}

async function streamText(
  response: Response,
  parser: (line: string) => string,
  onToken: (text: string) => void
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const text = parser(trimmed);
      if (text) {
        output += text;
        onToken(text);
      }
    }
  }

  return output;
}

async function benchmarkTarget(target: Target, sample: number, args: Args): Promise<Result> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  const startedAt = performance.now();
  let firstTokenMs: number | undefined;
  let output = '';

  try {
    const messages = [{ role: 'user', content: args.prompt }];
    const endpoint = target.provider === 'ollama' ? `${target.baseUrl}/api/chat` : `${target.baseUrl}/chat/completions`;
    const body =
      target.provider === 'ollama'
        ? {
            model: target.model,
            messages,
            stream: true,
            think: false,
            options: { num_ctx: target.context, num_predict: args.maxTokens },
          }
        : {
            model: target.model,
            messages,
            stream: true,
            max_tokens: args.maxTokens,
          };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }

    output = await streamText(response, target.provider === 'ollama' ? textFromOllamaLine : textFromOpenAiChunk, () => {
      firstTokenMs ??= performance.now() - startedAt;
    });

    return {
      ...target,
      ok: true,
      sample,
      promptChars: args.prompt.length,
      outputChars: output.length,
      firstTokenMs,
      totalMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      sample,
      promptChars: args.prompt.length,
      outputChars: output.length,
      firstTokenMs,
      totalMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(results: Result[]): void {
  const rows = results.map((result) => ({
    target: result.id,
    sample: result.sample,
    ok: result.ok,
    firstTokenMs: result.firstTokenMs ? Math.round(result.firstTokenMs) : undefined,
    totalMs: result.totalMs ? Math.round(result.totalMs) : undefined,
    outputChars: result.outputChars,
    error: result.error ? result.error.slice(0, 120) : '',
  }));
  console.table(rows);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const results: Result[] = [];
  for (const target of args.targets) {
    for (let sample = 1; sample <= args.samples; sample += 1) {
      console.log(`[bench] ${target.id} sample ${sample}/${args.samples}`);
      results.push(await benchmarkTarget(target, sample, args));
    }
  }

  const receipt = {
    version: 'command-eve-model-latency-benchmark/v0',
    created_at: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      total_memory_gb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    },
    args: {
      samples: args.samples,
      timeout_ms: args.timeoutMs,
      max_tokens: args.maxTokens,
      prompt_chars: args.prompt.length,
    },
    results,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(receipt, null, 2)}\n`);
  summarize(results);
  console.log(`[bench] receipt: ${args.output}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
