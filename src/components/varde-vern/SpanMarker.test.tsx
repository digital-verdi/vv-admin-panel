import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpanMarker } from './SpanMarker';

describe('SpanMarker', () => {
  it('marks the given UTF-16 spans from the LOCAL text (no substring crosses the API)', () => {
    const { container } = render(
      <SpanMarker
        text="Ola bor i Oslo"
        spans={[
          { start: 0, end: 3, tone: 'protective', label: 'PERSON' },
          { start: 10, end: 14, tone: 'measuring', label: 'LOCATION' },
        ]}
      />,
    );
    const marks = [...container.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['Ola', 'Oslo']);
    // The plain gaps + marks reconstruct the exact input.
    expect(container.textContent).toBe('Ola bor i Oslo');
  });

  it('skips out-of-range and reversed spans defensively', () => {
    const { container } = render(
      <SpanMarker
        text="short"
        spans={[
          { start: 0, end: 99, tone: 'protective', label: 'x' },
          { start: 3, end: 1, tone: 'protective', label: 'y' },
        ]}
      />,
    );
    expect(container.querySelectorAll('mark').length).toBe(0);
    expect(container.textContent).toBe('short');
  });
});
