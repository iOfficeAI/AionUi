/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, ToolProgress } from '@/common/chat/chatLib';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Card, Tag } from '@arco-design/web-react';
import { createTwoFilesPatch } from 'diff';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownView from '@renderer/components/Markdown';

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: 'Pending' };
      case 'in_progress':
        return { color: 'orange', text: 'In Progress' };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

// Diff content display as a separate component to ensure hooks are called unconditionally
const DiffContentView: React.FC<{ old_text: string; new_text: string; path: string }> = ({
  old_text,
  new_text,
  path,
}) => {
  const display_name = path.split(/[/\\]/).pop() || path || 'Unknown file';
  const formattedDiff = useMemo(
    () => createTwoFilesPatch(display_name, display_name, old_text, new_text, '', '', { context: 3 }),
    [display_name, old_text, new_text]
  );
  const fileInfo = useMemo(() => parseDiff(formattedDiff, display_name), [formattedDiff, display_name]);
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({
    diffText: formattedDiff,
    display_name,
    file_path: path || display_name,
  });

  return (
    <FileChangesPanel
      title={display_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const ContentView: React.FC<{ content: IMessageAcpToolCall['content']['update']['content'][0] }> = ({ content }) => {
  if (content.type === 'diff') {
    return (
      <DiffContentView old_text={content.old_text || ''} new_text={content.new_text || ''} path={content.path || ''} />
    );
  }

  // 处理 content 类型，包含 text 内容
  if (content.type === 'content' && content.content && content.content.type === 'text' && content.content.text) {
    return (
      <div className='mt-3'>
        <div className='bg-1 p-3 rounded border overflow-hidden'>
          <div className='overflow-x-auto break-words'>
            <MarkdownView>{content.content.text}</MarkdownView>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * Streaming tool-input arguments (model constructing JSON before execution).
 * Shows a "Constructing arguments…" header and a monospace block streaming the
 * partial JSON. Best-effort pretty-print on `ended`; raw text otherwise.
 *
 * Capped at 4 KB to avoid layout thrash on `write` calls with very long
 * bodies; the final input is rendered atomically once `ended` arrives.
 */
const InputStreamingView: React.FC<{ streaming: NonNullable<IMessageAcpToolCall['content']['inputStreaming']> }> = ({
  streaming,
}) => {
  const { t } = useTranslation();
  const ended = streaming.phase === 'ended';
  const display = useMemo(() => {
    const raw = streaming.partial ?? '';
    const capped = raw.length > 4096 ? `${raw.slice(0, 4096)}\n…` : raw;
    if (!ended) return capped;
    try {
      return JSON.stringify(JSON.parse(capped), null, 2);
    } catch {
      return capped;
    }
  }, [streaming.partial, ended]);

  return (
    <div className='mt-2'>
      <div className='flex items-center gap-2 text-xs text-t-secondary'>
        {ended ? null : <span className='inline-block w-2 h-2 rounded-full bg-warning animate-pulse' />}
        <span>
          {ended ? t('messages.remoteToolInput.finalArguments') : t('messages.remoteToolInput.constructing')}
          {streaming.toolName ? ` · ${streaming.toolName}` : ''}
        </span>
      </div>
      <pre className='bg-1 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all'>{display}</pre>
    </div>
  );
};

/**
 * Live tool-progress block. Per-family renderers picked by the discriminator:
 *   - bash: terminal block with stdout/stderr (cap 200 lines visible),
 *   - grep/glob: counter,
 *   - read/write: byte progress (bar if `bytesTotal` known),
 *   - mcp: one-line `step · percent · message` summary,
 *   - unknown: stringified raw JSON.
 */
const ProgressView: React.FC<{ progress: ToolProgress }> = ({ progress }) => {
  const { t } = useTranslation();
  if (progress.kind === 'bash') {
    const stdout = progress.stdoutChunk ?? '';
    const stderr = progress.stderrChunk ?? '';
    const lines = (stdout + (stderr ? `\n${stderr}` : '')).split('\n');
    const visible = lines.length > 200 ? lines.slice(-200).join('\n') : lines.join('\n');
    return (
      <div className='mt-2'>
        <div className='text-xs text-t-secondary mb-1'>{t('messages.remoteToolProgress.terminal')}</div>
        <pre className='bg-black text-white font-mono text-xs p-2 rounded overflow-x-auto whitespace-pre max-h-60 overflow-y-auto'>
          {visible || t('messages.remoteToolProgress.terminalEmpty')}
          {typeof progress.exitCode === 'number' ? `\n[exit ${progress.exitCode}]` : ''}
        </pre>
      </div>
    );
  }
  if (progress.kind === 'grep' || progress.kind === 'glob') {
    return (
      <div className='mt-2 text-xs text-t-secondary'>
        {t('messages.remoteToolProgress.scanned', {
          scanned: progress.filesScanned ?? 0,
          matches: progress.matches ?? 0,
        })}
      </div>
    );
  }
  if (progress.kind === 'read' || progress.kind === 'write') {
    const pct =
      progress.bytesTotal && progress.bytesTotal > 0
        ? Math.min(100, Math.round(((progress.bytesProcessed ?? 0) * 100) / progress.bytesTotal))
        : null;
    return (
      <div className='mt-2 text-xs text-t-secondary'>
        {pct !== null
          ? t('messages.remoteToolProgress.bytes', {
              processed: progress.bytesProcessed ?? 0,
              total: progress.bytesTotal,
              pct,
            })
          : t('messages.remoteToolProgress.bytesProcessed', { processed: progress.bytesProcessed ?? 0 })}
      </div>
    );
  }
  if (progress.kind === 'mcp') {
    const parts: string[] = [];
    if (progress.step) parts.push(progress.step);
    if (typeof progress.percent === 'number') parts.push(`${progress.percent}%`);
    if (progress.message) parts.push(progress.message);
    return (
      <div className='mt-2 text-xs text-t-secondary'>
        {t('messages.remoteToolProgress.mcpPrefix')} {parts.join(' · ') || t('messages.remoteToolProgress.mcpUnknown')}
      </div>
    );
  }
  // Unknown / unstructured: dump as JSON. Type narrowing through the chain
  // above lands here only when `kind === 'unknown'`, but we cast defensively in
  // case TS can't see through React-return-flow.
  const raw = (progress as { raw?: unknown }).raw ?? progress;
  return (
    <div className='mt-2'>
      <pre className='bg-1 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all'>
        {JSON.stringify(raw, null, 2)}
      </pre>
    </div>
  );
};

const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall }> = ({ message }) => {
  const { t } = useTranslation();
  const { content } = message;
  if (!content?.update) {
    return null;
  }
  const { update, parentSessionId, inputStreaming, progress } = content;
  const { tool_call_id, kind, title, status, rawInput, content: diffContent } = update;

  const getKindDisplayName = (kind: string) => {
    switch (kind) {
      case 'edit':
        return 'File Edit';
      case 'read':
        return 'File Read';
      case 'execute':
        return 'Shell Command';
      default:
        return kind;
    }
  };

  // Sub-agent attribution: when the call originated from a child session, add a
  // left border and a small "Sub-agent" tag so the user can tell at a glance.
  const isSubagent = Boolean(parentSessionId);

  return (
    <Card className={`w-full mb-2 ${isSubagent ? 'border-l-4 border-l-primary' : ''}`} size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            {isSubagent && (
              <Tag color='arcoblue' size='small'>
                {t('messages.remoteSubagent.tag')}
              </Tag>
            )}
            <span className='font-medium text-t-primary'>{title || getKindDisplayName(kind)}</span>
            {status ? <StatusTag status={status} /> : null}
          </div>
          {inputStreaming && <InputStreamingView streaming={inputStreaming} />}
          {!inputStreaming && rawInput && (
            <div className='text-sm'>
              {typeof rawInput === 'string' ? (
                <MarkdownView>{`\`\`\`\n${rawInput}\n\`\`\``}</MarkdownView>
              ) : (
                <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>{JSON.stringify(rawInput, null, 2)}</pre>
              )}
            </div>
          )}
          {progress && <ProgressView progress={progress} />}
          {diffContent && diffContent.length > 0 && (
            <div>
              {diffContent.map((content, index) => (
                <ContentView key={index} content={content} />
              ))}
            </div>
          )}
          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {tool_call_id}</div>
        </div>
      </div>
    </Card>
  );
};

export default MessageAcpToolCall;
