import { Button, Message, Collapse, Tag } from '@arco-design/web-react';
import React, { useState } from 'react';
import StepsWrapper from '@/renderer/components/base/StepsWrapper';
import ModalWrapper from '@/renderer/components/base/ModalWrapper';
import { Check } from '@icon-park/react';

const ComponentsShowcase: React.FC = () => {
  const [message, contextHolder] = Message.useMessage();
  const [modalVisible, setModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className='p-8 space-y-8 max-w-6xl mx-auto'>
      {contextHolder}

      <div>
        <h1 className='text-3xl font-bold mb-2'>AionUi 自定义组件样式展示</h1>
        <p className='text-t-secondary'>展示所有在 arco-override.css 中自定义的组件样式</p>
      </div>

      {/* Message */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Message - 消息提示</h2>
        <div className='space-y-3'>
          <Button type='primary' status='success' onClick={() => message.success('操作成功提示信息')} size='large'>
            Success Message
          </Button>
          <Button type='primary' status='warning' onClick={() => message.warning('警告提示信息')} size='large'>
            Warning Message
          </Button>
          <Button type='primary' onClick={() => message.info('普通提示信息')} size='large'>
            Info Message
          </Button>
          <Button type='primary' status='danger' onClick={() => message.error('错误提示信息')} size='large'>
            Error Message
          </Button>
          <Button
            onClick={() => {
              message.success('操作成功提示信息');
              setTimeout(() => message.warning('警告提示信息'), 200);
              setTimeout(() => message.info('普通提示信息'), 400);
              setTimeout(() => message.error('错误提示信息'), 600);
            }}
            size='large'
          >
            显示所有类型
          </Button>
        </div>
      </section>

      {/* Button */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Button - 按钮</h2>
        <div className='flex gap-3'>
          <Button type='outline'>Outline Button</Button>
          <Button type='primary'>Primary Button</Button>
          <Button>Default Button</Button>
          <Button type='primary' shape='round'>
            Round Button
          </Button>
        </div>
      </section>

      {/* Collapse */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Collapse - 折叠面板</h2>
        <Collapse defaultActiveKey={['1']}>
          <Collapse.Item header='折叠面板标题 1' name='1'>
            <div>这是折叠面板的内容区域，可以放置任意内容。</div>
          </Collapse.Item>
          <Collapse.Item header='折叠面板标题 2' name='2'>
            <div>自定义样式：无边框，圆角 8px。</div>
          </Collapse.Item>
        </Collapse>
      </section>

      {/* Tag */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Tag - 标签（深色模式优化）</h2>
        <div className='flex gap-2 flex-wrap'>
          <Tag checkable color='blue'>
            Blue Tag
          </Tag>
          <Tag checkable color='green'>
            Green Tag
          </Tag>
          <Tag checkable color='red'>
            Red Tag
          </Tag>
          <Tag checkable color='orange'>
            Orange Tag
          </Tag>
          <Tag checkable color='gray'>
            Gray Tag
          </Tag>
        </div>
        <p className='text-sm text-t-secondary'>提示：切换到深色模式查看优化效果</p>
      </section>

      {/* Steps */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Steps - 步骤条</h2>
        <StepsWrapper current={currentStep} size='small'>
          <StepsWrapper.Step title='步骤一' icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <StepsWrapper.Step title='步骤二' icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <StepsWrapper.Step title='步骤三' />
        </StepsWrapper>
        <div className='flex gap-2 mt-4'>
          <Button onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>
            上一步
          </Button>
          <Button onClick={() => setCurrentStep(Math.min(3, currentStep + 1))} disabled={currentStep === 3} type='primary'>
            下一步
          </Button>
        </div>
      </section>

      {/* Modal */}
      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Modal - 模态框</h2>
        <Button type='primary' onClick={() => setModalVisible(true)}>
          打开自定义 Modal
        </Button>
        <ModalWrapper
          title='自定义模态框标题'
          visible={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={
            <div className='flex justify-end gap-3'>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type='primary' onClick={() => setModalVisible(false)}>
                确定
              </Button>
            </div>
          }
        >
          <div className='p-6'>
            <p>这是使用 ModalWrapper 封装的自定义模态框。</p>
            <p className='mt-2 text-t-secondary'>特性：圆角 12px、自定义关闭按钮、主题背景色。</p>
          </div>
        </ModalWrapper>
      </section>
    </div>
  );
};

export default ComponentsShowcase;
