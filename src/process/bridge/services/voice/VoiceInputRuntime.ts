import { ipcBridge } from '@/common';
import type {
  VoiceInputConfig,
  VoiceInputPermissions,
  VoiceInputRecord,
  VoiceInputState,
  VoiceInputStats,
} from '@/common/types/voiceInput';
import { DEFAULT_VOICE_INPUT_CONFIG, EMPTY_VOICE_INPUT_STATS } from '@/common/types/voiceInput';
import { getDatabase } from '@process/services/database';
import { ProcessConfig } from '@process/utils/initStorage';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { BrowserWindow, screen, systemPreferences } from 'electron';
import { Buffer } from 'node:buffer';
import { DashScopeVoiceProvider } from './DashScopeVoiceProvider';
import { MacNativeVoiceRecorder } from './MacNativeVoiceRecorder';
import { getFrontmostAppInfo, pasteTextToActiveApp } from './macosVoiceActions';
import {
  createVoiceInputPermissions,
  createVoiceInputState,
  getTriggerPressedState,
  isVoiceInputConfigured,
  normalizeVoiceInputConfig,
  toPermissionState,
} from './voiceInputConfig';

type IoHookModule = (typeof import('iohook-macos'))['default'];

type RecordingPayload = {
  bytes: number;
  pcmBase64: string;
  durationMs: number;
};

const VOICE_OVERLAY_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #capsule {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      #dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #ef4444;
        flex: 0 0 auto;
      }
      #indicator {
        width: 18px;
        height: 14px;
        position: relative;
        display: inline-flex;
        align-items: flex-end;
        justify-content: center;
      }
      #indicator::before,
      #indicator::after {
        content: '';
        position: absolute;
      }
      body[data-state='recording'] #indicator {
        gap: 2px;
      }
      body[data-state='recording'] #indicator::before,
      body[data-state='recording'] #indicator::after {
        display: none;
      }
      body[data-state='recording'] #indicator span {
        width: 3px;
        border-radius: 999px;
        background: #ef4444;
        animation: voice-bars 0.72s ease-in-out infinite;
        transform-origin: bottom center;
      }
      body[data-state='recording'] #indicator span:nth-child(2) {
        animation-delay: 0.12s;
      }
      body[data-state='recording'] #indicator span:nth-child(3) {
        animation-delay: 0.24s;
      }
      body[data-state='recording'] #indicator span:nth-child(4) {
        animation-delay: 0.36s;
      }
      body[data-state='transcribing'] #dot {
        background: #f59e0b;
      }
      body[data-state='transcribing'] #indicator {
        gap: 3px;
        align-items: center;
      }
      body[data-state='transcribing'] #indicator span {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: rgba(245, 158, 11, 0.4);
        animation: voice-dots 0.88s ease-in-out infinite;
      }
      body[data-state='transcribing'] #indicator span:nth-child(2) {
        animation-delay: 0.16s;
      }
      body[data-state='transcribing'] #indicator span:nth-child(3) {
        animation-delay: 0.32s;
      }
      body[data-state='transcribing'] #indicator span:nth-child(4) {
        display: none;
      }
      body[data-state='success'] #dot {
        background: #16a34a;
      }
      body[data-state='success'] #indicator {
        align-items: center;
        justify-content: center;
      }
      body[data-state='success'] #indicator span {
        width: 9px;
        height: 5px;
        border-left: 2px solid #16a34a;
        border-bottom: 2px solid #16a34a;
        transform: rotate(-45deg);
      }
      body[data-state='success'] #indicator span:nth-child(n + 2) {
        display: none;
      }
      body[data-state='error'] #dot {
        background: #dc2626;
      }
      body[data-state='error'] #indicator {
        align-items: center;
        justify-content: center;
      }
      body[data-state='error'] #indicator span {
        position: absolute;
        width: 10px;
        height: 2px;
        border-radius: 999px;
        background: #dc2626;
      }
      body[data-state='error'] #indicator span:nth-child(1) {
        transform: rotate(45deg);
      }
      body[data-state='error'] #indicator span:nth-child(2) {
        transform: rotate(-45deg);
      }
      body[data-state='error'] #indicator span:nth-child(n + 3) {
        display: none;
      }
      @keyframes voice-bars {
        0%, 100% { height: 5px; opacity: 0.45; }
        50% { height: 13px; opacity: 1; }
      }
      @keyframes voice-dots {
        0%, 100% { opacity: 0.25; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.1); }
      }
    </style>
  </head>
  <body data-state="recording">
    <div id="capsule">
      <div id="dot"></div>
      <div id="indicator">
        <span style="height: 5px"></span>
        <span style="height: 9px"></span>
        <span style="height: 12px"></span>
        <span style="height: 7px"></span>
      </div>
    </div>
    <script>
      (() => {
        const state = {
          stream: null,
          recorder: null,
          recorderChunks: [],
          chunkCount: 0,
          startTime: 0,
        };

        const toMono = (buffer) => {
          if (buffer.numberOfChannels === 1) {
            return new Float32Array(buffer.getChannelData(0));
          }
          const left = buffer.getChannelData(0);
          const right = buffer.getChannelData(1);
          const merged = new Float32Array(buffer.length);
          for (let index = 0; index < buffer.length; index += 1) {
            merged[index] = (left[index] + right[index]) / 2;
          }
          return merged;
        };

        const mergeChunks = (chunks) => {
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const merged = new Float32Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          return merged;
        };

        const resampleTo16k = (samples, sourceRate) => {
          if (!samples.length) {
            return new Float32Array();
          }
          if (sourceRate === 16000) {
            return samples;
          }
          const targetLength = Math.max(1, Math.round(samples.length * 16000 / sourceRate));
          const result = new Float32Array(targetLength);
          const ratio = (samples.length - 1) / Math.max(1, targetLength - 1);
          for (let index = 0; index < targetLength; index += 1) {
            const sourceIndex = index * ratio;
            const lowerIndex = Math.floor(sourceIndex);
            const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
            const weight = sourceIndex - lowerIndex;
            result[index] = samples[lowerIndex] * (1 - weight) + samples[upperIndex] * weight;
          }
          return result;
        };

        const floatToPcm16Base64 = (samples) => {
          const pcm = new Int16Array(samples.length);
          for (let index = 0; index < samples.length; index += 1) {
            const value = Math.max(-1, Math.min(1, samples[index]));
            pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
          }
          const bytes = new Uint8Array(pcm.buffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
          }
          return btoa(binary);
        };

        const decodeRecordedAudio = async (chunks, mimeType) => {
          if (!chunks.length) {
            return {
              samples: new Float32Array(),
              sampleRate: 16000,
            };
          }

          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const context = new AudioContext();

          try {
            const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
            return {
              samples: toMono(audioBuffer),
              sampleRate: audioBuffer.sampleRate,
            };
          } finally {
            if (context.state !== 'closed') {
              await context.close();
            }
          }
        };

        const teardown = async () => {
          try {
            if (state.recorder && state.recorder.state !== 'inactive') {
              await new Promise((resolve) => {
                state.recorder.addEventListener('stop', () => resolve(), { once: true });
                try {
                  state.recorder.stop();
                } catch {
                  resolve();
                }
              });
            }
            state.stream?.getTracks().forEach((track) => track.stop());
          } finally {
            state.stream = null;
            state.recorder = null;
            state.recorderChunks = [];
            state.chunkCount = 0;
          }
        };

        window.voiceOverlaySetState = (nextState) => {
          document.body.dataset.state = nextState;
        };

        window.voiceOverlayStartRecording = async () => {
          await teardown();
          state.recorderChunks = [];
          state.chunkCount = 0;
          state.startTime = Date.now();

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';
          const recorder = new MediaRecorder(
            stream,
            preferredMimeType ? { mimeType: preferredMimeType } : undefined
          );
          recorder.addEventListener('dataavailable', (event) => {
            if (event.data && event.data.size > 0) {
              state.recorderChunks.push(event.data);
              state.chunkCount += 1;
            }
          });
          recorder.start(250);
          state.stream = stream;
          state.recorder = recorder;
          window.voiceOverlaySetState('recording');
          return true;
        };

        window.voiceOverlayStopRecording = async () => {
          if (!state.recorder) {
            return { pcmBase64: '', durationMs: 0, chunkCount: 0 };
          }

          const recorder = state.recorder;
          const recordedChunks = await new Promise((resolve, reject) => {
            recorder.addEventListener(
              'stop',
              () => resolve([...state.recorderChunks]),
              { once: true }
            );
            recorder.addEventListener(
              'error',
              () => reject(new Error('MediaRecorder failed to capture audio.')),
              { once: true }
            );

            if (recorder.state === 'inactive') {
              resolve([...state.recorderChunks]);
              return;
            }

            recorder.stop();
          });
          const decoded = await decodeRecordedAudio(recordedChunks, recorder.mimeType);
          const resampled = resampleTo16k(decoded.samples, decoded.sampleRate);
          const pcmBase64 = floatToPcm16Base64(resampled);
          const durationMs = Math.max(0, Date.now() - state.startTime);
          const chunkCount = state.chunkCount;
          await teardown();
          return { pcmBase64, durationMs, chunkCount };
        };

        window.voiceOverlayCancelRecording = async () => {
          await teardown();
          return true;
        };
      })();
    </script>
  </body>
</html>`;

export class VoiceInputRuntime {
  private config: VoiceInputConfig = DEFAULT_VOICE_INPUT_CONFIG;
  private state: VoiceInputState = createVoiceInputState({});
  private overlayWindow: BrowserWindow | null = null;
  private overlayReadyPromise: Promise<void> | null = null;
  private hookListenerRegistered = false;
  private triggerHeld = false;
  private captureActive = false;
  private iohookModulePromise: Promise<IoHookModule> | null = null;
  private nativeRecorder = process.platform === 'darwin' ? new MacNativeVoiceRecorder() : null;

  async initialize(): Promise<void> {
    this.config = normalizeVoiceInputConfig(await ProcessConfig.get('voiceInput.config'));
    await this.refreshPermissions();
    await this.syncMonitoring();
    this.emitState();
  }

  getConfig(): VoiceInputConfig {
    return this.config;
  }

  getState(): VoiceInputState {
    return this.state;
  }

  async setConfig(config: VoiceInputConfig): Promise<VoiceInputConfig> {
    this.config = normalizeVoiceInputConfig(config);
    await ProcessConfig.set('voiceInput.config', this.config);
    await this.syncMonitoring();
    this.updateState({
      enabled: this.config.enabled,
      providerId: this.config.providerId,
      triggerMode: this.config.triggerMode,
    });
    return this.config;
  }

  async requestPermissions(): Promise<VoiceInputPermissions> {
    if (process.platform !== 'darwin') {
      const permissions = createVoiceInputPermissions('unsupported', 'unsupported');
      this.updateState({ permissions });
      return permissions;
    }

    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch (error) {
      mainWarn('[VoiceInput]', 'Failed to request microphone access', error);
    }

    try {
      const iohook = await this.getIoHookModule();
      const result = iohook.checkAccessibilityPermissions();
      if (!result.hasPermissions) {
        iohook.requestAccessibilityPermissions();
      }
    } catch (error) {
      mainWarn('[VoiceInput]', 'Failed to request accessibility access', error);
    }

    return this.refreshPermissions();
  }

  async startManualCapture(): Promise<void> {
    await this.beginCapture('manual');
  }

  async stopManualCapture(): Promise<void> {
    await this.finishCapture('manual');
  }

  async listRecords(limit = 20): Promise<VoiceInputRecord[]> {
    const db = await getDatabase();
    const result = db.listVoiceInputRecords(limit);
    return result.data ?? [];
  }

  async getStats(): Promise<VoiceInputStats> {
    const db = await getDatabase();
    const result = db.getVoiceInputStats();
    return result.data ?? EMPTY_VOICE_INPUT_STATS;
  }

  private async getIoHookModule(): Promise<IoHookModule> {
    if (!this.iohookModulePromise) {
      this.iohookModulePromise = import('iohook-macos').then((module) => module.default);
    }
    return this.iohookModulePromise;
  }

  private async refreshPermissions(): Promise<VoiceInputPermissions> {
    if (process.platform !== 'darwin') {
      const permissions = createVoiceInputPermissions('unsupported', 'unsupported');
      this.updateState({ supported: false, permissions, status: 'unsupported' });
      return permissions;
    }

    const microphone = toPermissionState(systemPreferences.getMediaAccessStatus('microphone'));
    let accessibility = toPermissionState('not-determined');

    try {
      const iohook = await this.getIoHookModule();
      accessibility = iohook.checkAccessibilityPermissions().hasPermissions ? 'granted' : 'denied';
    } catch (error) {
      mainWarn('[VoiceInput]', 'Failed to inspect accessibility permissions', error);
      accessibility = 'denied';
    }

    const permissions = createVoiceInputPermissions(microphone, accessibility);
    this.updateState({
      supported: true,
      permissions,
      status: this.state.status === 'unsupported' ? 'idle' : this.state.status,
    });
    return permissions;
  }

  private async syncMonitoring(): Promise<void> {
    if (process.platform !== 'darwin') {
      return;
    }

    const iohook = await this.getIoHookModule();
    const shouldMonitor =
      this.config.enabled && this.state.permissions.accessibility === 'granted' && isVoiceInputConfigured(this.config);

    if (!this.hookListenerRegistered) {
      const handleKeyboardLikeEvent = (event: {
        keyCode?: number;
        flags?: number;
        modifiers: { command: boolean; option: boolean; fn: boolean };
      }) => {
        void this.handleHookEvent(event);
      };
      iohook.on('flagsChanged', handleKeyboardLikeEvent);
      iohook.on('keyDown', handleKeyboardLikeEvent);
      iohook.on('keyUp', handleKeyboardLikeEvent);
      this.hookListenerRegistered = true;
    }

    if (shouldMonitor) {
      iohook.startMonitoring();
      mainLog('[VoiceInput]', 'Started global modifier monitoring');
      return;
    }

    iohook.stopMonitoring();
    this.triggerHeld = false;
  }

  private async handleHookEvent(event: {
    keyCode?: number;
    flags?: number;
    modifiers: { command: boolean; option: boolean; fn: boolean };
  }): Promise<void> {
    const nextPressed = getTriggerPressedState(this.config.triggerMode, event);
    if (nextPressed === null || nextPressed === this.triggerHeld) {
      return;
    }

    this.triggerHeld = nextPressed;

    if (nextPressed) {
      await this.beginCapture('shortcut');
      return;
    }

    await this.finishCapture('shortcut');
  }

  private async beginCapture(_reason: 'shortcut' | 'manual'): Promise<void> {
    if (this.captureActive) {
      return;
    }

    if (process.platform !== 'darwin') {
      this.updateState({ status: 'unsupported', lastError: 'Voice input is only supported on macOS right now.' });
      return;
    }

    if (!isVoiceInputConfigured(this.config)) {
      this.updateState({ status: 'error', lastError: 'DashScope API key is not configured.' });
      return;
    }

    const permissions = await this.refreshPermissions();
    if (permissions.microphone !== 'granted') {
      this.updateState({ status: 'error', lastError: 'Microphone permission is required.' });
      return;
    }
    if (permissions.accessibility !== 'granted') {
      this.updateState({ status: 'error', lastError: 'Accessibility permission is required.' });
      return;
    }

    const sourceApp = await getFrontmostAppInfo();
    this.captureActive = true;
    await this.ensureOverlayWindow();
    await this.overlayWindow?.showInactive();

    try {
      await this.nativeRecorder?.start();
      await this.setOverlayState('recording');
      this.updateState({
        status: 'recording',
        lastError: undefined,
        sourceAppName: sourceApp.appName,
      });
    } catch (error) {
      this.captureActive = false;
      this.updateState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
      await this.flashOverlayState('error');
    }
  }

  private async finishCapture(_reason: 'shortcut' | 'manual'): Promise<void> {
    if (!this.captureActive) {
      return;
    }

    this.captureActive = false;

    let payload: RecordingPayload;

    try {
      await this.setOverlayState('transcribing');
      const result = await this.nativeRecorder?.stop();
      payload = {
        bytes: result?.bytes ?? 0,
        pcmBase64: result?.pcmBase64 ?? '',
        durationMs: result?.durationMs ?? 0,
      };
      mainLog('[VoiceInput]', 'Capture payload received', {
        durationMs: payload.durationMs,
        bytes: payload.bytes,
        pcmBase64Length: payload.pcmBase64.length,
      });
    } catch (error) {
      this.updateState({ status: 'error', lastError: error instanceof Error ? error.message : String(error) });
      await this.flashOverlayState('error');
      return;
    }

    if (!payload.pcmBase64 || payload.bytes === 0) {
      const message = 'No audio was captured. Check microphone permission and the selected input device.';
      await this.persistRecord({
        id: crypto.randomUUID(),
        providerId: this.config.providerId,
        triggerMode: this.config.triggerMode,
        status: 'failed',
        transcript: '',
        transcriptLength: 0,
        sourceAppName: this.state.sourceAppName,
        model: this.config.providers.dashscope.model,
        languageHints: this.config.providers.dashscope.languageHints,
        vocabularyId: this.config.providers.dashscope.vocabularyId,
        hotwords: this.config.providers.dashscope.hotwords,
        durationMs: payload.durationMs,
        errorMessage: message,
        createdAt: Date.now(),
      });
      this.updateState({ status: 'error', lastError: message });
      await this.flashOverlayState('error');
      return;
    }

    try {
      const provider = new DashScopeVoiceProvider(this.config.providers.dashscope);
      const transcript = (await provider.transcribe(Buffer.from(payload.pcmBase64, 'base64'))).trim();

      if (!transcript) {
        throw new Error('No transcript was returned.');
      }

      const outcome = this.config.autoInsert ? await pasteTextToActiveApp(transcript) : 'copied';
      const appInfo = await getFrontmostAppInfo();
      const record: VoiceInputRecord = {
        id: crypto.randomUUID(),
        providerId: this.config.providerId,
        triggerMode: this.config.triggerMode,
        status: outcome,
        transcript,
        transcriptLength: transcript.length,
        sourceAppName: this.state.sourceAppName ?? appInfo.appName,
        sourceBundleId: appInfo.bundleId,
        model: this.config.providers.dashscope.model,
        languageHints: this.config.providers.dashscope.languageHints,
        vocabularyId: this.config.providers.dashscope.vocabularyId,
        hotwords: this.config.providers.dashscope.hotwords,
        durationMs: payload.durationMs,
        createdAt: Date.now(),
      };
      await this.persistRecord(record);

      this.updateState({
        status: outcome === 'inserted' ? 'inserted' : 'copied',
        lastTranscript: transcript,
        lastError: undefined,
        sourceAppName: record.sourceAppName,
      });
      await this.flashOverlayState('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.persistRecord({
        id: crypto.randomUUID(),
        providerId: this.config.providerId,
        triggerMode: this.config.triggerMode,
        status: 'failed',
        transcript: '',
        transcriptLength: 0,
        sourceAppName: this.state.sourceAppName,
        model: this.config.providers.dashscope.model,
        languageHints: this.config.providers.dashscope.languageHints,
        vocabularyId: this.config.providers.dashscope.vocabularyId,
        hotwords: this.config.providers.dashscope.hotwords,
        durationMs: payload.durationMs,
        errorMessage: message,
        createdAt: Date.now(),
      });
      this.updateState({ status: 'error', lastError: message });
      await this.flashOverlayState('error');
      mainError('[VoiceInput]', 'Voice capture failed', error);
    }
  }

  private async persistRecord(record: VoiceInputRecord): Promise<void> {
    const db = await getDatabase();
    const result = db.insertVoiceInputRecord(record);
    if (!result.success) {
      mainWarn('[VoiceInput]', 'Failed to persist voice input record', result.error);
    }
  }

  private async ensureOverlayWindow(): Promise<void> {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return;
    }

    this.overlayWindow = new BrowserWindow({
      width: 84,
      height: 42,
      show: false,
      paintWhenInitiallyHidden: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      transparent: true,
      roundedCorners: true,
      alwaysOnTop: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    this.overlayWindow.setIgnoreMouseEvents(true);
    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null;
      this.overlayReadyPromise = null;
    });
    this.positionOverlayWindow();
    this.overlayWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media');
    });
    this.overlayReadyPromise = this.overlayWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(VOICE_OVERLAY_HTML)}`
    );
    await this.overlayReadyPromise;
  }

  private positionOverlayWindow(): void {
    if (!this.overlayWindow) {
      return;
    }

    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;
    const overlayBounds = this.overlayWindow.getBounds();
    this.overlayWindow.setBounds({
      x: Math.round(x + width / 2 - overlayBounds.width / 2),
      y: Math.round(y + height - overlayBounds.height - 26),
      width: overlayBounds.width,
      height: overlayBounds.height,
    });
  }

  private async executeOverlay<T>(script: string): Promise<T> {
    await this.ensureOverlayWindow();
    if (!this.overlayWindow) {
      throw new Error('Voice overlay window is unavailable.');
    }
    return this.overlayWindow.webContents.executeJavaScript(script, true) as Promise<T>;
  }

  private async setOverlayState(state: 'recording' | 'transcribing' | 'success' | 'error'): Promise<void> {
    await this.executeOverlay(`window.voiceOverlaySetState(${JSON.stringify(state)})`);
  }

  private async flashOverlayState(state: 'success' | 'error'): Promise<void> {
    try {
      await this.setOverlayState(state);
      await new Promise((resolve) => setTimeout(resolve, 900));
    } finally {
      if (state === 'error') {
        await this.nativeRecorder?.cancel().catch(() => {});
      }
      await this.hideOverlay();
      this.updateState({ status: state === 'success' ? this.state.status : 'idle' });
    }
  }

  private async hideOverlay(): Promise<void> {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
      return;
    }

    this.overlayWindow.hide();
  }

  private updateState(patch: Partial<VoiceInputState>): void {
    this.state = createVoiceInputState(
      {
        ...this.state,
        ...patch,
        updatedAt: Date.now(),
      },
      this.config
    );
    this.emitState();
  }

  private emitState(): void {
    ipcBridge.voiceInput.stateChanged.emit(this.state);
  }
}
