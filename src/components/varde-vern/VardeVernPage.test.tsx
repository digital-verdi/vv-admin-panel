import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as t from '@/types';
import { VardeVernPage } from './VardeVernPage';

const mockVern: t.VardeVern = {
  policyVersion: 1,
  defaultAction: 'enforce',
  policyValid: true,
  rolloutValid: true,
  entities: [
    { entityType: 'FNR', label: 'Fødselsnummer', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Mod-11 checksum', action: 'enforce' },
    { entityType: 'EMAIL', label: 'E-post', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Format validation', action: 'enforce' },
    { entityType: 'PERSON', label: 'Person name', engine: 'semantic', confidenceApplicable: true, minConfidence: 0.7, action: 'shadow' },
  ],
  policy: {
    version: 1,
    defaultAction: 'enforce',
    entities: {
      FNR: { action: 'enforce', requiredEngines: ['regex'] },
      EMAIL: { action: 'enforce', requiredEngines: ['regex'] },
      PERSON: { action: 'shadow', requiredEngines: [], minConfidence: 0.7 },
    },
  },
  rollout: [{ engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true }],
  configRevision: 3,
  dbBacked: true,
};

let queryValue: t.VardeVern = mockVern;
const saveFn = vi.fn().mockResolvedValue({ status: 'ok', configRevision: 4 });
vi.mock('@/server', () => ({
  vardeVernQueryOptions: { queryKey: ['varde-vern'], queryFn: () => Promise.resolve(queryValue) },
  saveVardeVernFn: (args: unknown) => saveFn(args),
}));
vi.mock('@/hooks', () => ({ useCapabilities: () => ({ hasCapability: () => true }) }));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
vi.mock('@clickhouse/click-ui', () => ({ Icon: ({ name }: { name: string }) => <span data-icon={name} /> }));
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

describe('VardeVernPage — interactive engine-split editor', () => {
  it('groups entities into regex vs semantic sections with the right controls', async () => {
    queryValue = mockVern;
    const regexSection = await (async () => {
      renderPage();
      return screen.findByRole('region', { name: 'Structured & validated data (local regex)' });
    })();
    // Regex: checksum badge + an action select limited to enforce/block.
    expect(within(regexSection).getByText('Mod-11 checksum')).toBeInTheDocument();
    expect(within(regexSection).getByLabelText('Fødselsnummer policy action')).toBeInTheDocument();

    const semanticSection = screen.getByRole('region', { name: 'Contextual & semantic data (AI / Presidio)' });
    // Semantic: a minConfidence number field + an action select.
    expect(within(semanticSection).getByLabelText('Person name minimum confidence')).toBeInTheDocument();
    expect(within(semanticSection).getByLabelText('Person name policy action')).toBeInTheDocument();
  });

  it('the local regex rollout is locked to enforce', async () => {
    queryValue = mockVern;
    renderPage();
    const rollout = await screen.findByRole('region', { name: 'Rollout' });
    expect(within(rollout).getByText(/enforce \(locked\)/)).toBeInTheDocument();
  });

  it('Save sends the edited policy + rollout with the expectedRevision', async () => {
    queryValue = mockVern;
    saveFn.mockClear();
    renderPage();
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
});
