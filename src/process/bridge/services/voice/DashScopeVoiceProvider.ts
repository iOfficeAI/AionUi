import type { VoiceInputConfig } from '@/common/types/voiceInput';
import WebSocket from 'ws';
import { getDashScopeWebSocketUrl } from './voiceInputConfig';

type RunTaskCommand = {
  header: {
    action: 'run-task';
    task_id: string;
    streaming: 'duplex';
  };
  payload: {
    task_group: 'audio';
    task: 'asr';
    function: 'recognition';
    model: string;
    parameters: {
      format: 'pcm';
      sample_rate: 16000;
      vocabulary_id?: string;
      language_hints?: string[];
    };
    input: Record<string, never>;
  };
};

type FinishTaskCommand = {
  header: {
    action: 'finish-task';
    task_id: string;
    streaming: 'duplex';
  };
  payload: {
    input: Record<string, never>;
  };
};

type ServerEnvelope = {
  header?: {
    event?: string;
    error_code?: string;
    error_message?: string;
  };
  payload?: {
    output?: {
      sentence?: {
        text?: string;
        sentence_end?: boolean;
        heartbeat?: boolean;
      };
    };
  };
};

const CHUNK_SIZE = 3_200;
const TASK_TIMEOUT_MS = 15_000;

export class DashScopeVoiceProvider {
  constructor(private readonly config: VoiceInputConfig['providers']['dashscope']) {}

  async transcribe(pcmBuffer: Buffer): Promise<string> {
    if (this.config.apiKey.trim().length === 0) {
      throw new Error('DashScope API key is required');
    }

    if (pcmBuffer.length === 0) {
      return '';
    }

    const taskId = crypto.randomUUID().toLowerCase();
    const command = this.createRunTaskCommand(taskId);

    return new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(getDashScopeWebSocketUrl(this.config.region), {
        headers: {
          Authorization: `bearer ${this.config.apiKey}`,
        },
      });

      let timeoutId: NodeJS.Timeout | null = null;
      let taskStarted = false;
      let settled = false;
      let partialText = '';
      const finalSegments: string[] = [];

      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        try {
          ws.close();
        } catch {
          // ignore close failures
        }
        callback();
      };

      const refreshTimeout = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
          finish(() => reject(new Error('DashScope ASR request timed out')));
        }, TASK_TIMEOUT_MS);
      };

      ws.on('open', () => {
        refreshTimeout();
        ws.send(JSON.stringify(command));
      });

      ws.on('message', (payload) => {
        refreshTimeout();

        const message = typeof payload === 'string' ? payload : payload.toString('utf8');
        let envelope: ServerEnvelope;

        try {
          envelope = JSON.parse(message) as ServerEnvelope;
        } catch {
          return;
        }

        const event = envelope.header?.event;
        if (event === 'task-started') {
          taskStarted = true;

          for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK_SIZE) {
            ws.send(pcmBuffer.subarray(offset, Math.min(offset + CHUNK_SIZE, pcmBuffer.length)));
          }

          const finishCommand: FinishTaskCommand = {
            header: {
              action: 'finish-task',
              task_id: taskId,
              streaming: 'duplex',
            },
            payload: {
              input: {},
            },
          };
          ws.send(JSON.stringify(finishCommand));
          return;
        }

        if (event === 'result-generated') {
          const sentence = envelope.payload?.output?.sentence;
          if (!sentence || sentence.heartbeat === true || !sentence.text) {
            return;
          }

          if (sentence.sentence_end === true) {
            finalSegments.push(sentence.text);
          } else {
            partialText = sentence.text;
          }
          return;
        }

        if (event === 'task-finished') {
          const transcript = finalSegments.join('').trim() || partialText.trim();
          finish(() => resolve(transcript));
          return;
        }

        if (event === 'task-failed') {
          const errorCode = envelope.header?.error_code;
          const errorMessage = envelope.header?.error_message || 'DashScope ASR failed';
          finish(() => reject(new Error(errorCode ? `${errorCode}: ${errorMessage}` : errorMessage)));
        }
      });

      ws.on('error', (error) => {
        finish(() => reject(error));
      });

      ws.on('close', (code, reason) => {
        if (settled) {
          return;
        }

        const reasonText = reason.toString('utf8').trim();
        if (!taskStarted) {
          finish(() => reject(new Error(reasonText || `DashScope connection closed (${code}) before task started`)));
          return;
        }

        const transcript = finalSegments.join('').trim() || partialText.trim();
        if (transcript.length > 0) {
          finish(() => resolve(transcript));
          return;
        }

        finish(() => reject(new Error(reasonText || `DashScope connection closed unexpectedly (${code})`)));
      });
    });
  }

  private createRunTaskCommand(taskId: string): RunTaskCommand {
    const languageHints = this.config.languageHints.length > 0 ? this.config.languageHints : undefined;
    const vocabularyId = this.config.vocabularyId?.trim() || undefined;

    return {
      header: {
        action: 'run-task',
        task_id: taskId,
        streaming: 'duplex',
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: this.config.model,
        parameters: {
          format: 'pcm',
          sample_rate: 16000,
          vocabulary_id: vocabularyId,
          language_hints: languageHints,
        },
        input: {},
      },
    };
  }
}
