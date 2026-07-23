import type { CSSProperties } from 'react';

/**
 * Chart colors resolve to the app's CSS custom properties (never hardcoded hex), so every series tracks
 * the active light/dark theme automatically — the tokens flip in `src/styles.css`, the SVG follows.
 * Semantics: enforce/protective = success, shadow/measuring = info, blocked/danger = danger,
 * inspected/reference line + axes = muted text, grid = default stroke.
 */
export const CHART_COLORS = {
  enforce: 'var(--cui-color-accent-success)',
  shadow: 'var(--cui-color-accent-info)',
  blocked: 'var(--cui-color-accent-danger)',
  inspected: 'var(--cui-color-text-muted)',
  axis: 'var(--cui-color-text-muted)',
  grid: 'var(--cui-color-stroke-default)',
} as const;

/** Shared recharts tooltip surface — panel background, default stroke border, default text. */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--cui-color-background-panel)',
  border: '1px solid var(--cui-color-stroke-default)',
  borderRadius: 8,
  color: 'var(--cui-color-text-default)',
  fontSize: 12,
};

/** Fixed chart height (px). ResponsiveContainer drives the width from the flex parent. */
export const CHART_HEIGHT = 260;

/** Muted tick styling shared by the cartesian axes (recharts `tick` takes SVG text props, not CSS). */
export const AXIS_TICK: { fill: string; fontSize: number } = {
  fill: CHART_COLORS.axis,
  fontSize: 11,
};
