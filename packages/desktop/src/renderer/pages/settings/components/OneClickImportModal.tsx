import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import { mcpService } from '@/common/adapter/ipcBridge';
import { Button, Select, Spin, Tag, Tooltip } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '@icon-park/react';
import { iconColors } from '@/renderer/styles/colors';
import AionSteps from '@/renderer/components/base/AionSteps';
import AionModal from '@/renderer/components/base/AionModal';

type DetectedMcpServer = IMcpServer & {
  importable: boolean;
  import_skip_reason?: string;
};

const IMPORTABLE_AGENTS = [
  { backend: 'claude', name: 'Claude' },
  { backend: 'codex', name: 'Codex' },
] as const;

const normalizeImportSkipReason = (reason: string | undefined) =>
  reason
    ?.trim()
    .replace(/^[✓✗!•\-*✔✘:[\]\s]+/, '')
    .trim();

const getUnsupportedReasonDetail = (reason: string | undefined, t: ReturnType<typeof useTranslation>['t']) => {
  const normalizedReason = normalizeImportSkipReason(reason);

  if (!normalizedReason || normalizedReason === 'Connected') {
    return undefined;
  }

  if (normalizedReason === 'Plugin-managed MCP') {
    return t('settings.mcpImportSkippedPluginManaged');
  }
  if (normalizedReason === 'Disabled') {
    return t('settings.mcpImportSkippedDisabled');
  }
  if (normalizedReason === 'Needs authentication') {
    return t('settings.mcpImportSkippedNeedsAuth');
  }
  if (normalizedReason === 'Disconnected' || normalizedReason === 'Failed to connect') {
    return t('settings.mcpImportSkippedUnavailable');
  }
  return normalizedReason;
};

type ImportStatus = {
  color: 'arcoblue' | 'green' | 'gray';
  label: string;
  detail?: string;
};

interface OneClickImportModalProps {
  visible: boolean;
  existingServerNames?: string[];
  onCancel: () => void;
  onBatchImport?: (
    servers: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]
  ) => Promise<IMcpServer[] | void> | IMcpServer[] | void;
}

const OneClickImportModal: React.FC<OneClickImportModalProps> = ({
  visible,
  existingServerNames = [],
  onCancel,
  onBatchImport,
}) => {
  const { t } = useTranslation();
  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [fetchedServers, setFetchedServers] = useState<DetectedMcpServer[]>([]);
  const [importedServers, setImportedServers] = useState<IMcpServer[]>([]);
  const [loadingImport, setLoadingImport] = useState(false);
  const [submittingImport, setSubmittingImport] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const existingNameSet = React.useMemo(() => new Set(existingServerNames), [existingServerNames]);
  const isEffectivelyImportable = React.useCallback(
    (server: DetectedMcpServer) =>
      server.importable || normalizeImportSkipReason(server.import_skip_reason) === 'Connected',
    []
  );
  const importableFetchedServers = React.useMemo(
    () => fetchedServers.filter((server) => isEffectivelyImportable(server) && !existingNameSet.has(server.name)),
    [existingNameSet, fetchedServers, isEffectivelyImportable]
  );
  const skippedFetchedServers = React.useMemo(
    () => fetchedServers.filter((server) => !isEffectivelyImportable(server) || existingNameSet.has(server.name)),
    [existingNameSet, fetchedServers, isEffectivelyImportable]
  );
  const orderedFetchedServers = React.useMemo(
    () => [...importableFetchedServers, ...skippedFetchedServers],
    [importableFetchedServers, skippedFetchedServers]
  );
  const importedNameSet = React.useMemo(() => new Set(importedServers.map((server) => server.name)), [importedServers]);

  const getFetchStatus = React.useCallback(
    (server: DetectedMcpServer): ImportStatus => {
      if (existingNameSet.has(server.name)) {
        return {
          color: 'gray' as const,
          label: t('settings.mcpImportSkippedAlreadyExists'),
        };
      }
      if (!isEffectivelyImportable(server)) {
        return {
          color: 'gray' as const,
          label: t('settings.mcpImportSkipped'),
          detail: getUnsupportedReasonDetail(server.import_skip_reason, t),
        };
      }
      return {
        color: 'arcoblue' as const,
        label: t('settings.mcpStatusReady'),
      };
    },
    [existingNameSet, isEffectivelyImportable, t]
  );

  const getImportResultStatus = React.useCallback(
    (server: DetectedMcpServer): ImportStatus => {
      if (importedNameSet.has(server.name)) {
        return {
          color: 'green' as const,
          label: t('settings.mcpStatusImported'),
        };
      }
      if (existingNameSet.has(server.name)) {
        return {
          color: 'gray' as const,
          label: t('settings.mcpImportSkippedAlreadyExists'),
        };
      }
      return {
        color: 'gray' as const,
        label: t('settings.mcpImportSkipped'),
        detail: getUnsupportedReasonDetail(server.import_skip_reason, t),
      };
    },
    [existingNameSet, importedNameSet, t]
  );

  const renderStatusTag = (status: ImportStatus) => {
    const tag = <Tag color={status.color}>{status.label}</Tag>;
    if (!status.detail) {
      return tag;
    }

    return (
      <Tooltip content={status.detail} position='top'>
        <span className='inline-flex'>{tag}</span>
      </Tooltip>
    );
  };

  useEffect(() => {
    if (visible) {
      // 重置状态
      setCurrentStep(1);
      setSelectedAgent(IMPORTABLE_AGENTS[0].backend);
      setFetchedServers([]);
      setImportedServers([]);
      setDetectedAgents([...IMPORTABLE_AGENTS]);
      setLoadingImport(false);
      setSubmittingImport(false);
    }
  }, [visible]);

  const handleNextStep = async () => {
    if (currentStep === 1) {
      // 步骤1 -> 步骤2: 选择Agent后，进入获取MCP阶段
      if (!selectedAgent) return;
      setCurrentStep(2);
      setImportedServers([]);
      await handleImportFromCLI();
    } else if (currentStep === 2) {
      // 步骤2 -> 步骤3: 执行导入，显示成功页面
      if (submittingImport) {
        return;
      }

      setSubmittingImport(true);
      try {
        await handleBatchImport();
        setCurrentStep(3);
      } catch (error) {
        console.error('Failed to batch import MCP servers:', error);
      } finally {
        setSubmittingImport(false);
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
      setFetchedServers([]);
      setLoadingImport(false);
    }
  };

  const handleImportFromCLI = async () => {
    setLoadingImport(true);
    try {
      const mcpConfigs = await mcpService.getAgentMcpConfigs.invoke();
      const selectedConfig = mcpConfigs.find((agentConfig) => agentConfig.source === selectedAgent);
      const allServers = (selectedConfig?.servers ?? []) as DetectedMcpServer[];
      setFetchedServers(allServers);
    } catch (error) {
      console.error('Failed to import from CLI:', error);
      setFetchedServers([]);
    } finally {
      setLoadingImport(false);
    }
  };

  const handleBatchImport = async () => {
    if (onBatchImport && fetchedServers.length > 0) {
      const serversToImport = importableFetchedServers.map((server) => {
        // 为CLI导入的服务器生成标准的JSON格式
        const serverConfig: Record<string, string | string[] | Record<string, string>> = {
          description: server.description,
        };

        if (server.transport.type === 'stdio') {
          serverConfig.command = server.transport.command;
          if (server.transport.args?.length) {
            serverConfig.args = server.transport.args;
          }
          if (server.transport.env && Object.keys(server.transport.env).length) {
            serverConfig.env = server.transport.env;
          }
        } else {
          serverConfig.type = server.transport.type;
          serverConfig.url = server.transport.url;
          if (server.transport.headers && Object.keys(server.transport.headers).length) {
            serverConfig.headers = server.transport.headers;
          }
        }

        return {
          name: server.name,
          description: server.description,
          enabled: server.enabled,
          transport: server.transport,
          last_test_status: server.last_test_status as IMcpServer['last_test_status'],
          tools: (server.tools || []) as IMcpTool[], // 保留原始的 tools 信息
          original_json: JSON.stringify({ mcpServers: { [server.name]: serverConfig } }, null, 2),
        };
      });

      const result = await onBatchImport(serversToImport);
      setImportedServers(Array.isArray(result) ? result : []);
      return;
    }

    setImportedServers([]);
  };

  // 渲染步骤1: 选择Agent
  const renderStep1 = () => (
    <div className='py-4'>
      <Select
        placeholder={t('settings.mcpSelectCLI')}
        value={selectedAgent}
        onChange={setSelectedAgent}
        className='w-full'
        size='large'
      >
        {detectedAgents.map((agent) => (
          <Select.Option key={agent.backend} value={agent.backend}>
            {agent.name}
          </Select.Option>
        ))}
      </Select>
    </div>
  );

  // 渲染步骤2: 获取MCP工具列表
  const renderStep2 = () => (
    <div>
      {loadingImport ? (
        <div className='py-8'>
          <div className='flex items-center gap-3 bg-fill-1 rounded-lg p-4'>
            <Spin size={20} />
            <div className='text-t-secondary text-sm'>{t('settings.mcpLoadingTools')}</div>
          </div>
        </div>
      ) : fetchedServers.length > 0 ? (
        <div>
          <div className='mb-3 flex items-center gap-2'>
            <Check theme='filled' size={20} fill={iconColors.success} />
            <span className='text-t-primary'>{t('settings.mcpToolsLoaded', { count: fetchedServers.length })}</span>
          </div>
          <div className='mb-3 flex flex-wrap gap-2'>
            <Tag color='arcoblue'>{t('settings.mcpWillImportCount', { count: importableFetchedServers.length })}</Tag>
            <Tag color='gray'>{t('settings.mcpSkippedCount', { count: skippedFetchedServers.length })}</Tag>
          </div>
          <div className='bg-base rounded-lg max-h-[320px] overflow-y-auto'>
            {orderedFetchedServers.map((server, index) => {
              const status = getFetchStatus(server);
              return (
                <div
                  key={index}
                  className='p-3'
                  style={
                    index < orderedFetchedServers.length - 1 ? { borderBottom: '1px solid var(--bg-3)' } : undefined
                  }
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div className='font-medium text-t-primary'>{server.name}</div>
                    {renderStatusTag(status)}
                  </div>
                  {server.description && <div className='text-sm text-t-secondary mt-1'>{server.description}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className='text-center py-8 text-t-secondary'>{t('settings.mcpNoServersFound')}</div>
      )}
    </div>
  );

  // 渲染步骤3: 导入成功
  const renderStep3 = () => (
    <div>
      <div>
        <div className='mb-3 flex items-center gap-2'>
          <Check theme='filled' size={20} fill={iconColors.success} />
          <span className='text-t-primary'>{t('settings.mcpImportedSuccess', { count: importedServers.length })}</span>
        </div>
        <div className='mb-3 flex flex-wrap gap-2'>
          <Tag color='green'>{t('settings.mcpImportedCount', { count: importedServers.length })}</Tag>
          <Tag color='gray'>
            {t('settings.mcpSkippedCount', { count: fetchedServers.length - importedServers.length })}
          </Tag>
        </div>
        {fetchedServers.length > 0 ? (
          <div className='bg-base rounded-lg max-h-[320px] overflow-y-auto'>
            {orderedFetchedServers.map((server, index) => {
              const status = getImportResultStatus(server);
              return (
                <div
                  key={index}
                  className='p-3'
                  style={
                    index < orderedFetchedServers.length - 1 ? { borderBottom: '1px solid var(--bg-3)' } : undefined
                  }
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div className='font-medium text-t-primary'>{server.name}</div>
                    {renderStatusTag(status)}
                  </div>
                  {server.description && <div className='text-sm text-t-secondary mt-1'>{server.description}</div>}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!visible) return null;

  const renderFooter = () => (
    <div className='flex justify-end gap-10px'>
      {currentStep === 1 && (
        <>
          <Button onClick={onCancel} className='min-w-100px' style={{ borderRadius: 8 }}>
            {t('common.cancel')}
          </Button>
          <Button
            type='primary'
            onClick={handleNextStep}
            disabled={!selectedAgent}
            className='min-w-120px'
            style={{ borderRadius: 8 }}
          >
            {t('settings.mcpNextStep')}
          </Button>
        </>
      )}
      {currentStep === 2 && (
        <>
          <Button onClick={handlePrevStep} className='min-w-100px' style={{ borderRadius: 8 }}>
            {t('settings.mcpPrevStep')}
          </Button>
          <Button
            type='primary'
            onClick={handleNextStep}
            loading={submittingImport}
            disabled={loadingImport || submittingImport || importableFetchedServers.length === 0}
            className='min-w-120px'
            style={{ borderRadius: 8 }}
          >
            {t('settings.mcpImportButton')}
          </Button>
        </>
      )}
      {currentStep === 3 && (
        <Button type='primary' onClick={onCancel} className='min-w-120px' style={{ borderRadius: 8 }}>
          {t('settings.mcpConfirmButton')}
        </Button>
      )}
    </div>
  );

  return (
    <AionModal
      variant='standard'
      header={{ title: t('settings.mcpOneKeyImport'), showClose: true }}
      visible={visible}
      onCancel={onCancel}
      footer={{ render: renderFooter }}
      style={{ width: 680 }}
    >
      <div className='flex min-h-0 flex-col'>
        <div className='mb-6 text-t-secondary text-sm'>{t('settings.mcpImportDescription')}</div>

        <div className='mb-6'>
          <AionSteps current={currentStep} size='small'>
            <AionSteps.Step
              title={t('settings.mcpStepSelectAgent')}
              icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined}
            />
            <AionSteps.Step
              title={t('settings.mcpStepFetchTools')}
              icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined}
            />
            <AionSteps.Step title={t('settings.mcpStepImportSuccess')} />
          </AionSteps>
        </div>

        <div className={`min-h-0 ${currentStep === 1 ? 'min-h-[60px]' : 'min-h-[180px]'}`}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </div>
    </AionModal>
  );
};

export default OneClickImportModal;
