/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chatLib';
import { Alert, Button, Radio, Tag } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import { ToolConfirmationOutcome } from '@office-ai/aioncli-core/dist/src/tools/tools';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Diff2Html from '../components/Diff2Html';
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
                  });
              }}
            ></ConfirmationDetails>
          );
        }

        if (name === 'WriteFile' && typeof resultDisplay !== 'string') {
          return (
            <div className='min-w-400px'>
              <Diff2Html className='ml-16px' diff={resultDisplay?.fileDiff || ''}></Diff2Html>
            </div>
          );
        }

        const display = typeof resultDisplay === 'string' ? resultDisplay : JSON.stringify(resultDisplay);
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
                <div className='overflow-auto'>{display}</div>
              </div>
            }
          ></Alert>
        );
      })}
    </div>
  );
};

export default MessageToolGroup;
