/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { transcribeAudioBlob } from '@/renderer/services/SpeechToTextService';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import {
  AudioWorkletUnavailableError,
  createPcmRecorder,
  encodeWavPcm16,
  STREAM_SAMPLE_RATE,
  type PcmRecorderHandle,
} from '@/renderer/services/speech/pcmRecorder';
import { startSpeechStream, type SpeechStreamHandle } from '@/renderer/services/speech/SpeechStreamClient';
import { rememberStreamUnsupported, shouldTryStreaming } from '@/renderer/services/speech/speechStreamPolicy';
import { isElectronDesktop } from '@/renderer/utils/platform';

export type SpeechInputAvailability = 'record' | 'file' | 'unsupported';
export type SpeechInputStatus = 'idle' | 'recording' | 'transcribing' | 'error';
export type SpeechInputErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'empty-transcript'
  | 'file-too-large'
  | 'network'
  | 'not-configured'
  | 'permission-denied'
  | 'recording-unsupported'
  | 'transcription-failed'
  | 'unknown';

type SpeechInputEnvironment = {
  hasFileInput: boolean;
  hasMediaDevices: boolean;
  hasMediaRecorder: boolean;
  hostname: string;
  isElectronDesktop: boolean;
  isSecureContext: boolean;
};

type UseSpeechInputOptions = {
  /**
   * Live transcript of the current STREAMING session (finals + trailing
   * partial). Called with `null` exactly once per streaming session to clear
   * the live display, always before the terminal `onTranscript` or error.
   * Never called on the non-streaming MediaRecorder path.
   */
  onLiveTranscript?: (sessionText: string | null) => void;
  onTranscript: (transcript: string) => void;
};

/** One active streaming transcription session (PCM recorder + WebSocket). */
type StreamingSession = {
  config: SpeechToTextConfig;
  finals: string[];
  partial: string;
  recorder: PcmRecorderHandle;
  handle: SpeechStreamHandle | null;
  liveCleared: boolean;
  /** Set once the server acks `ready` — i.e. the stream actually established. */
  ready: boolean;
  /**
   * Non-null once streaming was abandoned before it ever established and the
   * session degraded to batch capture: holds the originating error code and
   * defers the whole-blob /api/stt fallback until the user stops recording.
   */
  deferredFallbackCode: string | null;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const RECORDING_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const SPEECH_WAVEFORM_SAMPLE_COUNT = 40;
const SPEECH_WAVEFORM_MIN_LEVEL = 0.015;
const SPEECH_WAVEFORM_MAX_LEVEL = 1;
const SPEECH_VISUALIZER_INTERVAL_MS = 80;

const createInitialWaveformLevels = (): number[] =>
  Array.from({ length: SPEECH_WAVEFORM_SAMPLE_COUNT }, (_, index) => ((index + 1) % 6 === 0 ? 0.04 : 0.015));

const clampWaveformLevel = (value: number): number =>
  Math.max(SPEECH_WAVEFORM_MIN_LEVEL, Math.min(SPEECH_WAVEFORM_MAX_LEVEL, value));

const createNextWaveformLevels = (previous: number[], nextLevel: number): number[] => [
  ...previous.slice(1),
  clampWaveformLevel(nextLevel),
];

export const appendSpeechTranscript = (base: string, transcript: string): string => {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    return base;
  }

  const normalizedBase = base.trimEnd();
  if (!normalizedBase) {
    return normalizedTranscript;
  }

  return `${normalizedBase}\n${normalizedTranscript}`;
};

/** CJK Unified Ideographs + extension A + CJK/fullwidth punctuation. */
const CJK_BOUNDARY_CHAR = /[　-〿㐀-䶿一-鿿＀-￯]/;

/** Join transcript segments: CJK-adjacent boundaries concatenate directly, otherwise a single space. */
export const joinTranscriptSegments = (segments: string[]): string => {
  return segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((joined, segment) => {
      if (!joined) {
        return segment;
      }
      const isCjkBoundary = CJK_BOUNDARY_CHAR.test(joined[joined.length - 1]) || CJK_BOUNDARY_CHAR.test(segment[0]);
      return `${joined}${isCjkBoundary ? '' : ' '}${segment}`;
    }, '');
};

/**
 * Compose the live display text for a streaming session: committed finals
 * plus the in-flight partial, joined as one continuous utterance
 * (VAD pause boundaries must not introduce line breaks).
 */
export const composeLiveTranscript = (finals: string[], partial: string): string => {
  return joinTranscriptSegments(partial ? [...finals, partial] : finals);
};

export const getSpeechInputErrorMessageKey = (errorCode: SpeechInputErrorCode): string => {
  switch (errorCode) {
    case 'audio-capture':
      return 'conversation.chat.speech.audioCaptureError';
    case 'empty-transcript':
      return 'conversation.chat.speech.emptyTranscript';
    case 'file-too-large':
      return 'conversation.chat.speech.fileTooLarge';
    case 'network':
      return 'conversation.chat.speech.networkError';
    case 'not-configured':
      return 'conversation.chat.speech.notConfigured';
    case 'permission-denied':
      return 'conversation.chat.speech.permissionDenied';
    case 'recording-unsupported':
      return 'conversation.chat.speech.recordingUnsupported';
    case 'transcription-failed':
      return 'conversation.chat.speech.transcriptionFailed';
    case 'aborted':
    case 'unknown':
    default:
      return 'conversation.chat.speech.genericError';
  }
};

const getSpeechInputEnvironment = (): SpeechInputEnvironment => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      hasFileInput: false,
      hasMediaDevices: false,
      hasMediaRecorder: false,
      hostname: '',
      isElectronDesktop: false,
      isSecureContext: false,
    };
  }

  return {
    hasFileInput: typeof document.createElement === 'function',
    hasMediaDevices: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
    hostname: window.location.hostname,
    isElectronDesktop: isElectronDesktop(),
    isSecureContext: window.isSecureContext,
  };
};

export const getSpeechInputAvailabilityForEnvironment = (
  environment: SpeechInputEnvironment
): SpeechInputAvailability => {
  const canUseLiveRecording =
    environment.hasMediaDevices &&
    environment.hasMediaRecorder &&
    (environment.isElectronDesktop || environment.isSecureContext || LOCAL_HOSTNAMES.has(environment.hostname));

  if (canUseLiveRecording) {
    return 'record';
  }

  if (environment.hasFileInput) {
    return 'file';
  }

  return 'unsupported';
};

export const getSpeechInputAvailability = (): SpeechInputAvailability => {
  return getSpeechInputAvailabilityForEnvironment(getSpeechInputEnvironment());
};

export const pickRecordingMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
};

const mapSpeechInputError = (error: unknown): SpeechInputErrorCode => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'permission-denied';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'audio-capture';
      case 'AbortError':
        return 'aborted';
      default:
        return 'unknown';
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('STT_OPENAI_NOT_CONFIGURED') ||
    message.includes('STT_DEEPGRAM_NOT_CONFIGURED') ||
    message.includes('STT_DISABLED')
  ) {
    return 'not-configured';
  }
  if (message.includes('STT_FILE_TOO_LARGE')) {
    return 'file-too-large';
  }
  if (message.includes('STT_NETWORK_ERROR')) {
    return 'network';
  }
  if (message.includes('STT_ABORTED')) {
    return 'aborted';
  }
  if (message.includes('STT_REQUEST_FAILED')) {
    return 'transcription-failed';
  }

  return 'unknown';
};

export const useSpeechInput = ({ onLiveTranscript, onTranscript }: UseSpeechInputOptions) => {
  const [status, setStatus] = useState<SpeechInputStatus>('idle');
  const [errorCode, setErrorCode] = useState<SpeechInputErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() => createInitialWaveformLevels());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const visualizerIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const onTranscriptRef = useLatestRef(onTranscript);
  const onLiveTranscriptRef = useLatestRef(onLiveTranscript);
  const streamSessionRef = useRef<StreamingSession | null>(null);
  const availability = useMemo(() => getSpeechInputAvailability(), []);

  const pauseSpeechVisualizer = useCallback(() => {
    if (visualizerIntervalRef.current !== null) {
      window.clearInterval(visualizerIntervalRef.current);
      visualizerIntervalRef.current = null;
    }
  }, []);

  const resetSpeechVisualizer = useCallback(() => {
    pauseSpeechVisualizer();
    recordingStartedAtRef.current = null;
    setRecordingDurationMs(0);
    setRecordingLevels(createInitialWaveformLevels());
  }, [pauseSpeechVisualizer]);

  const cleanupAudioAnalysis = useCallback(async () => {
    if (mediaSourceRef.current) {
      try {
        mediaSourceRef.current.disconnect();
      } catch {
        // Ignore disconnect failures during teardown.
      }
      mediaSourceRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignore disconnect failures during teardown.
      }
      analyserRef.current = null;
    }

    analyserDataRef.current = null;

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // Ignore close failures during teardown.
      }
      audioContextRef.current = null;
    }
  }, []);

  const startSpeechVisualizer = useCallback(
    async (stream: MediaStream) => {
      resetSpeechVisualizer();
      recordingStartedAtRef.current = Date.now();

      const AudioContextCtor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : typeof window !== 'undefined'
            ? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            : undefined;

      if (AudioContextCtor) {
        try {
          const audioContext = new AudioContextCtor();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.82;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          mediaSourceRef.current = source;
          analyserDataRef.current = new Uint8Array(analyser.fftSize);
        } catch {
          void cleanupAudioAnalysis();
        }
      }

      visualizerIntervalRef.current = window.setInterval(() => {
        const startedAt = recordingStartedAtRef.current;
        if (startedAt) {
          setRecordingDurationMs(Date.now() - startedAt);
        }

        const analyser = analyserRef.current;
        const analyserData = analyserDataRef.current;
        if (!analyser || !analyserData) {
          setRecordingLevels((previous) => createNextWaveformLevels(previous, SPEECH_WAVEFORM_MIN_LEVEL));
          return;
        }

        analyser.getByteTimeDomainData(analyserData);
        let sum = 0;
        for (const sample of analyserData) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / analyserData.length);
        const scaledLevel = clampWaveformLevel(rms * 5.6);
        setRecordingLevels((previous) => createNextWaveformLevels(previous, scaledLevel));
      }, SPEECH_VISUALIZER_INTERVAL_MS);
    },
    [cleanupAudioAnalysis, resetSpeechVisualizer]
  );

  const cleanupRecorder = useCallback(() => {
    pauseSpeechVisualizer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    void cleanupAudioAnalysis();
  }, [cleanupAudioAnalysis, pauseSpeechVisualizer]);

  const clearError = useCallback(() => {
    setErrorCode(null);
    setErrorMessage(null);
    setStatus('idle');
    resetSpeechVisualizer();
  }, [resetSpeechVisualizer]);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      try {
        setStatus('transcribing');
        setErrorCode(null);
        setErrorMessage(null);
        // No languageHint: the configured STT language (or provider-native
        // auto detection) is the only language signal.
        const result = await transcribeAudioBlob(blob);
        const transcript = result.text.trim();
        if (!transcript) {
          setErrorCode('empty-transcript');
          setErrorMessage(null);
          setStatus('error');
          resetSpeechVisualizer();
          return;
        }
        onTranscriptRef.current(transcript);
        setStatus('idle');
        resetSpeechVisualizer();
      } catch (error) {
        setErrorCode(mapSpeechInputError(error));
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(
          message.startsWith('STT_REQUEST_FAILED:') ? message.replace('STT_REQUEST_FAILED:', '').trim() : null
        );
        setStatus('error');
        resetSpeechVisualizer();
      }
    },
    [onTranscriptRef, resetSpeechVisualizer]
  );

  const emitLiveTranscript = useCallback(
    (session: StreamingSession) => {
      onLiveTranscriptRef.current?.(composeLiveTranscript(session.finals, session.partial));
    },
    [onLiveTranscriptRef]
  );

  /** Clear the live display exactly once, always before terminal onTranscript/error. */
  const clearLiveTranscript = useCallback(
    (session: StreamingSession) => {
      if (session.liveCleared) {
        return;
      }
      session.liveCleared = true;
      onLiveTranscriptRef.current?.(null);
    },
    [onLiveTranscriptRef]
  );

  /** Detach the session from the hook and stop visualizer/analyser wiring. */
  const teardownStreamingSession = useCallback(
    (session: StreamingSession) => {
      if (streamSessionRef.current === session) {
        streamSessionRef.current = null;
      }
      pauseSpeechVisualizer();
      void cleanupAudioAnalysis();
    },
    [cleanupAudioAnalysis, pauseSpeechVisualizer]
  );

  const finishStreamingSession = useCallback(
    (session: StreamingSession) => {
      teardownStreamingSession(session);
      // Idempotent: returns the existing stop promise when already stopped.
      void session.recorder.stop();
      clearLiveTranscript(session);

      const transcript = joinTranscriptSegments(session.finals);
      if (!transcript) {
        setErrorCode('empty-transcript');
        setErrorMessage(null);
        setStatus('error');
        resetSpeechVisualizer();
        return;
      }

      onTranscriptRef.current(transcript);
      setStatus('idle');
      resetSpeechVisualizer();
    },
    [clearLiveTranscript, onTranscriptRef, resetSpeechVisualizer, teardownStreamingSession]
  );

  /**
   * Streaming failed after it had established (`ready`): stop now and replay the
   * PCM captured so far through the whole-blob /api/stt fallback, so a mid-session
   * interruption never loses the user's recording.
   */
  const fallbackStreamingSession = useCallback(
    async (session: StreamingSession, code: string) => {
      teardownStreamingSession(session);
      if (code === 'STT_STREAM_UNSUPPORTED') {
        rememberStreamUnsupported(session.config);
      }
      session.handle?.abort();
      clearLiveTranscript(session);
      setStatus('transcribing');

      try {
        const { pcm } = await session.recorder.stop();
        await transcribeBlob(encodeWavPcm16(pcm, STREAM_SAMPLE_RATE, 1));
      } catch (error) {
        setErrorCode(mapSpeechInputError(error));
        setErrorMessage(null);
        setStatus('error');
        resetSpeechVisualizer();
      }
    },
    [clearLiveTranscript, resetSpeechVisualizer, teardownStreamingSession, transcribeBlob]
  );

  /**
   * Streaming failed BEFORE it ever established (no `ready`): a custom
   * OpenAI-compatible endpoint with no `/api/stt/stream` support rejects/closes
   * within a fraction of a second — well under the connect timeout. Immediately
   * replaying the PCM captured so far would transcribe only that fraction of a
   * second of audio and surface "no speech detected" on every single attempt.
   *
   * Instead: drop the dead socket but KEEP the PCM recorder running, so recording
   * continues uninterrupted; the captured audio is replayed through the
   * whole-blob /api/stt fallback when the user actually stops. Only an explicit
   * `STT_STREAM_UNSUPPORTED` is persisted as stream-unsupported — ambiguous codes
   * (connect-failed/timeout/interrupted) may be transient, so they degrade this
   * one recording without permanently disabling streaming for the config.
   */
  const degradeStreamingSessionToBatch = useCallback(
    (session: StreamingSession, code: string) => {
      if (code === 'STT_STREAM_UNSUPPORTED') {
        rememberStreamUnsupported(session.config);
      }
      session.handle?.abort();
      session.deferredFallbackCode = code;
      clearLiveTranscript(session);
    },
    [clearLiveTranscript]
  );

  /**
   * Try to start a streaming session. Returns true when the attempt was
   * handled (session running or error surfaced); false when the environment
   * lacks AudioWorklet support and the caller should fall back to the
   * MediaRecorder path for this session (environment, not config — no memory).
   */
  const startStreamingSession = useCallback(
    async (config: SpeechToTextConfig): Promise<boolean> => {
      let handle: SpeechStreamHandle | null = null;
      const earlyChunks: Uint8Array[] = [];
      let recorder: PcmRecorderHandle;

      try {
        recorder = await createPcmRecorder({
          onChunk: (chunk) => {
            if (handle) {
              handle.sendChunk(chunk);
            } else {
              earlyChunks.push(chunk);
            }
          },
        });
      } catch (error) {
        if (error instanceof AudioWorkletUnavailableError) {
          return false;
        }
        // getUserMedia/AudioContext failures would also fail the MediaRecorder
        // path — surface them directly instead of retrying.
        setErrorCode(mapSpeechInputError(error));
        setErrorMessage(null);
        setStatus('error');
        resetSpeechVisualizer();
        return true;
      }

      const session: StreamingSession = {
        config,
        finals: [],
        partial: '',
        recorder,
        handle: null,
        liveCleared: false,
        ready: false,
        deferredFallbackCode: null,
      };
      const isActive = () => streamSessionRef.current === session;

      // No languageHint: language comes from the STT settings (config-first on
      // the server); omitting the hint keeps explicit auto-detect truly auto.
      handle = startSpeechStream({
        callbacks: {
          onReady: () => {
            // Chunk buffering/flushing is handled inside the stream client.
            session.ready = true;
          },
          onPartial: (text) => {
            if (!isActive()) return;
            session.partial = text;
            emitLiveTranscript(session);
          },
          onFinal: (text) => {
            if (!isActive()) return;
            session.partial = '';
            if (text.trim()) {
              session.finals.push(text);
            }
            emitLiveTranscript(session);
          },
          onDone: () => {
            if (!isActive()) return;
            finishStreamingSession(session);
          },
          onError: (code) => {
            if (!isActive()) return;
            // Never established → keep recording and defer to batch on stop.
            // Established then dropped → replay what was captured immediately.
            if (session.ready) {
              void fallbackStreamingSession(session, code);
            } else {
              degradeStreamingSessionToBatch(session, code);
            }
          },
        },
      });
      session.handle = handle;
      streamSessionRef.current = session;
      for (const chunk of earlyChunks.splice(0)) {
        handle.sendChunk(chunk);
      }

      setErrorCode(null);
      setErrorMessage(null);
      setStatus('recording');
      await startSpeechVisualizer(recorder.stream);
      return true;
    },
    [
      degradeStreamingSessionToBatch,
      emitLiveTranscript,
      fallbackStreamingSession,
      finishStreamingSession,
      resetSpeechVisualizer,
      startSpeechVisualizer,
    ]
  );

  const startRecording = useCallback(async () => {
    if (availability !== 'record') {
      setErrorCode('recording-unsupported');
      setStatus('error');
      return;
    }

    const speechConfig = await getClientBusinessSetting('tools.speechToText');
    if (speechConfig && shouldTryStreaming(speechConfig)) {
      const handled = await startStreamingSession(speechConfig);
      if (handled) {
        return;
      }
      // AudioWorklet unavailable — use the MediaRecorder path for this session.
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      await startSpeechVisualizer(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        cleanupRecorder();
        setErrorCode('unknown');
        setStatus('error');
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        cleanupRecorder();
        void transcribeBlob(audioBlob);
      };

      setErrorCode(null);
      setErrorMessage(null);
      setStatus('recording');
      recorder.start();
    } catch (error) {
      cleanupRecorder();
      setErrorCode(mapSpeechInputError(error));
      setErrorMessage(null);
      setStatus('error');
      resetSpeechVisualizer();
    }
  }, [
    availability,
    cleanupRecorder,
    resetSpeechVisualizer,
    startSpeechVisualizer,
    startStreamingSession,
    transcribeBlob,
  ]);

  const stopRecording = useCallback(() => {
    if (status !== 'recording') {
      return;
    }

    const session = streamSessionRef.current;
    if (session) {
      if (session.deferredFallbackCode !== null) {
        // Streaming never established and degraded to batch capture; now that
        // recording ended, transcribe the full PCM via the whole-blob fallback.
        void fallbackStreamingSession(session, session.deferredFallbackCode);
        return;
      }
      setStatus('transcribing');
      pauseSpeechVisualizer();
      // Keep the accumulated PCM (resolved by this stop) for potential fallback.
      void session.recorder.stop();
      session.handle?.stop();
      return;
    }

    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    setStatus('transcribing');
    recorder.stop();
  }, [fallbackStreamingSession, pauseSpeechVisualizer, status]);

  const transcribeFile = useCallback(
    async (file: Blob) => {
      await transcribeBlob(file);
    },
    [transcribeBlob]
  );

  useEffect(() => {
    return () => {
      const session = streamSessionRef.current;
      if (session) {
        streamSessionRef.current = null;
        session.handle?.abort();
        void session.recorder.stop();
      }
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
      }
      if (recorder?.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Ignore teardown failures from partially started recording sessions.
        }
      }
      cleanupRecorder();
    };
  }, [cleanupRecorder]);

  return {
    availability,
    clearError,
    errorCode,
    errorMessage,
    recordingDurationMs,
    recordingLevels,
    startRecording,
    status,
    stopRecording,
    transcribeFile,
  };
};
