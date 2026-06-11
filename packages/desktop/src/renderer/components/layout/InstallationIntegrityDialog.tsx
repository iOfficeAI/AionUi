import { Modal, Typography } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const AIONUI_DOWNLOAD_URL = 'https://www.aionui.com/';

export function openDownloadLatest(): void {
  window.open(AIONUI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
}

export function getInstallationIntegrityTitle(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.title');
}

export function getBackendStartupInstallationDescription(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.description');
}

export function getRuntimeComponentInstallationDescription(t: TFunction, resource: string): string {
  return t('common.backendStartup.incompleteInstallation.runtimeComponentDescription', { resource });
}

export function getInstallationIntegrityDownloadText(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.downloadLatest');
}

export function getDownloadLatestModalActionProps(t: TFunction): {
  cancelButtonProps: {
    style: {
      display: 'none';
    };
  };
  okText: string;
  onOk: () => void;
} {
  return {
    okText: getInstallationIntegrityDownloadText(t),
    onOk: openDownloadLatest,
    cancelButtonProps: {
      style: {
        display: 'none',
      },
    },
  };
}

export const InstallationIntegrityContent: React.FC<{ description: string }> = ({ description }) => (
  <div className='text-t-1'>
    <Typography.Paragraph className='mb-0 text-t-secondary'>{description}</Typography.Paragraph>
  </div>
);

type InstallationIntegrityModalController = ReturnType<typeof Modal.useModal>[0];

export function showInstallationIntegrityModal(
  modal: InstallationIntegrityModalController,
  t: TFunction,
  description: string
): void {
  modal.error({
    title: getInstallationIntegrityTitle(t),
    content: <InstallationIntegrityContent description={description} />,
    ...getDownloadLatestModalActionProps(t),
    closable: false,
    maskClosable: false,
  });
}

export const InstallationIntegrityModalHost: React.FC<{ description: string }> = ({ description }) => {
  const [modal, modalContextHolder] = Modal.useModal();
  const { t } = useTranslation();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    showInstallationIntegrityModal(modal, t, description);
  }, [description, modal, t]);

  return <>{modalContextHolder}</>;
};
