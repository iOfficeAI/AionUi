import { Typography } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React from 'react';

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

export const InstallationIntegrityContent: React.FC<{ description: string }> = ({ description }) => (
  <div className='text-t-1'>
    <Typography.Paragraph className='mb-0 text-t-secondary'>{description}</Typography.Paragraph>
  </div>
);
