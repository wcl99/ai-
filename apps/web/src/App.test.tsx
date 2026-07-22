import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App', () => {
  function renderRoute(path: string) {
    return render(
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>,
    );
  }

  it('renders the platform overview', () => {
    const { container } = renderRoute('/overview');
    expect(screen.getByRole('heading', { name: '平台总览' })).toBeInTheDocument();
    expect(screen.getByText('AI 今日摘要')).toBeInTheDocument();
    expect(screen.getByLabelText('风险趋势折线图').querySelectorAll('path')).toHaveLength(4);
    expect(
      [...container.querySelectorAll<HTMLImageElement>('.metric-card img')].map((image) => image.src),
    ).toEqual([
      expect.stringContaining('/ui-icons/metric-task.png'),
      expect.stringContaining('/ui-icons/metric-task-clock.png'),
      expect.stringContaining('/ui-icons/metric-warning.png'),
      expect.stringContaining('/ui-icons/metric-database.png'),
      expect.stringContaining('/ui-icons/metric-danger.png'),
    ]);
  });

  it.each([
    ['/tasks', ['metric-task-all', 'metric-task-queued', 'metric-task-running', 'metric-task-completed', 'metric-task-abnormal', 'metric-task-today']],
    ['/vulnerabilities', ['metric-vulnerability-total', 'metric-vulnerability-high', 'metric-vulnerability-medium', 'metric-vulnerability-pending', 'metric-vulnerability-retest', 'metric-vulnerability-fixed']],
    ['/reports', ['metric-report-total', 'metric-report-weekly', 'metric-report-pending-export', 'metric-report-exported', 'metric-report-pending-confirm', 'metric-report-delivered']],
  ])('uses the exported metric icons on %s', (path, icons) => {
    const { container } = renderRoute(path);
    const sources = [...container.querySelectorAll<HTMLImageElement>('.metric-card img')].map((image) => image.src);
    expect(sources).toEqual(icons.map((icon) => expect.stringContaining(`/ui-icons/${icon}.png`)));
  });

  it('renders the new overview routes', () => {
    renderRoute('/vulnerabilities/overview');
    expect(screen.getByText('AI 风险一览')).toBeInTheDocument();
    expect(screen.getAllByText('整体修复进度')).not.toHaveLength(0);
  });

  it('renders the login page without the app shell', () => {
    renderRoute('/login');
    expect(screen.getByRole('heading', { name: '系统登录' })).toBeInTheDocument();
    expect(screen.queryByText('平台总览')).not.toBeInTheDocument();
  });
});
