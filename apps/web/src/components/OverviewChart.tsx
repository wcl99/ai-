type ChartValue = { label: string; value: number; color?: string };

type OverviewChartProps = {
  kind: 'bar' | 'donut';
  label: string;
  values: ChartValue[];
  centerLabel?: string;
};

const palette = ['#075bcc', '#ff9138', '#c52c32', '#c8cddd', '#7357e8'];

export function OverviewChart({ kind, label, values, centerLabel = '' }: OverviewChartProps) {
  return kind === 'donut'
    ? <DonutChart label={label} centerLabel={centerLabel} values={values} />
    : <BarChart label={label} values={values} />;
}

function DonutChart({ label, centerLabel, values }: Omit<OverviewChartProps, 'kind'>) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const circumference = 2 * Math.PI * 40;
  let offset = 0;
  return (
    <div className="material-donut" aria-label={label} data-chart-kind="donut">
      <div className="material-donut-graphic">
        <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
          <circle cx="60" cy="60" r="40" className="material-donut-track" />
          {values.map((item, index) => {
            const length = total ? (item.value / total) * circumference : 0;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r="40"
                className="material-donut-segment"
                stroke={item.color ?? palette[index % palette.length]}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
              ><title>{`${item.label}：${item.value}`}</title></circle>
            );
          })}
        </svg>
        <div className="material-donut-center"><span>{centerLabel}</span><strong>{total}</strong></div>
      </div>
      <div className="material-chart-legend">
        {values.map((item, index) => (
          <div key={item.label}>
            <i style={{ background: item.color ?? palette[index % palette.length] }} />
            <span>{item.label}</span><strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ label, values }: Pick<OverviewChartProps, 'label' | 'values'>) {
  const max = Math.max(1, ...values.map((item) => item.value));
  return (
    <div className="material-bars" aria-label={label} data-chart-kind="bar">
      <svg viewBox="0 0 560 220" preserveAspectRatio="none" role="img" aria-hidden="true">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="30" x2="550" y1={24 + line * 48} y2={24 + line * 48} />)}
        {values.map((item, index) => {
          const slot = 510 / Math.max(values.length, 1);
          const height = (item.value / max) * 150;
          return (
            <g key={`${item.label}-${index}`}>
              <rect x={35 + index * slot} y={178 - height} width={Math.min(18, slot * .58)} height={height} rx="4">
                <title>{`${item.label}：${item.value}`}</title>
              </rect>
              <text x={44 + index * slot} y="202" textAnchor="middle">{item.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="sr-only">{values.map((item) => <span key={item.label}>{item.label}：{item.value}</span>)}</div>
    </div>
  );
}
