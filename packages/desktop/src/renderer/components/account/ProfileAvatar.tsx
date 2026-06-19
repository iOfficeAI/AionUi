/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Circular profile avatar (titlebar right side, desktop only).
 *
 * Shows the account initials derived from the local registration/session name;
 * when no name is available it falls back to the EVE glyph (⌘). Clicking it
 * opens the Account settings panel. Reads the LOCAL registration-status bridge
 * (no tokens) and self-quiets in non-desktop builds. PII (name/email) stays
 * local — only this chrome reads it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { commandEve } from '@/common/adapter/ipcBridge';
import './profileAvatar.css';

export interface ProfileAvatarProps {
  /** Open the account settings panel. */
  onOpenAccount?: () => void;
}

/** Derive up-to-2-char uppercase initials from a display name. */
export function initialsFromName(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ onOpenAccount }) => {
  const { t } = useTranslation();
  const [name, setName] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const response = await commandEve.registrationStatus.invoke();
      const data = response.data;
      if (data?.ok) {
        setName(data.name);
        setEmail(data.email);
      }
    } catch {
      // Self-quiet: leave the glyph fallback in place.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const initials = initialsFromName(name);
  const tooltip = name || email || t('settings.accountPanel.title', { defaultValue: 'Account' });

  return (
    <Tooltip content={tooltip} position='bottom'>
      <button
        type='button'
        className='profile-avatar'
        onClick={() => onOpenAccount?.()}
        aria-label={tooltip}
        data-testid='profile-avatar'
      >
        {initials ? (
          <span className='profile-avatar__initials'>{initials}</span>
        ) : (
          <span className='profile-avatar__glyph' aria-hidden='true'>
            ⌘
          </span>
        )}
      </button>
    </Tooltip>
  );
};

export default ProfileAvatar;
