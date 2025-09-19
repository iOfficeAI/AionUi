import React from 'react';
import { useTranslation } from 'react-i18next';
import type { IMcpServer } from '@/common/storage';

interface McpServerToolsListProps {
  server: IMcpServer;
}

const McpServerToolsList: React.FC<McpServerToolsListProps> = ({ server }) => {
  const { t } = useTranslation();

  if (!server.tools || server.tools.length === 0) {
    return null;
  }

  return (
    <div className='space-y-3'>
      <div>
        <div className='space-y-2'>
          {server.tools.map((tool, index) => (
            <div key={index} className='border border-gray-200 rounded p-3'>
              <div className='flex gap-4'>
                <div className='flex-shrink-0 min-w-0 w-1/3'>
                  <div className='font-medium text-sm text-blue-600 break-words'>{tool.name}</div>
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='text-xs text-gray-600 break-words'>{tool.description || t('settings.mcpNoDescription')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default McpServerToolsList;
