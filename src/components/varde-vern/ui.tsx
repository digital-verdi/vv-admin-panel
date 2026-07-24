import { Tooltip } from '@clickhouse/click-ui';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import { cn } from '@/utils';

/** `Tone` is owned by `./operations` (the single source of truth); re-exported here so the shared
 *  primitives and their consumers can pull the type from one place alongside the components. */
export type { Tone };

/** Tone → background/text classes for the pill primitives. Kept in lockstep across every Varde Vern
 *  surface (previously duplicated verbatim in VardeVernPage + PresidioPanel). */
export const TONE_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

/** A small toned pill. `Chip` is the same primitive under the name PresidioPanel used historically. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

export const Chip = Badge;

/** A bordered card with a heading + optional description. Exposes `role="region"` (via `aria-label`) so
 *  callers and tests can target it by name. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-(--cui-color-stroke-default) p-4"
    >
      <h2 className="text-sm font-semibold text-(--cui-color-title-default)">{title}</h2>
      {description && (
        <p className="mt-1 mb-3 text-xs text-(--cui-color-text-muted)">{description}</p>
      )}
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** A label/value row for read-only status blocks (monospace value, wraps on overflow). */
export function StatusRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-(--cui-color-text-muted)">{label}</span>
      <span className="font-mono text-xs break-all text-(--cui-color-text-default)">{value}</span>
    </div>
  );
}

/** A keyboard/screen-reader-accessible help marker: a focusable "?" whose description is exposed via the
 *  click-ui Tooltip (Radix), so touch + AT users reach the help copy a bare `title` would hide. */
export function HelpTooltip({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <Tooltip.Trigger
        role="button"
        tabIndex={0}
        aria-label={`More information about ${label}`}
        className="ml-1 inline-flex cursor-help text-xs text-(--cui-color-text-muted)"
      >
        ?
      </Tooltip.Trigger>
      <Tooltip.Content maxWidth="18rem">{text}</Tooltip.Content>
    </Tooltip>
  );
}

/** A `<th>` with an optional inline `HelpTooltip`. */
export function ColumnHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
      {label}
      {tooltip && <HelpTooltip label={label} text={tooltip} />}
    </th>
  );
}
