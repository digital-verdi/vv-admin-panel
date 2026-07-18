import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as t from '@/types';
import { VardeVernPage } from './VardeVernPage';

const mockVern: t.VardeVern = {
  policyVersion: 1,
  defaultAction: 'enforce',
  policyValid: true,
  entities: [
    { entityType: 'FNR', label: 'Fødselsnummer', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Mod-11 checksum', action: 'enforce' },
    { entityType: 'EMAIL', label: 'E-post', engine: 'regex', confidenceApplicable: false, technicalStatus: 'Format validation', action: 'enforce' },
    { entityType: 'PERSON', label: 'Person name', engine: 'semantic', confidenceApplicable: true, minConfidence: 0.7, action: 'shadow' },
  ],
  rollout: [
    { engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true },
  ],
  configRevision: 3,
  dbBacked: true,
};

let queryValue: t.VardeVern = mockVern;
vi.mock('@/server', () => ({
  vardeVernQueryOptions: { queryKey: ['varde-vern'], queryFn: () => Promise.resolve(queryValue) },
}));
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/components/shared', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingState: () => <div data-testid="loading" />,
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VardeVernPage />
    </QueryClientProvider>,
  );
}

describe('VardeVernPage — engine-split view', () => {
  it('groups entities into the regex vs semantic sections from backend metadata', async () => {
    queryValue = mockVern;
    renderPage();

    const regexSection = await screen.findByRole('region', {
      name: 'Structured & validated data (local regex)',
    });
    // FNR + EMAIL live in the regex section with their checksum/validator badges.
    expect(within(regexSection).getByText('Fødselsnummer')).toBeInTheDocument();
    expect(within(regexSection).getByText('Mod-11 checksum')).toBeInTheDocument();
    expect(within(regexSection).queryByText('Person name')).not.toBeInTheDocument();

    const semanticSection = screen.getByRole('region', {
      name: 'Contextual & semantic data (AI / Presidio)',
    });
    // PERSON lives in the semantic section and shows a confidence threshold, not a checksum badge.
    expect(within(semanticSection).getByText('Person name')).toBeInTheDocument();
    expect(within(semanticSection).getByText(/Min\. confidence: 0\.7/)).toBeInTheDocument();
  });

  it('renders the rollout section with the engine phase', async () => {
    queryValue = mockVern;
    renderPage();
    const rollout = await screen.findByRole('region', { name: 'Rollout' });
    expect(within(rollout).getByText('regex')).toBeInTheDocument();
    expect(within(rollout).getByText('enforce')).toBeInTheDocument();
  });

  it('warns when the stored policy is invalid (keep-last-good default shown)', async () => {
    queryValue = { ...mockVern, policyValid: false };
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/failed validation/i);
  });
});
