import type { AcpBackendConfig } from '@/types/acpTypes';
import { Alert } from '@arco-design/web-react';
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import AionModal from '@/renderer/components/base/AionModal';
import { uuid } from '@/common/utils';

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

const CustomAcpAgentModal: React.FC<CustomAcpAgentModalProps> = ({ visible, agent, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();
  const [jsonInput, setJsonInput] = useState('');
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });

  // JSON syntax validation
  const validateJsonSyntax = useCallback((input: string): ValidationResult => {
    if (!input.trim()) {
      return { isValid: true };
    }

    try {
      const parsed = JSON.parse(input);
      // Validate structure - defaultCliPath is required
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

  // Pre-fill when editing existing agent
  useEffect(() => {
    if (visible && agent) {
      // Convert existing agent to JSON for editing
      const config: AcpBackendConfig = {
        id: agent.id || 'custom',
        name: agent.name || 'My Agent',
        defaultCliPath: agent.defaultCliPath || '',
        enabled: agent.enabled ?? true,
        env: agent.env || {},
      };
      setJsonInput(JSON.stringify(config, null, 2));
    } else if (visible && !agent) {
      setJsonInput('');
    }
  }, [visible, agent]);

  const handleSubmit = () => {
    const parsed = JSON.parse(jsonInput);

    const customAgent: AcpBackendConfig = {
      // Keep existing id when editing, generate new UUID for new agents
      id: agent?.id || parsed.id || uuid(),
      name: parsed.name || 'My Agent',
      defaultCliPath: parsed.defaultCliPath,
      enabled: parsed.enabled ?? true,
      env: parsed.env || {},
      acpArgs: parsed.acpArgs,
    };

    onSubmit(customAgent);
  };

  if (!visible) return null;

  return (
    <AionModal visible={visible} onCancel={onCancel} onOk={handleSubmit} okButtonProps={{ disabled: !validation.isValid || !jsonInput.trim() }} header={{ title: agent ? t('settings.editCustomAgent') || 'Edit Custom Agent' : t('settings.configureCustomAgent') || 'Configure Custom Agent', showClose: true }} style={{ width: 600, height: 500 }} contentStyle={{ borderRadius: 16, padding: '24px', background: 'var(--bg-1)', overflow: 'auto', height: 500 - 80 }}>
      <div className='space-y-12px'>
        <div>
          <div className='mb-2 text-sm text-t-secondary'>{t('settings.customAcpAgentJsonDescription') || 'Paste your custom agent configuration JSON below'}</div>
          <CodeMirror
            value={jsonInput}
            height='280px'
            theme={theme}
            extensions={[json()]}
            onChange={(value: string) => setJsonInput(value)}
            placeholder={`{
  "id": "custom",
  "name": "My Agent",
  "defaultCliPath": "my-agent",
  "enabled": true,
  "env": {}
}`}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              dropCursor: false,
              allowMultipleSelections: false,
            }}
            style={{
              fontSize: '13px',
              border: validation.isValid || !jsonInput.trim() ? '1px solid var(--bg-3)' : '1px solid var(--danger)',
              borderRadius: '6px',
              marginBottom: '12px',
              overflow: 'hidden',
            }}
            className='[&_.cm-editor]:rounded-[6px]'
          />

          {/* JSON format error message */}
          {!validation.isValid && jsonInput.trim() && <div className='mt-2 text-sm text-red-600'>{validation.errorMessage}</div>}
        </div>

        <Alert
          type='info'
          showIcon
          content={
            <div>
              <div>{t('settings.customAcpAgentTips') || 'Configuration tips:'}</div>
              <ul className='list-disc pl-5 mt-2 space-y-1 text-sm'>
                <li>{t('settings.customAcpAgentTip1') || 'id: Always "custom" for user-configured agents'}</li>
                <li>{t('settings.customAcpAgentTip2') || 'name: Display name shown in the agent selector'}</li>
                <li>{t('settings.customAcpAgentTip3') || 'defaultCliPath: Command to run (e.g., "goose" or "npx @pkg/name --flag")'}</li>
                <li>{t('settings.customAcpAgentTip4') || 'env: Environment variables (e.g., API keys)'}</li>
              </ul>
            </div>
          }
        />
      </div>
    </AionModal>
  );
};

export default CustomAcpAgentModal;
