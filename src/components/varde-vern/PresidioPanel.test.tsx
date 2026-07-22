import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { PresidioPanel } from './PresidioPanel';

const testFn = vi.fn().mockResolvedValue({
  status: 'success',
  findings: [{ entityType: 'PERSON', startUtf16: 0, endUtf16: 3, score: 0.9, abovePolicyThreshold: true }],
});
const refreshFn = vi.fn().mockResolvedValue({ state: 'ready', supportedEntities: ['PERSON'] });

vi.mock('@/server', () => ({
  testPresidioFn: (args: unknown) => testFn(args),
  refreshPresidioFn: () => refreshFn(),
}));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifyError: vi.fn() };
});
vi.mock('@clickhouse/click-ui', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));
vi.mock('@/components/configuration/fields', () => ({
  SelectField: (p: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <select aria-label={p['aria-label']} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      <option value="nb">nb</option>
      <option value="en">en</option>
    </select>
  ),
  TextareaField: (p: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <textarea aria-label={p['aria-label']} value={p.value} onChange={(e) => p.onChange(e.target.value)} />
  ),
  NumberField: (p: { value: number | null; onChange: (v: number) => void; 'aria-label'?: string }) => (
    <input
      type="number"
      aria-label={p['aria-label']}
      value={p.value ?? ''}
      onChange={(e) => p.onChange(Number(e.target.value))}
    />
  ),
}));

const CONFIGURED: t.PresidioStatus = {
  configured: true,
  credential: 'managed',
  imageMode: 'derived',
  release: '2.2.363',
  digest: 'sha256:abc',
  language: 'nb',
  languages: ['nb', 'en'],
  state: 'ready',
  lastProbeAt: null,
  lastProbeLatencyMs: null,
  supportedEntities: ['PERSON', 'LOCATION'],
};

function renderPanel(
  status?: t.PresidioStatus,
  opts: {
    canManage?: boolean;
    entityActions?: Record<string, t.VardeVernAction>;
    presidioStatus?: t.VardeVernEngineStatus;
    presidioPhase?: t.VardeVernRolloutPhase;
    qc?: QueryClient;
  } = {},
) {
  const qc =
    opts.qc ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PresidioPanel
        status={status}
        canManage={opts.canManage}
        entityActions={opts.entityActions}
        presidioStatus={opts.presidioStatus}
        presidioPhase={opts.presidioPhase}
      />
    </QueryClientProvider>,
  );
}

describe('PresidioPanel', () => {
  beforeEach(() => {
    testFn.mockClear();
    refreshFn.mockClear();
  });

  it('shows a placeholder when Presidio is not configured', () => {
    renderPanel(undefined);
    expect(screen.getByText(/Presidio is not connected/i)).toBeInTheDocument();
  });

  it('renders read-only status (release/digest/managed/languages) but never an endpoint or token', () => {
    const { container } = renderPanel(CONFIGURED, { canManage: true });
    expect(screen.getByText('2.2.363', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('sha256:abc')).toBeInTheDocument();
    expect(screen.getByText('managed')).toBeInTheDocument();
    expect(screen.getByText('nb, en')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/http|X-Auth-Token|Bearer/i);
  });

  it('test studio: Analyze calls the admin API and renders offsets/scores + local span marking', async () => {
    const { container } = renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('0–3')).toBeInTheDocument());
    expect(screen.getByText('90%')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe('Ola'));
  });

  it('F12b: Refresh invalidates the varde-vern query so the status updates', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    renderPanel(CONFIGURED, { canManage: true, qc });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(refreshFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['varde-vern'] }));
  });

  it('F12c: results mark the SUBMITTED snapshot, not the edited text', async () => {
    const { container } = renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe('Ola'));
    // Edit the textarea AFTER analyzing — the mark must still reflect the analyzed snapshot, not the new text.
    fireEvent.change(screen.getByLabelText('Sample text'), { target: { value: 'ZZZ totally different' } });
    expect(container.querySelector('mark')?.textContent).toBe('Ola');
  });

  it('F12d: without canManage, Analyze is disabled and Refresh is hidden', () => {
    renderPanel(CONFIGURED, { canManage: false });
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
    expect(screen.getByText(/testing and refresh require Manage configs/i)).toBeInTheDocument();
  });

  it('F12f: the entity filter + threshold are sent to the admin API (display name shown, code sent)', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByLabelText('Person')); // entity-filter checkbox (title-case display name)
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as { data: { entities?: string[]; scoreThreshold?: number } };
    expect(arg.data.entities).toEqual(['PERSON']);
    expect(arg.data.scoreThreshold).toBe(0.5);
  });

  // The full decision table (plan Del 6): (presidioStatus, presidioPhase, saved policy action, above saved
  // threshold) → the Varde Vern column chip. Mirrors PresidioPanel.vernDecision EXACTLY, in evaluation order.
  const DECISION_CASES: {
    presidioStatus: t.VardeVernEngineStatus;
    presidioPhase: t.VardeVernRolloutPhase;
    action: t.VardeVernAction;
    above: boolean;
    expected: string;
  }[] = [
    { presidioStatus: 'disabled', presidioPhase: 'enforce', action: 'enforce', above: true, expected: 'ignore' },
    { presidioStatus: 'optional', presidioPhase: 'off', action: 'enforce', above: true, expected: 'ignore' },
    { presidioStatus: 'optional', presidioPhase: 'shadow', action: 'allow', above: true, expected: 'ignore' },
    { presidioStatus: 'optional', presidioPhase: 'shadow', action: 'enforce', above: true, expected: 'observe' },
    { presidioStatus: 'optional', presidioPhase: 'enforce', action: 'shadow', above: true, expected: 'observe' },
    { presidioStatus: 'optional', presidioPhase: 'enforce', action: 'enforce', above: false, expected: 'ignore' },
    { presidioStatus: 'optional', presidioPhase: 'enforce', action: 'enforce', above: true, expected: 'mask' },
    { presidioStatus: 'optional', presidioPhase: 'enforce', action: 'block', above: true, expected: 'block' },
    // presidioStatus='required' exercises the non-disabled "proceeds" branch (all other rows use disabled/optional).
    { presidioStatus: 'required', presidioPhase: 'enforce', action: 'enforce', above: true, expected: 'mask' },
  ];

  it.each(DECISION_CASES)(
    'decision table: status=$presidioStatus phase=$presidioPhase action=$action above=$above → $expected',
    async ({ presidioStatus, presidioPhase, action, above, expected }) => {
      testFn.mockResolvedValueOnce({
        status: 'success',
        findings: [{ entityType: 'PERSON', startUtf16: 0, endUtf16: 3, score: 0.9, abovePolicyThreshold: above }],
      });
      renderPanel(CONFIGURED, {
        canManage: true,
        entityActions: { PERSON: action },
        presidioStatus,
        presidioPhase,
      });
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
      const table = await screen.findByRole('table');
      // The "Presidio" column always chips "found"; the "Varde Vern" column carries the decision label.
      await waitFor(() => expect(within(table).getByText('found')).toBeInTheDocument());
      expect(within(table).getByText(expected)).toBeInTheDocument();
    },
  );

  it('the test studio shows the transient test-score filter (its own copy, not the saved-policy intro)', () => {
    renderPanel(CONFIGURED, { canManage: true });
    expect(screen.getByText('Test score filter')).toBeInTheDocument();
    expect(
      screen.getAllByText('Filters this test only. Saved entity thresholds are evaluated separately.'),
    ).toHaveLength(1);
    // The saved-policy minimum-score copy lives on the page, never inside the test studio.
    expect(screen.queryByText(/Findings below this value are ignored/)).toBeNull();
    expect(screen.queryByText('Minimum Presidio-score')).toBeNull();
    expect(screen.queryByText(/fast score 0,85/)).toBeNull();
  });

  it('renders entity display names, never the ALL-CAPS codes, in the findings table', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(screen.getByText('found')).toBeInTheDocument());
    const table = screen.getByRole('table');
    expect(within(table).getByText('Person')).toBeInTheDocument();
    expect(within(table).queryByText('PERSON')).toBeNull();
  });

  it('the results table has a "Policy score" column that chips "pass" for an above-threshold finding', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Policy score' })).toBeInTheDocument();
    await waitFor(() => expect(within(table).getByText('pass')).toBeInTheDocument());
  });

  it('the "Policy score" column chips "below" for a below-threshold finding', async () => {
    testFn.mockResolvedValueOnce({
      status: 'success',
      findings: [{ entityType: 'PERSON', startUtf16: 0, endUtf16: 3, score: 0.4, abovePolicyThreshold: false }],
    });
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('below')).toBeInTheDocument());
    expect(within(table).queryByText('pass')).toBeNull();
  });

  it('shows the compact entity-filter legend', () => {
    renderPanel(CONFIGURED, { canManage: true });
    expect(screen.getByText('Entities (none = all):')).toBeInTheDocument();
  });

  it('F12f: the Organization filter sends the Presidio request code ORGANIZATION (label stays "Organization")', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByLabelText('Organization')); // display-name label; Presidio code sent
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as { data: { entities?: string[] } };
    expect(arg.data.entities).toEqual(['ORGANIZATION']);
  });
});
