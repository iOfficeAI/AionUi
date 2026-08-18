import { ipcBridge } from '@/common';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useOptionalPreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { Browser, Command, Down, FolderOpen, Terminal } from '@icon-park/react';
import { Button, Dropdown, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * `browser` 打开的是应用内浏览器（预览面板里的 tab），其余三个是拉起外部程序。
 * 两类行为不同，下拉里用分隔线区分。
 *
 * `browser` opens the in-app browser (a tab in the preview panel); the other three
 * launch external programs. The dropdown separates the two groups with a divider.
 */
type ToolType = 'vscode' | 'terminal' | 'explorer' | 'browser';

/** 拉起外部程序的工具，需要走 shell IPC / Tools that launch external programs via shell IPC */
type ExternalToolType = Exclude<ToolType, 'browser'>;

interface ToolOption {
  key: ToolType;
  label: string;
  icon: React.ReactNode;
  available: boolean;
}

interface WorkspaceOpenButtonProps {
  workspacePath: string;
  /**
   * Authoritative flag from `conversation.extra.is_temporary_workspace`.
   * External shell tools are hidden for temp workspaces (there is no meaningful
   * project folder to open), but the in-app browser still applies — so the button
   * itself stays, showing only Browser.
   */
  isTemporary: boolean;
}

const STORAGE_KEY = 'workspace-open-preference';

const isExternalTool = (tool: ToolType): tool is ExternalToolType => tool !== 'browser';

/**
 * Workspace Open Button — opens the workspace with various tools.
 *
 * Covers VS Code / Terminal / File Explorer (external programs) plus the in-app
 * browser, and remembers the user's last choice so the main button repeats it.
 */
const WorkspaceOpenButton: React.FC<WorkspaceOpenButtonProps> = ({ workspacePath, isTemporary }) => {
  const { t } = useTranslation();
  /**
   * 预览上下文是可选的：本组件主要负责拉起外部程序，浏览器只是附带的一项。
   * 拿不到上下文时（例如在没有 PreviewProvider 的场景里渲染文件树）就隐藏
   * 「浏览器」菜单项，其余功能照常。
   *
   * The preview context is optional: this component mainly launches external
   * programs and the browser is an extra. When it is unavailable (e.g. the file tree
   * rendered without a PreviewProvider) the Browser entry is hidden and everything
   * else keeps working.
   */
  const previewContext = useOptionalPreviewContext();
  const openBrowserTab = previewContext?.openBrowserTab;
  const [vscodeInstalled, setVscodeInstalled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [preferredTool, setPreferredTool] = useState<ToolType | null>(null);

  // Check if VS Code is installed and load preferred tool
  useEffect(() => {
    // Load preferred tool from storage — applies to temp workspaces too, since
    // Browser is available there.
    const saved = localStorage.getItem(STORAGE_KEY) as ToolType | null;
    if (saved) {
      setPreferredTool(saved);
    }

    if (isTemporary) return;

    const checkTools = async () => {
      try {
        const installed = await ipcBridge.shell.checkToolInstalled.invoke({ tool: 'vscode' });
        setVscodeInstalled(installed);
      } catch (error) {
        console.warn('[WorkspaceOpenButton] Failed to check VS Code:', error);
        setVscodeInstalled(false);
      }
    };

    void checkTools();
  }, [isTemporary]);

  const handleOpenWith = useCallback(
    async (tool: ToolType) => {
      try {
        if (isExternalTool(tool)) {
          await ipcBridge.shell.openFolderWith.invoke({ folder_path: workspacePath, tool });
        } else {
          openBrowserTab?.();
        }
        // Save preference
        localStorage.setItem(STORAGE_KEY, tool);
        setPreferredTool(tool);
      } catch (error) {
        console.error(`[WorkspaceOpenButton] Failed to open folder with ${tool}:`, error);
      }
      setDropdownOpen(false);
    },
    [workspacePath, openBrowserTab]
  );

  // Build dropdown options. Temp workspaces have no project folder, so the
  // external tools drop out and only Browser remains.
  const toolOptions: ToolOption[] = useMemo(
    () => [
      {
        key: 'vscode',
        label: t('conversation.workspace.openWith.vscode', { defaultValue: 'VS Code' }),
        icon: <Command size={16} />,
        available: !isTemporary && vscodeInstalled,
      },
      {
        key: 'terminal',
        label: t('conversation.workspace.openWith.terminal', { defaultValue: 'Terminal' }),
        icon: <Terminal size={16} />,
        available: !isTemporary,
      },
      {
        key: 'explorer',
        label: t('conversation.workspace.openWith.explorer', { defaultValue: 'File Explorer' }),
        icon: <FolderOpen size={16} />,
        available: !isTemporary,
      },
      {
        key: 'browser',
        label: t('conversation.workspace.openWith.browser', { defaultValue: 'Browser' }),
        icon: <Browser size={16} />,
        available: Boolean(openBrowserTab),
      },
    ],
    [t, isTemporary, vscodeInstalled, openBrowserTab]
  );

  // Filter only available tools
  const availableOptions = useMemo(() => toolOptions.filter((opt) => opt.available), [toolOptions]);

  // Determine current tool: preferred > first available > browser
  const currentTool: ToolType = useMemo(() => {
    if (preferredTool && availableOptions.some((opt) => opt.key === preferredTool)) {
      return preferredTool;
    }
    return availableOptions[0]?.key ?? 'browser';
  }, [preferredTool, availableOptions]);

  // Get current icon based on selected tool
  const currentIcon = useMemo(() => {
    switch (currentTool) {
      case 'vscode':
        return <Command size={16} />;
      case 'explorer':
        return <FolderOpen size={16} />;
      case 'browser':
        return <Browser size={16} />;
      case 'terminal':
      default:
        return <Terminal size={16} />;
    }
  }, [currentTool]);

  const tooltipContent =
    currentTool === 'browser'
      ? t('conversation.workspace.openWith.browser', { defaultValue: 'Browser' })
      : t('conversation.workspace.openWorkspace', { defaultValue: 'Open workspace folder' });

  // Don't render in WebUI/browser mode: shell tools would run on the server with
  // no visible feedback, and the in-app browser needs Electron's <webview>.
  if (!isElectronDesktop()) return null;

  // 一个可用项都没有时不渲染（临时工作区 + 无预览上下文），否则会留下一个点了没反应的按钮
  // Nothing available (temp workspace with no preview context): render nothing rather
  // than a button that does nothing when clicked.
  if (availableOptions.length === 0) return null;

  const dropdownList = (
    <div className='workspace-open-dropdown p-4px'>
      {availableOptions.map((option, index) => (
        <React.Fragment key={option.key}>
          {/* 分隔线：应用内浏览器与"拉起外部程序"是两类行为
              Divider: the in-app browser behaves differently from launching external programs */}
          {option.key === 'browser' && index > 0 && <div className='my-4px mx-8px h-1px bg-[var(--color-border-2)]' />}
          <div
            className={`workspace-open-dropdown-item flex items-center gap-8px px-12px py-8px cursor-pointer hover:bg-[var(--color-fill-2)] rounded-4px transition-colors ${
              currentTool === option.key ? 'bg-[var(--color-fill-2)]' : ''
            }`}
            onClick={() => handleOpenWith(option.key)}
          >
            <span className='flex items-center justify-center w-20px h-20px'>{option.icon}</span>
            <span className='text-14px'>{option.label}</span>
            {currentTool === option.key && <span className='ms-auto text-12px text-[var(--color-text-3)]'>✓</span>}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className='workspace-open-button flex items-center'>
      <Tooltip content={tooltipContent} mini>
        <Button
          type='text'
          size='small'
          className='workspace-open-button__btn flex items-center gap-4px ps-8px pe-4px'
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
          className='workspace-open-button__dropdown-btn ps-2px pe-4px'
          style={{ marginInlineStart: '-4px' }}
        >
          <Down size={12} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
        </Button>
      </Dropdown>
    </div>
  );
};

export default WorkspaceOpenButton;
