import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock window.matchMedia for Arco Design responsive observer
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@icon-park/react', () => ({
  LinkCloud: () => <span data-testid='icon-link-cloud' />,
}));

// Mock IPC bridge
vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      fetchModelList: { invoke: vi.fn().mockResolvedValue({ success: false }) },
    },
  },
}));

// Mock useModeModeList hook
const mockUseModeModeList = vi.fn().mockReturnValue({
  loading: false,
  data: { success: true, data: { mode: ['gpt-4', 'gpt-3.5-turbo'] } },
  run: vi.fn(),
});
vi.mock('@renderer/hooks/agent/useModeModeList', () => ({
  default: () => mockUseModeModeList(),
}));

// Mock SVG and PNG imports
vi.mock('@/renderer/assets/logos/ai-major/gemini.svg', () => ({ default: 'gemini.svg' }));
vi.mock('@/renderer/assets/logos/ai-major/openai.svg', () => ({ default: 'openai.svg' }));
vi.mock('@/renderer/assets/logos/ai-major/anthropic.svg', () => ({ default: 'anthropic.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/bedrock.svg', () => ({ default: 'bedrock.svg' }));
vi.mock('@/renderer/assets/logos/ai-major/deepseek.svg', () => ({ default: 'deepseek.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/openrouter.svg', () => ({ default: 'openrouter.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/siliconflow.png', () => ({ default: 'siliconflow.png' }));
vi.mock('@/renderer/assets/logos/ai-china/qwen.svg', () => ({ default: 'qwen.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/kimi.svg', () => ({ default: 'kimi.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/zhipu.svg', () => ({ default: 'zhipu.svg' }));
vi.mock('@/renderer/assets/logos/ai-major/xai.svg', () => ({ default: 'xai.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/volcengine.svg', () => ({ default: 'volcengine.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/baidu.svg', () => ({ default: 'baidu.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/tencent.svg', () => ({ default: 'tencent.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/lingyiwanwu.svg', () => ({ default: 'lingyiwanwu.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/poe.svg', () => ({ default: 'poe.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/modelscope.svg', () => ({ default: 'modelscope.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/infiniai.svg', () => ({ default: 'infiniai.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/ctyun.svg', () => ({ default: 'ctyun.svg' }));
vi.mock('@/renderer/assets/logos/ai-china/stepfun.svg', () => ({ default: 'stepfun.svg' }));
vi.mock('@/renderer/assets/logos/ai-cloud/newapi.svg', () => ({ default: 'newapi.svg' }));

// Track unhandled rejections
let unhandledRejection: Error | undefined;
const rejectionHandler = (event: PromiseRejectionEvent) => {
  unhandledRejection = event.reason;
  event.preventDefault();
};

// Mock Arco Form with controllable validate behavior
const mockValidate = vi.fn();
const mockSetFieldsValue = vi.fn();
const mockSetFieldValue = vi.fn();
const mockResetFields = vi.fn();
const mockGetFieldValue = vi.fn().mockReturnValue('');

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const MockForm = Object.assign(
    ({ children }: { children: React.ReactNode }) => <div data-testid='mock-form'>{children}</div>,
    {
      Item: ({ children, label }: { children: React.ReactNode; label?: string }) => (
        <div data-testid={`form-item-${label}`}>{children}</div>
      ),
      useForm: () => [
        {
          validate: mockValidate,
          setFieldsValue: mockSetFieldsValue,
          setFieldValue: mockSetFieldValue,
          resetFields: mockResetFields,
          getFieldValue: mockGetFieldValue,
          getFields: vi.fn().mockReturnValue({}),
        },
      ],
      useWatch: () => undefined,
    }
  );
  return {
    ...actual,
    Form: MockForm,
    Message: {
      ...actual.Message,
      useMessage: () => [
        { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
        <div key='message-holder' data-testid='message-holder' />,
      ],
    },
  };
});

// Mock ModalHOC to directly render the component with visible=true
vi.mock('@/renderer/utils/ui/ModalHOC', () => ({
  default: (Component: React.ComponentType<any>) => {
    const Wrapped = (props: any) => {
      const modalProps = { visible: true };
      const modalCtrl = { close: vi.fn(), open: vi.fn() };
      return <Component {...props} modalProps={modalProps} modalCtrl={modalCtrl} />;
    };
    Wrapped.open = vi.fn();
    return Wrapped;
  },
}));

// Mock AionModal to expose the onOk handler
let capturedOnOk: (() => Promise<void>) | undefined;
vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, onOk, ...props }: any) => {
    capturedOnOk = onOk;
    return (
      <div data-testid='aion-modal' data-visible={props.visible}>
        {children}
        <button data-testid='modal-ok-btn' onClick={onOk}>
          {props.okText || 'OK'}
        </button>
      </div>
    );
  },
}));

// Import after all mocks are set up
const { default: EditModeModal } = await import('@/renderer/pages/settings/components/EditModeModal');

describe('EditModeModal', () => {
  const defaultData = {
    id: 'test-id',
    platform: 'custom',
    name: 'Test Provider',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    model: ['gpt-4'],
    useModel: 'gpt-4',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    unhandledRejection = undefined;
    window.addEventListener('unhandledrejection', rejectionHandler);
  });

  it('does not produce unhandled rejection when form validation fails', async () => {
    // Simulate Arco Form validation failure
    mockValidate.mockRejectedValueOnce({
      errors: { apiKey: { message: 'API Key is required', type: 'string' } },
    });

    const onChange = vi.fn();
    render(<EditModeModal data={defaultData} onChange={onChange} />);

    // Click the OK button which triggers onOk -> form.validate()
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok-btn'));
      // Allow microtask queue to flush
      await new Promise((r) => setTimeout(r, 50));
    });

    window.removeEventListener('unhandledrejection', rejectionHandler);

    expect(unhandledRejection).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange and closes modal when form validation succeeds', async () => {
    mockValidate.mockResolvedValueOnce({
      name: 'Test Provider',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'new-key',
      model: 'gpt-4',
    });

    const onChange = vi.fn();
    render(<EditModeModal data={defaultData} onChange={onChange} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-ok-btn'));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id',
        apiKey: 'new-key',
        model: ['gpt-4'],
      })
    );
  });
});
