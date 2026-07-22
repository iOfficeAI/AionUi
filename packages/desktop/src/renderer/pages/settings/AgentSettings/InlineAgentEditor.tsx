/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomAgentAdvancedOverrides } from '@/common/types/platform/acpTypes';
import type { AgentMetadata, ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { acpConversation, dialog, fs } from '@/common/adapter/ipcBridge';
import { useAssistantList } from '@/renderer/hooks/assistant';
import { resolveAvatarImageSrc } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import { Alert, Avatar, Button, Collapse, Input, Message, Typography } from '@arco-design/web-react';
import { CheckOne, CloseOne } from '@icon-park/react';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { uuid } from '@/common/utils';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import EnvVarEditor, { type EnvVarRow } from './EnvVarEditor';

/**
 * Longest edge (in px) a custom-agent avatar image is downscaled to before
 * being re-encoded as a JPEG data URL. Custom agents persist their avatar in
 * the `icon` TEXT column (there is no `/api/agents/{id}/avatar` route), so we
 * keep the base64 payload small while staying crisp at the sizes the UI
 * renders (≤48px in the editor, ≤32px in lists).
 */
const AVATAR_MAX_EDGE = 256;
const AVATAR_JPEG_QUALITY = 0.85;

/**
 * Downscale an image data URL so it fits within `maxEdge` square and re-encode
 * it as a JPEG data URL. SVGs are returned untouched — `<canvas>` cannot
 * rasterize SVG markup, and SVGs are already tiny. Rejects (→ original) if the
 * image fails to decode; the caller keeps the previous avatar in that case.
 */
async function downscaleAvatarDataUrl(
  sourceDataUrl: string,
  maxEdge = AVATAR_MAX_EDGE,
  quality = AVATAR_JPEG_QUALITY
): Promise<string> {
  if (sourceDataUrl.startsWith('data:image/svg')) return sourceDataUrl;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const { width, height } = image;
      const longest = Math.max(width, height);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        // toDataURL can throw on tainted canvases; fall back to the original.
        resolve(sourceDataUrl);
      }
    };
    image.onerror = () => resolve(sourceDataUrl);
    image.src = sourceDataUrl;
  });
}

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

export interface EnvVar {
  id: string;
  key: string;
  value: string;
}

/**
 * Payload emitted by {@link InlineAgentEditor} on save. Matches the backend
 * `CustomAgentUpsertRequest` body (sans `id`, which LocalAgents reattaches
 * when calling `updateCustomAgent`). Keeping this shape aligned with the
 * IPC contract avoids a legacy intermediate conversion step.
 */
export interface CustomAgentDraft {
  /** Preserved across edits; new drafts receive a fresh uuid. */
  id: string;
  name: string;
  /**
   * User-picked avatar — backend field name is `icon`. May be:
   *   - a single emoji glyph,
   *   - a backend-relative URL (e.g. `/api/assistants/{id}/avatar`, from the
   *     built-in avatar gallery), or
   *   - a `data:` URL (uploaded image, client-side downscaled to ≤256px).
   */
  icon?: string;
  /** Spawn command for the CLI. */
  command: string;
  enabled: boolean;
  args?: string[];
  env?: Array<{ name: string; value: string; description?: string }>;
  advanced?: CustomAgentAdvancedOverrides;
}

interface InlineAgentEditorProps {
  agent?: AgentMetadata | ManagedAgent | null;
  onSave: (agent: CustomAgentDraft) => void;
  onCancel: () => void;
}

/** Parse a space-separated argument string into an array, respecting quotes. */
export function parseArgsString(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const char of input) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

export function envVarsToObject(vars: EnvVar[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const v of vars) {
    const key = v.key.trim();
    if (key) obj[key] = v.value;
  }
  return obj;
}

export function objectToEnvVars(obj: Record<string, string> | undefined): EnvVar[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  return Object.entries(obj).map(([key, value]) => ({ id: uuid(), key, value }));
}

/** Convert the backend `AgentMetadata.env` array form into the flat record the
 *  form's `{key,value}` rows expect. */
function agentEnvToRecord(
  entries: Array<{ name: string; value: string }> | undefined
): Record<string, string> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (e.name) out[e.name] = e.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Rebuild the editor's `advanced` override bag from an `AgentMetadata` row. */
function agentToAdvanced(agent: AgentMetadata | ManagedAgent): CustomAgentAdvancedOverrides {
  const advanced: CustomAgentAdvancedOverrides = {};
  if (agent.yolo_id) advanced.yolo_id = agent.yolo_id;
  if (agent.native_skills_dirs && agent.native_skills_dirs.length > 0) {
    advanced.native_skills_dirs = agent.native_skills_dirs;
  }
  if (agent.behavior_policy && Object.keys(agent.behavior_policy).length > 0) {
    advanced.behavior_policy = agent.behavior_policy;
  }
  if (agent.description) advanced.description = agent.description;
  return advanced;
}

const InlineAgentEditor: React.FC<InlineAgentEditorProps> = ({ agent, onSave, onCancel }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  const [avatar, setAvatar] = useState('🤖');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsString, setArgsString] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  // `advanced` mirrors the backend `CustomAgentAdvancedOverrides` schema
  // 1:1. The JSON panel below renders this object — never the basic form
  // fields — so new keys on the backend only need to be added here to
  // surface in the UI.
  const [advanced, setAdvanced] = useState<CustomAgentAdvancedOverrides>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const isJsonEditingRef = useRef(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testErrorDetail, setTestErrorDetail] = useState('');
  const runtimeScopeId = useMemo(() => agent?.id || uuid(), [agent?.id]);

  // Built-in avatar gallery: reuse the same source as the assistant editor —
  // builtin assistants that ship an image avatar (`/api/assistants/{id}/avatar`).
  // Centralizing this here avoids a new asset directory and keeps the gallery
  // visually consistent across both editors.
  const { assistants: builtinAssistants, localeKey } = useAssistantList();
  const builtinAvatarOptions = useMemo(
    () =>
      builtinAssistants
        .filter((assistant) => assistant.source === 'builtin' && assistant.avatar?.startsWith('/api/assistants/'))
        .map((assistant) => {
          const src = resolveAvatarImageSrc(assistant.avatar);
          if (!src) return null;
          return {
            id: assistant.id,
            label: assistant.name_i18n?.[localeKey] || assistant.name,
            src,
          };
        })
        .filter((option): option is { id: string; label: string; src: string } => option !== null),
    [builtinAssistants, localeKey]
  );

  // Resolve the current `avatar` into an image URL / emoji for the preview.
  // Mirrors the logic every downstream consumer (AgentCard, guid pill, …)
  // already runs via resolveAgentAvatar, so what the editor shows matches the
  // final rendering everywhere else.
  const avatarPreview = useMemo(() => resolveAssistantAvatar(avatar), [avatar]);

  const handlePickAvatarImage = useCallback(async () => {
    try {
      const selectedFiles = await dialog.showOpen.invoke({
        properties: ['openFile'],
        filters: [
          {
            name: t('settings.assistantAvatarImageFiles', { defaultValue: 'Image files' }),
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
          },
        ],
      });
      const pickedPath = selectedFiles?.[0];
      if (!pickedPath) return;
      // The backend reads the file and returns a `data:` URL; we then shrink
      // it client-side so the persisted `icon` value stays small.
      const rawDataUrl = await fs.getImageBase64.invoke({ path: pickedPath });
      if (!rawDataUrl) return;
      const resized = await downscaleAvatarDataUrl(rawDataUrl);
      setAvatar(resized);
    } catch (error) {
      console.error('Failed to pick custom agent avatar image:', error);
      Message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  }, [t]);

  // Canonical empty shape shown when the user has not filled anything yet.
  // Keep keys in sync with CustomAgentAdvancedOverrides.
  const buildJsonFromAdvanced = useCallback((advancedVal: CustomAgentAdvancedOverrides) => {
    const skeleton: CustomAgentAdvancedOverrides = {
      yolo_id: advancedVal.yolo_id ?? '',
      native_skills_dirs: advancedVal.native_skills_dirs ?? [],
      behavior_policy: advancedVal.behavior_policy ?? { supports_side_question: false },
      description: advancedVal.description ?? '',
    };
    return JSON.stringify(skeleton, null, 2);
  }, []);

  useEffect(() => {
    if (!isJsonEditingRef.current) {
      setJsonInput(buildJsonFromAdvanced(advanced));
    }
  }, [advanced, buildJsonFromAdvanced]);

  useEffect(() => {
    setTestStatus('idle');
    setTestErrorDetail('');
    setJsonError('');
    isJsonEditingRef.current = false;
    if (agent) {
      setAvatar(agent.icon || '🤖');
      setName(agent.name || '');
      setCommand(agent.command || '');
      setArgsString(agent.args?.join(' ') || '');
      setEnvVars(objectToEnvVars(agentEnvToRecord(agent.env)));
      setAdvanced(agentToAdvanced(agent));
    } else {
      setAvatar('🤖');
      setName('');
      setCommand('');
      setArgsString('');
      setEnvVars([]);
      setAdvanced({});
    }
    setShowAdvanced(false);
  }, [agent]);

  const jsonEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJsonChange = useCallback((value: string) => {
    isJsonEditingRef.current = true;
    if (jsonEditTimerRef.current) clearTimeout(jsonEditTimerRef.current);
    setJsonInput(value);
    try {
      const parsed: unknown = JSON.parse(value);
      setJsonError('');
      if (parsed && typeof parsed === 'object') {
        const next: CustomAgentAdvancedOverrides = {};
        const p = parsed as Record<string, unknown>;
        if (typeof p.yolo_id === 'string' && p.yolo_id.trim()) next.yolo_id = p.yolo_id;
        if (Array.isArray(p.native_skills_dirs)) {
          const dirs = p.native_skills_dirs.filter((x): x is string => typeof x === 'string');
          if (dirs.length > 0) next.native_skills_dirs = dirs;
        }
        if (p.behavior_policy && typeof p.behavior_policy === 'object') {
          const bp = p.behavior_policy as Record<string, unknown>;
          if (typeof bp.supports_side_question === 'boolean') {
            next.behavior_policy = { supports_side_question: bp.supports_side_question };
          }
        }
        if (typeof p.description === 'string' && p.description.trim()) next.description = p.description;
        setAdvanced(next);
      }
    } catch {
      setJsonError('Invalid JSON');
    }
    jsonEditTimerRef.current = setTimeout(() => {
      isJsonEditingRef.current = false;
      jsonEditTimerRef.current = null;
    }, 500);
  }, []);

  const handleNameChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setName(v);
  }, []);
  const handleCommandChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setCommand(v);
  }, []);
  const handleArgsChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setArgsString(v);
  }, []);

  const handleEnvVarsChange = useCallback((rows: EnvVarRow[]) => {
    isJsonEditingRef.current = false;
    setEnvVars(rows);
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestErrorDetail('');
    try {
      const parsedArgs = parseArgsString(argsString);
      const envObj = envVarsToObject(envVars);
      const result = await acpConversation.testCustomAgent.invoke({
        command: command.trim(),
        acp_args: parsedArgs.length > 0 ? parsedArgs : undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        runtime_scope_id: runtimeScopeId,
      });
      switch (result.step) {
        case 'success':
          setTestStatus('success');
          setTestErrorDetail('');
          break;
        case 'fail_cli':
          setTestStatus('fail_cli');
          setTestErrorDetail(result.error || '');
          break;
        case 'fail_acp':
          setTestStatus('fail_acp');
          setTestErrorDetail(result.error || '');
          break;
      }
    } catch (error) {
      setTestStatus('fail_cli');
      setTestErrorDetail(error instanceof Error ? error.message : String(error));
    }
  }, [command, argsString, envVars, runtimeScopeId]);

  const handleSubmit = useCallback(() => {
    const parsedArgs = parseArgsString(argsString);
    const envObj = envVarsToObject(envVars);
    // Only forward `advanced` when at least one override is set — an
    // empty object would still round-trip through the backend as `{}`
    // and reset columns the user never touched.
    const hasAdvanced =
      Boolean(advanced.yolo_id) ||
      Boolean(advanced.description) ||
      (advanced.native_skills_dirs && advanced.native_skills_dirs.length > 0) ||
      Boolean(advanced.behavior_policy && Object.keys(advanced.behavior_policy).length > 0);
    const envEntries = Object.entries(envObj).map(([envName, value]) => ({ name: envName, value }));
    const draft: CustomAgentDraft = {
      id: agent?.id || uuid(),
      name: name.trim() || 'Custom Agent',
      icon: avatar,
      command: command.trim(),
      enabled: agent?.enabled !== false,
      args: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: envEntries.length > 0 ? envEntries : undefined,
      advanced: hasAdvanced ? advanced : undefined,
    };
    onSave(draft);
  }, [agent, name, avatar, command, argsString, envVars, advanced, onSave]);

  const isSubmitDisabled = !name.trim() || !command.trim();
  const isTestDisabled = !command.trim() || testStatus === 'testing';
  const fieldLabelClassName = 'mb-6px block text-13px font-medium text-t-primary';
  const fieldHelpClassName = 'mt-4px block text-12px leading-18px text-t-tertiary';

  return (
    <div className='flex flex-col gap-16px pt-8px pb-20px'>
      {/* Avatar + Name row */}
      <div className='flex items-center gap-12px'>
        <div className='flex shrink-0 flex-col items-center gap-6px'>
          <EmojiPicker
            value={avatar}
            builtinAvatars={builtinAvatarOptions}
            onChange={(next) => setAvatar(next)}
            placement='br'
          >
            <div className='cursor-pointer'>
              <Avatar
                size={48}
                shape='square'
                style={{
                  backgroundColor: avatarPreview.kind === 'image' ? 'transparent' : 'var(--color-fill-3)',
                  fontSize: 24,
                  borderRadius: 12,
                }}
              >
                {avatarPreview.kind === 'image' ? (
                  <img src={avatarPreview.value} alt='' className='h-full w-full object-cover' />
                ) : avatarPreview.kind === 'emoji' ? (
                  avatarPreview.value
                ) : (
                  '🤖'
                )}
              </Avatar>
            </div>
          </EmojiPicker>
          <Button
            type='outline'
            size='mini'
            data-testid='btn-agent-avatar-upload'
            className='!h-auto !w-full !rounded-8px !border-[var(--color-border-2)] !px-6px !py-1px !text-11px'
            onClick={() => void handlePickAvatarImage()}
          >
            {t('settings.assistantAvatarUploadImage', { defaultValue: 'Upload image' })}
          </Button>
        </div>
        <div className='min-w-0 flex-1'>
          <Typography.Text className={fieldLabelClassName}>{t('settings.agentDisplayName')}</Typography.Text>
          <Input
            size='large'
            value={name}
            onChange={handleNameChange}
            placeholder={t('settings.agentNamePlaceholder')}
          />
        </div>
      </div>

      {/* Command */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.commandLabel')}</Typography.Text>
        <Input
          size='large'
          value={command}
          onChange={handleCommandChange}
          placeholder={t('settings.commandPlaceholder')}
        />
        <Typography.Text type='secondary' className={fieldHelpClassName}>
          {t('settings.commandHelp')}
        </Typography.Text>
      </div>

      {/* Arguments */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.argsLabel')}</Typography.Text>
        <Input
          size='large'
          value={argsString}
          onChange={handleArgsChange}
          placeholder={t('settings.argsPlaceholder')}
        />
        <Typography.Text type='secondary' className={fieldHelpClassName}>
          {t('settings.argsHelp')}
        </Typography.Text>
      </div>

      {/* Environment Variables */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.envLabel')}</Typography.Text>
        <EnvVarEditor value={envVars} onChange={handleEnvVarsChange} />
      </div>

      {/* Test Connection */}
      <div>
        <Button
          long
          type='outline'
          disabled={isTestDisabled}
          onClick={handleTestConnection}
          loading={testStatus === 'testing'}
          className='!rounded-10px'
        >
          {testStatus === 'testing' ? t('settings.testConnectionTesting') : t('settings.testConnectionBtn')}
        </Button>
        {testStatus === 'success' && (
          <Alert
            className='mt-10px'
            type='success'
            icon={<CheckOne theme='filled' size={16} />}
            content={t('settings.testConnectionSuccess')}
          />
        )}
        {testStatus === 'fail_cli' && (
          <Alert
            className='mt-10px'
            type='error'
            icon={<CloseOne theme='filled' size={16} />}
            content={
              <div className='flex flex-col gap-4px'>
                <span>{t('settings.testConnectionFailCli')}</span>
                {testErrorDetail ? <span className='text-12px break-all opacity-80'>{testErrorDetail}</span> : null}
              </div>
            }
          />
        )}
        {testStatus === 'fail_acp' && (
          <Alert
            className='mt-10px'
            type='warning'
            icon={<CloseOne theme='filled' size={16} />}
            content={
              <div className='flex flex-col gap-4px'>
                <span>{t('settings.testConnectionFailAcp')}</span>
                {testErrorDetail ? <span className='text-12px break-all opacity-80'>{testErrorDetail}</span> : null}
              </div>
            }
          />
        )}
      </div>

      {/* Advanced JSON Editor */}
      <div className='overflow-hidden rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)]'>
        <Collapse
          activeKey={showAdvanced ? ['advanced'] : []}
          onChange={(_key, keys) => setShowAdvanced(keys.includes('advanced'))}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Collapse.Item
            name='advanced'
            header={<span className='text-13px text-t-secondary'>{t('settings.advancedMode')}</span>}
          >
            <div className='pt-8px'>
              <CodeMirror
                value={jsonInput}
                height='200px'
                theme={theme}
                extensions={[json()]}
                onChange={handleJsonChange}
                basicSetup={{ lineNumbers: true, foldGutter: true, dropCursor: false, allowMultipleSelections: false }}
                style={{
                  fontSize: '12px',
                  border: jsonError ? '1px solid var(--danger)' : '1px solid var(--color-border-2)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
                className='[&_.cm-editor]:rounded-[10px]'
              />
              {jsonError && <div className='mt-4px text-xs text-danger'>{jsonError}</div>}
            </div>
          </Collapse.Item>
        </Collapse>
      </div>

      {/* Actions */}
      <div className='flex justify-end gap-10px pt-4px'>
        <Button className='!rounded-10px !px-20px' onClick={onCancel}>
          {t('common.cancel') || 'Cancel'}
        </Button>
        <Button type='primary' disabled={isSubmitDisabled} onClick={handleSubmit} className='!rounded-10px !px-20px'>
          {t('common.save') || 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default InlineAgentEditor;
