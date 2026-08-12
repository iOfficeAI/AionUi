import { Button, Message, Modal, Space, Typography } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type FeedbackEventTags, submitFeedbackReport } from '@/renderer/services/feedback/submitFeedbackReport';

const AIONUI_DOWNLOAD_URL = 'https://www.aionui.com/';
const INSTALLATION_INTEGRITY_REPORT_FLUSH_TIMEOUT_MS = 2000;

type InstallationIntegrityDialogKind =
  | 'incomplete_installation'
  | 'data_migration'
  | 'database_newer_than_app'
  | 'local_data_repair'
  | 'recoverable_database_corruption'
  | 'transient_concurrent_startup'
  | 'startup_directory'
  | 'backend_exited'
  | 'port_report_timeout'
  | 'startup_failed';

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

/**
 * Per-kind dialog configuration: which `common.backendStartup.*` section the
 * copy lives in, and which footer actions the dialog offers. One row per kind
 * replaces the previous per-suffix ternary chains.
 *
 * `showDiagnostics: false` kinds (the downgrade dialog) have no diagnostics
 * button at all: the root cause is fully understood and the only remedy is
 * updating, so the single download action stays unambiguous.
 */
const DIALOG_KIND_CONFIG: Record<
  InstallationIntegrityDialogKind,
  {
    i18nSection: string;
    showDiagnostics: boolean;
    showDiagnosticsHint?: boolean;
    showDownloadLatest?: boolean;
    showRecover?: boolean;
  }
> = {
  incomplete_installation: { i18nSection: 'incompleteInstallation', showDiagnostics: true, showDownloadLatest: true },
  data_migration: { i18nSection: 'dataMigration', showDiagnostics: true },
  database_newer_than_app: { i18nSection: 'databaseNewerThanApp', showDiagnostics: false, showDownloadLatest: true },
  local_data_repair: { i18nSection: 'localDataRepair', showDiagnostics: true },
  recoverable_database_corruption: {
    i18nSection: 'recoverableDatabaseCorruption',
    showDiagnostics: true,
    showDiagnosticsHint: true,
    showRecover: true,
  },
  transient_concurrent_startup: {
    i18nSection: 'transientConcurrentStartup',
    showDiagnostics: true,
    showDiagnosticsHint: true,
  },
  startup_directory: { i18nSection: 'startupDirectory', showDiagnostics: true },
  backend_exited: { i18nSection: 'exited', showDiagnostics: true },
  port_report_timeout: { i18nSection: 'portReportTimeout', showDiagnostics: true },
  startup_failed: { i18nSection: 'startupFailed', showDiagnostics: true },
};

function dialogKindText(t: TFunction, diagnosticsKind: InstallationIntegrityDialogKind, suffix: string): string {
  return t(`common.backendStartup.${DIALOG_KIND_CONFIG[diagnosticsKind].i18nSection}.${suffix}`);
}

export function getInstallationIntegrityTitle(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  return dialogKindText(t, diagnosticsKind, 'title');
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

export function getInstallationIntegrityDiagnosticsSentText(
  t: TFunction,
  diagnosticsKind: InstallationIntegrityDialogKind = 'incomplete_installation'
): string {
  // Kinds without a diagnostics button have no diagnosticsSent copy of their
  // own; fall back to the generic text (unreachable from the dialog footer).
  const kind = DIALOG_KIND_CONFIG[diagnosticsKind].showDiagnostics ? diagnosticsKind : 'incomplete_installation';
  return dialogKindText(t, kind, 'diagnosticsSent');
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
    onRecoverCorruptedDatabase?: () => Promise<unknown> | void;
    onReportDiagnostics?: () => Promise<unknown> | void;
  } = {}
): {
  downloadText?: string;
  onDownloadLatest: () => void;
  onRecoverCorruptedDatabase: () => Promise<unknown> | void;
  onReportDiagnostics: () => Promise<unknown> | void;
  recoverText?: string;
  reportText?: string;
} {
  const diagnosticsKind = options.diagnosticsKind ?? 'incomplete_installation';
  const config = DIALOG_KIND_CONFIG[diagnosticsKind];
  return {
    downloadText: config.showDownloadLatest ? getInstallationIntegrityDownloadText(t) : undefined,
    onDownloadLatest: options.onDownloadLatest ?? openDownloadLatest,
    onRecoverCorruptedDatabase: options.onRecoverCorruptedDatabase ?? (() => Promise.resolve()),
    onReportDiagnostics: options.onReportDiagnostics ?? (() => Promise.resolve()),
    recoverText: config.showRecover ? dialogKindText(t, diagnosticsKind, 'confirmRebuild') : undefined,
    reportText: config.showDiagnostics ? dialogKindText(t, diagnosticsKind, 'sendDiagnostics') : undefined,
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

export const InstallationIntegrityContent: React.FC<{ description: string; diagnosticsHint?: string }> = ({
  description,
  diagnosticsHint,
}) => (
  <div className='text-t-1' data-testid='installation-integrity-dialog'>
    <Typography.Paragraph className='mb-0 text-t-secondary' data-testid='installation-integrity-description'>
      {description}
    </Typography.Paragraph>
    {diagnosticsHint ? (
      <Typography.Paragraph className='mt-12px mb-0 text-12px text-t-tertiary'>{diagnosticsHint}</Typography.Paragraph>
    ) : null}
  </div>
);

export const InstallationIntegrityFooter: React.FC<{
  diagnostics?: InstallationIntegrityDiagnostics;
  diagnosticsKind?: InstallationIntegrityDialogKind;
}> = ({ diagnostics, diagnosticsKind = 'incomplete_installation' }) => {
  const { t } = useTranslation();
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const actions = getInstallationIntegrityModalActions(t, {
    diagnosticsKind,
    onRecoverCorruptedDatabase: () => window.electronAPI?.recoverCorruptedDatabase?.(),
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
      Message.success(dialogKindText(t, diagnosticsKind, 'diagnosticsReportSuccess'));
    } catch {
      Message.error(dialogKindText(t, diagnosticsKind, 'diagnosticsReportFailed'));
    } finally {
      setReporting(false);
    }
  };

  const handleRecoverCorruptedDatabase = () => {
    if (recovering) return;
    // Rebuild is destructive (backs up the corrupted DB and creates an empty one),
    // so gate it behind an explicit second confirmation before invoking recovery.
    Modal.confirm({
      title: t('common.backendStartup.recoverableDatabaseCorruption.confirmDialog.title'),
      content: t('common.backendStartup.recoverableDatabaseCorruption.confirmDialog.content'),
      okText: t('common.backendStartup.recoverableDatabaseCorruption.confirmDialog.okText'),
      cancelText: t('common.backendStartup.recoverableDatabaseCorruption.confirmDialog.cancelText'),
      onOk: async () => {
        setRecovering(true);
        try {
          await actions.onRecoverCorruptedDatabase();
        } catch {
          Message.error(t('common.backendStartup.recoverableDatabaseCorruption.rebuildFailed'));
          setRecovering(false);
        }
      },
    });
  };

  return (
    <Space>
      {actions.reportText ? (
        <Button
          data-testid='installation-integrity-report'
          disabled={!diagnostics || reported}
          loading={reporting}
          onClick={handleReportDiagnostics}
        >
          {reported ? getInstallationIntegrityDiagnosticsSentText(t, diagnosticsKind) : actions.reportText}
        </Button>
      ) : null}
      {actions.downloadText ? (
        <Button data-testid='installation-integrity-download' type='primary' onClick={actions.onDownloadLatest}>
          {actions.downloadText}
        </Button>
      ) : null}
      {actions.recoverText ? (
        <Button
          data-testid='recoverable-database-corruption-rebuild'
          loading={recovering}
          status='danger'
          type='outline'
          onClick={handleRecoverCorruptedDatabase}
        >
          {actions.recoverText}
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
): ReturnType<InstallationIntegrityModalController['error']> {
  const diagnosticsHint = DIALOG_KIND_CONFIG[diagnosticsKind].showDiagnosticsHint
    ? dialogKindText(t, diagnosticsKind, 'diagnosticsHint')
    : undefined;

  return modal.error({
    title: getInstallationIntegrityTitle(t, diagnosticsKind),
    content: <InstallationIntegrityContent description={description} diagnosticsHint={diagnosticsHint} />,
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
