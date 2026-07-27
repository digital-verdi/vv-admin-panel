import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { PresidioStatusCard } from './PresidioStatusCard';

const refreshFn = vi.fn().mockResolvedValue({ state: 'ready', supportedEntities: ['PERSON'] });

vi.mock('@/server', () => ({
  refreshPresidioFn: () => refreshFn(),
}));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifyError: vi.fn() };
});
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
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
  semanticScoreFixed: 0.85,
  nlpEngine: 'spaCy (SpacyRecognizer)',
  localEngine: 'Regex, Checksums (handles structural identifiers)',
  inactiveModules: ['Transformers', 'Stanza', 'Pattern recognizers', 'Deny/Allow-lists'],
};

function renderCard(status?: t.PresidioStatus, opts: { canManage?: boolean; qc?: QueryClient } = {}) {
  const qc =
    opts.qc ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PresidioStatusCard status={status} canManage={opts.canManage} />
    </QueryClientProvider>,
  );
}

describe('PresidioStatusCard', () => {
  beforeEach(() => {
    refreshFn.mockClear();
  });

  it('shows a not-configured placeholder when Presidio is not connected', () => {
    renderCard(undefined);
    expect(screen.getByText(/Presidio is not connected/i)).toBeInTheDocument();
    expect(screen.getByText('Presidio Analyzer Status')).toBeInTheDocument();
  });

  it('renders read-only status (release/digest/managed/languages) but never an endpoint or token', () => {
    const { container } = renderCard(CONFIGURED, { canManage: true });
    expect(screen.getByText('2.2.363', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('sha256:abc')).toBeInTheDocument();
    expect(screen.getByText('managed')).toBeInTheDocument();
    expect(screen.getByText('nb, en')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/http|X-Auth-Token|Bearer/i);
  });

  it('renders the dynamic engine capabilities (NLP engine, local PII engine, inactive modules)', () => {
    renderCard(CONFIGURED, { canManage: true });
    const nlpRow = screen.getByText('NLP Engine').closest('div')!;
    expect(within(nlpRow).getByText('spaCy (SpacyRecognizer)')).toBeInTheDocument();
    const localRow = screen.getByText('Local PII engine').closest('div')!;
    expect(
      within(localRow).getByText('Regex, Checksums (handles structural identifiers)'),
    ).toBeInTheDocument();
    const modulesRow = screen.getByText('Inactive modules').closest('div')!;
    expect(
      within(modulesRow).getByText('Transformers, Stanza, Pattern recognizers, Deny/Allow-lists'),
    ).toBeInTheDocument();
  });

  it('Refresh invalidates the varde-vern query so the status updates', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    renderCard(CONFIGURED, { canManage: true, qc });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(refreshFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['varde-vern'] }));
  });

  it('without canManage, Refresh is hidden', () => {
    renderCard(CONFIGURED, { canManage: false });
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  });
});
