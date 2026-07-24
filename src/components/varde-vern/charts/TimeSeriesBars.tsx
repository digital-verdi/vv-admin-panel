import {
  Bar,
  Line,
  XAxis,
  YAxis,
  Legend,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import type * as t from '@/types';
import { CHART_COLORS, CHART_HEIGHT, CHART_TOOLTIP_STYLE, AXIS_TICK } from './palette';

/**
 * Protection activity over the window: one stacked bar per day (protected ∪ would-be-protected ∪ blocked
 * spans) with the inspected-request count overlaid as a reference line. Colors come from CSS tokens, so the
 * chart re-themes with the panel.
 */
export function TimeSeriesBars({ data }: { data: t.VardeVernInsightSeriesPoint[] }) {
  return (
    <div style={{ width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="day" stroke={CHART_COLORS.axis} tick={AXIS_TICK} tickLine={false} />
          <YAxis
            stroke={CHART_COLORS.axis}
            tick={AXIS_TICK}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'transparent' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="enforced" name="Protected" stackId="spans" fill={CHART_COLORS.enforce} />
          <Bar
            dataKey="shadow"
            name="Would be protected"
            stackId="spans"
            fill={CHART_COLORS.shadow}
          />
          <Bar dataKey="blocked" name="Blocked" stackId="spans" fill={CHART_COLORS.blocked} />
          <Line
            dataKey="inspected"
            name="Inspected"
            type="monotone"
            stroke={CHART_COLORS.inspected}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
