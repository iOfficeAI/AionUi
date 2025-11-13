import classNames from 'classnames';
import React from 'react';

interface AionScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to render scrollbars on the x-axis as well */
  direction?: 'y' | 'x' | 'both';
}

const AionScrollArea: React.FC<AionScrollAreaProps> = ({ children, className, direction = 'y', ...rest }) => {
  const overflowClass = direction === 'both' ? 'overflow-auto' : direction === 'x' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden';

  return (
    <div data-scroll-area='' className={classNames(overflowClass, className)} {...rest}>
      {children}
      <style>{`
        [data-scroll-area]::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        [data-scroll-area]::-webkit-scrollbar-track {
          background: transparent;
        }
        [data-scroll-area]::-webkit-scrollbar-thumb {
          background: var(--color-fill-3);
          border-radius: 3px;
        }
        [data-scroll-area]::-webkit-scrollbar-thumb:hover {
          background: var(--color-fill-4);
        }
      `}</style>
    </div>
  );
};

export default AionScrollArea;
