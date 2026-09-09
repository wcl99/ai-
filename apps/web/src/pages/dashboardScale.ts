export const dashboardDesignSize = { width: 1280, height: 960 } as const;

export function dashboardScaleForViewport(viewport: { width: number; height: number }): number | null {
  void viewport;
  // The dashboard uses a fluid grid. Width is allowed to stretch so cards keep
  // the same height as the task-center metrics instead of being transformed.
  return null;
}
