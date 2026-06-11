import type { IMcpServer } from '@/common/config/storage';
import { getAgents } from '@/renderer/hooks/agent/useAgents';
import React, { useEffect, useState } from 'react';
import JsonImportModal from './JsonImportModal';
import OneClickImportModal from './OneClickImportModal';

interface AddMcpServerModalProps {
  visible: boolean;
  server?: IMcpServer;
  existingServerNames?: string[];
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => Promise<void> | void;
  onBatchImport?: (
    servers: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]
  ) => Promise<IMcpServer[] | void> | IMcpServer[] | void;
  importMode?: 'json' | 'oneclick';
}

const AddMcpServerModal: React.FC<AddMcpServerModalProps> = ({
  visible,
  server,
  existingServerNames = [],
  onCancel,
  onSubmit,
  onBatchImport,
  importMode = 'json',
}) => {
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showOneClickModal, setShowOneClickModal] = useState(false);

  useEffect(() => {
    if (visible && !server) {
      // 初始化时检测可用的agents
      const loadAgents = async () => {
        try {
          const result = await getAgents();

          if (result.length > 0) {
            // 根据检测到的agents数量和importMode决定显示哪个模态框
            if (importMode === 'json') {
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
      <JsonImportModal
        visible={showJsonModal}
        server={server}
        onCancel={handleModalCancel}
        onSubmit={onSubmit}
        onBatchImport={onBatchImport}
      />
      <OneClickImportModal
        visible={showOneClickModal}
        existingServerNames={existingServerNames}
        onCancel={handleModalCancel}
        onBatchImport={onBatchImport}
      />
    </>
  );
};

export default AddMcpServerModal;
