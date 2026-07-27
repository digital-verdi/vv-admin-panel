import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { PresidioPanel } from './PresidioPanel';

const testFn = vi.fn().mockResolvedValue({
  status: 'success',
  findings: [
    {
      entityType: 'PERSON',
      startUtf16: 0,
      endUtf16: 3,
      score: 0.9,
      abovePolicyThreshold: true,
      recognizer: 'SpacyRecognizer',
    },
  ],
  requestedLanguage: 'auto',
  resolvedLanguage: 'nb',
  languageResolutionSource: 'franc_current_turn',
  scoreGap: 0.42,
  sampleChars: 57,
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
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/components/configuration/fields', () => ({
  SelectField: (p: {
    value: string;
    onChange: (v: string) => void;
    options?: { label: string; value: string }[];
    'aria-label'?: string;
  }) => (
    <select
      aria-label={p['aria-label']}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    >
      {(p.options ?? [
        { label: 'nb', value: 'nb' },
        { label: 'en', value: 'en' },
      ]).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  TextareaField: (p: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <textarea
      aria-label={p['aria-label']}
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    />
  ),
  NumberField: (p: {
    value: number | null;
    onChange: (v: number) => void;
    'aria-label'?: string;
  }) => (
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
  semanticScoreFixed: 0.85,
  nlpEngine: 'spaCy (SpacyRecognizer)',
  localEngine: 'Regex, Checksums (handles structural identifiers)',
  inactiveModules: ['Transformers', 'Stanza', 'Pattern recognizers', 'Deny/Allow-lists'],
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
    opts.qc ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

  it('test studio: Analyze calls the admin API and renders offsets/scores + local span marking', async () => {
    const { container } = renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('0–3')).toBeInTheDocument());
    // Score is the raw 0–1 analyzer value, not a percentage (spaCy returns a FIXED score, not a probability).
    expect(screen.getByText('0.9')).toBeInTheDocument();
    expect(screen.queryByText('90%')).toBeNull();
    await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe('Ola'));
    // The results table shows the Match (sliced from the local text, offsets 0–3 of SAMPLE_TEXT = "Ola") and
    // the Recognizer that produced the finding — scoped to the table (the SpanMarker "Ola" is outside it).
    const table = screen.getByRole('table');
    expect(within(table).getByText('Ola')).toBeInTheDocument();
    expect(within(table).getByText('SpacyRecognizer')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Match' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Recognizer' })).toBeInTheDocument();
  });

  it('test studio: the results legend explains Score is a fixed technical value, not a probability', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(screen.getByText('0–3')).toBeInTheDocument());
    // The note is a bare text node in a mixed-content <p>, so match the paragraph's full textContent.
    expect(
      screen.getByText(
        (_content, el) =>
          el?.tagName === 'P' &&
          /fixed 0\.85, not a calibrated probability/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('F12c: results mark the SUBMITTED snapshot, not the edited text', async () => {
    const { container } = renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe('Ola'));
    // Edit the textarea AFTER analyzing — the mark must still reflect the analyzed snapshot, not the new text.
    fireEvent.change(screen.getByLabelText('Sample text'), {
      target: { value: 'ZZZ totally different' },
    });
    expect(container.querySelector('mark')?.textContent).toBe('Ola');
  });

  it('F12d: without canManage, Analyze is disabled', () => {
    renderPanel(CONFIGURED, { canManage: false });
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled();
    expect(screen.getByText(/testing and refresh require Manage configs/i)).toBeInTheDocument();
  });

  it('F12f: the entity filter + threshold are sent to the admin API (display name shown, code sent)', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByLabelText('Person')); // entity-filter checkbox (title-case display name)
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as {
      data: { entities?: string[]; scoreThreshold?: number };
    };
    expect(arg.data.entities).toEqual(['PERSON']);
    expect(arg.data.scoreThreshold).toBe(0.5);
  });

  it('ADR 0026: language defaults to Auto and is sent to the admin API', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('auto');
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as { data: { language?: string; uiLanguage?: string } };
    expect(arg.data.language).toBe('auto');
    expect(arg.data.uiLanguage).toBeUndefined(); // no hint chosen
  });

  it('ADR 0026: the results show the resolved language + the reason (Franc + score gap + sample size)', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(screen.getByText('Language detection')).toBeInTheDocument());
    const card = screen.getByText('Language detection').closest('div')!.parentElement!;
    expect(within(card).getAllByText('Norwegian (nb)').length).toBeGreaterThan(0);
    expect(within(card).getByText(/Detected by Franc/i)).toBeInTheDocument();
    expect(within(card).getByText(/score gap 0\.42/i)).toBeInTheDocument();
    expect(within(card).getByText(/57 characters analyzed/i)).toBeInTheDocument();
  });

  it('ADR 0026: an "if uncertain" UI-language hint is sent as uiLanguage (auto only)', async () => {
    renderPanel(CONFIGURED, { canManage: true });
    // The hint selector appears only under Auto; pick Norwegian as the simulated browser hint.
    fireEvent.change(screen.getByLabelText('UI-language hint'), { target: { value: 'nb' } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    await waitFor(() => expect(testFn).toHaveBeenCalledTimes(1));
    const arg = testFn.mock.calls[0]![0] as { data: { language?: string; uiLanguage?: string } };
    expect(arg.data.language).toBe('auto');
    expect(arg.data.uiLanguage).toBe('nb');
  });

  it('ADR 0026: the UI-language hint selector is hidden when a language is pinned (not auto)', () => {
    renderPanel(CONFIGURED, { canManage: true });
    expect(screen.getByLabelText('UI-language hint')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'en' } });
    expect(screen.queryByLabelText('UI-language hint')).toBeNull();
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
    {
      presidioStatus: 'disabled',
      presidioPhase: 'enforce',
      action: 'enforce',
      above: true,
      expected: 'ignore',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'off',
      action: 'enforce',
      above: true,
      expected: 'ignore',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'shadow',
      action: 'allow',
      above: true,
      expected: 'ignore',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'shadow',
      action: 'enforce',
      above: true,
      expected: 'observe',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'enforce',
      action: 'shadow',
      above: true,
      expected: 'observe',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'enforce',
      action: 'enforce',
      above: false,
      expected: 'ignore',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'enforce',
      action: 'enforce',
      above: true,
      expected: 'mask',
    },
    {
      presidioStatus: 'optional',
      presidioPhase: 'enforce',
      action: 'block',
      above: true,
      expected: 'block',
    },
    // presidioStatus='required' exercises the non-disabled "proceeds" branch (all other rows use disabled/optional).
    {
      presidioStatus: 'required',
      presidioPhase: 'enforce',
      action: 'enforce',
      above: true,
      expected: 'mask',
    },
  ];

  it.each(DECISION_CASES)(
    'decision table: status=$presidioStatus phase=$presidioPhase action=$action above=$above → $expected',
    async ({ presidioStatus, presidioPhase, action, above, expected }) => {
      testFn.mockResolvedValueOnce({
        status: 'success',
        findings: [
          {
            entityType: 'PERSON',
            startUtf16: 0,
            endUtf16: 3,
            score: 0.9,
            abovePolicyThreshold: above,
          },
        ],
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
      screen.getAllByText(
        'Filters this test only. Saved entity thresholds are evaluated separately.',
      ),
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
      findings: [
        {
          entityType: 'PERSON',
          startUtf16: 0,
          endUtf16: 3,
          score: 0.4,
          abovePolicyThreshold: false,
        },
      ],
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
