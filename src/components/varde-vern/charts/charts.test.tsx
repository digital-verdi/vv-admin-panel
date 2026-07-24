import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { TimeSeriesBars } from './TimeSeriesBars';
import { HorizontalBars } from './HorizontalBars';
import { StackedBar } from './StackedBar';
import { CHART_COLORS } from './palette';

// recharts' ResponsiveContainer relies on ResizeObserver, which jsdom does not implement — stub it so the
// wrappers mount (they render 0-size, which is fine for a smoke test).
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const series = [
  { day: '2026-07-01', inspected: 40, enforced: 15, shadow: 6, blocked: 1 },
  { day: '2026-07-02', inspected: 80, enforced: 30, shadow: 12, blocked: 2 },
];

describe('varde-vern charts', () => {
  it('every chart color is a CSS custom property, never a hardcoded hex', () => {
    for (const value of Object.values(CHART_COLORS)) {
      expect(value.startsWith('var(--cui-color-')).toBe(true);
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('TimeSeriesBars renders without throwing', () => {
    const { container } = render(<TimeSeriesBars data={series} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('HorizontalBars renders without throwing', () => {
    const { container } = render(
      <HorizontalBars
        data={[
          { label: 'Person', value: 18 },
          { label: 'Location', value: 6 },
        ]}
      />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('StackedBar renders without throwing', () => {
    const { container } = render(
      <StackedBar
        data={[
          { label: 'Person', enforce: 20, shadow: 12 },
          { label: 'Location', enforce: 0, shadow: 6 },
        ]}
      />,
    );
    expect(container.firstChild).not.toBeNull();
  });
});
