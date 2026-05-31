/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chat/chatLib';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Image, Message, Radio, Tooltip } from '@arco-design/web-react';
import { Copy, Download, LoadingOne } from '@icon-park/react';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import MessageFileChanges from '../MessageFileChanges';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import LocalImageView from '@renderer/components/media/LocalImageView';
import MarkdownView from '@renderer/components/Markdown';
import { ToolConfirmationOutcome } from '@renderer/utils/common';
import { ImagePreviewContext } from '../MessageList';
import { COLLAPSE_CONFIG, TEXT_CONFIG } from '../constants';
import type { ImageGenerationResult, WriteFileResult } from '../types';
import ToolShell from './ToolShell';
import type { StatusPillState } from './StatusPill';
import { STATE_LABEL_FALLBACK, STATE_LABEL_KEY } from './StatusPill';

const CODE_STYLE = { marginTop: 4, marginBottom: 4 };

// CollapsibleContent 高度常量 CollapsibleContent height constants
const RESULT_MAX_HEIGHT = COLLAPSE_CONFIG.MAX_HEIGHT;

const toolStatusToPill = (status: string): StatusPillState => {
  switch (status) {
    case 'Success':
      return 'success';
    case 'Error':
      return 'failed';
    case 'Canceled':
      return 'cancelled';
    case 'Confirming':
      return 'queued';
    default:
      return 'running';
  }
};

interface IMessageToolGroupProps {
  message: IMessageToolGroup;
}

const useConfirmationButtons = (
  confirmationDetails: IMessageToolGroupProps['message']['content'][number]['confirmationDetails'],
  t: (key: string, options?: any) => string
) => {
  return useMemo(() => {
    if (!confirmationDetails) return {};
    let question: string;
    const options: Array<{ label: string; value: ToolConfirmationOutcome }> = [];
    switch (confirmationDetails.type) {
      case 'edit':
        {
          question = t('messages.confirmation.applyChange');
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'exec':
        {
          question = t('messages.confirmation.allowExecution');
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'info':
        {
          question = t('messages.confirmation.proceed');
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      default: {
        const mcpProps = confirmationDetails;
        question = t('messages.confirmation.allowMCPTool', {
          toolName: mcpProps.tool_name,
          serverName: mcpProps.server_name,
        });
        options.push(
          {
            label: t('messages.confirmation.yesAllowOnce'),
            value: ToolConfirmationOutcome.ProceedOnce,
          },
          {
            label: t('messages.confirmation.yesAlwaysAllowTool', {
              toolName: mcpProps.tool_name,
              serverName: mcpProps.server_name,
            }),
            value: ToolConfirmationOutcome.ProceedAlwaysTool,
          },
          {
            label: t('messages.confirmation.yesAlwaysAllowServer', {
              serverName: mcpProps.server_name,
            }),
            value: ToolConfirmationOutcome.ProceedAlwaysServer,
          },
          { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
        );
      }
    }
    return {
      question,
      options,
    };
  }, [confirmationDetails, t]);
};

const EditConfirmationDiff: React.FC<{ diff: string; file_name: string; title: string }> = ({
  diff,
  file_name,
  title,
}) => {
  const fileInfo = useMemo(() => parseDiff(diff, file_name), [diff, file_name]);
  const display_name = file_name.split(/[/\\]/).pop() || file_name;
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({
    diffText: diff,
    display_name,
    file_path: file_name,
    title,
  });

  return (
    <FileChangesPanel
      title={title}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const ConfirmationDetails: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
  onConfirm: (outcome: ToolConfirmationOutcome) => void;
}> = ({ content, onConfirm }) => {
  const { t } = useTranslation();
  const { confirmationDetails } = content;
  if (!confirmationDetails) return;
  const node = useMemo(() => {
    if (!confirmationDetails) return null;
    switch (confirmationDetails.type) {
      case 'edit':
        return null; // Rendered separately below with hooks support
      case 'exec': {
        const bashSnippet = `\`\`\`bash\n${confirmationDetails.command}\n\`\`\``;
        return (
          <div className='w-full max-w-100% min-w-0'>
            <MarkdownView codeStyle={CODE_STYLE}>{bashSnippet}</MarkdownView>
          </div>
        );
      }
      case 'info':
        return <span className='text-t-primary'>{confirmationDetails.prompt}</span>;
      case 'mcp':
        return <span className='text-t-primary'>{confirmationDetails.tool_display_name}</span>;
    }
  }, [confirmationDetails]);

  const { question = '', options = [] } = useConfirmationButtons(confirmationDetails, t);

  const [selected, setSelected] = useState<ToolConfirmationOutcome | null>(null);

  const isConfirm = content.status === 'Confirming';

  return (
    <div>
      {confirmationDetails.type === 'edit' ? (
        <EditConfirmationDiff
          diff={confirmationDetails?.file_diff || ''}
          file_name={confirmationDetails.file_name}
          title={isConfirm ? confirmationDetails.title : content.description}
        />
      ) : (
        node
      )}
      {content.status === 'Confirming' && (
        <>
          <div className='mt-10px text-t-primary'>{question}</div>
          <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
            {options.map((item) => {
              return (
                <Radio key={item.value} value={item.value}>
                  {item.label}
                </Radio>
              );
            })}
          </Radio.Group>
          <div className='flex justify-start pl-20px'>
            <Button type='primary' size='mini' disabled={!selected} onClick={() => onConfirm(selected)}>
              {t('messages.confirm')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ImageDisplay: 图片生成结果展示组件 Image generation result display component
const ImageDisplay: React.FC<{
  imgUrl: string;
  relativePath?: string;
}> = ({ imgUrl, relativePath }) => {
  const { t } = useTranslation();
  const [messageApi, messageContext] = Message.useMessage();
  const [imageUrl, setImageUrl] = useState<string>(imgUrl);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { inPreviewGroup } = useContext(ImagePreviewContext);

  // 如果是本地路径，需要加载为 base64 Load local paths as base64
  React.useEffect(() => {
    if (imgUrl.startsWith('data:') || imgUrl.startsWith('http')) {
      setImageUrl(imgUrl);
      setLoading(false);
    } else {
      setLoading(true);
      setError(false);
      ipcBridge.fs.getImageBase64
        .invoke({ path: imgUrl })
        .then((base64) => {
          if (!base64) {
            throw new Error('Image file not found');
          }
          setImageUrl(base64);
          setLoading(false);
        })
        .catch((error) => {
          console.error('Failed to load image:', error);
          setError(true);
          setLoading(false);
        });
    }
  }, [imgUrl]);

  // 获取图片 blob（复用逻辑）Get image blob (reusable logic)
  const getImageBlob = useCallback(async (): Promise<Blob> => {
    const response = await fetch(imageUrl);
    return await response.blob();
  }, [imageUrl]);

  const handleCopy = useCallback(async () => {
    try {
      const blob = await getImageBlob();

      // Try using Clipboard API with blob (requires secure context in WebUI)
      if (navigator.clipboard && window.isSecureContext && typeof navigator.clipboard.write === 'function') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
          messageApi.success(t('messages.copySuccess', { defaultValue: 'Copied' }));
          return;
        } catch (clipboardError) {
          console.warn('[ImageDisplay] Clipboard API failed, trying fallback:', clipboardError);
        }
      }

      // Fallback: Use canvas to copy image for browsers/Electron that don't support ClipboardItem with images
      const img = document.createElement('img');
      img.src = imageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(async (canvasBlob) => {
        if (!canvasBlob) {
          messageApi.error(t('messages.copyFailed', { defaultValue: 'Failed to copy' }));
          return;
        }
        if (!navigator.clipboard || !window.isSecureContext || typeof navigator.clipboard.write !== 'function') {
          messageApi.error(t('messages.copyFailed', { defaultValue: 'Failed to copy' }));
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': canvasBlob,
            }),
          ]);
          messageApi.success(t('messages.copySuccess', { defaultValue: 'Copied' }));
        } catch (canvasError) {
          console.error('[ImageDisplay] Canvas fallback also failed:', canvasError);
          messageApi.error(t('messages.copyFailed', { defaultValue: 'Failed to copy' }));
        }
      }, 'image/png');
    } catch (error) {
      console.error('Failed to copy image:', error);
      messageApi.error(t('messages.copyFailed', { defaultValue: 'Failed to copy' }));
    }
  }, [getImageBlob, imageUrl, t, messageApi]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await getImageBlob();
      const file_name = relativePath?.split(/[\\/]/).pop() || 'image.png';

      // 创建下载链接 Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      messageApi.success(t('messages.downloadSuccess', { defaultValue: 'Download successful' }));
    } catch (error) {
      console.error('Failed to download image:', error);
      messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
    }
  }, [getImageBlob, relativePath, t, messageApi]);

  // 加载状态 Loading state
  if (loading) {
    return (
      <div className='flex items-center gap-8px my-8px'>
        <LoadingOne className='loading' theme='outline' size='14' fill={iconColors.primary} />
        <span className='text-t-secondary text-sm'>{t('common.loading', { defaultValue: 'Loading...' })}</span>
      </div>
    );
  }

  // 错误状态 Error state
  if (error || !imageUrl) {
    return (
      <div className='flex items-center gap-8px my-8px text-t-secondary text-sm'>
        <span>{t('messages.imageLoadFailed', { defaultValue: 'Failed to load image' })}</span>
      </div>
    );
  }

  // 图片元素 Image element
  const imageElement = (
    <Image
      src={imageUrl}
      alt={relativePath || 'Generated image'}
      width={197}
      style={{
        maxHeight: '320px',
        objectFit: 'contain',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    />
  );

  return (
    <>
      {messageContext}
      <div className='flex flex-col gap-8px my-8px' style={{ maxWidth: '197px' }}>
        {/* 图片预览 Image preview - 如果已在 PreviewGroup 中则直接渲染，否则包裹 PreviewGroup */}
        {inPreviewGroup ? imageElement : <Image.PreviewGroup>{imageElement}</Image.PreviewGroup>}
        {/* 操作按钮 Action buttons */}
        <div className='flex gap-8px'>
          <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
            <Button
              type='secondary'
              size='small'
              shape='circle'
              icon={<Copy theme='outline' size='14' fill={iconColors.primary} />}
              onClick={handleCopy}
            />
          </Tooltip>
          <Tooltip content={t('common.download', { defaultValue: 'Download' })}>
            <Button
              type='secondary'
              size='small'
              shape='circle'
              icon={<Download theme='outline' size='14' fill={iconColors.primary} />}
              onClick={handleDownload}
            />
          </Tooltip>
        </div>
      </div>
    </>
  );
};

const ToolResultDisplay: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
}> = ({ content }) => {
  const { result_display, name } = content;

  // 图片生成特殊处理 Special handling for image generation
  if (name === 'ImageGeneration' && typeof result_display === 'object') {
    const result = result_display as ImageGenerationResult;
    // 如果有 img_url 才显示图片，否则显示错误信息
    if (result.img_url) {
      return (
        <LocalImageView
          src={result.img_url}
          alt={result.relative_path || result.img_url}
          className='max-w-100% max-h-100%'
        />
      );
    }
    // 如果是错误，继续走下面的 JSON 显示逻辑
  }

  // 将结果转换为字符串 Convert result to string
  const display = typeof result_display === 'string' ? result_display : JSON.stringify(result_display, null, 2);

  // 使用 CollapsibleContent 包装长内容
  // Wrap long content with CollapsibleContent
  return (
    <CollapsibleContent maxHeight={RESULT_MAX_HEIGHT} defaultCollapsed={true} useMask={false}>
      <pre
        className='text-t-primary whitespace-pre-wrap break-words m-0'
        style={{ fontSize: `${TEXT_CONFIG.FONT_SIZE}px`, lineHeight: TEXT_CONFIG.LINE_HEIGHT }}
      >
        {display}
      </pre>
    </CollapsibleContent>
  );
};

const MessageToolGroup: React.FC<IMessageToolGroupProps> = ({ message }) => {
  const { t } = useTranslation();

  // Collect all WriteFile results for summary display
  const writeFileResults = useMemo(() => {
    return message.content
      .filter(
        (item) =>
          item.name === 'WriteFile' &&
          item.result_display &&
          typeof item.result_display === 'object' &&
          'file_diff' in item.result_display
      )
      .map((item) => item.result_display as WriteFileResult);
  }, [message.content]);

  // Find the index of first WriteFile
  const firstWriteFileIndex = useMemo(() => {
    return message.content.findIndex(
      (item) =>
        item.name === 'WriteFile' &&
        item.result_display &&
        typeof item.result_display === 'object' &&
        'file_diff' in item.result_display
    );
  }, [message.content]);

  return (
    <div>
      {message.content.map((content, index) => {
        const { status, call_id, name, description, result_display, confirmationDetails } = content;

        if (confirmationDetails) {
          const confirmState: StatusPillState = status === 'Confirming' ? 'queued' : toolStatusToPill(status);
          return (
            <ToolShell
              key={call_id}
              state={confirmState}
              stateLabel={t(STATE_LABEL_KEY[confirmState], { defaultValue: STATE_LABEL_FALLBACK[confirmState] })}
              title={<span className='font-medium'>{name}</span>}
              defaultExpanded
              collapsible={false}
            >
              <ConfirmationDetails
                content={content}
                onConfirm={(outcome) => {
                  ipcBridge.conversation.confirmMessage
                    .invoke({
                      confirm_key: outcome,
                      msg_id: message.id,
                      call_id: call_id,
                      conversation_id: message.conversation_id,
                    })
                    .then(() => {
                      // confirmation sent successfully
                    })
                    .catch((error) => {
                      console.error('Failed to confirm message:', error);
                    });
                }}
              />
            </ToolShell>
          );
        }

        // WriteFile special handling: use MessageFileChanges (which itself uses ToolShell)
        if (name === 'WriteFile' && typeof result_display !== 'string') {
          if (result_display && typeof result_display === 'object' && 'file_diff' in result_display) {
            if (index === firstWriteFileIndex && writeFileResults.length > 0) {
              return (
                <div className='w-full min-w-0' key={call_id}>
                  <MessageFileChanges writeFileChanges={writeFileResults} />
                </div>
              );
            }
            return null;
          }
        }

        // ImageGeneration special handling: render the image inside a ToolShell so
        // the chrome matches every other tool call.
        if (name === 'ImageGeneration' && typeof result_display === 'object') {
          const result = result_display as ImageGenerationResult;
          if (result.img_url) {
            const imgState = toolStatusToPill(status);
            return (
              <ToolShell
                key={call_id}
                state={imgState}
                stateLabel={t(STATE_LABEL_KEY[imgState], { defaultValue: STATE_LABEL_FALLBACK[imgState] })}
                title={<span className='font-medium'>{name}</span>}
                meta={result.relative_path}
              >
                <ImageDisplay imgUrl={result.img_url} relativePath={result.relative_path} />
              </ToolShell>
            );
          }
        }

        // Generic tool call display.
        const pillState = toolStatusToPill(status);
        const stateLabel = t(STATE_LABEL_KEY[pillState], { defaultValue: STATE_LABEL_FALLBACK[pillState] });
        const hasBody = Boolean(description || result_display || status === 'Error');
        const titleNode = (
          <span className='font-medium'>
            {name}
            {status === 'Canceled' ? ` (${t('messages.canceledExecution')})` : ''}
          </span>
        );

        return (
          <ToolShell
            key={call_id}
            state={pillState}
            stateLabel={stateLabel}
            title={titleNode}
            collapsible={hasBody}
          >
            {hasBody && (
              <div>
                {description && (
                  <div
                    className={`text-12px text-t-secondary mb-2 ${status === 'Error' ? 'whitespace-pre-wrap break-words' : 'truncate'}`}
                  >
                    {description}
                  </div>
                )}
                {result_display && (
                  <div>
                    {/* ToolResultDisplay already contains CollapsibleContent internally, avoid nesting */}
                    <ToolResultDisplay content={content} />
                  </div>
                )}
                {status === 'Error' && (
                  <div className='mt-4px flex justify-end'>
                    <FeedbackButton module='conversation-session' />
                  </div>
                )}
              </div>
            )}
          </ToolShell>
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
