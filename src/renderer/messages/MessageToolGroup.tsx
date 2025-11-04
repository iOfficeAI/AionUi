/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chatLib';
import { Alert, Button, Radio, Tag, Message, Image, Tooltip } from '@arco-design/web-react';
import { LoadingOne, Copy, Download } from '@icon-park/react';
import { ToolConfirmationOutcome } from '../types/tool-confirmation';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useMemo, useState, useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import Diff2Html from '../components/Diff2Html';
import LocalImageView from '../components/LocalImageView';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
import { iconColors } from '@/renderer/theme/colors';
import { ImagePreviewContext } from './MessageList';

// Alert 组件样式常量 Alert component style constant
const ALERT_CLASSES = '!items-center !rd-8px !px-8px [&_.arco-alert-icon]:flex [&_.arco-alert-icon]:items-center [&_.arco-alert-content-wrapper]:flex [&_.arco-alert-content-wrapper]:items-center [&_.arco-alert-content-wrapper]:w-full [&_.arco-alert-content]:flex-1';

// CollapsibleContent 高度常量 CollapsibleContent height constants
const DESCRIPTION_MAX_HEIGHT = 84; // 描述文字最大高度（4行）Description max height (4 lines)
const RESULT_MAX_HEIGHT = 84; // 结果内容最大高度（4行，text-sm 14px × lineHeight 1.5 = 21px/行）Result content max height (4 lines, text-sm 14px × 1.5 = 21px per line)

interface IMessageToolGroupProps {
  message: IMessageToolGroup;
}

const useConfirmationButtons = (confirmationDetails: IMessageToolGroupProps['message']['content'][number]['confirmationDetails']) => {
  return useMemo(() => {
    if (!confirmationDetails) return {};
    let question;
    const options = [];
    switch (confirmationDetails.type) {
      case 'edit':
        {
          question = `Apply this change?`;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            // {
            //   label: "Modify with external editor",
            //   value: ToolConfirmationOutcome.ModifyWithEditor,
            // },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'exec':
        {
          const executionProps = confirmationDetails;
          question = `Allow execution?`;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: `Yes, allow always "${executionProps.rootCommand} ..."`,
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'info':
        {
          question = `Do you want to proceed?`;
          options.push(
            {
              label: 'Yes, allow once',
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: 'Yes, allow always',
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      default: {
        const mcpProps = confirmationDetails;
        question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
        options.push(
          {
            label: 'Yes, allow once',
            value: ToolConfirmationOutcome.ProceedOnce,
          },
          {
            label: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysTool, // Cast until types are updated
          },
          {
            label: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
            value: ToolConfirmationOutcome.ProceedAlwaysServer,
          },
          { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel }
        );
      }
    }
    return {
      question,
      options,
    };
  }, [confirmationDetails]);
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
    const isConfirm = content.status === 'Confirming';
    switch (confirmationDetails.type) {
      case 'edit':
        return (
          <div>
            <Diff2Html title={isConfirm ? confirmationDetails.title : content.description} diff={confirmationDetails?.fileDiff || ''}></Diff2Html>
          </div>
        );
      case 'exec':
        return (
          <div className='min-w-400px'>
            <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBottom: 4 }}>{`\`\`\`bash\n${confirmationDetails.command}\n\`\`\``}</MarkdownView>
          </div>
        );
      case 'info':
        return <span className='text-t-primary'>{confirmationDetails.prompt}</span>;
      case 'mcp':
        return <span className='text-t-primary'>{confirmationDetails.toolDisplayName}</span>;
    }
  }, [confirmationDetails, content]);

  const { question = '', options = [] } = useConfirmationButtons(confirmationDetails);

  const [selected, setSelected] = useState<ToolConfirmationOutcome | null>(null);

  return (
    <div>
      {node}
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
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      messageApi.success(t('messages.copySuccess', { defaultValue: 'Copied' }));
    } catch (error) {
      console.error('Failed to copy image:', error);
      messageApi.error(t('messages.copyFailed', { defaultValue: 'Failed to copy' }));
    }
  }, [getImageBlob, t, messageApi]);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await getImageBlob();
      const fileName = relativePath?.split(/[\\/]/).pop() || 'image.png';

      // 创建下载链接 Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
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
            <Button type='secondary' size='small' shape='circle' icon={<Copy theme='outline' size='14' fill={iconColors.primary} />} onClick={handleCopy} />
          </Tooltip>
          <Tooltip content={t('common.download', { defaultValue: 'Download' })}>
            <Button type='secondary' size='small' shape='circle' icon={<Download theme='outline' size='14' fill={iconColors.primary} />} onClick={handleDownload} />
          </Tooltip>
        </div>
      </div>
    </>
  );
};

const ToolResultDisplay: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
  inAlert?: boolean; // 是否在 Alert 组件内，使用 mask 模式 Whether inside Alert component, use mask mode
}> = ({ content, inAlert = false }) => {
  const { resultDisplay, name } = content;

  // 图片生成特殊处理 Special handling for image generation
  if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
    const { img_url, relative_path } = resultDisplay as any;
    // 如果有 img_url 才显示图片，否则显示错误信息
    if (img_url) {
      return <LocalImageView src={img_url} alt={relative_path || img_url} className='max-w-100% max-h-100%' />;
    }
    // 如果是错误，继续走下面的 JSON 显示逻辑
  }

  // 将结果转换为字符串 Convert result to string
  const display = typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay, null, 2);

  // Alert 内的错误信息直接限制高度到 4 行，不使用 CollapsibleContent
  // For error messages in Alert, directly limit height to 4 lines without CollapsibleContent
  if (inAlert) {
    return <div className='alert-result-display text-t-primary text-sm'>{display}</div>;
  }

  // 使用 CollapsibleContent 包装长内容
  // Wrap long content with CollapsibleContent
  return (
    <CollapsibleContent maxHeight={RESULT_MAX_HEIGHT} defaultCollapsed={true} useMask={inAlert}>
      <pre className='text-t-primary whitespace-pre-wrap break-words m-0' style={{ fontSize: '14px', lineHeight: '21px' }}>
        {display}
      </pre>
    </CollapsibleContent>
  );
};

const MessageToolGroup: React.FC<IMessageToolGroupProps> = ({ message }) => {
  const { t } = useTranslation();

  return (
    <div>
      {message.content.map((content) => {
        const { status, callId, name, description, resultDisplay, confirmationDetails } = content;
        const isLoading = status !== 'Success' && status !== 'Error' && status !== 'Canceled';
        // status === "Confirming" &&
        if (confirmationDetails) {
          return (
            <ConfirmationDetails
              content={content}
              onConfirm={(outcome) => {
                ipcBridge.geminiConversation.confirmMessage
                  .invoke({
                    confirmKey: outcome,
                    msg_id: message.id,
                    callId: callId,
                    conversation_id: message.conversation_id,
                  })
                  .then((res) => {
                    console.log('------onConfirm.res>:', res);
                  })
                  .catch((error) => {
                    console.error('Failed to confirm message:', error);
                  });
              }}
            ></ConfirmationDetails>
          );
        }

        // WriteFile 特殊处理：显示 diff Special handling for WriteFile: show diff
        if (name === 'WriteFile' && typeof resultDisplay !== 'string') {
          return (
            <div className='min-w-400px' key={callId}>
              <Diff2Html diff={(resultDisplay as any)?.fileDiff || ''}></Diff2Html>
            </div>
          );
        }

        // ImageGeneration 特殊处理：单独展示图片，不用 Alert 包裹 Special handling for ImageGeneration: display image separately without Alert wrapper
        if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
          const { img_url, relative_path } = resultDisplay as any;
          if (img_url) {
            return <ImageDisplay key={callId} imgUrl={img_url} relativePath={relative_path} />;
          }
        }

        // 通用工具调用展示 Generic tool call display
        return (
          <Alert
            className={ALERT_CLASSES}
            key={callId}
            type={status === 'Error' ? 'error' : status === 'Success' ? 'success' : status === 'Canceled' ? 'warning' : 'info'}
            icon={isLoading && <LoadingOne theme='outline' size='12' fill={iconColors.primary} className='loading lh-[1] flex' />}
            content={
              <div>
                <Tag className={'mr-4px'}>
                  {name}
                  {status === 'Canceled' ? `(${t('messages.canceledExecution')})` : ''}
                </Tag>
                {/* description 使用 CollapsibleContent 包装，mask 模式适配 Alert 背景色
                    Wrap description with CollapsibleContent, mask mode adapts to Alert background color */}
                {description && (
                  <CollapsibleContent maxHeight={DESCRIPTION_MAX_HEIGHT} defaultCollapsed={true} useMask={true}>
                    <div className='text-12px text-t-secondary whitespace-pre-wrap break-words'>{description}</div>
                  </CollapsibleContent>
                )}
                {/* resultDisplay 使用 ToolResultDisplay 组件展示
                    Display resultDisplay using ToolResultDisplay component */}
                {resultDisplay && (
                  <div className='mt-2'>
                    <ToolResultDisplay content={content} inAlert={true} />
                  </div>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
