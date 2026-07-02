/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty, Popover, Tabs } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Common emoji categories with popular emojis
const EMOJI_CATEGORIES = {
  recent: {
    icon: '🕐',
    label: 'Recent',
    emojis: [] as string[], // Will be populated from localStorage
  },
  smileys: {
    icon: '😀',
    label: 'Smileys',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😅',
      '😂',
      '🤣',
      '😊',
      '😇',
      '🙂',
      '🙃',
      '😉',
      '😌',
      '😍',
      '🥰',
      '😘',
      '😗',
      '😙',
      '😚',
      '😋',
      '😛',
      '😜',
      '🤪',
      '😝',
      '🤑',
      '🤗',
      '🤭',
      '🤫',
      '🤔',
      '🤐',
      '🤨',
      '😐',
      '😑',
      '😶',
      '😏',
      '😒',
      '🙄',
      '😬',
      '🤥',
      '😌',
      '😔',
      '😪',
      '🤤',
      '😴',
      '😷',
      '🤒',
      '🤕',
      '🤢',
      '🤮',
      '🥵',
      '🥶',
      '🥴',
      '😵',
      '🤯',
      '🤠',
      '🥳',
      '😎',
      '🤓',
      '🧐',
      '😕',
      '😟',
      '🙁',
      '☹️',
      '😮',
    ],
  },
  animals: {
    icon: '🐱',
    label: 'Animals',
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🐤',
      '🦆',
      '🦅',
      '🦉',
      '🦇',
      '🐺',
      '🐗',
      '🐴',
      '🦄',
      '🐝',
      '🐛',
      '🦋',
      '🐌',
      '🐞',
      '🐜',
      '🦟',
      '🦗',
      '🕷',
      '🦂',
      '🐢',
      '🐍',
      '🦎',
      '🦖',
      '🦕',
      '🐙',
      '🦑',
      '🦐',
      '🦞',
      '🦀',
      '🐡',
      '🐠',
      '🐟',
      '🐬',
      '🐳',
      '🐋',
      '🦈',
      '🐊',
      '🐅',
    ],
  },
  food: {
    icon: '🍎',
    label: 'Food',
    emojis: [
      '🍎',
      '🍐',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍈',
      '🍒',
      '🍑',
      '🥭',
      '🍍',
      '🥥',
      '🥝',
      '🍅',
      '🍆',
      '🥑',
      '🥦',
      '🥬',
      '🥒',
      '🌶',
      '🫑',
      '🌽',
      '🥕',
      '🧄',
      '🧅',
      '🥔',
      '🍠',
      '🥐',
      '🥯',
      '🍞',
      '🥖',
      '🥨',
      '🧀',
      '🥚',
      '🍳',
      '🧈',
      '🥞',
      '🧇',
      '🥓',
      '🥩',
      '🍗',
      '🍖',
      '🦴',
      '🌭',
      '🍔',
      '🍟',
      '🍕',
      '🫓',
      '🥪',
      '🥙',
      '🧆',
      '🌮',
      '🌯',
    ],
  },
  activities: {
    icon: '⚽',
    label: 'Activities',
    emojis: [
      '⚽',
      '🏀',
      '🏈',
      '⚾',
      '🥎',
      '🎾',
      '🏐',
      '🏉',
      '🥏',
      '🎱',
      '🪀',
      '🏓',
      '🏸',
      '🏒',
      '🏑',
      '🥍',
      '🏏',
      '🪃',
      '🥅',
      '⛳',
      '🪁',
      '🏹',
      '🎣',
      '🤿',
      '🥊',
      '🥋',
      '🎽',
      '🛹',
      '🛼',
      '🛷',
      '⛸',
      '🥌',
      '🎿',
      '⛷',
      '🏂',
      '🪂',
      '🏋️',
      '🤼',
      '🤸',
      '⛹️',
      '🤺',
      '🤾',
      '🏌️',
      '🏇',
      '🧘',
      '🏄',
      '🏊',
      '🤽',
      '🚣',
      '🧗',
      '🚵',
      '🚴',
      '🏆',
      '🥇',
      '🥈',
      '🥉',
    ],
  },
  objects: {
    icon: '💡',
    label: 'Objects',
    emojis: [
      '💡',
      '🔦',
      '🏮',
      '🪔',
      '📱',
      '💻',
      '🖥',
      '🖨',
      '⌨️',
      '🖱',
      '🖲',
      '💾',
      '💿',
      '📀',
      '📼',
      '📷',
      '📸',
      '📹',
      '🎥',
      '📽',
      '🎬',
      '📺',
      '📻',
      '🎙',
      '🎚',
      '🎛',
      '🧭',
      '⏱',
      '⏲',
      '⏰',
      '🕰',
      '⌛',
      '📡',
      '🔋',
      '🔌',
      '💎',
      '🔧',
      '🔨',
      '⚒',
      '🛠',
      '🔩',
      '⚙️',
      '🧱',
      '⛓',
      '🧲',
      '🔫',
      '💣',
      '🔪',
      '🗡',
      '⚔️',
      '🛡',
      '🚬',
      '⚰️',
      '🪦',
      '⚱️',
      '🏺',
    ],
  },
  symbols: {
    icon: '❤️',
    label: 'Symbols',
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '🤎',
      '💔',
      '❣️',
      '💕',
      '💞',
      '💓',
      '💗',
      '💖',
      '💘',
      '💝',
      '💟',
      '☮️',
      '✝️',
      '☪️',
      '🕉',
      '☸️',
      '✡️',
      '🔯',
      '🕎',
      '☯️',
      '☦️',
      '🛐',
      '⛎',
      '♈',
      '♉',
      '♊',
      '♋',
      '♌',
      '♍',
      '♎',
      '♏',
      '♐',
      '♑',
      '♒',
      '♓',
      '🆔',
      '⚛️',
      '🉑',
      '☢️',
      '☣️',
      '📴',
      '📳',
      '🈶',
      '🈚',
      '🈸',
      '🈺',
      '🈷️',
      '✴️',
    ],
  },
  flags: {
    icon: '🏁',
    label: 'Flags',
    emojis: [
      '🏁',
      '🚩',
      '🎌',
      '🏴',
      '🏳️',
      '🏳️‍🌈',
      '🏳️‍⚧️',
      '🏴‍☠️',
      '🇨🇳',
      '🇺🇸',
      '🇯🇵',
      '🇰🇷',
      '🇬🇧',
      '🇫🇷',
      '🇩🇪',
      '🇮🇹',
      '🇪🇸',
      '🇷🇺',
      '🇧🇷',
      '🇮🇳',
      '🇦🇺',
      '🇨🇦',
      '🇲🇽',
      '🇦🇷',
    ],
  },
};

type CategoryKey = keyof typeof EMOJI_CATEGORIES;

const RECENT_EMOJIS_KEY = 'aionui.emoji.recent';
const MAX_RECENT_EMOJIS = 24;

// Arco Design Popover position types
type PopoverPosition = 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br' | 'lt' | 'lb' | 'rt' | 'rb';

interface EmojiPickerProps {
  value?: string;
  onChange?: (emoji: string) => void;
  children?: React.ReactNode;
  placement?: PopoverPosition;
  builtinAvatars?: Array<{
    id: string;
    label: string;
    src: string;
  }>;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({
  value,
  onChange,
  children,
  placement = 'bl',
  builtinAvatars = [],
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('smileys');
  const [activeTab, setActiveTab] = useState<'emoji' | 'builtin'>('emoji');

  // Load recent emojis from localStorage
  const recentEmojis = useMemo(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, [visible]); // Refresh when popover opens

  const saveRecentEmoji = useCallback((emoji: string) => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      let recent: string[] = stored ? JSON.parse(stored) : [];
      // Remove if already exists, then add to front
      recent = recent.filter((e) => e !== emoji);
      recent.unshift(emoji);
      // Keep only MAX_RECENT_EMOJIS
      recent = recent.slice(0, MAX_RECENT_EMOJIS);
      localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      saveRecentEmoji(emoji);
      onChange?.(emoji);
      setVisible(false);
    },
    [onChange, saveRecentEmoji]
  );

  const handleSelectBuiltinAvatar = useCallback(
    (src: string) => {
      onChange?.(src);
      setVisible(false);
    },
    [onChange]
  );

  const currentEmojis = useMemo(() => {
    if (activeCategory === 'recent') {
      return recentEmojis;
    }
    return EMOJI_CATEGORIES[activeCategory].emojis;
  }, [activeCategory, recentEmojis]);

  const categoryKeys = useMemo(() => {
    const keys = Object.keys(EMOJI_CATEGORIES) as CategoryKey[];
    // Only show recent if there are recent emojis
    if (recentEmojis.length === 0) {
      return keys.filter((key) => key !== 'recent');
    }
    return keys;
  }, [recentEmojis.length]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const hasMatchingBuiltinAvatar = builtinAvatars.some((avatarOption) => avatarOption.src === value);
    setActiveTab(hasMatchingBuiltinAvatar ? 'builtin' : 'emoji');
  }, [builtinAvatars, value, visible]);

  const emojiPickerContent = (
    <div className='w-280px'>
      {/* Category Tabs */}
      <div className='flex items-center gap-2px px-8px py-6px border-b border-[var(--color-border-2)] overflow-x-auto'>
        {categoryKeys.map((key) => (
          <button
            key={key}
            className={`flex-shrink-0 w-28px h-28px flex items-center justify-center rounded-md text-16px cursor-pointer border-none bg-transparent hover:bg-fill-2 transition-colors ${activeCategory === key ? 'bg-fill-2' : ''}`}
            onClick={() => setActiveCategory(key)}
            title={EMOJI_CATEGORIES[key].label}
          >
            {EMOJI_CATEGORIES[key].icon}
          </button>
        ))}
      </div>

      {/* Emoji Grid */}
      <div className='p-8px max-h-200px overflow-y-auto'>
        {currentEmojis.length > 0 ? (
          <div className='grid grid-cols-8 gap-2px'>
            {currentEmojis.map((emoji: string, index: number) => (
              <button
                key={`${emoji}-${index}`}
                className='w-32px h-32px flex items-center justify-center text-20px cursor-pointer border-none bg-transparent rounded-md hover:bg-fill-2 transition-colors'
                onClick={() => handleSelectEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className='text-center text-t-secondary py-16px text-14px'>
            {t('settings.noRecentEmojis', { defaultValue: 'No recent emojis' })}
          </div>
        )}
      </div>
    </div>
  );

  const builtinAvatarContent = (
    <div className='w-280px p-8px max-h-264px overflow-y-auto'>
      {builtinAvatars.length > 0 ? (
        <div className='grid grid-cols-4 gap-8px'>
          {builtinAvatars.map((avatarOption) => {
            const isSelected = avatarOption.src === value;
            return (
              <Button
                key={avatarOption.id}
                type='text'
                className={`!h-auto !w-full !justify-start !rounded-10px !border !border-solid !px-6px !py-8px transition-colors ${
                  isSelected ? 'border-primary bg-primary-1' : 'border-transparent bg-transparent hover:bg-fill-1'
                }`}
                onClick={() => handleSelectBuiltinAvatar(avatarOption.src)}
              >
                <div className='flex w-full items-center justify-center'>
                  <div className='h-48px w-48px overflow-hidden rounded-10px bg-fill-1'>
                    <img src={avatarOption.src} alt={avatarOption.label} className='h-full w-full object-cover' />
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      ) : (
        <Empty description={t('settings.assistantAvatarNoBuiltinImages', { defaultValue: 'No built-in images' })} />
      )}
    </div>
  );

  const pickerContent =
    builtinAvatars.length > 0 ? (
      <div className='w-280px'>
        <Tabs activeTab={activeTab} onChange={(key) => setActiveTab(key as 'emoji' | 'builtin')} size='small'>
          <Tabs.TabPane
            key='builtin'
            title={
              <span className='flex items-center gap-4px'>
                <span aria-hidden='true'>👤</span>{' '}
                <span>{t('settings.assistantAvatarBuiltinTab', { defaultValue: 'Built-in' })}</span>
              </span>
            }
          >
            {builtinAvatarContent}
          </Tabs.TabPane>
          <Tabs.TabPane
            key='emoji'
            title={
              <span className='flex items-center gap-4px'>
                <span aria-hidden='true'>🙂</span>{' '}
                <span>{t('settings.assistantAvatarEmojiTab', { defaultValue: 'Emoji' })}</span>
              </span>
            }
          >
            {emojiPickerContent}
          </Tabs.TabPane>
        </Tabs>
      </div>
    ) : (
      emojiPickerContent
    );

  return (
    <Popover
      trigger='click'
      position={placement}
      popupVisible={visible}
      onVisibleChange={setVisible}
      content={pickerContent}
      unmountOnExit
    >
      {children || (
        <div className='w-40px h-40px flex items-center justify-center text-24px bg-fill-2 rounded-lg cursor-pointer hover:bg-fill-3 transition-colors'>
          {value || '😀'}
        </div>
      )}
    </Popover>
  );
};

export default EmojiPicker;
