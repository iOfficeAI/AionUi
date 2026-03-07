/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDisplayMessage } from '@/renderer/utils/messageFiles';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { useOpenFileSelector } from '@/renderer/hooks/useOpenFileSelector';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';
import { useSlashCommands } from '@/renderer/hooks/useSlashCommands';

interface OpenClawDraftData {
  _type: 'openclaw-gateway';
  atPath: Array<string | FileOrFolderItem>;
  content: string;
  uploadFile: string[];
}

const useOpenClawSendBoxDraft = getSendBoxDraftHook('openclaw-gateway', {
  _type: 'openclaw-gateway',
  atPath: [],
  content: '',
  uploadFile: [],
});

/**
 * Validate that the OpenClaw runtime matches the expected configuration.
 * Returns true if validation passes, false otherwise (with user-facing error).
 */
const validateRuntimeMismatch = async (conversationId: string): Promise<boolean> => {
  const runtimeResult = await ipcBridge.openclawConversation.getRuntime.invoke({ conversation_id: conversationId });
  if (!runtimeResult?.success || !runtimeResult.data) {
    Message.error('Failed to validate agent runtime');
    return false;
  }

  const runtime = runtimeResult.data.runtime || {};
  const expected = runtimeResult.data.expected || {};
  const mismatches: string[] = [];

  const norm = (v?: string | null) => (v || '').trim();
  const eqPath = (a?: string | null, b?: string | null) => norm(a).replace(/[\\/]+$/, '') === norm(b).replace(/[\\/]+$/, '');

  if (expected.expectedWorkspace && !eqPath(expected.expectedWorkspace, runtime.workspace)) {
    mismatches.push(`workspace: expected=${expected.expectedWorkspace || '-'} actual=${runtime.workspace || '-'}`);
  }
  if (expected.expectedBackend && norm(expected.expectedBackend) !== norm(runtime.backend)) {
    mismatches.push(`backend: expected=${expected.expectedBackend || '-'} actual=${runtime.backend || '-'}`);
  }
  if (expected.expectedAgentName && norm(expected.expectedAgentName) !== norm(runtime.agentName)) {
    mismatches.push(`agent: expected=${expected.expectedAgentName || '-'} actual=${runtime.agentName || '-'}`);
  }
  if (expected.expectedCliPath && norm(expected.expectedCliPath) !== norm(runtime.cliPath)) {
    mismatches.push(`cliPath: expected=${expected.expectedCliPath || '-'} actual=${runtime.cliPath || '-'}`);
  }
  if (expected.expectedModel && norm(expected.expectedModel) !== norm(runtime.model)) {
    mismatches.push(`model: expected=${expected.expectedModel || '-'} actual=${runtime.model || '-'}`);
  }
  if (expected.expectedIdentityHash && norm(expected.expectedIdentityHash) !== norm(runtime.identityHash)) {
    mismatches.push(`identity: expected=${expected.expectedIdentityHash || '-'} actual=${runtime.identityHash || '-'}`);
  }

  if (mismatches.length > 0) {
    Message.error(`Agent switch validation failed: ${mismatches.join(' | ')}`);
    return false;
  }
  return true;
};

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];
const STAR_OFFICE_CARD_MARKER = '[STAROFFICE_CARD]';
const normalizeConsentText = (input: string) => input.trim().toLowerCase();
const isInstallConsentApproved = (input: string) => {
  const normalized = normalizeConsentText(input);
  return ['同意', '继续', '开始', '确认', '可以', 'yes', 'ok', 'y', 'run'].some((k) => normalized.includes(k));
};
const isInstallConsentRejected = (input: string) => {
  const normalized = normalizeConsentText(input);
  return ['取消', '拒绝', '不要', 'no', 'n', 'stop'].some((k) => normalized.includes(k));
};
const extractResponseText = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'content' in raw) {
    const content = (raw as { content?: unknown }).content;
    if (typeof content === 'string') return content;
  }
  return '';
};
type InstallFlowStage = 'idle' | 'consent' | 'checking' | 'installing' | 'starting' | 'detecting' | 'troubleshooting' | 'completed';
const OpenClawSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const slashCommands = useSlashCommands(conversation_id);
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [aiProcessing, setAiProcessing] = useState(false);
  const [openclawStatus, setOpenClawStatus] = useState<string | null>(null);
  const [starOfficeInstallMode, setStarOfficeInstallMode] = useState(false);
  const [awaitingInstallConsent, setAwaitingInstallConsent] = useState(false);
  const [pendingInstallPrompt, setPendingInstallPrompt] = useState<string | null>(null);
  const [installFlowStage, setInstallFlowStage] = useState<InstallFlowStage>('idle');
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const installCompletedInTurnRef = useRef(false);
  const lastAnnouncedInstallStageRef = useRef<InstallFlowStage>('idle');
  const installFlowMeta = useMemo(() => {
    const map: Record<InstallFlowStage, { label: string; percent: number }> = {
      idle: { label: t('conversation.chat.starOffice.modeIdle', { defaultValue: 'Idle' }), percent: 0 },
      consent: { label: t('conversation.chat.starOffice.modeConsent', { defaultValue: 'Waiting consent' }), percent: 5 },
      checking: { label: t('conversation.chat.starOffice.modeChecking', { defaultValue: 'Checking environment' }), percent: 20 },
      installing: { label: t('conversation.chat.starOffice.modeInstalling', { defaultValue: 'Installing / repairing' }), percent: 50 },
      starting: { label: t('conversation.chat.starOffice.modeStarting', { defaultValue: 'Starting service' }), percent: 70 },
      detecting: { label: t('conversation.chat.starOffice.modeDetecting', { defaultValue: 'Detecting local port' }), percent: 85 },
      troubleshooting: { label: t('conversation.chat.starOffice.modeTroubleshooting', { defaultValue: 'Troubleshooting connection' }), percent: 90 },
      completed: { label: t('conversation.chat.starOffice.modeCompleted', { defaultValue: 'Completed' }), percent: 100 },
    };
    return map[installFlowStage];
  }, [installFlowStage, t]);

  // Use ref to sync state for immediate access in event handlers
  // 使用 ref 同步状态，以便在事件处理程序中立即访问
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether current turn has content output
  // Only reset aiProcessing when finish arrives after content (not after tool calls)
  const hasContentInTurnRef = useRef(false);

  // Delayed finish timeout to detect true end of task
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50;
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  const { data: draftData, mutate: mutateDraft } = useOpenClawSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setAtPath = useCallback(
    (val: Array<string | FileOrFolderItem>) => {
      mutateDraft((prev) => ({ ...(prev as OpenClawDraftData), atPath: val }));
    },
    [mutateDraft]
  );

  const setUploadFile = createSetUploadFile(mutateDraft, draftData);

  const setContent = useCallback(
    (val: string) => {
      mutateDraft((prev) => ({ ...(prev as OpenClawDraftData), content: val }));
    },
    [mutateDraft]
  );

  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);
  const immediateSendRef = useRef<((text: string) => Promise<void>) | null>(null);
  const emitAssistantNarration = useCallback(
    (markdown: string) => {
      const assistantMessage: TMessage = {
        id: uuid(),
        msg_id: uuid(),
        conversation_id,
        type: 'text',
        position: 'left',
        content: {
          content: markdown,
        },
        createdAt: Date.now(),
      };
      addOrUpdateMessage(assistantMessage, true);
    },
    [addOrUpdateMessage, conversation_id]
  );
  const emitAssistantCard = useCallback(
    (markdown: string) => {
      emitAssistantNarration(`${STAR_OFFICE_CARD_MARKER}\n${markdown}`);
    },
    [emitAssistantNarration]
  );
  const announceInstallStage = useCallback(
    (stage: InstallFlowStage) => {
      if (stage === 'idle' || stage === 'consent') return;
      if (lastAnnouncedInstallStageRef.current === stage) return;
      lastAnnouncedInstallStageRef.current = stage;
      // Keep stage updates inside the install mode pill only.
      // Avoid appending repetitive progress text messages into conversation history.
    },
    []
  );
  const emitWorkflowTip = useCallback(
    (text: string, type: 'success' | 'warning' = 'success') => {
      const tipMessage: TMessage = {
        id: uuid(),
        msg_id: uuid(),
        conversation_id,
        type: 'tips',
        position: 'center',
        content: {
          content: text,
          type,
        },
        createdAt: Date.now(),
      };
      addOrUpdateMessage(tipMessage, true);
    },
    [addOrUpdateMessage, conversation_id]
  );
  const emitLocalUserMessage = useCallback(
    (text: string) => {
      const userMessage: TMessage = {
        id: uuid(),
        msg_id: uuid(),
        conversation_id,
        type: 'text',
        position: 'right',
        content: { content: text },
        createdAt: Date.now(),
      };
      addOrUpdateMessage(userMessage, true);
    },
    [addOrUpdateMessage, conversation_id]
  );
  const exitInstallMode = useCallback(
    (tip?: string) => {
      setInstallFlowStage('idle');
      void ipcBridge.conversation.update.invoke({
        id: conversation_id,
        updates: {
          extra: {
            starOfficeInstallMode: false,
            starOfficeInstallModePrimed: false,
          },
        },
        mergeExtra: true,
      });
      emitter.emit('staroffice.install-mode.changed', { conversationId: conversation_id, enabled: false });
      if (tip) emitWorkflowTip(tip);
    },
    [conversation_id, emitWorkflowTip]
  );
  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    // Clear pending finish timeout when conversation changes
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }

    setOpenClawStatus(null);
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    setInstallFlowStage('idle');
    lastAnnouncedInstallStageRef.current = 'idle';

    // Check actual conversation status from backend before resetting aiProcessing
    // to avoid flicker when switching to a running conversation
    // 先获取后端状态再重置 aiProcessing，避免切换到运行中的会话时闪烁
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        return;
      }
      const isRunning = res.status === 'running';
      setAiProcessing(isRunning);
      aiProcessingRef.current = isRunning;
    });

    // Eagerly initialize the OpenClaw agent and recover its connection status.
    // The agent may have already emitted 'session_active' before this listener was set up
    // (race condition: agent starts in constructor during conversation.create, before navigation).
    // getRuntime awaits bootstrap, so by the time it returns the agent is fully connected.
    void ipcBridge.openclawConversation.getRuntime
      .invoke({ conversation_id })
      .then((res) => {
        if (res?.success && res.data?.runtime?.hasActiveSession) {
          setOpenClawStatus('session_active');
        }
      })
      .catch(() => {
        // Agent not ready or conversation not found – ignore
      });
  }, [conversation_id]);

  useEffect(() => {
    const handler = (text: string) => {
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  useEffect(() => {
    return ipcBridge.openclawConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // Cancel pending finish timeout if new message arrives
      if (finishTimeoutRef.current && message.type !== 'finish') {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }

      switch (message.type) {
        case 'thought':
          // Auto-recover aiProcessing state if thought arrives after finish
          // 如果 thought 在 finish 后到达，自动恢复 aiProcessing 状态
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'finish':
          {
            // Use delayed reset to detect true end of task
            // 使用延迟重置来检测任务的真正结束
            finishTimeoutRef.current = setTimeout(() => {
              setAiProcessing(false);
              aiProcessingRef.current = false;
              setThought({ subject: '', description: '' });
              finishTimeoutRef.current = null;
            }, 1000);
            if (starOfficeInstallMode && installCompletedInTurnRef.current) {
              installCompletedInTurnRef.current = false;
              setInstallFlowStage('completed');
              announceInstallStage('completed');
              emitAssistantNarration(
                t('conversation.chat.starOffice.flowCompletedNarration', {
                  defaultValue: 'Install and connection flow completed. Thank you. Install mode has exited automatically.',
                })
              );
              exitInstallMode(t('conversation.chat.starOffice.flowCompletedTip', { defaultValue: 'Star Office flow completed. Back to normal mode.' }));
            } else if (starOfficeInstallMode) {
              // Prevent getting stuck at intermediate progress (e.g. 85% detecting)
              // when this turn has finished but no success keyword was emitted.
              setInstallFlowStage('idle');
              emitAssistantNarration(
                t('conversation.chat.starOffice.flowEndedWithoutSuccessNarration', {
                  defaultValue:
                    'This install/repair turn has ended, but connection success was not confirmed yet. Please click the TV icon to verify; if needed, run guided diagnose.',
                })
              );
              exitInstallMode(
                t('conversation.chat.starOffice.flowEndedWithoutSuccessTip', {
                  defaultValue: 'Star Office flow ended. Verify in TV panel or run diagnose if still not connected.',
                }),
              );
            }
            hasContentInTurnRef.current = false;
          }
          break;
        case 'content':
        case 'acp_permission': {
          // Mark that current turn has content output
          hasContentInTurnRef.current = true;
          // Auto-recover aiProcessing state if content arrives after finish
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          setThought({ subject: '', description: '' });
          if (starOfficeInstallMode && message.type === 'content') {
            const text = extractResponseText(message.data);
            let nextStage: InstallFlowStage | null = null;
            if (/unauthorized|占用|冲突|失败|error|排查|troubleshoot|repair/i.test(text)) nextStage = 'troubleshooting';
            else if (/端口|port|127\.0\.0\.1|health|reachable|monitor/i.test(text)) nextStage = 'detecting';
            else if (/启动|start|serve|npm run|pnpm run|backend|frontend|running/i.test(text)) nextStage = 'starting';
            else if (/install|安装|修复|setup|pip|clone|venv/i.test(text)) nextStage = 'installing';
            else if (/检查|检测环境|doctor|preflight|dependency|诊断/i.test(text)) nextStage = 'checking';
            if (nextStage) {
              setInstallFlowStage(nextStage);
              announceInstallStage(nextStage);
            }
            if (/安装完成|安装成功|已启动|连接成功|ready|connected|running|http:\/\/127\.0\.0\.1/i.test(text)) {
              installCompletedInTurnRef.current = true;
            }
          }
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        case 'agent_status': {
          const statusData = message.data as { status: string; message: string };
          setOpenClawStatus(statusData.status);
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        default: {
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage, starOfficeInstallMode, emitAssistantNarration, exitInstallMode, announceInstallStage]);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
      const extra = (res.extra as { starOfficeInstallMode?: boolean; starOfficeInstallModePrimed?: boolean }) || {};
      const shouldKeepInstallMode = Boolean(extra.starOfficeInstallMode) && res.status === 'running';
      setStarOfficeInstallMode(shouldKeepInstallMode);
      if (shouldKeepInstallMode) {
        setInstallFlowStage('checking');
      }

      // Prevent stale install mode from re-appearing when user re-enters conversation.
      if (extra.starOfficeInstallMode && !shouldKeepInstallMode) {
        void ipcBridge.conversation.update.invoke({
          id: conversation_id,
          updates: {
            extra: {
              starOfficeInstallMode: false,
              starOfficeInstallModePrimed: false,
            },
          },
          mergeExtra: true,
        });
      }
    });
  }, [conversation_id]);

  useAddEventListener(
    'staroffice.install-mode.changed',
    ({ conversationId, enabled }) => {
      if (conversationId !== conversation_id) return;
      setStarOfficeInstallMode(enabled);
    },
    [conversation_id]
  );

  useAddEventListener(
    'staroffice.install.request',
    ({ conversationId, text, detectedUrl }) => {
      if (conversationId !== conversation_id) return;
      const runRequest = () => {
        if (!immediateSendRef.current) {
          setContentRef.current(text);
          emitAssistantNarration(
            t('conversation.chat.starOffice.channelNotReady', {
              defaultValue: 'Send channel is not ready yet. I placed the request in the input box; click send and I will continue.',
            })
          );
          return;
        }
        void immediateSendRef.current(text).catch(() => {
          setContentRef.current(text);
          emitAssistantNarration(
            t('conversation.chat.starOffice.autoRunFailed', {
              defaultValue: 'Auto-run failed. I placed the request in the input box; click send and I will continue.',
            })
          );
        });
      };

      const hasLocal = Boolean(detectedUrl);
      if (hasLocal) {
        emitWorkflowTip(
          t('conversation.chat.starOffice.helperReadyDiagnose', {
            defaultValue: 'Star Office helper is ready. Running connection diagnosis / guidance in this conversation.',
          })
        );
        emitAssistantNarration(
          t('conversation.chat.starOffice.detectedAndGuide', {
            defaultValue: 'Detected local Star Office service ({{url}}). I will now guide connection and usage directly.',
            url: detectedUrl || '',
          })
        );
        runRequest();
        return;
      }

      setPendingInstallPrompt(text);
      setAwaitingInstallConsent(true);
      setInstallFlowStage('consent');
      emitWorkflowTip(
        t('conversation.chat.starOffice.helperReadyConsent', {
          defaultValue: 'Star Office helper is ready. Waiting for your consent to auto-install.',
        })
      );
      emitAssistantCard(
        [
          t('conversation.chat.starOffice.cardTitle', { defaultValue: '## 📺 Star Office UI Assistant' }),
          '',
          t('conversation.chat.starOffice.cardNotDetected', { defaultValue: '> No Star Office service was detected on this machine.' }),
          '',
          t('conversation.chat.starOffice.cardWhatIsTitle', { defaultValue: '**What is Star Office?**' }),
          t('conversation.chat.starOffice.cardWhatIsBullet1', { defaultValue: '- A local UI project that visualizes OpenClaw conversations' }),
          t('conversation.chat.starOffice.cardWhatIsBullet2', { defaultValue: '- You can view real-time status and live interaction in the TV panel' }),
          '',
          t('conversation.chat.starOffice.cardHelpTitle', { defaultValue: '**What can I do for you?**' }),
          t('conversation.chat.starOffice.cardHelpBullet1', { defaultValue: '- Auto install/repair environment' }),
          t('conversation.chat.starOffice.cardHelpBullet2', { defaultValue: '- Auto start service and detect port' }),
          t('conversation.chat.starOffice.cardHelpBullet3', { defaultValue: '- Guide one-click connection to Aion live monitor' }),
          '',
          '```text',
          'Install flow: detect -> install/repair -> start -> check port -> open live monitor',
          '```',
          '',
          t('conversation.chat.starOffice.cardProjectLink', {
            defaultValue: 'Project (docs/screenshots): https://github.com/ringhyacinth/Star-Office-UI',
          }),
          '',
          t('conversation.chat.starOffice.cardConsentApprove', {
            defaultValue: 'If you agree to start one-stop install now, reply: `Agree` (or `Continue`).',
          }),
          t('conversation.chat.starOffice.cardConsentReject', {
            defaultValue: 'If not for now, reply: `Cancel`.',
          }),
        ].join('\n')
      );
    },
    [conversation_id, emitAssistantCard, emitAssistantNarration, t]
  );

  const handleExitStarOfficeInstallMode = useCallback(() => {
    void (async () => {
      // Stop ongoing OpenClaw turn immediately, then exit install mode.
      try {
        await ipcBridge.conversation.stop.invoke({ conversation_id });
      } finally {
        if (finishTimeoutRef.current) {
          clearTimeout(finishTimeoutRef.current);
          finishTimeoutRef.current = null;
        }
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        setAwaitingInstallConsent(false);
        setPendingInstallPrompt(null);
        installCompletedInTurnRef.current = false;
        setInstallFlowStage('idle');
        exitInstallMode(
          t('conversation.chat.starOffice.flowStoppedTip', {
            defaultValue: 'Stopped Star Office install flow. Conversation is back to normal mode.',
          })
        );
      }
    })();
  }, [conversation_id, exitInstallMode, t]);

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile((prev) => [...prev, ...filePaths]);
    },
    [setUploadFile]
  );

  useAddEventListener('openclaw-gateway.selected.file', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      setAtPath(items);
    }, 10);
  });

  useAddEventListener('openclaw-gateway.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    }, 10);
  });

  const sendOpenClawMessage = useCallback(
    async (message: string) => {
      const runtimeOk = await validateRuntimeMismatch(conversation_id);
      if (!runtimeOk) return;

      const msg_id = uuid();
      // Content is already cleared by the shared SendBox component (setInput(''))
      // before calling onSend — no need to clear again here.
      emitter.emit('openclaw-gateway.selected.file.clear');
      const currentAtPath = [...atPath];
      const currentUploadFile = [...uploadFile];
      setAtPath([]);
      setUploadFile([]);

      const filePaths = [...currentUploadFile, ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path))];
      const displayMessage = buildDisplayMessage(message, filePaths, workspacePath);

      const userMessage: TMessage = {
        id: msg_id,
        msg_id,
        conversation_id,
        type: 'text',
        position: 'right',
        content: { content: displayMessage },
        createdAt: Date.now(),
      };
      addOrUpdateMessage(userMessage, true);
      setAiProcessing(true);
      aiProcessingRef.current = true;
      try {
        const atPathStrings = currentAtPath.map((item) => (typeof item === 'string' ? item : item.path));
        await ipcBridge.openclawConversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files: [...currentUploadFile, ...atPathStrings],
        });
        void checkAndUpdateTitle(conversation_id, message);
        emitter.emit('chat.history.refresh');
      } catch (error) {
        // Only reset aiProcessing on error, normal flow is reset by 'finish' event
        setAiProcessing(false);
        aiProcessingRef.current = false;
        throw error;
      }
    },
    [conversation_id, atPath, uploadFile, workspacePath, addOrUpdateMessage, checkAndUpdateTitle, setAtPath, setUploadFile]
  );

  const onSendHandler = async (message: string) => {
    if (awaitingInstallConsent && pendingInstallPrompt) {
      emitLocalUserMessage(message);
      if (isInstallConsentApproved(message)) {
        const requestText = pendingInstallPrompt;
        setAwaitingInstallConsent(false);
        setPendingInstallPrompt(null);
        setInstallFlowStage('checking');
        announceInstallStage('checking');
        emitAssistantNarration(
          t('conversation.chat.starOffice.consentApproved', {
            defaultValue: 'Consent received. I am now starting auto install/repair/start flow.',
          })
        );
        void ipcBridge.conversation.update.invoke({
          id: conversation_id,
          updates: {
            extra: {
              starOfficeInstallMode: true,
              starOfficeInstallModePrimed: false,
            },
          },
          mergeExtra: true,
        });
        emitter.emit('staroffice.install-mode.changed', { conversationId: conversation_id, enabled: true });
        void sendOpenClawMessage(requestText).catch(() => {
          setContentRef.current(requestText);
          emitAssistantNarration(
            t('conversation.chat.starOffice.autoRunFailed', {
              defaultValue: 'Auto-run failed. I placed the request in the input box; click send and I will continue.',
            })
          );
        });
        return;
      }
      if (isInstallConsentRejected(message)) {
        setAwaitingInstallConsent(false);
        setPendingInstallPrompt(null);
        setInstallFlowStage('idle');
        lastAnnouncedInstallStageRef.current = 'idle';
        emitAssistantNarration(
          t('conversation.chat.starOffice.consentRejected', {
            defaultValue: 'Okay, this install flow is cancelled. You can tap the TV icon anytime to start again.',
          })
        );
        return;
      }
      emitAssistantNarration(
        t('conversation.chat.starOffice.waitingConsent', {
          defaultValue: 'I am waiting for your confirmation. Please reply: `Agree` (or `Continue`) / `Cancel`.',
        })
      );
      return;
    }

    await sendOpenClawMessage(message);
  };

  useEffect(() => {
    immediateSendRef.current = sendOpenClawMessage;
    return () => {
      immediateSendRef.current = null;
    };
  }, [sendOpenClawMessage]);

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  // Handle initial message from guid page
  useEffect(() => {
    if (!conversation_id || !openclawStatus) return;
    if (openclawStatus !== 'session_active') return;

    const storageKey = `openclaw_initial_message_${conversation_id}`;
    const processedKey = `openclaw_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;

      try {
        const runtimeOk = await validateRuntimeMismatch(conversation_id);
        if (!runtimeOk) return;

        sessionStorage.setItem(processedKey, 'true');
        setAiProcessing(true);
        aiProcessingRef.current = true;
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
        const loading_id = uuid();
        const initialDisplayMessage = buildDisplayMessage(input, files, workspacePath);

        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: initialDisplayMessage },
          createdAt: Date.now(),
        };
        addOrUpdateMessage(userMessage, true);

        await ipcBridge.openclawConversation.sendMessage.invoke({ input: initialDisplayMessage, msg_id, conversation_id, files, loading_id });
        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch (err) {
        sessionStorage.removeItem(processedKey);
        // Only reset aiProcessing on error, normal flow is reset by 'finish' event
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    };

    const timer = setTimeout(() => {
      processInitialMessage().catch((error) => {
        console.error('Failed to process initial message:', error);
      });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, openclawStatus, addOrUpdateMessage]);

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      // Clear pending finish timeout
      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }

      setAiProcessing(false);
      aiProcessingRef.current = false;
      setThought({ subject: '', description: '' });
      hasContentInTurnRef.current = false;
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={aiProcessing} onStop={handleStop} />
      {starOfficeInstallMode ? (
        <div className='mb-4px flex items-center justify-between gap-10px rounded-full border border-[rgb(var(--arcoblue-3))] bg-[rgba(var(--arcoblue-1),0.6)] px-10px py-6px'>
          <div className='min-w-0 flex items-center gap-8px text-12px text-[rgb(var(--arcoblue-7))]'>
            <span className='truncate'>
              {t('conversation.chat.starOffice.installModeTitle', { defaultValue: 'Star Office install mode' })} · {installFlowMeta.label}
            </span>
            <span className='text-[11px] text-t-secondary'>{installFlowMeta.percent}%</span>
          </div>
          <div className='shrink-0'>
            <Button size='mini' type='text' onClick={handleExitStarOfficeInstallMode}>
              {t('conversation.chat.starOffice.stop', { defaultValue: 'Stop' })}
            </Button>
          </div>
        </div>
      ) : null}

      <SendBox
        value={content}
        onChange={setContent}
        loading={aiProcessing}
        disabled={false}
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: 'OpenClaw',
                defaultValue: `Send message to OpenClaw...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={<Button type='secondary' shape='circle' icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />} onClick={openFileSelector} />}
        prefix={
          <>
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />
                ))}
                {atPath.map((item) => {
                  const isFile = typeof item === 'string' ? true : item.isFile;
                  const path = typeof item === 'string' ? item : item.path;
                  if (isFile) {
                    return (
                      <FilePreview
                        key={path}
                        path={path}
                        onRemove={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? v !== path : v.path !== path));
                          emitter.emit('openclaw-gateway.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('openclaw-gateway.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
      ></SendBox>
    </div>
  );
};

export default OpenClawSendBox;
