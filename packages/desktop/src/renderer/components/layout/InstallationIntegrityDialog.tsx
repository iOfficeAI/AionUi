import { Button, Message, Modal, Space, Typography } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type FeedbackEventTags, submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

const AIONUI_DOWNLOAD_URL = 'https://www.aionui.com/';
const INSTALLATION_INTEGRITY_REPORT_FLUSH_TIMEOUT_MS = 2000;

type InstallationIntegrityDialogKind = 'incomplete_installation' | 'data_migration' | 'local_data_repair';

export type InstallationIntegrityDiagnostics = {
  source: 'backend_startup_failure' | 'runtime_status';
  description?: string;
  runtime?: {
    failureKind?: string;
    message?: string;
    phase?: string;
    resource?: string;
    resourceId?: string;
    scopeId?: string;
    scopeKind?: string;
  };
  backendStartupFailure?: Record<string, unknown> | null;
};

export function openDownloadLatest(): void {
  window.open(AIONUI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
}

export function getInstallationIntegrityTitle(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  if (diagnosticsKind === 'local_data_repair') return t('common.backendStartup.localDataRepair.title');
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.title')
    : t('common.backendStartup.incompleteInstallation.title');
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

export function getInstallationIntegritySendDiagnosticsText(t: TFunction): string {
  return t('common.backendStartup.incompleteInstallation.sendDiagnostics');
}

export function getInstallationIntegrityDiagnosticsSentText(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  if (diagnosticsKind === 'local_data_repair') return t('common.backendStartup.localDataRepair.diagnosticsSent');
  return diagnosticsKind === 'data_migration'
    ? t('common.backendStartup.dataMigration.diagnosticsSent')
    : t('common.backendStartup.incompleteInstallation.diagnosticsSent');
}

function buildInstallationIntegrityTags(diagnostics: InstallationIntegrityDiagnostics): FeedbackEventTags {
  const tags: FeedbackEventTags = {
    'aionui.installation_integrity.user_report': 'true',
    'aionui.installation_integrity.report_source': diagnostics.source,
  };

  if (diagnostics.runtime?.failureKind) {
    tags['aionui.installation_integrity.failure_kind'] = diagnostics.runtime.failureKind;
  }
  if (diagnostics.runtime?.resource) {
    tags['aionui.runtime_resource'] = diagnostics.runtime.resource;
  }
  if (diagnostics.runtime?.resourceId) {
    tags['aionui.runtime_resource_id'] = diagnostics.runtime.resourceId;
  }
  if (diagnostics.runtime?.scopeKind) {
    tags['aionui.runtime_scope'] = diagnostics.runtime.scopeKind;
  }

  const reason = diagnostics.backendStartupFailure?.reason;
  if (typeof reason === 'string') {
    tags['aionui.backend_startup_failure.reason'] = reason;
  }
  const backendBoundaryCode = diagnostics.backendStartupFailure?.backendBoundaryCode;
  if (typeof backendBoundaryCode === 'string') {
    tags['aionui.backend_startup_failure.backend_boundary_code'] = backendBoundaryCode;
  }
  const backendBoundaryStage = diagnostics.backendStartupFailure?.backendBoundaryStage;
  if (typeof backendBoundaryStage === 'string') {
    tags['aionui.backend_startup_failure.backend_boundary_stage'] = backendBoundaryStage;
  }

  return tags;
}

export async function reportInstallationIntegrityDiagnostics(
  diagnostics: InstallationIntegrityDiagnostics,
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): Promise<void> {
  await submitFeedbackReport({
    collectLogs: true,
    description: diagnostics.description ?? getBackendStartupInstallationDescription(t),
    extra: {
      installation_integrity: diagnostics,
    },
    flushTimeoutMs: INSTALLATION_INTEGRITY_REPORT_FLUSH_TIMEOUT_MS,
    module: 'installation-integrity',
    moduleLabel: getInstallationIntegrityTitle(t, diagnosticsKind),
    tags: buildInstallationIntegrityTags(diagnostics),
  });

  if (typeof window !== 'undefined' && window.__aionuiE2ETest) {
    window.__installationIntegrityReportCount = (window.__installationIntegrityReportCount ?? 0) + 1;
    window.__lastInstallationIntegrityReportMessage = 'installation-integrity-user-report';
  }
}

export function getInstallationIntegrityModalActions(
  t: TFunction,
  options: {
    diagnosticsKind?: InstallationIntegrityDialogKind;
    onDownloadLatest?: () => void;
    onReportDiagnostics?: () => Promise<unknown> | void;
  } = {}
): {
  downloadText?: string;
  onDownloadLatest: () => void;
  onReportDiagnostics: () => Promise<unknown> | void;
  reportText: string;
} {
  const diagnosticsKind = options.diagnosticsKind ?? 'incomplete_installation';
  return {
    downloadText: diagnosticsKind === 'incomplete_installation' ? getInstallationIntegrityDownloadText(t) : undefined,
    onDownloadLatest: options.onDownloadLatest ?? openDownloadLatest,
    onReportDiagnostics: options.onReportDiagnostics ?? (() => Promise.resolve()),
    reportText:
      diagnosticsKind === 'local_data_repair'
        ? t('common.backendStartup.localDataRepair.sendDiagnostics')
        : diagnosticsKind === 'data_migration'
          ? t('common.backendStartup.dataMigration.sendDiagnostics')
          : getInstallationIntegritySendDiagnosticsText(t),
  };
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
  <div className='text-t-1' data-testid='installation-integrity-dialog'>
    <Typography.Paragraph className='mb-0 text-t-secondary' data-testid='installation-integrity-description'>
      {description}
    </Typography.Paragraph>
  </div>
);

const InstallationIntegrityFooter: React.FC<{
  diagnostics?: InstallationIntegrityDiagnostics;
  diagnosticsKind?: InstallationIntegrityDialogKind;
}> = ({ diagnostics, diagnosticsKind = 'incomplete_installation' }) => {
  const { t } = useTranslation();
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const actions = getInstallationIntegrityModalActions(t, {
    diagnosticsKind,
    onReportDiagnostics: diagnostics
      ? () => reportInstallationIntegrityDiagnostics(diagnostics, t, diagnosticsKind)
      : undefined,
  });

  const handleReportDiagnostics = async () => {
    if (!diagnostics || reporting || reported) return;
    setReporting(true);
    try {
      await actions.onReportDiagnostics();
      setReported(true);
      Message.success(
        diagnosticsKind === 'local_data_repair'
          ? t('common.backendStartup.localDataRepair.diagnosticsReportSuccess')
          : diagnosticsKind === 'data_migration'
            ? t('common.backendStartup.dataMigration.diagnosticsReportSuccess')
            : t('common.backendStartup.incompleteInstallation.diagnosticsReportSuccess')
      );
    } catch {
      Message.error(
        diagnosticsKind === 'local_data_repair'
          ? t('common.backendStartup.localDataRepair.diagnosticsReportFailed')
          : diagnosticsKind === 'data_migration'
            ? t('common.backendStartup.dataMigration.diagnosticsReportFailed')
            : t('common.backendStartup.incompleteInstallation.diagnosticsReportFailed')
      );
    } finally {
      setReporting(false);
    }
  };

  return (
    <Space>
      <Button
        data-testid='installation-integrity-report'
        disabled={!diagnostics || reported}
        loading={reporting}
        onClick={handleReportDiagnostics}
      >
        {reported ? getInstallationIntegrityDiagnosticsSentText(t, diagnosticsKind) : actions.reportText}
      </Button>
      {actions.downloadText ? (
        <Button data-testid='installation-integrity-download' type='primary' onClick={actions.onDownloadLatest}>
          {actions.downloadText}
        </Button>
      ) : null}
    </Space>
  );
};

type InstallationIntegrityModalController = ReturnType<typeof Modal.useModal>[0];

export function showInstallationIntegrityModal(
  modal: InstallationIntegrityModalController,
  t: TFunction,
  description: string,
  diagnostics?: InstallationIntegrityDiagnostics,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): void {
  modal.error({
    title: getInstallationIntegrityTitle(t, diagnosticsKind),
    content: <InstallationIntegrityContent description={description} />,
    footer: <InstallationIntegrityFooter diagnostics={diagnostics} diagnosticsKind={diagnosticsKind} />,
    closable: false,
    maskClosable: false,
  });
}

export const InstallationIntegrityModalHost: React.FC<{
  description: string;
  diagnostics?: InstallationIntegrityDiagnostics;
  diagnosticsKind?: InstallationIntegrityDialogKind;
}> = ({ description, diagnostics, diagnosticsKind = 'incomplete_installation' }) => {
  const [modal, modalContextHolder] = Modal.useModal();
  const { t } = useTranslation();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    showInstallationIntegrityModal(modal, t, description, diagnostics, diagnosticsKind);
  }, [description, diagnostics, diagnosticsKind, modal, t]);

  return <>{modalContextHolder}</>;
};
