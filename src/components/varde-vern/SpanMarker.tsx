import type { ReactNode } from 'react';
import type { Tone } from './operations';
import { cn } from '@/utils';

const MARK_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

export interface MarkSpan {
  start: number;
  end: number;
  tone: Tone;
  label: string;
}

/**
 * Render `text` with the given UTF-16 [start,end) spans wrapped in <mark>. The spans arrive from the
 * admin API as OFFSETS ONLY — this component slices the browser's OWN input, so no matched substring
 * ever crosses the API boundary. Out-of-range / overlapping spans are skipped defensively; gaps are
 * plain text.
 */
export function SpanMarker({ text, spans }: { text: string; spans: readonly MarkSpan[] }) {
  const ordered = [...spans]
    .filter((s) => s.start >= 0 && s.end <= text.length && s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((span, index) => {
    if (span.start < cursor) return; // already covered by an earlier span
    if (span.start > cursor) {
      nodes.push(<span key={`gap-${index}`}>{text.slice(cursor, span.start)}</span>);
    }
    nodes.push(
      <mark
        key={`mark-${index}`}
        title={span.label}
        className={cn('rounded-sm px-0.5', MARK_CLASS[span.tone])}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <p
      aria-label="Marked analysis input"
      className="rounded-md border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) p-3 text-sm whitespace-pre-wrap wrap-break-word"
    >
      {nodes.length > 0 ? nodes : <span className="text-(--cui-color-text-muted)">—</span>}
    </p>
  );
}
