/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Modal } from '@arco-design/web-react';
import React from 'react';

type DeleteConfirmModalProps = {
  visible: boolean;
  title: string;
  description: string;
  okText: string;
  cancelText: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  title,
  description,
  okText,
  cancelText,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal
      title={title}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ status: 'danger' }}
      okText={okText}
      cancelText={cancelText}
      className='w-[90vw] md:w-[400px]'
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <p>{description}</p>
    </Modal>
  );
};

export default DeleteConfirmModal;
