export const dashboardDesignSize = { width: 1280, height: 960 } as const;

const compactSidebarWidth = 220;
const dashboardContentPadding = { width: 36, height: 24 } as const;
const appHeaderHeight = 66;
const minimumDashboardScale = 0.78;

export function dashboardScaleForViewport(viewport: { width: number; height: number }): number | null {
  const availableWidth = viewport.width - compactSidebarWidth - dashboardContentPadding.width;
  const availableHeight = viewport.height - appHeaderHeight - dashboardContentPadding.height;
  const scale = Math.min(1, availableWidth / dashboardDesignSize.width, availableHeight / dashboardDesignSize.height);
  return scale >= minimumDashboardScale ? scale : null;
}
