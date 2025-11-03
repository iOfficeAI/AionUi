/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chatLib';
import { Alert, Button, Radio, Tag } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import { ToolConfirmationOutcome } from '../types/tool-confirmation';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Diff2Html from '../components/Diff2Html';
import LocalImageView from '../components/LocalImageView';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
import { iconColors } from '@/renderer/theme/colors';

// Alert 组件样式常量 Alert component style constant
const ALERT_CLASSES = '!items-start !rd-8px !px-8px [&_div.arco-alert-content-wrapper]:max-w-[calc(100%-24px)]';

// CollapsibleContent 高度常量 CollapsibleContent height constants
const DESCRIPTION_MAX_HEIGHT = 120; // 描述文字最大高度 Description max height
const RESULT_MAX_HEIGHT = 240; // 结果内容最大高度 Result content max height

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

const ToolResultDisplay: React.FC<{
  content: IMessageToolGroupProps['message']['content'][number];
  inAlert?: boolean; // 是否在 Alert 组件内，使用 mask 模式 Whether inside Alert component, use mask mode
}> = ({ content, inAlert = false }) => {
  const { resultDisplay, name } = content;

  // 图片生成特殊处理 Special handling for image generation
  if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
    const { img_url, relative_path } = resultDisplay as any;
    return <LocalImageView src={img_url} alt={relative_path || img_url} className='max-w-100% max-h-100%' />;
  }

  // 将结果转换为字符串 Convert result to string
  const display = typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay, null, 2);

  // 使用 CollapsibleContent 包装长内容，Alert 内使用 mask 模式适配背景色
  // Wrap long content with CollapsibleContent, use mask mode inside Alert to adapt to background color
  return (
    <CollapsibleContent maxHeight={RESULT_MAX_HEIGHT} defaultCollapsed={true} useMask={inAlert}>
      <pre className='text-t-primary whitespace-pre-wrap break-words text-sm m-0 overflow-x-auto'>{display}</pre>
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
                <div>
                  <ToolResultDisplay content={content} inAlert={true} />
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
