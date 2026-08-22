import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EchartsBlock from '@/renderer/components/Markdown/EchartsBlock';
import { parseEChartsOption } from '@/renderer/components/Markdown/echartsUtils';

const mockInit = vi.fn();
const mockSetOption = vi.fn();
const mockDispose = vi.fn();
const mockResize = vi.fn();

vi.mock('echarts', () => ({
  init: (...args: unknown[]) => {
    mockInit(...args);
    return {
      setOption: mockSetOption,
      dispose: mockDispose,
      resize: mockResize,
    };
  },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

const mockOpenPreview = vi.fn();
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: mockOpenPreview,
    isPreviewPanel: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'preview.echartsTitle': 'ECharts Chart',
        'preview.viewSource': 'View Source',
        'preview.viewDiagram': 'View Diagram',
        'preview.openInPanelTooltip': 'Open in panel',
        'preview.renderError': 'Render Error',
        'common.copySuccess': 'Copied',
        'common.copyFailed': 'Copy failed',
      };
      return translations[key] || key;
    },
  }),
}));

describe('parseEChartsOption', () => {
  it('parses valid JSON option', () => {
    const code =
      '{"xAxis": {"type": "category"}, "yAxis": {"type": "value"}, "series": [{"type": "line", "data": [1, 2, 3]}]}';
    const parsed = parseEChartsOption(code);
    expect(parsed).toBeDefined();
    expect(parsed?.xAxis).toEqual({ type: 'category' });
    expect(parsed?.series).toHaveLength(1);
  });

  it('parses JSON5 with comments, unquoted keys and trailing commas', () => {
    const code = `
      // This is a comment
      {
        xAxis: { type: 'category' },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [10, 20], }],
      }
    `;
    const parsed = parseEChartsOption(code);
    expect(parsed).toBeDefined();
    expect(parsed?.series).toHaveLength(1);
  });

  it('strips option = assignment wrapper', () => {
    const code = `
      const option = {
        series: [{ type: 'pie', data: [{ value: 1048, name: 'Search' }] }]
      };
    `;
    const parsed = parseEChartsOption(code);
    expect(parsed).toBeDefined();
    expect(parsed?.series).toHaveLength(1);
  });

  it('returns null for non-chart json', () => {
    const code = '{"name": "test", "version": "1.0.0"}';
    const parsed = parseEChartsOption(code);
    expect(parsed).toBeNull();
  });
});

describe('EchartsBlock Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validChartCode = `
    {
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
      yAxis: { type: 'value' },
      series: [{ data: [150, 230, 224], type: 'line' }]
    }
  `;

  it('renders chart container and initializes echarts', () => {
    render(<EchartsBlock code={validChartCode} isDark={false} />);

    expect(screen.getByTestId('echarts-header')).toBeInTheDocument();
    expect(screen.getByTestId('echarts-diagram')).toBeInTheDocument();
    expect(mockInit).toHaveBeenCalled();
    expect(mockSetOption).toHaveBeenCalled();
  });

  it('toggles between diagram and source view', () => {
    render(<EchartsBlock code={validChartCode} isDark={false} />);

    expect(screen.getByTestId('echarts-diagram')).toBeInTheDocument();

    const viewSourceBtn = screen.getByText('View Source');
    fireEvent.click(viewSourceBtn);

    expect(screen.queryByTestId('echarts-diagram')).not.toBeInTheDocument();
    expect(screen.getByText('View Diagram')).toBeInTheDocument();

    const viewDiagramBtn = screen.getByText('View Diagram');
    fireEvent.click(viewDiagramBtn);

    expect(screen.getByTestId('echarts-diagram')).toBeInTheDocument();
  });

  it('handles open in panel click', () => {
    render(<EchartsBlock code={validChartCode} isDark={false} />);

    const openPanelBtn = screen.getByTestId('echarts-open-in-panel');
    fireEvent.click(openPanelBtn);

    expect(mockOpenPreview).toHaveBeenCalledWith(
      expect.stringContaining('```echarts'),
      'markdown',
      expect.objectContaining({ title: expect.stringContaining('ECharts Chart') })
    );
  });
});
