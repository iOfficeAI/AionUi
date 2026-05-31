/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import { Button, Input, Message, Modal, Tooltip } from '@arco-design/web-react';
import { CloseOne, Refresh, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { configService } from '@/common/config/configService';
import { getBuiltinCommands } from '@/renderer/commands/registry';
import {
  acceleratorFromKeyboardEvent,
  getAcceleratorDisplayParts,
  normalizeAccelerator,
} from '@/renderer/shortcuts/accelerator';
import {
  createShortcutCatalog,
  shortcutCategoryOrder,
  type ShortcutCategory,
  type ShortcutDefinition,
} from '@/renderer/shortcuts/catalog';
import {
  KEYBOARD_SHORTCUTS_CONFIG_KEY,
  getShortcutConflicts,
  removeShortcutBindingOverride,
  normalizeKeyboardShortcutsConfig,
  setShortcutBindingOverride,
  validateShortcutBindingOverride,
} from '@/renderer/shortcuts/shortcutRegistry';
import type { KeyboardShortcutsConfig } from '@/renderer/shortcuts/types';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import './ShortcutsSettings.css';

const isShortcutEditable = (shortcut: ShortcutDefinition): boolean =>
  shortcut.status !== 'local' && shortcut.status !== 'reserved' && shortcut.source !== 'future';

const ShortcutKeys: React.FC<{ accelerator: string | null }> = ({ accelerator }) => {
  const { t } = useTranslation();
  const displayParts = getAcceleratorDisplayParts(accelerator);

  if (displayParts.length === 0) {
    return <span className='shortcuts-settings__empty-key'>{t('settings.keyboardShortcuts.unbound')}</span>;
  }

  return (
    <span className='shortcuts-settings__shortcut' aria-label={displayParts.join('+')}>
      {displayParts.map((key, index) => (
        <React.Fragment key={`${displayParts.join('+')}-${key}-${index}`}>
          {index > 0 && <span className='text-12px text-t-tertiary'>+</span>}
          <kbd className='shortcuts-settings__key'>{key}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
};

const ShortcutRecorder: React.FC<{
  shortcut: ShortcutDefinition;
  saving: boolean;
  onSave: (shortcut: ShortcutDefinition, accelerator: string | null, enabled: boolean) => Promise<void>;
}> = ({ shortcut, saving, onSave }) => {
  const [draftAccelerator, setDraftAccelerator] = React.useState<string | null>(shortcut.currentAccelerator);
  const [isFocused, setIsFocused] = React.useState(false);
  const editable = isShortcutEditable(shortcut);

  React.useEffect(() => {
    if (!isFocused) {
      setDraftAccelerator(shortcut.currentAccelerator);
    }
  }, [isFocused, shortcut.currentAccelerator]);

  const commit = React.useCallback(() => {
    if (!editable || saving) return;
    if (draftAccelerator === shortcut.currentAccelerator) return;
    void onSave(shortcut, draftAccelerator, Boolean(draftAccelerator));
  }, [draftAccelerator, editable, onSave, saving, shortcut]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!editable) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setDraftAccelerator(shortcut.currentAccelerator);
        event.currentTarget.blur();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        setDraftAccelerator(null);
        return;
      }

      const accelerator = acceleratorFromKeyboardEvent(event.nativeEvent);
      if (accelerator) {
        setDraftAccelerator(accelerator);
      }
    },
    [editable, shortcut.currentAccelerator]
  );

  return (
    <div
      className={classNames('shortcuts-settings__recorder', {
        'shortcuts-settings__recorder--disabled': !editable,
        'shortcuts-settings__recorder--saving': saving,
      })}
      tabIndex={editable ? 0 : -1}
      role='button'
      aria-disabled={!editable}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        commit();
      }}
      onKeyDown={handleKeyDown}
    >
      <ShortcutKeys accelerator={draftAccelerator} />
    </div>
  );
};

const MobileField: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={classNames('shortcuts-settings__mobile-field', className)}>
    <div className='shortcuts-settings__mobile-label'>{label}</div>
    <div className='min-w-0'>{children}</div>
  </div>
);

interface ShortcutsSettingsProps {
  withWrapper?: boolean;
}

const ShortcutsSettings: React.FC<ShortcutsSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();
  const [query, setQuery] = React.useState('');
  const commands = React.useMemo(() => getBuiltinCommands(), []);
  const [shortcutConfig, setShortcutConfig] = React.useState<KeyboardShortcutsConfig | null>(null);
  const [configDiagnostics, setConfigDiagnostics] = React.useState<ReturnType<typeof getShortcutConflicts>>([]);
  const [savingCommandId, setSavingCommandId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const applyConfig = (value: unknown) => {
      const normalized = normalizeKeyboardShortcutsConfig(value, commands);
      setShortcutConfig(normalized.config);
      setConfigDiagnostics([...normalized.conflicts, ...getShortcutConflicts(commands, normalized.config)]);
    };

    void configService
      .whenReady()
      .then(() => {
        if (cancelled) return;
        applyConfig(configService.get(KEYBOARD_SHORTCUTS_CONFIG_KEY));
      })
      .catch((error) => {
        console.warn('[shortcuts] Failed to load keyboard shortcut config for settings page:', error);
      });

    const unsubscribe = configService.subscribe(KEYBOARD_SHORTCUTS_CONFIG_KEY, applyConfig);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [commands]);

  const shortcutCatalog = React.useMemo(
    () => createShortcutCatalog(shortcutConfig, configDiagnostics),
    [configDiagnostics, shortcutConfig]
  );
  const catalogCommandIds = React.useMemo(
    () => new Set(shortcutCatalog.map((shortcut) => shortcut.id)),
    [shortcutCatalog]
  );
  const topLevelDiagnostics = React.useMemo(
    () =>
      configDiagnostics.filter(
        (diagnostic) =>
          diagnostic.commandIds.length === 0 ||
          diagnostic.commandIds.some((commandId) => !catalogCommandIds.has(commandId))
      ),
    [catalogCommandIds, configDiagnostics]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredShortcuts = React.useMemo(() => {
    if (!normalizedQuery) return shortcutCatalog;
    return shortcutCatalog.filter((shortcut) => {
      const haystack = [
        shortcut.id,
        t(shortcut.titleKey),
        t(`settings.keyboardShortcuts.categories.${shortcut.category}`),
        shortcut.defaultAccelerator ?? '',
        shortcut.currentAccelerator ?? '',
        t(`settings.keyboardShortcuts.scopes.${shortcut.scope}`),
        t(`settings.keyboardShortcuts.status.${shortcut.status}`),
        t(`settings.keyboardShortcuts.conflicts.${shortcut.conflict}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, shortcutCatalog, t]);

  const shortcutsByCategory = React.useMemo(() => {
    const grouped = new Map<ShortcutCategory, ShortcutDefinition[]>();
    for (const shortcut of filteredShortcuts) {
      const items = grouped.get(shortcut.category) ?? [];
      items.push(shortcut);
      grouped.set(shortcut.category, items);
    }
    return grouped;
  }, [filteredShortcuts]);

  const summary = React.useMemo(
    () => ({
      total: shortcutCatalog.length,
      active: shortcutCatalog.filter((shortcut) => shortcut.status === 'active' || shortcut.status === 'local').length,
      flagged: shortcutCatalog.filter((shortcut) => shortcut.conflict !== 'none').length,
    }),
    [shortcutCatalog]
  );

  const headerLabels = {
    command: t('settings.keyboardShortcuts.columns.command'),
    shortcut: t('settings.keyboardShortcuts.columns.shortcut'),
    scope: t('settings.keyboardShortcuts.columns.scope'),
    status: t('settings.keyboardShortcuts.columns.status'),
    action: t('settings.keyboardShortcuts.columns.action'),
  };

  const persistShortcutConfig = React.useCallback(async (nextConfig: KeyboardShortcutsConfig | null) => {
    if (nextConfig) {
      await configService.set(KEYBOARD_SHORTCUTS_CONFIG_KEY, nextConfig);
    } else {
      await configService.remove(KEYBOARD_SHORTCUTS_CONFIG_KEY);
    }
  }, []);

  const saveShortcut = React.useCallback(
    async (shortcut: ShortcutDefinition, accelerator: string | null, enabled: boolean) => {
      if (!isShortcutEditable(shortcut)) return;

      const normalized = accelerator ? normalizeAccelerator(accelerator) : null;
      if (accelerator && !normalized) {
        message.error(t('settings.keyboardShortcuts.shortcutInvalid'));
        return;
      }

      const nextAccelerator = normalized ?? null;
      const conflicts = validateShortcutBindingOverride(
        commands,
        shortcutConfig,
        shortcut.id,
        nextAccelerator,
        enabled
      );
      if (conflicts.length > 0) {
        message.error(
          t('settings.keyboardShortcuts.shortcutConflict', {
            message: conflicts[0]?.message ?? '',
          })
        );
        return;
      }

      const isDefault =
        enabled &&
        nextAccelerator !== null &&
        normalizeAccelerator(shortcut.defaultAccelerator ?? '') === nextAccelerator;
      const nextConfig = isDefault
        ? removeShortcutBindingOverride(shortcutConfig, shortcut.id)
        : setShortcutBindingOverride(shortcutConfig, shortcut.id, nextAccelerator, enabled);

      setSavingCommandId(shortcut.id);
      try {
        await persistShortcutConfig(nextConfig);
        message.success(t('settings.keyboardShortcuts.shortcutSaved'));
      } catch (error) {
        console.error('[shortcuts] Failed to save shortcut:', error);
        message.error(t('settings.keyboardShortcuts.shortcutSaveFailed'));
      } finally {
        setSavingCommandId(null);
      }
    },
    [commands, message, persistShortcutConfig, shortcutConfig, t]
  );

  const resetShortcut = React.useCallback(
    async (shortcut: ShortcutDefinition) => {
      if (!isShortcutEditable(shortcut) || shortcut.source !== 'user') return;
      setSavingCommandId(shortcut.id);
      try {
        await persistShortcutConfig(removeShortcutBindingOverride(shortcutConfig, shortcut.id));
        message.success(t('settings.keyboardShortcuts.shortcutReset'));
      } catch (error) {
        console.error('[shortcuts] Failed to reset shortcut:', error);
        message.error(t('settings.keyboardShortcuts.shortcutSaveFailed'));
      } finally {
        setSavingCommandId(null);
      }
    },
    [message, persistShortcutConfig, shortcutConfig, t]
  );

  const disableShortcut = React.useCallback(
    async (shortcut: ShortcutDefinition) => {
      await saveShortcut(shortcut, null, false);
    },
    [saveShortcut]
  );

  const resetAllShortcuts = React.useCallback(() => {
    Modal.confirm({
      title: t('settings.keyboardShortcuts.resetAllConfirmTitle'),
      content: t('settings.keyboardShortcuts.resetAllConfirmContent'),
      okText: t('settings.keyboardShortcuts.resetAll'),
      cancelText: t('settings.keyboardShortcuts.cancel'),
      onOk: async () => {
        try {
          await persistShortcutConfig(null);
          message.success(t('settings.keyboardShortcuts.resetAllSuccess'));
        } catch (error) {
          console.error('[shortcuts] Failed to reset all shortcuts:', error);
          message.error(t('settings.keyboardShortcuts.resetAllFailed'));
        }
      },
    });
  }, [message, persistShortcutConfig, t]);

  const content = (
    <div className='shortcuts-settings flex flex-col gap-18px'>
      <div className='flex flex-col gap-6px'>
        <h1 className='m-0 text-26px font-700 leading-32px text-t-primary'>{t('settings.keyboardShortcuts.title')}</h1>
        <p className='m-0 text-13px leading-20px text-t-secondary'>{t('settings.keyboardShortcuts.description')}</p>
      </div>

      <div className='shortcuts-settings__summary'>
        <div className='shortcuts-settings__summary-item'>
          <div className='text-12px text-t-tertiary'>{t('settings.keyboardShortcuts.summary.total')}</div>
          <div className='mt-4px text-22px font-700 text-t-primary'>{summary.total}</div>
        </div>
        <div className='shortcuts-settings__summary-item'>
          <div className='text-12px text-t-tertiary'>{t('settings.keyboardShortcuts.summary.active')}</div>
          <div className='mt-4px text-22px font-700 text-t-primary'>{summary.active}</div>
        </div>
        <div className='shortcuts-settings__summary-item'>
          <div className='text-12px text-t-tertiary'>{t('settings.keyboardShortcuts.summary.flagged')}</div>
          <div className='mt-4px text-22px font-700 text-t-primary'>{summary.flagged}</div>
        </div>
      </div>

      {topLevelDiagnostics.length > 0 && (
        <div className='shortcuts-settings__diagnostics'>
          {topLevelDiagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.type}-${diagnostic.commandIds.join(',')}-${index}`}>{diagnostic.message}</div>
          ))}
        </div>
      )}

      <div className='shortcuts-settings__toolbar'>
        <Input
          allowClear
          value={query}
          prefix={<Search theme='outline' size='15' />}
          placeholder={t('settings.keyboardShortcuts.searchPlaceholder')}
          onChange={setQuery}
        />
        <Button onClick={resetAllShortcuts} icon={<Refresh theme='outline' size='14' />}>
          {t('settings.keyboardShortcuts.resetAll')}
        </Button>
      </div>

      <div className='flex flex-col gap-14px'>
        {shortcutCategoryOrder.map((category) => {
          const shortcuts = shortcutsByCategory.get(category);
          if (!shortcuts?.length) return null;

          return (
            <section key={category} className='shortcuts-settings__group'>
              <div className='px-14px py-12px border-b border-border-2'>
                <h2 className='m-0 text-15px font-700 leading-22px text-t-primary'>
                  {t(`settings.keyboardShortcuts.categories.${category}`)}
                </h2>
              </div>
              <div className='shortcuts-settings__group-header'>
                <div>{headerLabels.command}</div>
                <div>{headerLabels.shortcut}</div>
                <div>{headerLabels.scope}</div>
                <div>{headerLabels.status}</div>
                <div className='text-right'>{headerLabels.action}</div>
              </div>
              {shortcuts.map((shortcut) => {
                const statusLabel = t(`settings.keyboardShortcuts.status.${shortcut.status}`);
                const conflictLabel = t(`settings.keyboardShortcuts.conflicts.${shortcut.conflict}`);
                const diagnosticMessage = shortcut.diagnostics?.[0]?.message;
                const note = diagnosticMessage || (shortcut.noteKey ? t(shortcut.noteKey) : '');
                const editable = isShortcutEditable(shortcut);
                const saving = savingCommandId === shortcut.id;

                return (
                  <div key={shortcut.id} className='shortcuts-settings__row'>
                    <div className='min-w-0'>
                      <div className='truncate text-14px font-600 leading-20px text-t-primary'>
                        {t(shortcut.titleKey)}
                      </div>
                      <div className='mt-3px truncate font-mono text-11px leading-16px text-t-tertiary'>
                        {shortcut.id}
                      </div>
                    </div>
                    <MobileField label={headerLabels.shortcut}>
                      <Tooltip
                        content={t('settings.keyboardShortcuts.defaultShortcut', {
                          shortcut: shortcut.defaultAccelerator || t('settings.keyboardShortcuts.unbound'),
                        })}
                      >
                        <span>
                          <ShortcutRecorder shortcut={shortcut} saving={saving} onSave={saveShortcut} />
                        </span>
                      </Tooltip>
                    </MobileField>
                    <MobileField label={headerLabels.scope}>
                      <span className='shortcuts-settings__pill'>
                        {t(`settings.keyboardShortcuts.scopes.${shortcut.scope}`)}
                      </span>
                    </MobileField>
                    <MobileField label={headerLabels.status} className='shortcuts-settings__note'>
                      <div className='flex min-w-0 flex-col gap-5px'>
                        <div className='flex flex-wrap items-center gap-6px'>
                          <span className='shortcuts-settings__pill'>{statusLabel}</span>
                          {shortcut.source === 'user' && (
                            <span className='shortcuts-settings__pill'>
                              {t('settings.keyboardShortcuts.userOverride')}
                            </span>
                          )}
                          {shortcut.conflict !== 'none' && (
                            <span className='shortcuts-settings__pill shortcuts-settings__pill--muted'>
                              {conflictLabel}
                            </span>
                          )}
                        </div>
                        {note && <div className='text-12px leading-18px text-t-tertiary'>{note}</div>}
                      </div>
                    </MobileField>
                    <MobileField label={headerLabels.action}>
                      <div className='shortcuts-settings__actions'>
                        <Tooltip content={t('settings.keyboardShortcuts.disable')}>
                          <Button
                            size='small'
                            type='text'
                            status='warning'
                            icon={<CloseOne theme='outline' size='14' />}
                            disabled={!editable || shortcut.currentAccelerator === null}
                            loading={saving && shortcut.currentAccelerator !== null}
                            onClick={() => void disableShortcut(shortcut)}
                          />
                        </Tooltip>
                        <Button
                          size='small'
                          disabled={!editable || shortcut.source !== 'user'}
                          loading={saving && shortcut.source === 'user'}
                          onClick={() => void resetShortcut(shortcut)}
                        >
                          {t('settings.keyboardShortcuts.resetOne')}
                        </Button>
                      </div>
                    </MobileField>
                  </div>
                );
              })}
            </section>
          );
        })}
        {filteredShortcuts.length === 0 && (
          <div className='rounded-8px border border-dashed border-border-2 bg-fill-1 px-16px py-32px text-center text-13px text-t-secondary'>
            {t('settings.keyboardShortcuts.empty')}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {messageContext}
      {withWrapper ? <SettingsPageWrapper contentClassName='md:max-w-1180px'>{content}</SettingsPageWrapper> : content}
    </>
  );
};

export default ShortcutsSettings;
