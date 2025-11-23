import React, { useEffect, useMemo, useState } from 'react';
import { Minus, CloseSmall } from '@icon-park/react';

const WindowMaximizeIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox='0 0 18 18' fill='none' stroke='currentColor' strokeWidth='1.4'>
    <rect x='3.5' y='3.5' width='11' height='11' rx='1.2' />
  </svg>
);

const WindowRestoreIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox='0 0 18 18' fill='none' stroke='currentColor' strokeWidth='1.4'>
    <rect x='4.75' y='6.75' width='8' height='8' rx='1.1' />
    <path d='M6.5 5.25V4.5c0-.7.57-1.25 1.25-1.25h5c.69 0 1.25.56 1.25 1.25v5c0 .69-.56 1.25-1.25 1.25h-.7' strokeWidth='1.2' />
  </svg>
);

const getWindowControls = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.electronAPI?.windowControls;
};

const WindowControls: React.FC = () => {
  const controls = useMemo(() => getWindowControls(), []);
  const [isMaximized, setIsMaximized] = useState(false);
  const [available, setAvailable] = useState(Boolean(controls));

  useEffect(() => {
    if (!controls) {
      return;
    }

    let isMounted = true;

    controls
      .isMaximized()
      .then((state) => {
        if (isMounted) {
          setIsMaximized(state);
          setAvailable(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailable(false);
        }
      });

    const unsubscribe = controls.onMaximizedChange?.((state) => {
      if (isMounted) {
        setIsMaximized(state);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [controls]);

  if (!controls || !available) {
    return null;
  }

  const handleMinimize = () => {
    void controls.minimize();
  };

  const handleClose = () => {
    void controls.close();
  };

  const handleToggleMaximize = () => {
    if (isMaximized) {
      void controls.unmaximize();
    } else {
      void controls.maximize();
    }
  };

  return (
    <div className='app-window-controls'>
      <button type='button' className='app-window-controls__button' onClick={handleMinimize} aria-label='Minimize'>
        <Minus theme='outline' size='14' fill='currentColor' strokeWidth={4} />
      </button>
      <button type='button' className='app-window-controls__button' onClick={handleToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
        {isMaximized ? <WindowRestoreIcon size={14} /> : <WindowMaximizeIcon size={14} />}
      </button>
      <button type='button' className='app-window-controls__button app-window-controls__button--close' onClick={handleClose} aria-label='Close'>
        <CloseSmall theme='outline' size='16' fill='currentColor' strokeWidth={3} />
      </button>
    </div>
  );
};

export default WindowControls;
