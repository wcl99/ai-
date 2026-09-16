type DonutSegment = { key: string; value: number; color: string };

export function RiskDonut({ total, segments }: { total: number; segments: DonutSegment[] }) {
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const sum = segments.reduce((result, segment) => result + segment.value, 0) || 1;
  let offset = 0;
  return (
    <div className="risk-donut" aria-label={`漏洞总数 ${total}`}>
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle className="risk-donut-track" cx="80" cy="80" r={radius} />
        {segments.map((segment) => {
          const length = Math.max(0, (segment.value / sum) * circumference - 3);
          const element = <circle key={segment.key} className="risk-donut-segment" cx="80" cy="80" r={radius} stroke={segment.color} strokeLinecap="round" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
          offset += (segment.value / sum) * circumference;
          return element;
        })}
      </svg>
      <div><span>漏洞总数</span><strong>{total}</strong></div>
    </div>
  );
}
