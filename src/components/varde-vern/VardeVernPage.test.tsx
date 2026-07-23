import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { VardeVernPage } from './VardeVernPage';

const mockVern: t.VardeVern = {
  policyVersion: 1,
  defaultAction: 'shadow',
  policyValid: true,
  rolloutValid: true,
  entities: [
    {
      entityType: 'FNR',
      label: 'Fødselsnummer',
      engine: 'regex',
      confidenceApplicable: false,
      technicalStatus: 'Mod-11 checksum',
      action: 'enforce',
    },
    {
      entityType: 'EMAIL',
      label: 'E-post',
      engine: 'regex',
      confidenceApplicable: false,
      technicalStatus: 'Format validation',
      action: 'enforce',
    },
    {
      entityType: 'PERSON',
      label: 'Person name',
      engine: 'semantic',
      confidenceApplicable: true,
      minConfidence: 0.7,
      action: 'shadow',
      enforceGreenLanguages: ['nb', 'en'],
      scoreModel: 'spacy-ner-fixed',
      semanticFixedScore: 0.85,
    },
    {
      entityType: 'LOCATION',
      label: 'Sted',
      engine: 'semantic',
      confidenceApplicable: true,
      action: 'shadow',
      enforceGreenLanguages: [],
      scoreModel: 'spacy-ner-fixed',
      semanticFixedScore: 0.85,
    },
    {
      entityType: 'ORG',
      label: 'Organisasjon',
      engine: 'semantic',
      confidenceApplicable: true,
      action: 'shadow',
      enforceGreenLanguages: [],
      scoreModel: 'spacy-ner-fixed',
      semanticFixedScore: 0.85,
    },
  ],
  policy: {
    version: 1,
    defaultAction: 'shadow',
    entities: {
      FNR: { action: 'enforce', requiredEngines: ['regex'] },
      EMAIL: { action: 'enforce', requiredEngines: ['regex'] },
      PERSON: { action: 'shadow', requiredEngines: [], minConfidence: 0.7 },
    },
  },
  rollout: [
    { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
    { engineId: 'presidio', status: 'optional', rolloutPhase: 'shadow', enforceAllowed: false },
  ],
  enforceableGreen: [
    { entity: 'PERSON', language: 'nb' },
    { entity: 'PERSON', language: 'en' },
  ],
  presidio: {
    configured: true,
    state: 'ready',
    imageMode: 'derived',
    release: '2.2.363',
    digest: 'sha256:x',
    languages: ['nb', 'en'],
    supportedEntities: ['PERSON', 'LOCATION', 'ORGANIZATION', 'DATE_TIME', 'NRP'],
    integratedPresidioEntities: ['PERSON', 'LOCATION', 'ORGANIZATION'],
    semanticScoreFixed: 0.85,
    defaultMinConfidence: 0.5,
  },
  configRevision: 3,
  dbBacked: true,
};

let queryValue: t.VardeVern = mockVern;
let canManage = true;
// Records the props the page threads into PresidioPanel, so the page→panel wiring is assertable via the mock.
let capturedPanelProps: {
  canManage?: boolean;
  presidioPhase?: t.VardeVernRolloutPhase;
  presidioStatus?: t.VardeVernEngineStatus;
  entityActions?: Record<string, t.VardeVernAction>;
} = {};
const saveFn = vi.fn().mockResolvedValue({ status: 'ok', configRevision: 4 });
vi.mock('@/server', () => ({
  vardeVernQueryOptions: { queryKey: ['varde-vern'], queryFn: () => Promise.resolve(queryValue) },
  saveVardeVernFn: (args: unknown) => saveFn(args),
}));
vi.mock('@/hooks', () => ({ useCapabilities: () => ({ hasCapability: () => canManage }) }));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
// Minimal click-ui stub: Icon + a Tabs whose Trigger buttons drive onValueChange (captured module-locally).
vi.mock('@clickhouse/click-ui', () => {
  let onChange: ((v: string) => void) | undefined;
  const Tabs = ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (v: string) => void;
  }) => {
    onChange = onValueChange;
    return <div>{children}</div>;
  };
  Tabs.TriggersList = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Tabs.Trigger = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button type="button" onClick={() => onChange?.(value)}>
      {children}
    </button>
  );
  Tabs.Content = () => null;
  // click-ui Tooltip: the trigger keeps its accessible name (aria-label); the content renders its text with
  // role="tooltip" so the help copy is assertable without hovering (real hover behavior is click-ui's own).
  const Tooltip = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tooltip.Trigger = ({
    children,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    'aria-label'?: string;
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {children}
    </button>
  );
  Tooltip.Content = ({ children }: { children: React.ReactNode }) => (
    <span role="tooltip">{children}</span>
  );
  return { Icon: ({ name }: { name: string }) => <span data-icon={name} />, Tabs, Tooltip };
});
// Isolate the page's IA from the panel internals (PresidioPanel has its own test), but RECORD the props the
// page threads in so the page→panel wiring (saved phase/status/entity actions) is assertable.
vi.mock('./PresidioPanel', () => ({
  PresidioPanel: (p: {
    canManage?: boolean;
    presidioPhase?: t.VardeVernRolloutPhase;
    presidioStatus?: t.VardeVernEngineStatus;
    entityActions?: Record<string, t.VardeVernAction>;
  }) => {
    capturedPanelProps = {
      canManage: p.canManage,
      presidioPhase: p.presidioPhase,
      presidioStatus: p.presidioStatus,
      entityActions: p.entityActions,
    };
    return <div data-testid="presidio-panel" data-can-manage={String(p.canManage)} />;
  },
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
  NumberField: (p: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
    'aria-label'?: string;
    placeholder?: string;
  }) => (
    <input
      type="number"
      aria-label={p['aria-label']}
      placeholder={p.placeholder}
      value={p.value ?? ''}
      onChange={(e) => p.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  ),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VardeVernPage />
    </QueryClientProvider>,
  );
}

const goTab = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

const openPresidioTab = async () => {
  await screen.findByRole('region', { name: 'Entity matrix' });
  goTab('Presidio Analyzer');
  return screen.findByRole('region', { name: 'Integrated in Varde Vern' });
};

const savedPolicy = (): t.VardeVernPolicyInput => {
  const arg = saveFn.mock.calls[0]![0] as { data: { policy: t.VardeVernPolicyInput } };
  return arg.data.policy;
};

describe('VardeVernPage — table redesign + English-only UI', () => {
  beforeEach(() => {
    queryValue = mockVern;
    canManage = true;
    capturedPanelProps = {};
    saveFn.mockClear();
  });

  it('Overview is the default tab and shows the entity matrix (local engine / Presidio / effective action)', async () => {
    renderPage();
    const matrix = await screen.findByRole('region', { name: 'Entity matrix' });
    // FNR = regex authoritative (backend label); PERSON = semantic supplementary (title-case display name).
    expect(within(matrix).getByText('Fødselsnummer')).toBeInTheDocument();
    expect(within(matrix).getByText('Person')).toBeInTheDocument();
    expect(within(matrix).getAllByText('authoritative').length).toBeGreaterThan(0);
    expect(within(matrix).getAllByText('supplementary').length).toBeGreaterThan(0);
    // The final column is "Policy action" (renamed from the old "Effective action").
    expect(within(matrix).getByText('Policy action')).toBeInTheDocument();
    expect(within(matrix).queryByText('Effective action')).toBeNull();
  });

  it('Local PII engine tab shows the regex section (checksum + enforce/block action)', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    goTab('Local PII engine');
    const regexSection = await screen.findByRole('region', {
      name: 'Structured & validated data (local regex)',
    });
    expect(within(regexSection).getByText('Mod-11 checksum')).toBeInTheDocument();
    expect(within(regexSection).getByLabelText('Fødselsnummer policy action')).toBeInTheDocument();
  });

  it('Presidio Analyzer tab shows the integrated table + the panel, and passes canManage', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(within(integrated).getByLabelText('Person minimum score')).toBeInTheDocument();
    const panel = screen.getByTestId('presidio-panel');
    expect(panel).toHaveAttribute('data-can-manage', 'true');
  });

  it('renders the five table columns: Entity | Presidio requirement | Enforcement Mode | Minimum Score | Effective outcome', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(within(integrated).getByRole('columnheader', { name: 'Entity' })).toBeInTheDocument();
    // "Presidio requirement", "Minimum Score" and "Effective outcome" carry help tooltips, so the header's
    // accessible name also includes the trigger/tooltip copy — match on the label substring.
    expect(
      within(integrated).getByRole('columnheader', { name: /Presidio requirement/ }),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByRole('columnheader', { name: 'Enforcement Mode' }),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByRole('columnheader', { name: /Minimum Score/ }),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByRole('columnheader', { name: /Effective outcome/ }),
    ).toBeInTheDocument();
    expect(within(integrated).queryByRole('columnheader', { name: /Detection Policy/ })).toBeNull();
    // The tooltip-bearing headers expose the help trigger via the "More information about …" aria-label.
    expect(
      within(integrated).getByRole('button', {
        name: 'More information about Presidio requirement',
      }),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByRole('button', { name: 'More information about Minimum Score' }),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByRole('button', { name: 'More information about Effective outcome' }),
    ).toBeInTheDocument();
    // Title-case display names — never the ALL-CAPS codes — in the Entity column.
    expect(within(integrated).getByText('Person')).toBeInTheDocument();
    expect(within(integrated).getByText('Location')).toBeInTheDocument();
    expect(within(integrated).getByText('Organization')).toBeInTheDocument();
    expect(within(integrated).queryByText('PERSON')).toBeNull();
    expect(within(integrated).queryByText('LOCATION')).toBeNull();
    expect(within(integrated).queryByText('ORG')).toBeNull();
  });

  it('the Effective outcome column combines the global Presidio phase with each entity action (proxy ceiling)', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    // Fixture: global Presidio phase = shadow, all three semantic entities = shadow ⇒ each observes.
    expect(within(integrated).getByTestId('effective-PERSON')).toHaveTextContent('Observe');
    expect(within(integrated).getByTestId('effective-LOCATION')).toHaveTextContent('Observe');
    expect(within(integrated).getByTestId('effective-ORG')).toHaveTextContent('Observe');

    // Setting Person to Enforce while the global phase is still Shadow is DOWNGRADED to observe (the ceiling).
    fireEvent.change(within(integrated).getByLabelText('Person enforcement mode'), {
      target: { value: 'enforce' },
    });
    expect(within(integrated).getByTestId('effective-PERSON')).toHaveTextContent('Observe');

    // Raising the global Presidio rollout mode to Enforce lets Person actually Mask; Location (still shadow)
    // keeps observing — the per-entity action now applies fully.
    fireEvent.change(screen.getByLabelText('Presidio rollout mode'), {
      target: { value: 'enforce' },
    });
    expect(within(integrated).getByTestId('effective-PERSON')).toHaveTextContent('Mask');
    expect(within(integrated).getByTestId('effective-LOCATION')).toHaveTextContent('Observe');

    // Turning Person Off (allow) ignores it outright, even under the enforce ceiling.
    fireEvent.change(within(integrated).getByLabelText('Person enforcement mode'), {
      target: { value: 'allow' },
    });
    expect(within(integrated).getByTestId('effective-PERSON')).toHaveTextContent('Ignored');
  });

  it('shows the integrated help as a scannable bulleted list with the live fixed score, not a dense intro block', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(
      within(integrated).getByText(/Configure how Varde Vern handles specific data types/),
    ).toBeInTheDocument();
    // The Off / Shadow / Enforce ceiling rules render as a real <ul><li> list (three items).
    expect(within(integrated).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(integrated).getByText(/All data types are ignored, regardless of their setting/),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByText(/downgraded to Shadow \(observed only\)/),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByText(/Each individual setting applies fully/),
    ).toBeInTheDocument();
    expect(
      within(integrated).getByText(/makes the entire Presidio connection mandatory/),
    ).toBeInTheDocument();
    // Minimum Score line distinguishes the empty-state DEFAULT (0.5, from defaultMinConfidence) from the
    // fixed score spaCy RETURNS (0.85, from semanticScoreFixed) — both dynamic, not hardcoded.
    expect(within(integrated).getByText(/Left empty it defaults to 0\.5/)).toBeInTheDocument();
    expect(within(integrated).getByText(/fixed score of 0\.85/)).toBeInTheDocument();
    // The old dense description block is gone.
    expect(
      within(integrated).queryByText(/Integrated Presidio types: people, locations/),
    ).toBeNull();
  });

  it('the Minimum Score inputs use the default threshold (0.5) as their empty-state placeholder, not the fixed score', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    const score = within(integrated).getByLabelText('Person minimum score');
    expect(score).toHaveAttribute('placeholder', '0.5');
  });

  it('the integrated vs reported split is derived from supportedEntities − integratedPresidioEntities', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(within(integrated).getByText('Person')).toBeInTheDocument();
    expect(within(integrated).getByText('Location')).toBeInTheDocument();
    expect(within(integrated).getByText('Organization')).toBeInTheDocument();
    const reported = screen.getByRole('region', { name: 'Supported by Presidio, not integrated' });
    // supportedEntities − integratedPresidioEntities = DATE_TIME, NRP (dynamic, not hardcoded).
    expect(within(reported).getByText('DATE_TIME')).toBeInTheDocument();
    expect(within(reported).getByText('NRP')).toBeInTheDocument();
    expect(within(reported).getAllByText('not integrated')).toHaveLength(2);
    // Integrated types never appear in the reported-only list.
    expect(within(reported).queryByText('PERSON')).toBeNull();
  });

  it('Presidio requirement → Required round-trips as requiredEngines: ["presidio"]', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    fireEvent.change(within(integrated).getByLabelText('Person Presidio requirement'), {
      target: { value: 'required' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    expect(savedPolicy().entities.PERSON!.requiredEngines).toEqual(['presidio']);
  });

  it('Enforcement Mode → Enforce auto-sets enforceLanguages to the green languages and shows them muted', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    fireEvent.change(within(integrated).getByLabelText('Person enforcement mode'), {
      target: { value: 'enforce' },
    });
    expect(within(integrated).getByText('nb, en')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    expect(savedPolicy().entities.PERSON!.action).toBe('enforce');
    expect(savedPolicy().entities.PERSON!.enforceLanguages).toEqual(['nb', 'en']);
  });

  it('Minimum Score edits round-trip as minConfidence', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    fireEvent.change(within(integrated).getByLabelText('Person minimum score'), {
      target: { value: '0.55' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    expect(savedPolicy().entities.PERSON!.minConfidence).toBe(0.55);
  });

  it('offers Enforce only for a green entity; non-green omits it with the quality-gate tooltip', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    const personSelect = within(integrated).getByLabelText('Person enforcement mode');
    expect(within(personSelect).getByRole('option', { name: 'Enforce' })).toBeInTheDocument();
    const locationSelect = within(integrated).getByLabelText('Location enforcement mode');
    expect(within(locationSelect).queryByRole('option', { name: 'Enforce' })).toBeNull();
    const orgSelect = within(integrated).getByLabelText('Organization enforcement mode');
    expect(within(orgSelect).queryByRole('option', { name: 'Enforce' })).toBeNull();
    expect(within(integrated).getAllByText('Enforce needs approved quality tests.')).toHaveLength(
      2,
    );
  });

  it('the Presidio rollout status (optional/required) is editable and round-trips', async () => {
    renderPage();
    await openPresidioTab();
    const status = await screen.findByLabelText('Presidio requirement');
    fireEvent.change(status, { target: { value: 'required' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    const arg = saveFn.mock.calls[0]![0] as {
      data: { rollout: { engines: t.VardeVernRolloutEngine[] } };
    };
    const presidio = arg.data.rollout.engines.find((e) => e.engineId === 'presidio');
    expect(presidio!.status).toBe('required');
  });

  it('renders the Presidio engine as two setting rows (label + description + control), no standalone "presidio" label', async () => {
    renderPage();
    await openPresidioTab();
    const engine = screen.getByRole('region', { name: 'Presidio engine' });
    // Two setting-row labels, each with its own description.
    expect(within(engine).getByText('Presidio requirement')).toBeInTheDocument();
    expect(within(engine).getByText('Presidio rollout mode')).toBeInTheDocument();
    expect(
      within(engine).getByText(/Controls how connection failures are handled/),
    ).toBeInTheDocument();
    expect(
      within(engine).getByText(/blocks the request entirely, if the Presidio is unavailable/),
    ).toBeInTheDocument();
    expect(
      within(engine).getByText(/Controls how the engine applies findings/),
    ).toBeInTheDocument();
    expect(within(engine).getByText(/Required cannot be combined with Off/)).toBeInTheDocument();
    // Each control lives in the same section as its label + description (proximity, not a detached block).
    expect(within(engine).getByLabelText('Presidio requirement')).toBeInTheDocument();
    expect(within(engine).getByLabelText('Presidio rollout mode')).toBeInTheDocument();
    // The standalone lowercase "presidio" row label and the old short inline labels are gone.
    expect(within(engine).queryByText('presidio')).toBeNull();
    expect(within(engine).queryByText('Requirement')).toBeNull();
    expect(within(engine).queryByText('Rollout mode')).toBeNull();
    // Old ambiguous copy + inheritance jargon stay gone.
    expect(within(engine).queryByText(/Off ignores, Shadow observes/)).toBeNull();
    expect(within(engine).queryByText(/automatically Required if any entity/)).toBeNull();
  });

  it('seeds semantic entities to the backend shadow default (no hardcoded enforce fallback)', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    // LOCATION has no policy entry — its control reflects the backend default (shadow), not a forced enforce.
    const locationSelect = within(integrated).getByLabelText('Location enforcement mode');
    expect((locationSelect as HTMLSelectElement).value).toBe('shadow');
  });

  it('the local regex rollout is locked to enforce (Local tab)', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    goTab('Local PII engine');
    const rollout = await screen.findByRole('region', { name: 'Rollout' });
    expect(within(rollout).getByText(/enforce \(locked\)/)).toBeInTheDocument();
  });

  it('Save sends the edited policy + rollout with the expectedRevision', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    goTab('Local PII engine');
    const emailAction = await screen.findByLabelText('E-post policy action');
    fireEvent.change(emailAction, { target: { value: 'block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    const arg = saveFn.mock.calls[0]![0] as {
      data: { expectedRevision: number; policy: t.VardeVernPolicyInput };
    };
    expect(arg.data.expectedRevision).toBe(3);
    expect(arg.data.policy.entities.EMAIL!.action).toBe('block');
  });

  it('no Norwegian UI strings remain in the feature area', async () => {
    renderPage();
    await openPresidioTab();
    expect(screen.queryByText('Oversikt')).toBeNull();
    expect(screen.queryByText('Lokal PII-motor')).toBeNull();
    expect(screen.queryByText('Entitetsmatrise')).toBeNull();
    expect(screen.queryByText('Aktivt integrert i Varde Vern')).toBeNull();
    expect(screen.queryByText(/Håndhev/)).toBeNull();
    expect(screen.queryByText(/krever grønn kvalitetsgate/)).toBeNull();
    expect(screen.queryByText(/ikke aktivert i Varde Vern/)).toBeNull();
    expect(screen.queryByText(/Minimum Presidio-score/)).toBeNull();
    expect(screen.queryByText(/Funn med Presidio-score/)).toBeNull();
    expect(screen.queryByText(/fast score 0,85/)).toBeNull();
  });

  it('warns when a stored value failed validation', async () => {
    queryValue = { ...mockVern, policyValid: false };
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Saved Varde Vern settings are invalid/i);
  });

  it('without MANAGE_CONFIGS the Save button is disabled', async () => {
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    canManage = true;
  });

  it('global status badge: piiEnabled=true → "enabled"', async () => {
    queryValue = { ...mockVern, piiEnabled: true };
    renderPage();
    const status = await screen.findByRole('region', { name: 'Operational status' });
    expect(within(status).getByText('enabled')).toBeInTheDocument();
  });

  it('global status badge: piiEnabled=false → "disabled"', async () => {
    queryValue = { ...mockVern, piiEnabled: false };
    renderPage();
    const status = await screen.findByRole('region', { name: 'Operational status' });
    expect(within(status).getByText('disabled')).toBeInTheDocument();
  });

  it('global status badge: piiEnabled undefined (older proxy) → "unknown"', async () => {
    queryValue = { ...mockVern, piiEnabled: undefined };
    renderPage();
    const status = await screen.findByRole('region', { name: 'Operational status' });
    expect(within(status).getByText('unknown')).toBeInTheDocument();
  });

  it('removes Off from the Presidio phase options once Presidio is Required', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'required', rolloutPhase: 'shadow', enforceAllowed: false },
      ],
    };
    renderPage();
    await openPresidioTab();
    const phaseSelect = await screen.findByLabelText('Presidio rollout mode');
    expect(within(phaseSelect).queryByRole('option', { name: 'Off' })).toBeNull();
    expect(within(phaseSelect).getByRole('option', { name: 'Shadow' })).toBeInTheDocument();
  });

  it('a loaded Required+Off Presidio config (engine status) surfaces the hoisted top-level alert and disables Save', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'required', rolloutPhase: 'off', enforceAllowed: false },
      ],
    };
    renderPage();
    // The banner is hoisted above the subtabs (rendered near Save), so it shows on the default Overview tab —
    // no need to open the Presidio tab first.
    await screen.findByRole('region', { name: 'Entity matrix' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Presidio cannot be Off while it is required/i);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // …and it persists across tabs (outside the subtab conditional).
    goTab('Local PII engine');
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Presidio cannot be Off while it is required/i,
    );
  });

  it('a loaded Required+Off Presidio config (entity requiredEngines) surfaces the hoisted top-level alert and disables Save', async () => {
    queryValue = {
      ...mockVern,
      policy: {
        ...mockVern.policy,
        entities: {
          ...mockVern.policy.entities,
          PERSON: { action: 'shadow', requiredEngines: ['presidio'], minConfidence: 0.7 },
        },
      },
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'optional', rolloutPhase: 'off', enforceAllowed: false },
      ],
    };
    renderPage();
    // Hoisted banner — assertable on the default Overview tab without navigating to Presidio.
    await screen.findByRole('region', { name: 'Entity matrix' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Presidio cannot be Off while it is required/i);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('marking the Presidio engine Required while its phase is Off auto-bumps the phase to Shadow', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'optional', rolloutPhase: 'off', enforceAllowed: false },
      ],
    };
    renderPage();
    await openPresidioTab();
    fireEvent.change(await screen.findByLabelText('Presidio requirement'), {
      target: { value: 'required' },
    });
    expect((screen.getByLabelText('Presidio rollout mode') as HTMLSelectElement).value).toBe(
      'shadow',
    );
    expect(screen.queryByText(/Presidio cannot be Off while it is required/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('marking an entity Required while the Presidio phase is Off auto-bumps the phase to Shadow', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'optional', rolloutPhase: 'off', enforceAllowed: false },
      ],
    };
    renderPage();
    const integrated = await openPresidioTab();
    fireEvent.change(within(integrated).getByLabelText('Person Presidio requirement'), {
      target: { value: 'required' },
    });
    expect((screen.getByLabelText('Presidio rollout mode') as HTMLSelectElement).value).toBe(
      'shadow',
    );
    expect(screen.queryByText(/Presidio cannot be Off while it is required/i)).toBeNull();
  });

  it('a valid Presidio configuration leaves Save enabled with no required-off alert', async () => {
    renderPage();
    await openPresidioTab();
    expect(screen.queryByText(/Presidio cannot be Off while it is required/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('removes Off from the Presidio phase options when an ENTITY marks Presidio Required (engine status still optional)', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    // Engine status is 'optional' in the default mock; require Presidio via a semantic entity, not the engine.
    fireEvent.change(within(integrated).getByLabelText('Person Presidio requirement'), {
      target: { value: 'required' },
    });
    const phaseSelect = screen.getByLabelText('Presidio rollout mode');
    expect(within(phaseSelect).queryByRole('option', { name: 'Off' })).toBeNull();
    expect(within(phaseSelect).getByRole('option', { name: 'Shadow' })).toBeInTheDocument();
    // The requirement came from the entity — the engine status is untouched.
    expect((screen.getByLabelText('Presidio requirement') as HTMLSelectElement).value).toBe(
      'optional',
    );
  });

  it('threads the SAVED presidio phase/status + entity actions to the panel — never the local unsaved edits', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
        { engineId: 'presidio', status: 'optional', rolloutPhase: 'shadow', enforceAllowed: false },
      ],
    };
    renderPage();
    const integrated = await openPresidioTab();
    // Sourced from data.rollout (saved) + data.entities[].action — not the local editable rollout/policy.
    expect(capturedPanelProps.presidioPhase).toBe('shadow');
    expect(capturedPanelProps.presidioStatus).toBe('optional');
    expect(capturedPanelProps.entityActions).toMatchObject({
      FNR: 'enforce',
      EMAIL: 'enforce',
      PERSON: 'shadow',
      LOCATION: 'shadow',
      ORG: 'shadow',
    });
    // Make LOCAL edits that DIFFER from the saved values; the panel must keep receiving the SAVED values.
    fireEvent.change(screen.getByLabelText('Presidio rollout mode'), {
      target: { value: 'enforce' },
    });
    fireEvent.change(within(integrated).getByLabelText('Person enforcement mode'), {
      target: { value: 'enforce' },
    });
    expect(capturedPanelProps.presidioPhase).toBe('shadow');
    expect(capturedPanelProps.presidioStatus).toBe('optional');
    expect(capturedPanelProps.entityActions!.PERSON).toBe('shadow');
  });

  it('falls back to presidioPhase="off" / presidioStatus="disabled" when data.rollout has no presidio entry', async () => {
    queryValue = {
      ...mockVern,
      rollout: [
        { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
      ],
    };
    renderPage();
    await openPresidioTab();
    expect(capturedPanelProps.presidioPhase).toBe('off');
    expect(capturedPanelProps.presidioStatus).toBe('disabled');
  });
});
