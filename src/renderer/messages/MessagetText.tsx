/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Message, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/clipboard';
import CollapsibleContent from '../components/CollapsibleContent';
import FilePreview from '../components/FilePreview';
import HorizontalFileList from '../components/HorizontalFileList';
import MarkdownView from '../components/Markdown';
import { stripThinkTags, hasThinkTags } from '../utils/thinkTagFilter';
import MessageCronBadge from './MessageCronBadge';

const STAR_OFFICE_CARD_MARKER = '[STAROFFICE_CARD]';
const INTERNAL_RULE_BLOCK_PATTERNS: Array<RegExp> = [
  /\[Assistant Rules[\s\S]*?\[User Request\]\s*/gi,
  /\[INTERNAL STAR OFFICE MODE[\s\S]*?\[User Request\]\s*/gi,
  /\[Available Skills\][\s\S]*?(?=\n## |\n### |\n[A-Z\u4e00-\u9fa5].*|$)/gi,
  /Skill:\s*star-office-helper[\s\S]*?(?=\n## |\n### |\n[A-Z\u4e00-\u9fa5].*|$)/gi,
];

const sanitizeInternalRuleLeakage = (content: string) => {
  let sanitized = content;
  for (const pattern of INTERNAL_RULE_BLOCK_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.trim();
};

const parseFileMarker = (content: string) => {
  const markerIndex = content.indexOf(AIONUI_FILES_MARKER);
  if (markerIndex === -1) {
    return { text: content, files: [] as string[] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + AIONUI_FILES_MARKER.length).trim();
  const files = afterMarker
    ? afterMarker
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { text, files };
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{ message: IMessageText }> = ({ message }) => {
  // Filter think tags from content before rendering
  // 在渲染前过滤 think 标签
  const contentToRender = useMemo(() => {
    const rawContent = message.content.content;
    if (typeof rawContent === 'string') {
      const noThink = hasThinkTags(rawContent) ? stripThinkTags(rawContent) : rawContent;
      return sanitizeInternalRuleLeakage(noThink);
    }
    return rawContent;
  }, [message.content.content]);

  const { text, files } = parseFileMarker(contentToRender);
  const isStarOfficeCardMessage = useMemo(
    () => typeof text === 'string' && text.trimStart().startsWith(STAR_OFFICE_CARD_MARKER) && message.position === 'left',
    [text, message.position]
  );
  const starOfficeCardText = useMemo(
    () => (isStarOfficeCardMessage ? text.replace(STAR_OFFICE_CARD_MARKER, '').trimStart() : text),
    [isStarOfficeCardMessage, text]
  );
  const { data, json } = useFormatContent(starOfficeCardText);
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const baseText = json ? JSON.stringify(data, null, 2) : starOfficeCardText;
    const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    const textToCopy = fileList + baseText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  const copyButton = (
    <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
      <div className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto' onClick={handleCopy} style={{ lineHeight: 0 }}>
        <Copy theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  );

  const cronMeta = message.content.cronMeta;

  return (
    <>
      <div className={classNames('min-w-0 flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {files.length > 0 && (
          <div className={classNames('mt-6px', { 'self-end': isUserMessage })}>
            {files.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview path={files[0]} onRemove={() => undefined} readonly />
              </div>
            ) : (
              <HorizontalFileList>
                {files.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        <div
          className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px md:max-w-780px', {
            'bg-aou-2 p-8px': isUserMessage || cronMeta,
            'w-full': !(isUserMessage || cronMeta),
          })}
          style={isUserMessage || cronMeta ? { borderRadius: '8px 0 8px 8px' } : undefined}
        >
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
            </CollapsibleContent>
          ) : (
            <div
              className={classNames({
                'rounded-14px border px-14px py-12px':
                  isStarOfficeCardMessage,
              })}
              style={
                isStarOfficeCardMessage
                  ? {
                      borderColor: 'rgb(var(--arcoblue-3))',
                      background:
                        'linear-gradient(135deg, rgba(var(--arcoblue-1), 0.62) 0%, rgba(var(--arcoblue-2), 0.28) 60%, var(--color-bg-2) 100%)',
                    }
                  : undefined
              }
            >
              <div
                className={classNames('mb-8px text-12px font-600 tracking-[0.2px]', {
                  hidden: !isStarOfficeCardMessage,
                })}
                style={isStarOfficeCardMessage ? { color: 'var(--color-text-2)' } : undefined}
              >
                📺 STAR OFFICE ASSISTANT
              </div>
              <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{starOfficeCardText}</MarkdownView>
            </div>
          )}
        </div>
        <div
          className={classNames('h-32px flex items-center mt-4px', {
            'justify-end': isUserMessage,
            'justify-start': !isUserMessage,
          })}
        >
          {copyButton}
        </div>
      </div>
      {showCopyAlert && <Alert type='success' content={t('messages.copySuccess')} showIcon className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]' style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }} closable={false} />}
    </>
  );
};

export default MessageText;
