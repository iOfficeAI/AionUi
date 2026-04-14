/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { transcribeAudioBlob } from '@/renderer/services/SpeechToTextService';
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
  locale?: string;
  onTranscript: (transcript: string) => void;
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

export const useSpeechInput = ({ locale, onTranscript }: UseSpeechInputOptions) => {
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
  const availability = useMemo(() => getSpeechInputAvailability(), []);

  const recognitionLocale = locale?.trim() || 'en-US';

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
        const result = await transcribeAudioBlob(blob, recognitionLocale);
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
    [onTranscriptRef, recognitionLocale, resetSpeechVisualizer]
  );

  const startRecording = useCallback(async () => {
    if (availability !== 'record') {
      setErrorCode('recording-unsupported');
      setStatus('error');
      return;
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
  }, [availability, cleanupRecorder, resetSpeechVisualizer, startSpeechVisualizer, transcribeBlob]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || status !== 'recording') {
      return;
    }

    setStatus('transcribing');
    recorder.stop();
  }, [status]);

  const transcribeFile = useCallback(
    async (file: Blob) => {
      await transcribeBlob(file);
    },
    [transcribeBlob]
  );

  useEffect(() => {
    return () => {
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
