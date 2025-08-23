/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { Checkbox } from '@arco-design/web-react';
import { ExpandDownOne, FoldUpOne } from '@icon-park/react';
import classNames from 'classnames';
import ReactDOM from 'react-dom';

const Diff2Html = ({ diff, className, title }: { diff: string; className?: string; title?: string }) => {
  const [sideBySide, setSideBySide] = useState(false);
  const [collapse, setCollapse] = useState(false);
  const diffHtmlContent = useMemo(() => {
    return html(diff, {
      outputFormat: sideBySide ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
      matching: 'lines',
      matchWordsThreshold: 0,
      maxLineLengthHighlight: 20,
      matchingMaxComparisons: 3,
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
    });
  }, [diff, sideBySide]);
  const operatorRef = useRef<HTMLDivElement>(document.createElement('div'));
  return (
    <div className={classNames('relative ', className)}>
      <div
        className={classNames('![&_.line-num1]:hidden ![&_.line-num2]:w-30px [&_td:first-child]:w-40px ![&_td:nth-child(2)>div]:pl-45px min-w-500px [&_div.d2f-file-wrapper]:rd-[0.3rem_0.3rem_0px_0px]  [&_div.d2h-file-header]:items-center [&_div.d2h-file-header]:bg-[rgb(220,220,220)]', {
          '[&_.d2h-file-diff]:hidden [&_.d2h-files-diff]:hidden': collapse,
        })}
        ref={(el) => {
          if (!el) return;
          const header = el.querySelectorAll('.d2h-file-header')[0] as HTMLDivElement;
          if (header) {
            header.style.alignItems = 'center';
            header.style.height = '23px';
            operatorRef.current.className = 'flex items-center justify-center gap-10px';
            header.appendChild(operatorRef.current);
            const name = header.querySelector('.d2h-file-name') as HTMLDivElement;
            if (name && title) {
              name.innerHTML = title;
            }
          }
        }}
        dangerouslySetInnerHTML={{
          __html: diffHtmlContent,
        }}
      ></div>
      {ReactDOM.createPortal(
        <>
          <Checkbox
            className='whitespace-nowrap'
            // className={"!flex items-center justify-center"}
            checked={sideBySide}
            onChange={(value) => setSideBySide(value)}
          >
            <span className='whitespace-nowrap'>side-by-side</span>
          </Checkbox>
          {collapse ? <ExpandDownOne theme='outline' size='14' fill='#333' className='flex items-center' onClick={() => setCollapse(false)} /> : <FoldUpOne theme='outline' size='14' fill='#333' className='flex items-center' onClick={() => setCollapse(true)} />}
        </>,
        operatorRef.current
      )}
    </div>
  );
};
export default Diff2Html;
