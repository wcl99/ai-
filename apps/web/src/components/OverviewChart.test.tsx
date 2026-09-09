import { render } from '@testing-library/react';
import { OverviewChart } from './OverviewChart';

describe('OverviewChart', () => {
  it('renders truthful native SVG bars and updates their labels', () => {
    const { rerender, getByLabelText, getAllByText } = render(
      <OverviewChart kind="bar" label="报告趋势" values={[{ label: '08-10', value: 2 }]} />,
    );

    expect(getByLabelText('报告趋势')).toHaveAttribute('data-chart-kind', 'bar');
    expect(getAllByText('08-10：2')).not.toHaveLength(0);

    rerender(<OverviewChart kind="bar" label="报告趋势" values={[{ label: '08-11', value: 5 }]} />);
    expect(getAllByText('08-11：5')).not.toHaveLength(0);
  });

  it('keeps every bar on or above the lowest grid line', () => {
    const { container } = render(
      <OverviewChart kind="bar" label="趋势" values={[
        { label: '08-10', value: -2 },
        { label: '08-11', value: 5 },
      ]} />,
    );
    const bars = [...container.querySelectorAll('rect')];
    expect(bars).toHaveLength(2);
    bars.forEach((bar) => {
      const y = Number(bar.getAttribute('y'));
      const height = Number(bar.getAttribute('height'));
      expect(y + height).toBe(168);
    });
  });

  it('renders a donut with a real total and accessible legend', () => {
    const { getByLabelText, getByText } = render(
      <OverviewChart
        kind="donut"
        label="报告来源分布"
        centerLabel="报告总数"
        values={[{ label: '渗透测试', value: 4 }, { label: '代码审计', value: 1 }]}
      />,
    );

    expect(getByLabelText('报告来源分布')).toHaveAttribute('data-chart-kind', 'donut');
    expect(getByText('5')).toBeInTheDocument();
    expect(getByText('渗透测试')).toBeInTheDocument();
  });
});
