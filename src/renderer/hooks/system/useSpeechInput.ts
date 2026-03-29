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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTranscriptRef = useLatestRef(onTranscript);
  const availability = useMemo(() => getSpeechInputAvailability(), []);

  const recognitionLocale = locale?.trim() || 'en-US';

  const cleanupRecorder = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const clearError = useCallback(() => {
    setErrorCode(null);
    setStatus('idle');
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      try {
        setStatus('transcribing');
        setErrorCode(null);
        const result = await transcribeAudioBlob(blob, recognitionLocale);
        if (result.text.trim()) {
          onTranscriptRef.current(result.text);
        }
        setStatus('idle');
      } catch (error) {
        setErrorCode(mapSpeechInputError(error));
        setStatus('error');
      }
    },
    [onTranscriptRef, recognitionLocale]
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
      setStatus('recording');
      recorder.start();
    } catch (error) {
      cleanupRecorder();
      setErrorCode(mapSpeechInputError(error));
      setStatus('error');
    }
  }, [availability, cleanupRecorder, transcribeBlob]);

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
    startRecording,
    status,
    stopRecording,
    transcribeFile,
  };
};
