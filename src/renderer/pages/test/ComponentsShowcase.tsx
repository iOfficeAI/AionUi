import { Button, Message, Tag, Space } from '@arco-design/web-react';
import React, { useState } from 'react';
import AionSteps from '@/renderer/components/base/AionSteps';
import AionModal from '@/renderer/components/base/AionModal';
import { Check } from '@icon-park/react';
import AionCollapse from '@/renderer/components/base/AionCollapse';

const ComponentsShowcase: React.FC = () => {
  const [message, contextHolder] = Message.useMessage();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalSizeVisible, setModalSizeVisible] = useState(false);
  const [modalCustomHeaderVisible, setModalCustomHeaderVisible] = useState(false);
  const [modalWithFooterVisible, setModalWithFooterVisible] = useState(false);
  const [modalFullConfigVisible, setModalFullConfigVisible] = useState(false);
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
        <AionCollapse defaultActiveKey={['1']}>
          <Collapse.Item header='折叠面板标题 1' name='1'>
            <div>这是折叠面板的内容区域，可以放置任意内容。</div>
          </Collapse.Item>
          <Collapse.Item header='折叠面板标题 2' name='2'>
            <div>自定义样式：无边框，圆角 16px，和 SettingsModal 保持一致。</div>
          </Collapse.Item>
        </AionCollapse>
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
        <AionSteps current={currentStep} size='small'>
          <AionSteps.Step title='步骤一' icon={currentStep > 1 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <AionSteps.Step title='步骤二' icon={currentStep > 2 ? <Check theme='filled' size={16} fill='#165dff' /> : undefined} />
          <AionSteps.Step title='步骤三' />
        </AionSteps>
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
        <h2 className='text-xl font-semibold'>AionModal - 模态框组件</h2>
        <p className='text-sm text-t-secondary mb-4'>基础弹窗组件，支持预设尺寸、自定义 Header/Footer、主题自适应等功能</p>

        <div className='space-y-3'>
          {/* 基础用法 */}
          <div>
            <h3 className='text-base font-medium mb-2'>1. 基础用法（向后兼容）</h3>
            <Button type='primary' onClick={() => setModalVisible(true)}>
              打开基础弹窗
            </Button>
            <AionModal title='基础弹窗标题' visible={modalVisible} onCancel={() => setModalVisible(false)} style={{ width: '500px' }}>
              <div className='p-6'>
                <p>这是基础用法，使用 title 属性设置标题</p>
                <p className='mt-2 text-t-secondary'>默认显示关闭按钮</p>
              </div>
            </AionModal>
          </div>

          {/* 预设尺寸 */}
          <div>
            <h3 className='text-base font-medium mb-2'>2. 使用预设尺寸</h3>
            <Space>
              <Button onClick={() => setModalSizeVisible(true)}>小尺寸 (small)</Button>
            </Space>
            <AionModal visible={modalSizeVisible} onCancel={() => setModalSizeVisible(false)} size='small' header='小尺寸弹窗'>
              <div className='p-6'>
                <p>使用 size="small" 预设尺寸</p>
                <p className='mt-2 text-t-secondary'>尺寸: 400px × 300px</p>
              </div>
            </AionModal>
          </div>

          {/* 自定义 Header */}
          <div>
            <h3 className='text-base font-medium mb-2'>3. 自定义 Header</h3>
            <Button type='primary' onClick={() => setModalCustomHeaderVisible(true)}>
              自定义渐变 Header
            </Button>
            <AionModal
              visible={modalCustomHeaderVisible}
              onCancel={() => setModalCustomHeaderVisible(false)}
              size='medium'
              header={{
                render: () => (
                  <div
                    style={{
                      padding: '20px 24px',
                      background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      borderRadius: '12px 12px 0 0',
                    }}
                  >
                    <h2 style={{ margin: 0, color: 'white' }}>🎨 自定义渐变 Header</h2>
                    <p style={{ margin: '8px 0 0', fontSize: '14px', opacity: 0.9 }}>使用 header.render 完全自定义 Header 内容</p>
                  </div>
                ),
              }}
            >
              <div className='p-6'>
                <p>这个弹窗使用了自定义的渐变色 Header</p>
                <p className='mt-2 text-t-secondary'>通过 header.render 属性可以完全控制 Header 的渲染</p>
              </div>
            </AionModal>
          </div>

          {/* 带 Footer */}
          <div>
            <h3 className='text-base font-medium mb-2'>4. 带 Footer 的弹窗</h3>
            <Button type='primary' onClick={() => setModalWithFooterVisible(true)}>
              打开带 Footer 的弹窗
            </Button>
            <AionModal
              visible={modalWithFooterVisible}
              onCancel={() => setModalWithFooterVisible(false)}
              size='medium'
              header='确认操作'
              footer={{
                render: () => (
                  <Space>
                    <Button onClick={() => setModalWithFooterVisible(false)}>取消</Button>
                    <Button
                      type='primary'
                      onClick={() => {
                        message.success('已确认！');
                        setModalWithFooterVisible(false);
                      }}
                    >
                      确认
                    </Button>
                  </Space>
                ),
              }}
            >
              <div className='p-6'>
                <p>这是一个带 Footer 的弹窗</p>
                <p className='mt-2 text-t-secondary'>Footer 包含取消和确认按钮</p>
              </div>
            </AionModal>
          </div>

          {/* 完整配置 */}
          <div>
            <h3 className='text-base font-medium mb-2'>5. 完整配置示例</h3>
            <Button type='primary' onClick={() => setModalFullConfigVisible(true)}>
              完整配置弹窗
            </Button>
            <AionModal
              visible={modalFullConfigVisible}
              onCancel={() => setModalFullConfigVisible(false)}
              size='large'
              header={{
                title: '完整配置示例',
                showClose: true,
                className: 'custom-header-class',
                style: { background: 'var(--color-fill-1)' },
              }}
              footer={{
                render: () => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-text-3)', fontSize: '12px' }}>提示：这是一个完整配置的示例</span>
                    <Space>
                      <Button size='small' onClick={() => setModalFullConfigVisible(false)}>
                        取消
                      </Button>
                      <Button
                        type='primary'
                        size='small'
                        onClick={() => {
                          message.success('已保存！');
                          setModalFullConfigVisible(false);
                        }}
                      >
                        保存
                      </Button>
                    </Space>
                  </div>
                ),
                style: { padding: '12px 24px' },
              }}
            >
              <div className='p-6'>
                <h3 className='font-semibold mb-3'>功能特性</h3>
                <ul className='list-disc list-inside space-y-1 text-sm'>
                  <li>✅ 预设尺寸支持 (small, medium, large, xlarge, full)</li>
                  <li>✅ 自定义 Header 配置</li>
                  <li>✅ 自定义 Footer 配置</li>
                  <li>✅ 完全的样式控制</li>
                  <li>✅ 向后兼容旧版 API</li>
                  <li>✅ TypeScript 类型支持</li>
                </ul>

                <h3 className='font-semibold mt-4 mb-2'>预设尺寸</h3>
                <div className='text-sm text-t-secondary space-y-1'>
                  <p>• small: 400px × 300px</p>
                  <p>• medium: 600px × 400px</p>
                  <p>• large: 800px × 600px (当前)</p>
                  <p>• xlarge: 1000px × 700px</p>
                  <p>• full: 90vw × 90vh</p>
                </div>
              </div>
            </AionModal>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ComponentsShowcase;
