/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { acpConversation, codexConversation } from '@/common/ipcBridge';
import type { IMessageToolGroup } from '@/common/chatLib';
import { Alert, Button, Radio, Tag } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import { ToolConfirmationOutcome } from '@office-ai/aioncli-core/dist/src/tools/tools';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Diff2Html from '../components/Diff2Html';
import LocalImageView from '../components/LocalImageView';
import MarkdownView from '../components/Markdown';

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
            <Diff2Html className='ml-16px' title={isConfirm ? confirmationDetails.title : content.description} diff={confirmationDetails?.fileDiff || ''}></Diff2Html>
          </div>
        );
      case 'exec':
        return (
          <div className='min-w-400px'>
            <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBottom: 4 }}>{`\`\`\`bash\n${confirmationDetails.command}\n\`\`\``}</MarkdownView>
          </div>
        );
      case 'info':
        return <span>{confirmationDetails.prompt}</span>;
      case 'mcp':
        return <span>{confirmationDetails.toolDisplayName}</span>;
    }
  }, [confirmationDetails, content]);

  const { question = '', options = [] } = useConfirmationButtons(confirmationDetails);

  const [selected, setSelected] = useState<ToolConfirmationOutcome | null>(null);

  return (
    <div>
      {node}
      {content.status === 'Confirming' && (
        <>
          <div className='mt-10px'>{question}</div>
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
}> = ({ content }) => {
  const { resultDisplay, name } = content;
  const display = typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay);
  if (name === 'ImageGeneration' && typeof resultDisplay === 'object') {
    const { img_url, relative_path } = resultDisplay as any;
    return <LocalImageView src={img_url} alt={relative_path || img_url} className='max-w-100% max-h-100%' />;
  }
  return <div>{display}</div>;
};

const MessageToolGroup: React.FC<IMessageToolGroupProps> = ({ message }) => {
  const { t } = useTranslation();
  console.log('----->message', message);
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
              onConfirm={async (outcome) => {
                try {
                  // 优化：如果有 agentType 信息，直接使用，避免额外 API 调用
                  const agentType = (content as any)?.agentType;

                  let conversationHandler;
                  if (agentType) {
                    // 直接根据 agentType 选择处理器（来自 MessageAcpPermission 的优化）
                    conversationHandler = agentType === 'codex' ? codexConversation : acpConversation;
                  } else {
                    // 后备方案：通过 conversation API 获取类型
                    const conv = await ipcBridge.conversation.get.invoke({ id: message.conversation_id });
                    if (conv?.type === 'acp') {
                      conversationHandler = acpConversation;
                    } else if (conv?.type === 'codex') {
                      conversationHandler = codexConversation;
                    } else {
                      conversationHandler = ipcBridge.geminiConversation;
                    }
                  }

                  // 改进的 callId 处理（来自 MessageAcpPermission 的优化）
                  const effectiveCallId = (content as any)?.toolCall?.toolCallId || callId || message.id;

                  if (conversationHandler === ipcBridge.geminiConversation) {
                    await conversationHandler.confirmMessage.invoke({
                      confirmKey: outcome,
                      msg_id: message.id,
                      callId: effectiveCallId,
                      conversation_id: message.conversation_id,
                    });
                  } else {
                    await conversationHandler.confirmMessage.invoke({
                      confirmKey: outcome,
                      msg_id: message.id,
                      callId: effectiveCallId,
                      conversation_id: message.conversation_id,
                    });
                  }
                } catch (e) {
                  console.error('Confirm failed:', e);
                }
              }}
            ></ConfirmationDetails>
          );
        }

        if (name === 'WriteFile' && typeof resultDisplay !== 'string') {
          return (
            <div className='min-w-400px'>
              <Diff2Html className='ml-16px' diff={(resultDisplay as any)?.fileDiff || ''}></Diff2Html>
            </div>
          );
        }

        return (
          <Alert
            className={'!items-start !rd-8px !px-8px [&_div.arco-alert-content-wrapper]:max-w-[calc(100%-24px)]'}
            key={callId}
            type={status === 'Error' ? 'error' : status === 'Success' ? 'success' : status === 'Canceled' ? 'warning' : 'info'}
            icon={isLoading && <LoadingOne theme='outline' size='12' fill='#333' className='loading lh-[1] flex' />}
            content={
              <div>
                <Tag className={'mr-4px'}>
                  {name}
                  {status === 'Canceled' ? `(${t('messages.canceledExecution')})` : ''}
                </Tag>
                <div className='text-12px color-#666'>{description}</div>
                <div className='overflow-auto'>
                  <ToolResultDisplay content={content}></ToolResultDisplay>
                </div>
              </div>
            }
          ></Alert>
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
