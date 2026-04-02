import { ipcBridge } from '@/common';
import { isTemporaryWorkspace } from '@/renderer/utils/workspace/workspace';
import { Command, Down, Folder, Terminal } from '@icon-park/react';
import { Button, Dropdown, Tooltip } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ToolType = 'vscode' | 'terminal' | 'explorer';

interface ToolOption {
  key: ToolType;
  label: string;
  icon: React.ReactNode;
  available: boolean;
}

interface WorkspaceOpenButtonProps {
  workspacePath: string;
}

const STORAGE_KEY = 'workspace-open-preference';

/**
 * Workspace Open Button - Opens workspace folder with various tools
 * Supports VS Code, Terminal, and File Explorer
 * Remembers user's preferred tool
 */
const WorkspaceOpenButton: React.FC<WorkspaceOpenButtonProps> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const [vscodeInstalled, setVscodeInstalled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [preferredTool, setPreferredTool] = useState<ToolType | null>(null);

  // Check if VS Code is installed and load preferred tool
  useEffect(() => {
    const checkTools = async () => {
      try {
        const installed = await ipcBridge.shell.checkToolInstalled.invoke({ tool: 'vscode' });
        setVscodeInstalled(installed);
      } catch (error) {
        console.warn('[WorkspaceOpenButton] Failed to check VS Code:', error);
        setVscodeInstalled(false);
      }
    };

    // Load preferred tool from storage
    const saved = localStorage.getItem(STORAGE_KEY) as ToolType | null;
    if (saved) {
      setPreferredTool(saved);
    }

    void checkTools();
  }, []);

  // Don't render if workspace is temporary
  if (isTemporaryWorkspace(workspacePath)) {
    return null;
  }

  const handleOpenWith = async (tool: ToolType) => {
    try {
      await ipcBridge.shell.openFolderWith.invoke({ folderPath: workspacePath, tool });
      // Save preference
      localStorage.setItem(STORAGE_KEY, tool);
      setPreferredTool(tool);
    } catch (error) {
      console.error(`[WorkspaceOpenButton] Failed to open folder with ${tool}:`, error);
    }
    setDropdownOpen(false);
  };

  // Build dropdown options
  const toolOptions: ToolOption[] = [
    {
      key: 'vscode',
      label: t('conversation.workspace.openWith.vscode', { defaultValue: 'VS Code' }),
      icon: <Command size={16} />,
      available: vscodeInstalled,
    },
    {
      key: 'terminal',
      label: t('conversation.workspace.openWith.terminal', { defaultValue: 'Terminal' }),
      icon: <Terminal size={16} />,
      available: true,
    },
    {
      key: 'explorer',
      label: t('conversation.workspace.openWith.explorer', { defaultValue: 'File Explorer' }),
      icon: <Folder size={16} />,
      available: true,
    },
  ];

  // Filter only available tools
  const availableOptions = toolOptions.filter((opt) => opt.available);

  // Determine current tool: preferred > first available > explorer
  const currentTool: ToolType = useMemo(() => {
    if (preferredTool && availableOptions.some((opt) => opt.key === preferredTool)) {
      return preferredTool;
    }
    return availableOptions[0]?.key ?? 'explorer';
  }, [preferredTool, availableOptions]);

  // Get current icon based on selected tool
  const currentIcon = useMemo(() => {
    switch (currentTool) {
      case 'vscode':
        return <Command size={16} />;
      case 'explorer':
        return <Folder size={16} />;
      case 'terminal':
      default:
        return <Terminal size={16} />;
    }
  }, [currentTool]);

  const dropdownList = (
    <div className='workspace-open-dropdown p-4px'>
      {availableOptions.map((option) => (
        <div
          key={option.key}
          className={`workspace-open-dropdown-item flex items-center gap-8px px-12px py-8px cursor-pointer hover:bg-[var(--color-fill-2)] rounded-4px transition-colors ${
            currentTool === option.key ? 'bg-[var(--color-fill-2)]' : ''
          }`}
          onClick={() => handleOpenWith(option.key)}
        >
          <span className='flex items-center justify-center w-20px h-20px'>{option.icon}</span>
          <span className='text-14px'>{option.label}</span>
          {currentTool === option.key && <span className='ml-auto text-12px text-[var(--color-text-3)]'>✓</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className='workspace-open-button flex items-center'>
      <Tooltip content={t('conversation.workspace.openWorkspace', { defaultValue: 'Open workspace folder' })} mini>
        <Button
          type='text'
          size='small'
          className='workspace-open-button__btn flex items-center gap-4px px-8px'
          onClick={() => handleOpenWith(currentTool)}
        >
          {currentIcon}
        </Button>
      </Tooltip>

      <Dropdown
        trigger='click'
        position='br'
        popupVisible={dropdownOpen}
        onVisibleChange={setDropdownOpen}
        droplist={dropdownList}
      >
        <Button
          type='text'
          size='small'
          className='workspace-open-button__dropdown-btn px-4px'
          style={{ marginLeft: '-4px' }}
        >
          <Down size={12} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
        </Button>
      </Dropdown>
    </div>
  );
};

export default WorkspaceOpenButton;
