import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  opts: { canManage?: boolean; entityActions?: Record<string, t.VardeVernAction>; qc?: QueryClient } = {},
) {
  const qc =
    opts.qc ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PresidioPanel status={status} canManage={opts.canManage} entityActions={opts.entityActions} />
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
    expect(screen.getByText(/Presidio joins Varde Vern/i)).toBeInTheDocument();
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
    expect(screen.getByText(/requires the manage-configs capability/i)).toBeInTheDocument();
  });

  it('F12f: the entity filter + threshold are sent to the admin API', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByLabelText('PERSON')); // entity-filter checkbox
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as { data: { entities?: string[]; scoreThreshold?: number } };
    expect(arg.data.entities).toEqual(['PERSON']);
    expect(arg.data.scoreThreshold).toBe(0.5);
  });

  it('F12f: the 3-level decision shows what Varde Vern would enforce (from entityActions)', async () => {
    renderPanel(CONFIGURED, { canManage: true, entityActions: { PERSON: 'enforce' } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    // found + above-threshold + would-enforce(mask). With PERSON=enforce and abovePolicyThreshold=true → "mask".
    await waitFor(() => expect(screen.getByText('found')).toBeInTheDocument());
    expect(screen.getByText('mask')).toBeInTheDocument();
  });

  it('F12f: an un-enforced entity shows "observe" (not enforced)', async () => {
    renderPanel(CONFIGURED, { canManage: true, entityActions: { PERSON: 'shadow' } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(screen.getByText('observe')).toBeInTheDocument());
  });
});
