/**
 * 自定义 ACP 代理配置弹窗
 * Custom ACP Agent Configuration Modal
 *
 * Redesigned modal with CLI card selection, logo display, and collapsible advanced JSON config.
 */
import type { AcpBackendConfig, AcpBackend } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import { Alert, Input, Spin, Collapse } from '@arco-design/web-react';
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionModal from '@/renderer/components/base/AionModal';
import { uuid } from '@/common/utils';
import { acpConversation } from '@/common/ipcBridge';
import { CheckSmall } from '@icon-park/react';

// CLI Logo 导入 / CLI Logo imports
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpencodeLogo from '@/renderer/assets/logos/opencode.svg';

/**
 * 后端 Logo 映射表，用于在 CLI 卡片中显示对应的图标
 * Backend logo mapping for displaying icons in CLI selection cards
 */
const BACKEND_LOGO_MAP: Record<string, string> = {
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpencodeLogo,
};

interface CustomAcpAgentModalProps {
  visible: boolean;
  agent?: AcpBackendConfig | null;
  onCancel: () => void;
  onSubmit: (agent: AcpBackendConfig) => void;
}

interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

interface DetectedAgent {
  backend: AcpBackend;
  name: string;
  cliPath?: string;
  acpArgs?: string[];
  customAgentId?: string;
}

const CustomAcpAgentModal: React.FC<CustomAcpAgentModalProps> = ({ visible, agent, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  // 组件状态 / Component state
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]); // 检测到的 CLI 列表 / Detected CLI list
  const [loadingAgents, setLoadingAgents] = useState(false); // 加载状态 / Loading state
  const [selectedCli, setSelectedCli] = useState<string>(''); // 当前选中的 CLI 路径 / Currently selected CLI path
  const [agentName, setAgentName] = useState(''); // 显示名称（独立于 JSON 配置）/ Display name (separate from JSON config)
  const [showAdvanced, setShowAdvanced] = useState(false); // 是否展开高级配置 / Whether advanced config is expanded
  const [jsonInput, setJsonInput] = useState(''); // JSON 配置内容（不含 name）/ JSON config content (excludes name)
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true }); // JSON 校验结果 / JSON validation result

  /**
   * 加载已检测到的 CLI 列表
   * Load detected CLI list from backend
   * 过滤规则：排除内置后端（gemini, codex）和需要认证的后端，只显示第三方独立 CLI
   * Filter rule: exclude built-in backends (gemini, codex) and auth-required backends, only show third-party CLIs
   */
  const loadDetectedAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const response = await acpConversation.getAvailableAgents.invoke();
      if (response.success && response.data) {
        // 只展示第三方独立 CLI（goose, auggie, kimi, opencode）
        // Only show third-party standalone CLIs (goose, auggie, kimi, opencode)
        const filteredAgents = response.data.filter((a) => {
          if (['gemini', 'custom', 'codex'].includes(a.backend)) return false;
          const backendConfig = ACP_BACKENDS_ALL[a.backend];
          return backendConfig && !backendConfig.authRequired;
        });
        setDetectedAgents(filteredAgents);
      }
    } catch (error) {
      console.error('Failed to load detected agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  /**
   * 生成 JSON 配置（不含 name 字段）
   * Generate JSON config (without name field)
   * name 统一从"显示名称"输入框获取，避免 JSON 和输入框中的 name 产生歧义
   * Name is taken from "Display Name" input to avoid ambiguity between JSON and input field
   */
  const generateJsonConfig = useCallback((selected: DetectedAgent) => {
    const config = {
      defaultCliPath: selected.cliPath || '',
      enabled: true,
      env: {},
      acpArgs: selected.acpArgs,
    };
    return JSON.stringify(config, null, 2);
  }, []);

  // JSON syntax validation
  const validateJsonSyntax = useCallback((input: string): ValidationResult => {
    if (!input.trim()) {
      return { isValid: true };
    }
    try {
      const parsed = JSON.parse(input);
      if (!parsed.defaultCliPath) {
        return { isValid: false, errorMessage: 'Missing required field: defaultCliPath' };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        errorMessage: error instanceof SyntaxError ? error.message : 'Invalid JSON format',
      };
    }
  }, []);

  // Update validation on input change
  useEffect(() => {
    setValidation(validateJsonSyntax(jsonInput));
  }, [jsonInput, validateJsonSyntax]);

  // 当 Modal 打开时初始化
  useEffect(() => {
    if (visible) {
      if (agent) {
        // 编辑模式：显示高级配置，name 从显示名称输入框获取
        setShowAdvanced(true);
        setAgentName(agent.name || 'Custom Agent');
        const config = {
          defaultCliPath: agent.defaultCliPath || '',
          enabled: agent.enabled ?? true,
          env: agent.env || {},
          acpArgs: agent.acpArgs,
        };
        setJsonInput(JSON.stringify(config, null, 2));
      } else {
        // 新增模式 / Add mode
        setSelectedCli('');
        setAgentName('');
        setJsonInput('');
        setShowAdvanced(false);
        void loadDetectedAgents(); // 显式标记为不需要等待 / Explicitly mark as fire-and-forget
      }
    }
  }, [visible, agent, loadDetectedAgents]);

  /**
   * 选择 CLI 的处理函数
   * Handle CLI card selection
   * 切换 CLI 时同步更新：选中状态、显示名称、JSON 配置
   * When switching CLI, synchronously update: selection state, display name, JSON config
   */
  const handleSelectCli = useCallback(
    (cliPath: string) => {
      const selected = detectedAgents.find((a) => a.cliPath === cliPath);
      if (selected) {
        setSelectedCli(cliPath);
        setAgentName(selected.name); // 自动填充 CLI 默认名称 / Auto-fill with CLI default name
        setJsonInput(generateJsonConfig(selected));
      }
    },
    [detectedAgents, generateJsonConfig]
  );

  // 当名称改变时同步更新 JSON（保持 JSON 与当前选中 CLI 一致）
  // Sync JSON when name changes (keep JSON consistent with selected CLI)
  useEffect(() => {
    if (selectedCli && agentName) {
      const selected = detectedAgents.find((a) => a.cliPath === selectedCli);
      if (selected) {
        setJsonInput(generateJsonConfig(selected));
      }
    }
  }, [agentName, selectedCli, detectedAgents, generateJsonConfig]);

  /**
   * 提交表单
   * Handle form submission
   * 根据是否展开高级配置决定数据来源：高级模式从 JSON 解析，简单模式从选中的 CLI 获取
   * Data source depends on advanced mode: parse from JSON in advanced mode, get from selected CLI in simple mode
   */
  const handleSubmit = () => {
    if (showAdvanced && jsonInput.trim()) {
      // 高级模式：解析 JSON，name 从显示名称输入框获取
      // Advanced mode: parse JSON, get name from display name input
      const parsed = JSON.parse(jsonInput);
      const customAgent: AcpBackendConfig = {
        id: agent?.id || parsed.id || uuid(),
        name: agentName || 'Custom Agent', // name 始终从输入框获取 / name always from input field
        defaultCliPath: parsed.defaultCliPath,
        enabled: parsed.enabled ?? true,
        env: parsed.env || {},
        acpArgs: parsed.acpArgs,
      };
      onSubmit(customAgent);
    } else {
      // 简单模式：直接使用选中的 CLI 配置
      // Simple mode: use selected CLI config directly
      const selected = detectedAgents.find((a) => a.cliPath === selectedCli);
      if (!selected) return;
      const customAgent: AcpBackendConfig = {
        id: uuid(),
        name: agentName || selected.name,
        defaultCliPath: selected.cliPath || '',
        enabled: true,
        env: {},
        acpArgs: selected.acpArgs,
      };
      onSubmit(customAgent);
    }
  };

  const isSubmitDisabled = () => {
    if (showAdvanced) {
      return !validation.isValid || !jsonInput.trim();
    }
    return !selectedCli || !agentName.trim();
  };

  if (!visible) return null;

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: isSubmitDisabled() }}
      header={{
        title: agent ? t('settings.editCustomAgent') || 'Edit Custom Agent' : t('settings.configureCustomAgent') || 'Add Custom Agent',
        showClose: true,
      }}
      style={{ width: 520, height: 'auto', maxHeight: '80vh' }}
      contentStyle={{
        borderRadius: 16,
        padding: '20px',
        background: 'var(--bg-1)',
        overflow: 'auto',
      }}
    >
      <div className='space-y-16px'>
        {/* CLI 选择卡片（仅新增模式显示）/ CLI selection cards (only shown in add mode) */}
        {!agent && (
          <div>
            <div className='mb-8px text-sm font-medium text-t-primary'>{t('settings.selectCli') || 'Select CLI'}</div>
            {loadingAgents ? (
              <div className='flex items-center justify-center py-16px'>
                <Spin />
              </div>
            ) : detectedAgents.length === 0 ? (
              <Alert type='warning' content={t('settings.noCliDetected') || 'No CLI tools detected. Please install an ACP-compatible CLI first.'} />
            ) : (
              <div className='grid grid-cols-2 gap-8px'>
                {detectedAgents.map((detectedAgent) => {
                  const logo = BACKEND_LOGO_MAP[detectedAgent.backend];
                  const isSelected = selectedCli === detectedAgent.cliPath;
                  return (
                    <div key={detectedAgent.cliPath} className={`p-10px rounded-lg cursor-pointer transition-all flex items-center gap-8px relative border ${isSelected ? 'bg-[var(--color-fill-2)] border-primary' : 'bg-[var(--bg-2)] border-transparent hover:bg-[var(--color-fill-2)] hover:border-[var(--color-border-2)]'}`} onClick={() => handleSelectCli(detectedAgent.cliPath || '')}>
                      {logo && <img src={logo} alt={`${detectedAgent.name} logo`} className='w-24px h-24px object-contain flex-shrink-0' />}
                      <div className='min-w-0 flex-1'>
                        <div className='font-medium text-sm text-t-primary'>{detectedAgent.name}</div>
                      </div>
                      {isSelected && <CheckSmall theme='filled' size={16} className='text-primary flex-shrink-0' />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 显示名称输入（选中 CLI 或编辑模式时显示）/ Display name input (shown when CLI selected or in edit mode) */}
        {(selectedCli || agent) && (
          <div>
            <div className='mb-8px text-sm font-medium text-t-primary'>{t('settings.agentDisplayName') || 'Display Name'}</div>
            <Input value={agentName} onChange={(v) => setAgentName(v)} placeholder={t('settings.agentNamePlaceholder') || 'Enter a name for this agent'} />
          </div>
        )}

        {/* 高级配置（可折叠 JSON 编辑器）/ Advanced config (collapsible JSON editor) */}
        {(selectedCli || agent) && (
          <Collapse
            activeKey={showAdvanced ? ['advanced'] : []}
            // Arco Collapse.onChange 签名：(key, keys, e) => void，第二个参数 keys 是当前激活的 key 数组
            // Arco Collapse.onChange signature: (key, keys, e) => void, second param keys is array of active keys
            onChange={(_key, keys) => setShowAdvanced(keys.includes('advanced'))}
            bordered={false}
            style={{ background: 'transparent' }}
          >
            <Collapse.Item name='advanced' header={<span className='text-sm text-t-secondary'>{t('settings.advancedMode') || 'Advanced Configuration'}</span>}>
              <div className='pt-8px'>
                <CodeMirror
                  value={jsonInput}
                  height='180px'
                  theme={theme}
                  extensions={[json()]}
                  onChange={(value: string) => setJsonInput(value)}
                  placeholder={`{
  "defaultCliPath": "my-agent",
  "enabled": true,
  "env": {},
  "acpArgs": ["--acp"]
}`}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: false,
                    allowMultipleSelections: false,
                  }}
                  style={{
                    fontSize: '12px',
                    border: validation.isValid || !jsonInput.trim() ? '1px solid var(--color-border-2)' : '1px solid var(--danger)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                  }}
                  className='[&_.cm-editor]:rounded-[6px]'
                />
                {!validation.isValid && jsonInput.trim() && <div className='mt-8px text-xs text-red-500'>{validation.errorMessage}</div>}
              </div>
            </Collapse.Item>
          </Collapse>
        )}
      </div>
    </AionModal>
  );
};

export default CustomAcpAgentModal;
