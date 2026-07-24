import {
  Bar,
  XAxis,
  YAxis,
  Legend,
  Tooltip,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_HEIGHT, CHART_TOOLTIP_STYLE, AXIS_TICK } from './palette';

/** One stacked horizontal bar: a `label` with `enforce` (protected) and `shadow` (would-be-protected) spans. */
export interface StackedBarRow {
  label: string;
  enforce: number;
  shadow: number;
}

/**
 * Enforce-vs-shadow per entity: a horizontal bar whose two stacked segments compare protected spans against
 * spans a shadow rule WOULD have protected. Segment colors come from CSS tokens.
 */
export function StackedBar({ data }: { data: StackedBarRow[] }) {
  return (
    <div style={{ width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={CHART_COLORS.axis}
            tick={AXIS_TICK}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={CHART_COLORS.axis}
            tick={AXIS_TICK}
            tickLine={false}
            width={128}
          />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'transparent' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="enforce" name="Protected" stackId="s" fill={CHART_COLORS.enforce} />
          <Bar dataKey="shadow" name="Would be protected" stackId="s" fill={CHART_COLORS.shadow} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
