import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type * as t from '@/types';
import { InsightPanel } from './InsightPanel';

const okInsight: t.VardeVernInsight = {
  status: 'ok',
  scope: 'tenant',
  window: { days: 30, since: '2026-06-24T00:00:00.000Z' },
  kpis: {
    requestsInspected: 120,
    requestsWithFindings: 30,
    protectedSpans: 45,
    shadowSpans: 18,
    requestsWithShadow: 12,
    requestsBlocked: 3,
  },
  series: [
    { day: '2026-07-01', inspected: 40, enforced: 15, shadow: 6, blocked: 1 },
    { day: '2026-07-02', inspected: 80, enforced: 30, shadow: 12, blocked: 2 },
  ],
  entities: [
    {
      piiType: 'PERSON',
      label: 'Person name',
      enforceRequests: 10,
      enforceSpans: 20,
      shadowRequests: 8,
      shadowSpans: 12,
      wouldMask: 10,
      wouldBlock: 2,
    },
    {
      piiType: 'LOCATION',
      label: 'Location',
      enforceRequests: 0,
      enforceSpans: 0,
      shadowRequests: 4,
      shadowSpans: 6,
      wouldMask: 6,
      wouldBlock: 0,
    },
    {
      piiType: 'FNR',
      label: 'Fødselsnummer',
      enforceRequests: 12,
      enforceSpans: 25,
      shadowRequests: 0,
      shadowSpans: 0,
      wouldMask: 0,
      wouldBlock: 0,
    },
  ],
  rules: [
    {
      ruleId: 'fnr',
      piiType: 'FNR',
      label: 'Fødselsnummer',
      mode: 'enforce',
      source: 'regex',
      active: true,
      requestActivations: 12,
      matchCount: 25,
      shadowRequestActivations: 0,
      shadowMatchCount: 0,
      wouldMaskCount: 0,
      wouldBlockCount: 0,
      blockActivations: 0,
      matchRate: 0.21,
    },
    {
      ruleId: 'person',
      piiType: 'PERSON',
      label: 'Person name',
      mode: 'shadow',
      source: 'ner',
      active: true,
      requestActivations: 8,
      matchCount: 12,
      shadowRequestActivations: 8,
      shadowMatchCount: 12,
      wouldMaskCount: 10,
      wouldBlockCount: 2,
      blockActivations: 0,
      matchRate: 0.1,
      minConfidence: 0.6,
    },
    {
      ruleId: 'legacy',
      piiType: 'EMAIL',
      label: 'Legacy email',
      mode: 'off',
      source: 'regex',
      active: false,
      requestActivations: 0,
      matchCount: 0,
      shadowRequestActivations: 0,
      shadowMatchCount: 0,
      wouldMaskCount: 0,
      wouldBlockCount: 0,
      blockActivations: 0,
      matchRate: 0,
    },
  ],
};

const vernValue = {
  enforceableGreen: [
    { entity: 'PERSON', language: 'nb' },
    { entity: 'PERSON', language: 'en' },
  ],
} as unknown as t.VardeVern;

let insightValue: t.VardeVernInsight = okInsight;
let pending = false;

vi.mock('@/server', () => ({
  vardeVernInsightQueryOptions: (days: number) => ({
    queryKey: ['varde-vern-insight', days],
    queryFn: () =>
      pending ? new Promise<t.VardeVernInsight>(() => {}) : Promise.resolve(insightValue),
  }),
  vardeVernQueryOptions: {
    queryKey: ['varde-vern'],
    queryFn: () => Promise.resolve(vernValue),
  },
}));
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/components/shared', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingState: () => <div data-testid="loading" />,
}));
vi.mock('@/components/configuration/fields', () => ({
  SelectField: (p: {
    value: string;
    options?: { label: string; value: string }[];
    onChange: (v: string) => void;
    'aria-label'?: string;
  }) => (
    <select
      aria-label={p['aria-label']}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    >
      {(p.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
// Charts render 0-size in jsdom; the panel logic is asserted via section headings + tables, so the wrappers
// are stubbed to trivial markers here (their own smoke test lives in charts.test.tsx).
vi.mock('./charts', () => ({
  TimeSeriesBars: () => <div data-testid="chart-timeseries" />,
  HorizontalBars: () => <div data-testid="chart-horizontal" />,
  StackedBar: () => <div data-testid="chart-stacked" />,
}));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InsightPanel />
    </QueryClientProvider>,
  );
}

describe('InsightPanel', () => {
  beforeEach(() => {
    insightValue = okInsight;
    pending = false;
  });

  it('renders the four KPI values (inspected, with-findings %, protected spans, shadow spans)', async () => {
    renderPanel();
    await screen.findByText('Requests inspected');
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('25% of inspected')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('spans masked or blocked')).toBeInTheDocument();
  });

  it('renders each chart wrapper inside its section', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Protection activity' });
    expect(screen.getByRole('region', { name: 'Findings by entity' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Enforce vs Shadow' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shadow readiness' })).toBeInTheDocument();
    expect(screen.getByTestId('chart-timeseries')).toBeInTheDocument();
    expect(screen.getByTestId('chart-horizontal')).toBeInTheDocument();
    expect(screen.getByTestId('chart-stacked')).toBeInTheDocument();
  });

  it('uses entity display names, never the ALL-CAPS codes', async () => {
    renderPanel();
    const readiness = await screen.findByRole('region', { name: 'Shadow readiness' });
    expect(within(readiness).getByText('Person')).toBeInTheDocument();
    expect(within(readiness).getByText('Location')).toBeInTheDocument();
    expect(within(readiness).queryByText('PERSON')).toBeNull();
    expect(within(readiness).queryByText('LOCATION')).toBeNull();
  });

  it('shows the "Would be protected" phrase for the shadow segment', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Enforce vs Shadow' });
    expect(screen.getByText('Would be protected')).toBeInTheDocument();
  });

  it('renders the rules table with engine labels + an inactive badge, sortable by column', async () => {
    renderPanel();
    const rules = await screen.findByRole('region', { name: 'Rules' });
    // Engine codes render as friendly labels; the disabled rule is marked inactive. ("Local regex" /
    // "Presidio" also appear as filter <option>s, so assert on the cell values via row scope below.)
    const rulesTable = within(rules).getByRole('table');
    expect(within(rulesTable).getByText('Presidio')).toBeInTheDocument();
    expect(within(rulesTable).getAllByText('Local regex').length).toBeGreaterThan(0);
    expect(within(rules).getByText('inactive')).toBeInTheDocument();
    // Default sort is requestActivations desc → Fødselsnummer (12) is the first data row.
    const firstRow = () => within(rules).getAllByRole('row')[1];
    expect(within(firstRow()).getByText('Fødselsnummer')).toBeInTheDocument();
    // Sorting by Min score (desc) surfaces the only NER rule with a score (Person, 0.6) first.
    fireEvent.click(within(rules).getByRole('button', { name: /Min score/ }));
    expect(within(firstRow()).getByText('Person name')).toBeInTheDocument();
    expect(within(rules).getByText('0.6')).toBeInTheDocument();
  });

  it('shows the quality-gate status from enforceableGreen (approved languages vs not yet approved)', async () => {
    renderPanel();
    const readiness = await screen.findByRole('region', { name: 'Shadow readiness' });
    // PERSON is green for nb + en; LOCATION is not in enforceableGreen.
    expect(within(readiness).getByText('Approved for nb, en')).toBeInTheDocument();
    expect(within(readiness).getByText('Not yet approved')).toBeInTheDocument();
  });

  it('renders the disabled state message', async () => {
    insightValue = {
      status: 'disabled',
      scope: 'tenant',
      window: { days: 30 },
      kpis: null,
      series: [],
      entities: [],
      rules: [],
    };
    renderPanel();
    expect(await screen.findByText(/protection is turned off/i)).toBeInTheDocument();
  });

  it('renders the unavailable state message', async () => {
    insightValue = {
      status: 'unavailable',
      scope: 'tenant',
      window: { days: 30 },
      kpis: null,
      series: [],
      entities: [],
      rules: [],
    };
    renderPanel();
    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
  });

  it('renders the loading state while the query is pending', () => {
    pending = true;
    renderPanel();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
