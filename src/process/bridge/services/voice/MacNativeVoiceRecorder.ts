import { app } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HELPER_NAME = 'voice-input-recorder';
const HELPER_RELATIVE_PATH = path.join('native', HELPER_NAME);
const HELPER_SOURCE_RELATIVE_PATH = path.join('resources', 'native', 'voice-input', 'VoiceInputRecorder.swift');
const READY_TIMEOUT_MS = 5_000;
const RESULT_TIMEOUT_MS = 15_000;

type NativeRecorderMessage =
  | { event: 'ready' }
  | { event: 'result'; pcmBase64: string; durationMs: number; bytes: number }
  | { event: 'error'; message: string }
  | { event: 'cancelled' };

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
};

export type NativeRecorderResult = {
  bytes: number;
  durationMs: number;
  pcmBase64: string;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  void promise.catch(() => {});

  return { promise, reject, resolve };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const getHelperExecutablePath = (): string => path.join(process.resourcesPath, HELPER_RELATIVE_PATH);

const getHelperSourcePath = (): string => path.join(app.getAppPath(), HELPER_SOURCE_RELATIVE_PATH);

export const parseNativeRecorderMessage = (line: string): NativeRecorderMessage | null => {
  try {
    const value = JSON.parse(line) as Partial<NativeRecorderMessage> & {
      bytes?: unknown;
      durationMs?: unknown;
      event?: unknown;
      message?: unknown;
      pcmBase64?: unknown;
    };

    if (value.event === 'ready') {
      return { event: 'ready' };
    }

    if (
      value.event === 'result' &&
      typeof value.pcmBase64 === 'string' &&
      typeof value.durationMs === 'number' &&
      typeof value.bytes === 'number'
    ) {
      return {
        event: 'result',
        pcmBase64: value.pcmBase64,
        durationMs: value.durationMs,
        bytes: value.bytes,
      };
    }

    if (value.event === 'error' && typeof value.message === 'string') {
      return {
        event: 'error',
        message: value.message,
      };
    }

    if (value.event === 'cancelled') {
      return { event: 'cancelled' };
    }

    return null;
  } catch {
    return null;
  }
};

export class MacNativeVoiceRecorder {
  private static helperPathPromise: Promise<string> | null = null;

  private child: ChildProcessWithoutNullStreams | null = null;
  private readyDeferred: Deferred<void> | null = null;
  private resultDeferred: Deferred<NativeRecorderResult> | null = null;
  private stderrBuffer = '';
  private stdoutBuffer = '';

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    const helperPath = await MacNativeVoiceRecorder.ensureHelperExecutable();
    const child = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;
    this.stderrBuffer = '';
    this.stdoutBuffer = '';
    this.readyDeferred = createDeferred<void>();
    this.resultDeferred = createDeferred<NativeRecorderResult>();

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.stdoutBuffer += chunk;
      const lines = this.stdoutBuffer.split('\n');
      this.stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const message = parseNativeRecorderMessage(line.trim());
        if (message) {
          this.handleMessage(message);
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderrBuffer += chunk;
    });

    child.on('error', (error) => {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
      this.cleanup();
    });

    child.on('exit', (code, signal) => {
      if (this.stdoutBuffer.trim()) {
        const trailingMessage = parseNativeRecorderMessage(this.stdoutBuffer.trim());
        if (trailingMessage) {
          this.handleMessage(trailingMessage);
        }
      }

      const details = this.stderrBuffer.trim();
      const suffix = details.length ? ` ${details}` : '';
      const exitError = new Error(
        signal
          ? `Native recorder exited with signal ${signal}.${suffix}`.trim()
          : `Native recorder exited with code ${code ?? -1}.${suffix}`.trim()
      );

      if (code !== 0 && code !== null) {
        this.rejectAll(exitError);
      }

      this.cleanup();
    });

    if (!this.readyDeferred) {
      throw new Error('Native recorder failed to initialize internal state.');
    }

    await withTimeout(this.readyDeferred.promise, READY_TIMEOUT_MS, 'Native recorder did not become ready.');
  }

  async stop(): Promise<NativeRecorderResult> {
    if (!this.child || !this.resultDeferred) {
      throw new Error('Native recorder is not running.');
    }

    this.child.stdin.write('stop\n');
    return withTimeout(this.resultDeferred.promise, RESULT_TIMEOUT_MS, 'Native recorder did not return a result.');
  }

  async cancel(): Promise<void> {
    if (!this.child) {
      return;
    }

    try {
      this.child.stdin.write('cancel\n');
      this.child.stdin.end();
    } catch {
      this.child.kill('SIGTERM');
    }
  }

  private handleMessage(message: NativeRecorderMessage): void {
    switch (message.event) {
      case 'ready':
        this.readyDeferred?.resolve();
        this.readyDeferred = null;
        return;
      case 'result':
        this.resultDeferred?.resolve({
          bytes: message.bytes,
          durationMs: message.durationMs,
          pcmBase64: message.pcmBase64,
        });
        this.resultDeferred = null;
        return;
      case 'error': {
        const error = new Error(message.message);
        this.rejectAll(error);
        return;
      }
      case 'cancelled':
        this.rejectAll(new Error('Native recorder was cancelled.'));
        return;
    }
  }

  private rejectAll(error: Error): void {
    this.readyDeferred?.reject(error);
    this.readyDeferred = null;
    this.resultDeferred?.reject(error);
    this.resultDeferred = null;
  }

  private cleanup(): void {
    this.child = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
  }

  private static async ensureHelperExecutable(): Promise<string> {
    if (!MacNativeVoiceRecorder.helperPathPromise) {
      MacNativeVoiceRecorder.helperPathPromise = MacNativeVoiceRecorder.resolveHelperExecutable().catch((error) => {
        MacNativeVoiceRecorder.helperPathPromise = null;
        throw error;
      });
    }

    return MacNativeVoiceRecorder.helperPathPromise;
  }

  private static async resolveHelperExecutable(): Promise<string> {
    const helperPath = getHelperExecutablePath();

    if (app.isPackaged) {
      await fs.access(helperPath);
      return helperPath;
    }

    const sourcePath = getHelperSourcePath();
    const needsBuild = await MacNativeVoiceRecorder.shouldRebuildHelper(sourcePath, helperPath);

    if (needsBuild) {
      await fs.mkdir(path.dirname(helperPath), { recursive: true });
      await execFileAsync('xcrun', ['swiftc', '-parse-as-library', '-O', '-o', helperPath, sourcePath]);
      await fs.chmod(helperPath, 0o755);
    }

    return helperPath;
  }

  private static async shouldRebuildHelper(sourcePath: string, helperPath: string): Promise<boolean> {
    try {
      const [sourceStat, helperStat] = await Promise.all([fs.stat(sourcePath), fs.stat(helperPath)]);
      return sourceStat.mtimeMs > helperStat.mtimeMs;
    } catch {
      return true;
    }
  }
}
