export type TrendPoint = { x: number; y: number };

export function smoothLine(points: TrendPoint[], bounds?: { minY?: number; maxY?: number }): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const control = (current: TrendPoint, previous: TrendPoint | undefined, next: TrendPoint | undefined, reverse = false) => {
    const prev = previous ?? current;
    const following = next ?? current;
    const smoothing = 0.16;
    const dx = following.x - prev.x;
    const dy = following.y - prev.y;
    const y = current.y + (reverse ? -dy : dy) * smoothing;
    return { x: current.x + (reverse ? -dx : dx) * smoothing, y: Math.min(bounds?.maxY ?? Infinity, Math.max(bounds?.minY ?? -Infinity, y)) };
  };
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const start = control(previous, points[index - 1], point);
    const end = control(point, previous, points[index + 2], true);
    return `${path} C ${start.x} ${start.y}, ${end.x} ${end.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}
