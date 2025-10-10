import type { IMcpServer } from '@/common/storage';
import { acpConversation } from '@/common/ipcBridge';
import React, { useEffect, useState } from 'react';
import JsonImportModal from './JsonImportModal';
import OneClickImportModal from './OneClickImportModal';

interface AddMcpServerModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
  importMode?: 'json' | 'oneclick';
}

const AddMcpServerModal: React.FC<AddMcpServerModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport, importMode = 'json' }) => {
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showOneClickModal, setShowOneClickModal] = useState(false);

  useEffect(() => {
    if (visible && !server) {
      // 初始化时检测可用的agents
      const loadAgents = async () => {
        try {
          const response = await acpConversation.getAvailableAgents.invoke();

          if (response.success && response.data) {
            const agents = response.data.map((agent) => ({ backend: agent.backend, name: agent.name }));

            // 根据检测到的agents数量和importMode决定显示哪个模态框
            if (agents.length === 0) {
              setShowJsonModal(true);
            } else if (importMode === 'json') {
              setShowJsonModal(true);
            } else if (importMode === 'oneclick') {
              setShowOneClickModal(true);
            }
          } else {
            setShowJsonModal(true);
          }
        } catch (error) {
          console.error('[AddMcpServerModal] Failed to load agents:', error);
          setShowJsonModal(true);
        }
      };
      void loadAgents();
    } else if (visible && server) {
      // 编辑现有服务器时直接显示JSON模态框
      setShowJsonModal(true);
    } else if (!visible) {
      // 当 modal 关闭时，重置状态
      setShowJsonModal(false);
      setShowOneClickModal(false);
    }
  }, [visible, server, importMode]);

  const handleModalCancel = () => {
    setShowJsonModal(false);
    setShowOneClickModal(false);
    onCancel();
  };

  if (!visible) return null;

  return (
    <>
      <JsonImportModal visible={showJsonModal} server={server} onCancel={handleModalCancel} onSubmit={onSubmit} onBatchImport={onBatchImport} />
      <OneClickImportModal visible={showOneClickModal} onCancel={handleModalCancel} onBatchImport={onBatchImport} />
    </>
  );
};

export default AddMcpServerModal;
