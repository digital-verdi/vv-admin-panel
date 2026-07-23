import { Bar, XAxis, YAxis, Tooltip, BarChart, CartesianGrid, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, CHART_HEIGHT, CHART_TOOLTIP_STYLE, AXIS_TICK } from './palette';

/** One horizontal bar: a category `label` and its numeric `value`. */
export interface HorizontalBarRow {
  label: string;
  value: number;
}

/**
 * A value-descending horizontal bar chart (one bar per row). The single series color defaults to the info
 * token but callers may override it with any CSS-var token.
 */
export function HorizontalBars({
  data,
  color = CHART_COLORS.shadow,
}: {
  data: HorizontalBarRow[];
  color?: string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <div style={{ width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
        >
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
          <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
