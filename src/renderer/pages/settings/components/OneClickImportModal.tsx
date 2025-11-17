import type { IMcpServer, IMcpTool } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { Button, Select, Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import AionSteps from '@/renderer/components/base/AionSteps';
import AionModal from '@/renderer/components/base/AionModal';

interface OneClickImportModalProps {
  visible: boolean;
  onCancel: () => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

const OneClickImportModal: React.FC<OneClickImportModalProps> = ({ visible, onCancel, onBatchImport }) => {
  const { t } = useTranslation();
  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [importableServers, setImportableServers] = useState<IMcpServer[]>([]);
  const [loadingImport, setLoadingImport] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(1);

  useEffect(() => {
    if (visible) {
      // 重置状态
      setCurrentStep(1);
      setSelectedAgent('');
      setImportableServers([]);
      setLoadingImport(false);

      // 初始化时检测可用的agents
      const loadAgents = async () => {
        try {
          const response = await acpConversation.getAvailableAgents.invoke();
          if (response.success && response.data) {
            const agents = response.data.map((agent) => ({ backend: agent.backend, name: agent.name }));
            setDetectedAgents(agents);
            // 设置第一个agent为默认值
            if (agents.length > 1) {
              setSelectedAgent(agents[0].backend);
            }
          }
        } catch (error) {
          console.error('Failed to load agents:', error);
        }
      };
      void loadAgents();
    }
  }, [visible]);

  const handleNextStep = async () => {
    if (currentStep === 1) {
      // 步骤1 -> 步骤2: 选择Agent后，进入获取MCP阶段
      if (!selectedAgent) return;
      setCurrentStep(2);
      await handleImportFromCLI();
    } else if (currentStep === 2) {
      // 步骤2 -> 步骤3: 执行导入，显示成功页面
      handleBatchImport();
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
      setImportableServers([]);
      setLoadingImport(false);
    }
  };

  const handleImportFromCLI = async () => {
    setLoadingImport(true);
    try {
      // 获取所有可用的agents
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (!agentsResponse.success || !agentsResponse.data) {
        throw new Error('Failed to get available agents');
      }

      // 通过IPC调用后端服务获取MCP配置
      const mcpResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);
      if (mcpResponse.success && mcpResponse.data) {
        const allServers: IMcpServer[] = [];

        // 过滤选中的agent的服务器
        mcpResponse.data.forEach((agentConfig) => {
          if (agentConfig.source === selectedAgent) {
            allServers.push(...agentConfig.servers);
          }
        });

        setImportableServers(allServers);
      } else {
        throw new Error(mcpResponse.msg || 'Failed to get MCP configs');
      }
    } catch (error) {
      console.error('Failed to import from CLI:', error);
      setImportableServers([]);
    } finally {
      setLoadingImport(false);
    }
  };

  const handleBatchImport = () => {
    if (onBatchImport && importableServers.length > 0) {
      const serversToImport = importableServers.map((server) => {
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
          status: server.status as IMcpServer['status'],
          tools: (server.tools || []) as IMcpTool[], // 保留原始的 tools 信息
          originalJson: JSON.stringify({ mcpServers: { [server.name]: serverConfig } }, null, 2),
        };
      });
      onBatchImport(serversToImport);
    }
  };

  // 渲染步骤1: 选择Agent
  const renderStep1 = () => (
    <div className='py-4'>
      <Select placeholder={t('settings.mcpSelectCLI')} value={selectedAgent} onChange={setSelectedAgent} className='w-full' size='large'>
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
      ) : importableServers.length > 0 ? (
        <div>
          <div className='mb-3 flex items-center gap-2'>
            <Check theme='filled' size={20} fill={iconColors.success} />
            <span className='text-t-primary'>{t('settings.mcpToolsLoaded', { count: importableServers.length })}</span>
          </div>
          <div className='bg-base rounded-lg max-h-[200px] overflow-y-auto'>
            {importableServers.map((server, index) => (
              <div key={index} className='p-3' style={index < importableServers.length - 1 ? { borderBottom: '1px solid var(--bg-3)' } : undefined}>
                <div className='font-medium text-t-primary'>{server.name}</div>
                {server.description && <div className='text-sm text-t-secondary mt-1'>{server.description}</div>}
              </div>
            ))}
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
      {importableServers.length > 0 ? (
        <div>
          <div className='mb-3 flex items-center gap-2'>
            <Check theme='filled' size={20} fill={iconColors.success} />
            <span className='text-t-primary'>{t('settings.mcpImportedSuccess', { count: importableServers.length })}</span>
          </div>
          <div className='bg-base rounded-lg max-h-[200px] overflow-y-auto'>
            {importableServers.map((server, index) => (
              <div key={index} className='p-3' style={index < importableServers.length - 1 ? { borderBottom: '1px solid var(--bg-3)' } : undefined}>
                <div className='font-medium text-t-primary'>{server.name}</div>
                {server.description && <div className='text-sm text-t-secondary mt-1'>{server.description}</div>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className='text-center py-8 text-t-secondary'>{t('settings.mcpNoServersFound')}</div>
      )}
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
          <Button type='primary' onClick={handleNextStep} disabled={!selectedAgent} className='min-w-120px' style={{ borderRadius: 8 }}>
            {t('settings.mcpNextStep')}
          </Button>
        </>
      )}
      {currentStep === 2 && (
        <>
          <Button onClick={handlePrevStep} className='min-w-100px' style={{ borderRadius: 8 }}>
            {t('settings.mcpPrevStep')}
          </Button>
          <Button type='primary' onClick={handleNextStep} disabled={loadingImport || importableServers.length === 0} className='min-w-120px' style={{ borderRadius: 8 }}>
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
    <AionModal header={{ title: t('settings.mcpOneKeyImport'), showClose: true }} visible={visible} onCancel={onCancel} footer={{ render: renderFooter }} style={{ width: 600, height: 420 }} contentStyle={{ borderRadius: 16, padding: '24px', background: 'var(--bg-1)', overflow: 'hidden', height: 420 - 96 }}>
      <div className='flex flex-col h-275px mt-20px'>
        <div className='mb-6 text-t-secondary text-sm'>{t('settings.mcpImportDescription')}</div>

        <div className='mb-6'>
          <AionSteps current={currentStep} size='small'>
            <AionSteps.Step title={t('settings.mcpStepSelectAgent')} icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
            <AionSteps.Step title={t('settings.mcpStepFetchTools')} icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
            <AionSteps.Step title={t('settings.mcpStepImportSuccess')} />
          </AionSteps>
        </div>

        <div className={`mb-6 flex-1 overflow-y-auto ${currentStep === 1 ? 'min-h-[60px]' : 'min-h-[180px]'}`}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </div>
    </AionModal>
  );
};

export default OneClickImportModal;
