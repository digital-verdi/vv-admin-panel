import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    { entityType: 'PERSON', label: 'Person name', engine: 'semantic', confidenceApplicable: true, minConfidence: 0.7, action: 'shadow' },
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
  presidio: { configured: true, state: 'ready', imageMode: 'derived', release: '2.2.363', digest: 'sha256:x', languages: ['nb', 'en'] },
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
  SelectField: (p: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <select aria-label={p['aria-label']} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {['enforce', 'block', 'shadow', 'allow', 'off'].map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  ),
  NumberField: (p: { value: number | null; 'aria-label'?: string }) => (
    <input type="number" aria-label={p['aria-label']} defaultValue={p.value ?? ''} />
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

describe('VardeVernPage — nested-tab IA (F12e)', () => {
  it('Oversikt is the default tab and shows the entity matrix (local engine / Presidio / effective action)', async () => {
    queryValue = mockVern;
    renderPage();
    const matrix = await screen.findByRole('region', { name: 'Entitetsmatrise' });
    // FNR = regex authoritative; PERSON = semantic supplementary; both listed with their effective action.
    expect(within(matrix).getByText('Fødselsnummer')).toBeInTheDocument();
    expect(within(matrix).getByText('Person name')).toBeInTheDocument();
    expect(within(matrix).getAllByText('autoritativ').length).toBeGreaterThan(0);
    expect(within(matrix).getByText('supplerende')).toBeInTheDocument();
  });

  it('Lokal PII-motor tab shows the regex section (checksum + enforce/block action)', async () => {
    queryValue = mockVern;
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    goTab('Lokal PII-motor');
    const regexSection = await screen.findByRole('region', { name: 'Structured & validated data (local regex)' });
    expect(within(regexSection).getByText('Mod-11 checksum')).toBeInTheDocument();
    expect(within(regexSection).getByLabelText('Fødselsnummer policy action')).toBeInTheDocument();
  });

  it('Presidio Analyzer tab shows the semantic section + the panel, and passes canManage', async () => {
    queryValue = mockVern;
    canManage = true;
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    goTab('Presidio Analyzer');
    const semantic = await screen.findByRole('region', { name: 'Contextual & semantic data (AI / Presidio)' });
    expect(within(semantic).getByLabelText('Person name minimum confidence')).toBeInTheDocument();
    const panel = screen.getByTestId('presidio-panel');
    expect(panel).toHaveAttribute('data-can-manage', 'true');
  });

  it('the local regex rollout is locked to enforce (Lokal tab)', async () => {
    queryValue = mockVern;
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    goTab('Lokal PII-motor');
    const rollout = await screen.findByRole('region', { name: 'Rollout' });
    expect(within(rollout).getByText(/enforce \(locked\)/)).toBeInTheDocument();
  });

  it('F149f/F12f: setting a semantic entity to enforce reveals the per-language gate checkboxes', async () => {
    queryValue = mockVern;
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    goTab('Presidio Analyzer');
    const action = await screen.findByLabelText('Person name policy action');
    fireEvent.change(action, { target: { value: 'enforce' } });
    // Per-language checkboxes appear (nb + en, from the analyzer languages).
    expect(screen.getByLabelText('PERSON enforce nb')).toBeInTheDocument();
    expect(screen.getByLabelText('PERSON enforce en')).toBeInTheDocument();
    expect(screen.getByText(/no language gated/i)).toBeInTheDocument();
  });

  it('Save sends the edited policy + rollout with the expectedRevision', async () => {
    queryValue = mockVern;
    canManage = true;
    saveFn.mockClear();
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    goTab('Lokal PII-motor');
    const emailAction = await screen.findByLabelText('E-post policy action');
    fireEvent.change(emailAction, { target: { value: 'block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    const arg = saveFn.mock.calls[0]![0] as { data: { expectedRevision: number; policy: t.VardeVernPolicyInput } };
    expect(arg.data.expectedRevision).toBe(3);
    expect(arg.data.policy.entities.EMAIL!.action).toBe('block');
  });

  it('warns when a stored value failed validation', async () => {
    queryValue = { ...mockVern, policyValid: false };
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/failed validation/i);
  });

  it('without MANAGE_CONFIGS the Save button is disabled', async () => {
    queryValue = mockVern;
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Entitetsmatrise' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    canManage = true;
  });
});
