export const PUBLIC_SURFACE = {
  navHeightPx: 76,
  backdropPrimaryWidthPx: 900,
  backdropPrimaryHeightPx: 700,
  backdropSecondaryWidthPx: 1200,
  backdropSecondaryHeightPx: 600,
  backdropGridSizePx: 80,
  titleMinPx: 52,
  titlePreferredVw: 8,
  titleMaxPx: 108,
  authTitleMinPx: 32,
  authTitlePreferredVw: 5,
  authTitleMaxPx: 48,
} as const;

export const SHELL_LAYOUT = {
  sidebarCollapseBreakpointPx: 1280,
} as const;

export const HEALTH_THRESHOLDS = {
  warningPct: 66,
  criticalPct: 86,
} as const;

export const GOAL_PROGRESS_THRESHOLDS = {
  cautionPct: 50,
  healthyPct: 80,
} as const;
