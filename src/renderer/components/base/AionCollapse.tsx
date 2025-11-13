/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useMemo, useState } from 'react';

export interface AionCollapseProps {
  children: React.ReactNode;
  className?: string;
  /** uncontrolled keys opened by default */
  defaultActiveKey?: string | string[];
  /** controlled active keys */
  activeKey?: string | string[];
  /** callback when keys change */
  onChange?: (keys: string[]) => void;
  /** accordion mode only keeps single panel open */
  accordion?: boolean;
  /** custom expand icon */
  expandIcon?: (active: boolean) => React.ReactNode;
  expandIconPosition?: 'left' | 'right';
  bordered?: boolean;
}

export interface AionCollapseItemProps {
  name: string;
  header: React.ReactNode;
  disabled?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children?: React.ReactNode;
}

const normalizeKeys = (keys?: string | string[]): string[] => {
  if (!keys) return [];
  return Array.isArray(keys) ? keys : [keys];
};

const DefaultIcon: React.FC<{ active: boolean }> = ({ active }) => <span className={classNames('text-xs text-t-secondary transition-transform duration-200', active && 'rotate-180')}>▼</span>;

const AionCollapseItem: React.FC<AionCollapseItemProps> = ({ children }) => <>{children}</>;
AionCollapseItem.displayName = 'AionCollapseItem';

const AionCollapseComponent: React.FC<AionCollapseProps> & { Item: typeof AionCollapseItem } = ({ children, className, defaultActiveKey, activeKey, onChange, accordion, expandIcon, expandIconPosition = 'left', bordered }) => {
  const isControlled = activeKey !== undefined;
  const [internalKeys, setInternalKeys] = useState<string[]>(normalizeKeys(defaultActiveKey));
  const currentKeys = isControlled ? normalizeKeys(activeKey) : internalKeys;

  const items = useMemo(() => {
    return React.Children.toArray(children).filter((child): child is React.ReactElement<AionCollapseItemProps> => {
      return React.isValidElement(child) && child.type === AionCollapseItem;
    });
  }, [children]);

  const handleToggle = (name: string, disabled?: boolean) => {
    if (disabled) return;
    let nextKeys: string[];
    if (currentKeys.includes(name)) {
      nextKeys = currentKeys.filter((key) => key !== name);
    } else {
      nextKeys = accordion ? [name] : [...currentKeys, name];
    }
    if (!isControlled) {
      setInternalKeys(nextKeys);
    }
    onChange?.(nextKeys);
  };

  return (
    <div className={classNames('rounded-16px  flex flex-col gap-12px bg-2 py-18px px-32px', className)}>
      {items.map((child) => {
        const { name, header, disabled, className: itemClassName, headerClassName, contentClassName } = child.props;
        const isActive = currentKeys.includes(name);
        const iconNode = expandIcon ? expandIcon(isActive) : <DefaultIcon active={isActive} />;

        return (
          <div key={name} className={classNames('overflow-hidden border border-solid border-[color:var(--color-border-2)]', !bordered && 'border-transparent', itemClassName, disabled && 'opacity-50')}>
            <div onClick={() => handleToggle(name, disabled)} className={classNames('flex items-center gap-3 text-left transition-colors py-10px', headerClassName)}>
              {expandIconPosition === 'left' && <span className='flex items-center'>{iconNode}</span>}
              <div className='flex-1 text-2 text-14px'>{header}</div>
              {expandIconPosition === 'right' && <span className='flex items-center'>{iconNode}</span>}
            </div>
            {isActive && (
              <div
                className={classNames('pt-20px mt-20px ', contentClassName)}
                style={{
                  borderRadius: '0 0 16px 16px',
                  borderTop: '1px solid var(--color-border-2)',
                }}
              >
                {child.props.children}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

AionCollapseComponent.Item = AionCollapseItem;

export default AionCollapseComponent;
