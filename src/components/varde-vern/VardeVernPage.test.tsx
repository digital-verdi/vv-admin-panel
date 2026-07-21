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
    { entityType: 'FNR', label: 'Fødselsnummer', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Mod-11 checksum', action: 'enforce' },
    { entityType: 'EMAIL', label: 'E-post', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Format validation', action: 'enforce' },
    { entityType: 'PERSON', label: 'Person name', engine: 'semantic', confidenceApplicable: true, minConfidence: 0.7, action: 'shadow', enforceGreenLanguages: ['nb', 'en'], scoreModel: 'spacy-ner-fixed', semanticFixedScore: 0.85 },
    { entityType: 'LOCATION', label: 'Sted', engine: 'semantic', confidenceApplicable: true, action: 'shadow', enforceGreenLanguages: [], scoreModel: 'spacy-ner-fixed', semanticFixedScore: 0.85 },
    { entityType: 'ORG', label: 'Organisasjon', engine: 'semantic', confidenceApplicable: true, action: 'shadow', enforceGreenLanguages: [], scoreModel: 'spacy-ner-fixed', semanticFixedScore: 0.85 },
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
  },
  configRevision: 3,
  dbBacked: true,
};

let queryValue: t.VardeVern = mockVern;
let canManage = true;
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
  const Tabs = ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (v: string) => void }) => {
    onChange = onValueChange;
    return <div>{children}</div>;
  };
  Tabs.TriggersList = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Tabs.Trigger = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <button type="button" onClick={() => onChange?.(value)}>{children}</button>
  );
  Tabs.Content = () => null;
  return { Icon: ({ name }: { name: string }) => <span data-icon={name} />, Tabs };
});
// Isolate the page's IA from the panel internals (PresidioPanel has its own test).
vi.mock('./PresidioPanel', () => ({
  PresidioPanel: (p: { canManage?: boolean }) => (
    <div data-testid="presidio-panel" data-can-manage={String(p.canManage)} />
  ),
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
    <select aria-label={p['aria-label']} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {(p.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  NumberField: (p: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
    'aria-label'?: string;
  }) => (
    <input
      type="number"
      aria-label={p['aria-label']}
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
  return screen.findByRole('region', { name: 'Active in Varde Vern' });
};

const savedPolicy = (): t.VardeVernPolicyInput => {
  const arg = saveFn.mock.calls[0]![0] as { data: { policy: t.VardeVernPolicyInput } };
  return arg.data.policy;
};

describe('VardeVernPage — table redesign + English-only UI', () => {
  beforeEach(() => {
    queryValue = mockVern;
    canManage = true;
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
  });

  it('Local PII engine tab shows the regex section (checksum + enforce/block action)', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    goTab('Local PII engine');
    const regexSection = await screen.findByRole('region', { name: 'Structured & validated data (local regex)' });
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

  it('renders the four table columns: Entity | Detection Policy | Enforcement Mode | Minimum Score', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(within(integrated).getByRole('columnheader', { name: 'Entity' })).toBeInTheDocument();
    expect(within(integrated).getByRole('columnheader', { name: 'Detection Policy' })).toBeInTheDocument();
    expect(within(integrated).getByRole('columnheader', { name: 'Enforcement Mode' })).toBeInTheDocument();
    expect(within(integrated).getByRole('columnheader', { name: 'Minimum Score' })).toBeInTheDocument();
    // Title-case display names — never the ALL-CAPS codes — in the Entity column.
    expect(within(integrated).getByText('Person')).toBeInTheDocument();
    expect(within(integrated).getByText('Location')).toBeInTheDocument();
    expect(within(integrated).getByText('Organization')).toBeInTheDocument();
    expect(within(integrated).queryByText('PERSON')).toBeNull();
    expect(within(integrated).queryByText('LOCATION')).toBeNull();
    expect(within(integrated).queryByText('ORG')).toBeNull();
  });

  it('the shared minimum-score intro renders ONCE above the table (not per entity)', async () => {
    renderPage();
    await openPresidioTab();
    expect(screen.getAllByText(/Findings below an entity's minimum score are ignored/)).toHaveLength(1);
  });

  it('the integrated vs reported split is derived from supportedEntities − integratedPresidioEntities', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    expect(within(integrated).getByText('Person')).toBeInTheDocument();
    expect(within(integrated).getByText('Location')).toBeInTheDocument();
    expect(within(integrated).getByText('Organization')).toBeInTheDocument();
    const reported = screen.getByRole('region', { name: 'Reported by Presidio, not integrated' });
    // supportedEntities − integratedPresidioEntities = DATE_TIME, NRP (dynamic, not hardcoded).
    expect(within(reported).getByText('DATE_TIME')).toBeInTheDocument();
    expect(within(reported).getByText('NRP')).toBeInTheDocument();
    expect(within(reported).getAllByText('not integrated')).toHaveLength(2);
    // Integrated types never appear in the reported-only list.
    expect(within(reported).queryByText('PERSON')).toBeNull();
  });

  it('Detection Policy → Required round-trips as requiredEngines: ["presidio"]', async () => {
    renderPage();
    const integrated = await openPresidioTab();
    fireEvent.change(within(integrated).getByLabelText('Person detection policy'), {
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
    expect(within(integrated).getAllByTitle('Requires a green quality gate')).toHaveLength(2);
  });

  it('the Presidio rollout status (optional/required) is editable and round-trips', async () => {
    renderPage();
    await openPresidioTab();
    const status = await screen.findByLabelText('presidio status');
    fireEvent.change(status, { target: { value: 'required' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    const arg = saveFn.mock.calls[0]![0] as {
      data: { rollout: { engines: t.VardeVernRolloutEngine[] } };
    };
    const presidio = arg.data.rollout.engines.find((e) => e.engineId === 'presidio');
    expect(presidio!.status).toBe('required');
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
    const arg = saveFn.mock.calls[0]![0] as { data: { expectedRevision: number; policy: t.VardeVernPolicyInput } };
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
    expect(alert).toHaveTextContent(/failed validation/i);
  });

  it('without MANAGE_CONFIGS the Save button is disabled', async () => {
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Entity matrix' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    canManage = true;
  });
});
