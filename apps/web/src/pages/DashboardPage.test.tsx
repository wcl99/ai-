import { renderToStaticMarkup } from 'react-dom/server';
import { RiskDonut } from '../components/DashboardVisuals';
import { smoothLine } from '../components/dashboardVisualGeometry';

describe('dashboard visual contracts', () => {
  it('uses a continuous cubic curve with no hard line joins', () => {
    const path = smoothLine([{ x: 0, y: 20 }, { x: 30, y: 5 }, { x: 60, y: 18 }]);
    expect(path).toMatch(/^M 0 20 C /);
    expect(path.match(/ C /g)).toHaveLength(2);
    expect(path).not.toContain(' L ');
  });

  it('renders risk segments as rounded SVG strokes', () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(<RiskDonut total={12} segments={[{ key: 'high', value: 4, color: '#ff8b32' }, { key: 'other', value: 8, color: '#e9edf5' }]} />),
      'text/html',
    );
    expect(document.querySelectorAll('.risk-donut-segment')).toHaveLength(2);
    expect(document.querySelector('.risk-donut-segment')?.getAttribute('stroke-linecap')).toBe('round');
  });
});
