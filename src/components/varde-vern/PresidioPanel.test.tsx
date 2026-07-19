import { describe, it, expect, vi } from 'vitest';
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
}));

const CONFIGURED: t.PresidioStatus = {
  configured: true,
  credential: 'managed',
  imageMode: 'derived',
  release: '2.2.363',
  digest: 'sha256:abc',
  language: 'nb',
  state: 'ready',
  lastProbeAt: null,
  lastProbeLatencyMs: null,
  supportedEntities: ['PERSON', 'LOCATION'],
};

function renderPanel(status?: t.PresidioStatus) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PresidioPanel status={status} />
    </QueryClientProvider>,
  );
}

describe('PresidioPanel', () => {
  it('shows a placeholder when Presidio is not configured', () => {
    renderPanel(undefined);
    expect(screen.getByText(/Presidio joins Varde Vern/i)).toBeInTheDocument();
  });

  it('renders read-only status (release/digest/managed) but never an endpoint or token', () => {
    const { container } = renderPanel(CONFIGURED);
    expect(screen.getByText('2.2.363', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('sha256:abc')).toBeInTheDocument();
    expect(screen.getByText('managed')).toBeInTheDocument();
    // No base URL / host / token is present in the rendered panel.
    expect(container.textContent).not.toMatch(/http|X-Auth-Token|Bearer/i);
  });

  it('test studio: Analyze calls the admin API and renders offsets/scores + local span marking', async () => {
    const { container } = renderPanel(CONFIGURED);
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    // The findings table shows the offsets + score (no matched substring came from the API).
    await waitFor(() => expect(screen.getByText('0–3')).toBeInTheDocument());
    expect(screen.getByText('90%')).toBeInTheDocument();
    // The input is marked LOCALLY from the returned offsets.
    await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe('Ola'));
  });
});
