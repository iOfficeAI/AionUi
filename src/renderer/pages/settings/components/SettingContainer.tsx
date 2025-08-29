import { Card, Divider } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';

const SettingContainer: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  bodyContainer?: boolean;
  className?: string;
}> = (props) => {
  return (
    <Card title={props.title} className={classNames('setting-container m-50px  [&.setting-container]:(bg-#F2F3F5 b-none rd-16px py-24px) [&>div.arco-card-body]:(pt-8px pb-0px) [&>div.arco-card-header]:(b-none px-32px h-28px) [&_div.arco-card-header-title]:(color-#86909C font-normal text-16px )`', props.className)}>
      <div
        className={classNames({
          'bg-white rd-16px py-24px px-32px box-border': props.bodyContainer,
        })}
      >
        {props.children}
      </div>
      {props.footer && !props.bodyContainer && <Divider></Divider>}
      <div
        className={classNames({
          'mt-16px': props.bodyContainer,
        })}
      >
        {props.footer}
      </div>
    </Card>
  );
};

export default SettingContainer;
