/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PCM capture recorder for streaming speech-to-text.
 *
 * Captures raw microphone audio via an AudioWorklet, converts it to 16-bit
 * PCM at 24kHz mono (the format required by the streaming `/api/stt/stream`
 * endpoint), and emits fixed-size chunks while recording. Also provides a WAV
 * encoder so the accumulated PCM can be replayed through the whole-blob
 * `/api/stt` fallback when streaming fails mid-session.
 */

/** Sample rate (Hz) required by the streaming transcription endpoint. */
export const STREAM_SAMPLE_RATE = 24000;

/** Samples per emitted chunk at STREAM_SAMPLE_RATE (200ms). */
export const STREAM_CHUNK_SAMPLES = 4800;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Convert Web Audio float samples [-1, 1] to 16-bit signed PCM (little-endian when serialized). */
export const floatTo16BitPcm = (samples: Float32Array): Int16Array => {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    // Standard asymmetric mapping: negative scale 0x8000, positive 0x7fff.
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
};

/**
 * Linear-interpolation resampler. Always returns a new array, even when the
 * rates are equal, so callers can rely on consistent ownership semantics.
 */
export const resampleLinear = (samples: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (fromRate === toRate) {
    return samples.slice(0);
  }
  if (samples.length === 0) {
    return new Float32Array(0);
  }
  const outLength = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const out = new Float32Array(outLength);
  if (outLength === 1) {
    out[0] = samples[0];
    return out;
  }
  const step = (samples.length - 1) / (outLength - 1);
  for (let i = 0; i < outLength; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = pos - i0;
    out[i] = samples[i0] + (samples[i1] - samples[i0]) * frac;
  }
  return out;
};

/** Build a complete RIFF/WAVE file (PCM16) from raw little-endian PCM bytes. */
export const encodeWavPcm16 = (pcmBytes: Uint8Array, sampleRate: number, channels: number): Blob => {
  const dataLen = pcmBytes.byteLength;
  const blockAlign = channels * 2;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataLen, true);
  // Copy into a fresh ArrayBuffer: satisfies BlobPart typing (the input view
  // may be backed by ArrayBufferLike) and detaches the Blob from caller data.
  const payload = new Uint8Array(pcmBytes).buffer;
  return new Blob([header, payload], { type: 'audio/wav' });
};

// ---------------------------------------------------------------------------
// AudioWorklet recorder
// ---------------------------------------------------------------------------

/** Thrown when the environment lacks AudioWorklet support; caller should fall back to MediaRecorder. */
export class AudioWorkletUnavailableError extends Error {
  constructor() {
    super('AudioWorklet is not available in this environment');
    this.name = 'AudioWorkletUnavailableError';
  }
}

export type PcmRecorderHandle = {
  /** The live MediaStream (for the existing AnalyserNode waveform). */
  stream: MediaStream;
  /** Stop capture, release mic + AudioContext; resolves with ALL pcm accumulated since start. */
  stop: () => Promise<{ pcm: Uint8Array; sampleRate: number }>;
};

const PROCESSOR_NAME = 'aionui-pcm-capture';

/**
 * Inline AudioWorklet processor source, loaded via a Blob URL so no bundler
 * configuration is required. Posts a copy of each 128-sample render quantum
 * (mono, first input channel) back to the main thread.
 */
const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', PcmCaptureProcessor);
`;

/**
 * Start capturing microphone audio as PCM16 24kHz mono.
 *
 * Emits `onChunk` with STREAM_CHUNK_SAMPLES-sized (200ms) little-endian PCM16
 * chunks while recording. `stop()` flushes the remaining tail and resolves
 * with the full accumulated PCM, suitable for `encodeWavPcm16` fallback.
 */
export const createPcmRecorder = async (options: {
  onChunk: (pcm16Chunk: Uint8Array) => void;
}): Promise<PcmRecorderHandle> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const releaseMic = () => stream.getTracks().forEach((track) => track.stop());

  // Request 24kHz directly; Chromium honors it, but some platforms ignore the
  // hint, so the actual context.sampleRate is checked below.
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: STREAM_SAMPLE_RATE });
  } catch (error) {
    releaseMic();
    throw error;
  }
  const closeContext = (): Promise<void> => context.close().catch((): void => undefined);

  if (!context.audioWorklet) {
    await closeContext();
    releaseMic();
    throw new AudioWorkletUnavailableError();
  }

  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(workletUrl);
  } catch (error) {
    await closeContext();
    releaseMic();
    throw error;
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const contextRate = context.sampleRate;
  const needsResample = contextRate !== STREAM_SAMPLE_RATE;
  // Input samples (at context rate) needed to produce one 200ms output chunk.
  const chunkInputSamples = Math.max(1, Math.round((STREAM_CHUNK_SAMPLES * contextRate) / STREAM_SAMPLE_RATE));

  const source = context.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(context, PROCESSOR_NAME);
  // An AudioWorkletNode is only pulled when it participates in the rendered
  // graph, so route it through a muted gain node to the destination: the
  // worklet keeps processing but produces no audible playback.
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(workletNode);
  workletNode.connect(silentGain);
  silentGain.connect(context.destination);

  /** Emitted PCM16 chunks, concatenated on stop(). */
  const accumulated: Uint8Array[] = [];
  /** Pending Float32 blocks at the context sample rate. */
  const pendingBlocks: Float32Array[] = [];
  let pendingSamples = 0;

  /** Remove exactly `count` samples from the front of the pending queue. */
  const takePending = (count: number): Float32Array => {
    const out = new Float32Array(count);
    let filled = 0;
    while (filled < count && pendingBlocks.length > 0) {
      const head = pendingBlocks[0];
      const take = Math.min(count - filled, head.length);
      out.set(head.subarray(0, take), filled);
      if (take === head.length) {
        pendingBlocks.shift();
      } else {
        pendingBlocks[0] = head.subarray(take);
      }
      filled += take;
    }
    pendingSamples -= filled;
    return out;
  };

  /** Resample (if needed), convert to PCM16, accumulate, and notify the caller. */
  const emitBlock = (block: Float32Array) => {
    if (block.length === 0) {
      return;
    }
    const resampled = needsResample ? resampleLinear(block, contextRate, STREAM_SAMPLE_RATE) : block;
    const pcm16 = floatTo16BitPcm(resampled);
    // Int16Array uses platform byte order; all realistic Electron targets
    // (x64/arm64) are little-endian, matching the PCM16 wire format.
    const bytes = new Uint8Array(pcm16.buffer);
    accumulated.push(bytes);
    options.onChunk(bytes);
  };

  workletNode.port.onmessage = (event: MessageEvent) => {
    const block: unknown = event.data;
    if (!(block instanceof Float32Array) || block.length === 0) {
      return;
    }
    pendingBlocks.push(block);
    pendingSamples += block.length;
    while (pendingSamples >= chunkInputSamples) {
      emitBlock(takePending(chunkInputSamples));
    }
  };

  let stopPromise: Promise<{ pcm: Uint8Array; sampleRate: number }> | null = null;

  const stop = (): Promise<{ pcm: Uint8Array; sampleRate: number }> => {
    if (stopPromise) {
      return stopPromise;
    }
    stopPromise = (async () => {
      workletNode.port.onmessage = null;
      source.disconnect();
      workletNode.disconnect();
      silentGain.disconnect();
      releaseMic();
      await closeContext();
      // Flush the remaining tail (shorter than one full chunk).
      emitBlock(takePending(pendingSamples));
      const totalBytes = accumulated.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const pcm = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of accumulated) {
        pcm.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { pcm, sampleRate: STREAM_SAMPLE_RATE };
    })();
    return stopPromise;
  };

  return { stream, stop };
};
