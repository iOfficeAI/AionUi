/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chat/chatLib';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Button, Radio } from '@arco-design/web-react';
import MarkdownView from '@renderer/components/Markdown';
import { ToolConfirmationOutcome } from '@renderer/utils/common';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CODE_STYLE = { marginTop: 4, marginBottom: 4 };

type ToolGroupContentItem = IMessageToolGroup['content'][number];

const useConfirmationButtons = (
  confirmationDetails: ToolGroupContentItem['confirmationDetails'],
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
  content: ToolGroupContentItem;
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
          <div className='flex justify-start ps-20px'>
            <Button type='primary' size='mini' disabled={!selected} onClick={() => onConfirm(selected)}>
              {t('messages.confirm')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ConfirmationDetails;
