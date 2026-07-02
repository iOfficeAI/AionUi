import type { IMcpServer } from '@/common/config/storage';
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
      if (importMode === 'json') {
        setShowJsonModal(true);
      } else if (importMode === 'oneclick') {
        setShowOneClickModal(true);
      }
    } else if (visible && server) {
      setShowJsonModal(true);
    } else if (!visible) {
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
