import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

export const REPORT_PATH = 'C:\\AI_LAB\\apps\\AionUi-WSL-ACP-Smoke-Report.md';

export type SmokeTarget = {
  id: 'claude-wsl' | 'codex-wsl';
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  notes: string[];
};

type SmokeOptions = {
  timeoutMs: number;
  prompt: boolean;
  targets?: string[];
  reportPath: string;
};

type StepResult = {
  name: string;
  ok: boolean;
  detail: string;
  elapsedMs?: number;
};

type TargetResult = {
  id: string;
  label: string;
  commandLine: string;
  ok: boolean;
  steps: StepResult[];
  stderr: string;
};

const JSONRPC_VERSION = '2.0';

export function buildCodexBridgeEnv(basePath = process.env.PATH || process.env.Path || ''): Record<string, string> {
  return {
    PATH: `C:\\AI_LAB\\bin;${basePath}`,
    Path: `C:\\AI_LAB\\bin;${basePath}`,
  };
}

export function buildClaudeBridgeEnv(basePath = process.env.PATH || process.env.Path || ''): Record<string, string> {
  return {
    PATH: `C:\\AI_LAB\\bin;${basePath}`,
    Path: `C:\\AI_LAB\\bin;${basePath}`,
    CLAUDE_CODE_EXECUTABLE: 'C:\\AI_LAB\\bin\\claude-wsl.exe',
  };
}

export function buildSmokeTargets(): SmokeTarget[] {
  return [
    {
      id: 'claude-wsl',
      label: 'Claude Code WSL via claude-agent-acp bridge',
      command: 'npx',
      args: ['@agentclientprotocol/claude-agent-acp@0.29.2'],
      env: buildClaudeBridgeEnv(),
      notes: [
        'Exercises the Windows claude-agent-acp bridge while CLAUDE_CODE_EXECUTABLE points to C:\\AI_LAB\\bin\\claude-wsl.exe.',
        'This is additive: it does not change the existing Claude Code backend or PATH ordering.',
      ],
    },
    {
      id: 'codex-wsl',
      label: 'Codex WSL via codex-acp bridge',
      command: 'npx',
      args: ['@zed-industries/codex-acp@0.9.5'],
      env: buildCodexBridgeEnv(),
      notes: [
        'Exercises the Windows codex-acp bridge while PATH resolves codex to C:\\AI_LAB\\bin\\codex.cmd first.',
        'This is additive: it does not change AionUi default PATH ordering or the existing Codex backend.',
      ],
    },
  ];
}

function redact(text: string): string {
  return text
    .replace(/(api[_-]?key|token|secret|password|authorization)(["'\s:=]+)([^\s"']+)/gi, '$1$2[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .slice(-4000);
}

function commandLine(target: SmokeTarget): string {
  return [target.command, ...target.args].join(' ');
}

function writeMessage(child: ChildProcess, message: Record<string, unknown>): void {
  child.stdin?.write(`${JSON.stringify(message)}\n`);
}

function extractTextFromUpdate(msg: Record<string, unknown>): string {
  const params = msg.params as Record<string, unknown> | undefined;
  const update = params?.update as Record<string, unknown> | undefined;
  const content = update?.content as Record<string, unknown> | undefined;
  if (typeof content?.text === 'string') return content.text;
  const nestedContent = content?.content as Record<string, unknown> | undefined;
  if (typeof nestedContent?.text === 'string') return nestedContent.text;
  const delta = content?.delta as Record<string, unknown> | undefined;
  if (typeof delta?.text === 'string') return delta.text;
  if (typeof update?.text === 'string') return update.text;
  return '';
}

function waitForPromptOutcome(
  child: ChildProcess,
  responseId: number,
  marker: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let accumulatedText = '';
    const timer = setTimeout(() => {
      child.stdout?.removeListener('data', onData);
      reject(
        new Error(
          `timed out after ${timeoutMs}ms waiting for prompt response or marker; accumulated=${JSON.stringify(accumulatedText.slice(-200))}`
        )
      );
    }, timeoutMs);

    const finish = (detail: string) => {
      clearTimeout(timer);
      child.stdout?.removeListener('data', onData);
      resolve(detail);
    };

    const onData = (data: Buffer) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (msg.id === responseId) {
            if (msg.error) reject(new Error(`prompt returned error: ${JSON.stringify(msg.error)}`));
            else finish('prompt returned JSON-RPC response');
            return;
          }
          accumulatedText += extractTextFromUpdate(msg);
          const serialized = JSON.stringify(msg);
          if (accumulatedText.includes(marker) || serialized.includes(marker)) {
            finish('marker observed in session/update stream; bridge did not need to return final JSON-RPC response');
            return;
          }
        } catch {
          if (line.includes(marker)) {
            finish('marker observed in non-JSON output stream');
            return;
          }
        }
      }
    };

    child.stdout?.on('data', onData);
  });
}

function waitForResponse(
  child: ChildProcess,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      child.stdout?.removeListener('data', onData);
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (predicate(msg)) {
            clearTimeout(timer);
            child.stdout?.removeListener('data', onData);
            resolve(msg);
            return;
          }
        } catch {
          // Ignore non-JSON banner/log lines from wrappers or CLIs.
        }
      }
    };

    child.stdout?.on('data', onData);
  });
}

async function runStep(name: string, fn: () => Promise<string>): Promise<StepResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, elapsedMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - start,
    };
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  try {
    child.stdin?.end();
  } catch {
    // ignore
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve();
    }, 2500);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function smokeTarget(target: SmokeTarget, options: SmokeOptions): Promise<TargetResult> {
  let stderr = '';
  const child = spawn(target.command, target.args, {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: 'C:\\AI_LAB\\apps\\AionUi',
    env: { ...process.env, ...(target.env || {}) },
    windowsHide: true,
  });

  child.stderr?.on('data', (data) => {
    stderr += data.toString('utf8');
  });

  const steps: StepResult[] = [];

  steps.push(
    await runStep('process-start', async () => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`process exited before initialize, code=${code}`));
        });
      });
      return 'process stayed alive long enough to send initialize';
    })
  );

  if (steps.at(-1)?.ok) {
    steps.push(
      await runStep('initialize', async () => {
        writeMessage(child, {
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'initialize',
          params: { protocolVersion: 1, clientCapabilities: {} },
        });
        const response = await waitForResponse(child, (msg) => msg.id === 1, options.timeoutMs);
        if (!response.result) throw new Error(`initialize response had no result: ${JSON.stringify(response)}`);
        return 'ACP initialize returned result';
      })
    );
  }

  let sessionId: string | undefined;
  if (options.prompt && steps.at(-1)?.ok) {
    steps.push(
      await runStep('session-new', async () => {
        writeMessage(child, {
          jsonrpc: JSONRPC_VERSION,
          id: 2,
          method: 'session/new',
          params: { cwd: 'C:\\AI_LAB\\apps\\AionUi', mcpServers: [] },
        });
        const response = await waitForResponse(child, (msg) => msg.id === 2, options.timeoutMs);
        const result = response.result as Record<string, unknown> | undefined;
        if (typeof result?.sessionId !== 'string')
          throw new Error(`session/new had no sessionId: ${JSON.stringify(response)}`);
        sessionId = result.sessionId;
        return `created session ${sessionId}`;
      })
    );
  }

  if (options.prompt && sessionId && steps.at(-1)?.ok) {
    steps.push(
      await runStep('marker-prompt', async () => {
        const marker = target.id === 'claude-wsl' ? 'AIONUI_WSL_CLAUDE_OK' : 'AIONUI_WSL_CODEX_OK';
        writeMessage(child, {
          jsonrpc: JSONRPC_VERSION,
          id: 3,
          method: 'session/prompt',
          params: {
            sessionId,
            prompt: [{ type: 'text', text: `Reply with exactly ${marker} and nothing else.` }],
          },
        });
        return await waitForPromptOutcome(child, 3, marker, options.timeoutMs * 3);
      })
    );
  }

  await stopChild(child);

  return {
    id: target.id,
    label: target.label,
    commandLine: commandLine(target),
    ok: steps.length > 0 && steps.every((step) => step.ok),
    steps,
    stderr: redact(stderr),
  };
}

function parseArgs(argv: string[]): SmokeOptions {
  let timeoutMs = 60000;
  let prompt = false;
  let targets: string[] | undefined;
  let reportPath = REPORT_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--prompt') prompt = true;
    else if (arg === '--timeout-ms') timeoutMs = Number(argv[++index] || timeoutMs);
    else if (arg === '--target')
      targets = (argv[++index] || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    else if (arg === '--report') reportPath = argv[++index] || reportPath;
  }

  return { timeoutMs, prompt, targets, reportPath };
}

function renderReport(results: TargetResult[], options: SmokeOptions): string {
  const now = new Date().toISOString();
  const lines: string[] = [];
  lines.push('# AionUi WSL ACP Smoke Report');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push(`Mode: ${options.prompt ? 'initialize + session + marker prompt' : 'handshake-only'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Target | Result | Command |');
  lines.push('|---|---:|---|');
  for (const result of results) {
    lines.push(`| ${result.label} | ${result.ok ? 'OK' : 'FAIL'} | \`${result.commandLine}\` |`);
  }
  lines.push('');
  for (const result of results) {
    lines.push(`## ${result.label}`);
    lines.push('');
    lines.push(`Overall: **${result.ok ? 'OK' : 'FAIL'}**`);
    lines.push('');
    lines.push('| Step | Result | Detail | ms |');
    lines.push('|---|---:|---|---:|');
    for (const step of result.steps) {
      lines.push(
        `| ${step.name} | ${step.ok ? 'OK' : 'FAIL'} | ${step.detail.replace(/\|/g, '\\|')} | ${step.elapsedMs ?? ''} |`
      );
    }
    if (result.stderr.trim()) {
      lines.push('');
      lines.push('<details><summary>Redacted stderr tail</summary>');
      lines.push('');
      lines.push('```text');
      lines.push(result.stderr.trim());
      lines.push('```');
      lines.push('');
      lines.push('</details>');
    }
    lines.push('');
  }
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- This harness is additive and does not change AionUi default Claude/Codex backends.');
  lines.push('- `handshake-only` proves process launch + ACP initialize only. It does not prove full chat stability.');
  lines.push(
    '- `--prompt` additionally creates a session and sends a marker prompt; use it when model/API cost and auth side effects are acceptable.'
  );
  lines.push(
    '- Only consider switching defaults after initialize, marker prompt, second-message/resume, abort/cancel, and Windows-native regression checks pass.'
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);
  const selected = buildSmokeTargets().filter((target) => !options.targets || options.targets.includes(target.id));
  if (selected.length === 0) {
    console.error(
      `No targets selected. Available: ${buildSmokeTargets()
        .map((target) => target.id)
        .join(', ')}`
    );
    return 2;
  }

  const results: TargetResult[] = [];
  for (const target of selected) {
    console.log(`== ${target.label} ==`);
    const result = await smokeTarget(target, options);
    results.push(result);
    console.log(`${result.ok ? 'OK' : 'FAIL'} ${target.id}`);
    for (const step of result.steps) {
      console.log(`  ${step.ok ? 'OK' : 'FAIL'} ${step.name}: ${step.detail}`);
    }
  }

  const report = renderReport(results, options);
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, report, 'utf8');
  console.log(`Report: ${options.reportPath}`);

  return results.every((result) => result.ok) ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
