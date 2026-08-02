import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type * as t from '@/types';
import { AnalysisScopeSection } from './AnalysisScopeSection';

vi.mock('@clickhouse/click-ui', () => ({
  Tooltip: Object.assign(({ children }: { children?: React.ReactNode }) => <>{children}</>, {
    Trigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Content: ({ children }: { children?: React.ReactNode }) => <span role="tooltip">{children}</span>,
  }),
}));

const SCOPE: t.VardeVernAnalysisScope = {
  engines: [
    { id: 'regex', label: 'Local PII engine', kind: 'authoritative' },
    { id: 'term-rules', label: 'Term rules', kind: 'authoritative' },
    { id: 'presidio', label: 'Presidio Analyzer', kind: 'supplementary' },
  ],
  fields: [
    { id: 'message_text:user', label: 'Message content — role: user', jsonPath: 'messages[].content', supplementary: true },
    { id: 'message_text:system', label: 'Message content — role: system', jsonPath: 'messages[].content', supplementary: false },
    { id: 'tool_description', label: 'Tool descriptions', jsonPath: 'tools[].function.description', supplementary: false },
    { id: 'embedding_input', label: 'Embeddings input', jsonPath: 'input', supplementary: true },
  ],
};

const rowFor = (label: string) => {
  const cell = screen.getByText(label);
  const row = cell.closest('tr');
  if (!row) throw new Error(`no row for ${label}`);
  return within(row);
};

describe('AnalysisScopeSection', () => {
  it('renders a column per engine, labelled with its class', async () => {
    render(<AnalysisScopeSection scope={SCOPE} />);
    const region = await screen.findByRole('region', { name: 'Analysis scope' });
    for (const label of ['Local PII engine', 'Term rules', 'Presidio Analyzer']) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
    expect(within(region).getAllByText('authoritative')).toHaveLength(2);
    expect(within(region).getByText('supplementary')).toBeInTheDocument();
  });

  it('marks every field analysed for BOTH authoritative engines, whatever the semantic scope says', () => {
    render(<AnalysisScopeSection scope={SCOPE} />);
    // This is the invariant an operator must be able to read off the table: a "not analysed" cell is
    // never a gap in structural PII protection, only in the semantic layer.
    for (const field of SCOPE.fields) {
      expect(rowFor(field.label).getAllByText('analysed').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('distinguishes caller-authored content from instruction text in the semantic column', () => {
    render(<AnalysisScopeSection scope={SCOPE} />);
    expect(rowFor('Message content — role: user').queryByText('not analysed')).toBeNull();
    expect(rowFor('Embeddings input').queryByText('not analysed')).toBeNull();
    expect(rowFor('Message content — role: system').getByText('not analysed')).toBeInTheDocument();
    expect(rowFor('Tool descriptions').getByText('not analysed')).toBeInTheDocument();
  });

  it('shows where each field lives, so a row can be checked against a real request body', () => {
    render(<AnalysisScopeSection scope={SCOPE} />);
    expect(screen.getByText('tools[].function.description')).toBeInTheDocument();
    expect(screen.getAllByText('messages[].content')).toHaveLength(2);
  });

  it('renders NOTHING when the proxy has not sent the field', () => {
    // An empty matrix would read as "nothing is analysed" — the most dangerous thing this could say.
    const { container } = render(<AnalysisScopeSection scope={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the payload is present but empty', () => {
    const { container } = render(<AnalysisScopeSection scope={{ engines: [], fields: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leaks no transport detail', () => {
    // Mirrors PresidioStatusCard.test.tsx — proxy-sourced data must never render a host or a token.
    const { container } = render(<AnalysisScopeSection scope={SCOPE} />);
    expect(container.textContent).not.toMatch(/http|X-Auth-Token|Bearer/i);
  });
});
