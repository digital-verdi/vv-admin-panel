import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as t from '@/types';
import { LlmRouterPage } from './LlmRouterPage';

const mockConfig: t.LlmProxyConfig = {
  isActive: true,
  openrouterBaseUrl: 'https://openrouter.ai/api/v1',
  openrouterReferer: null,
  openrouterTitle: null,
  chatRouting: {
    version: 3,
    defaultGroupId: 'standard',
    groups: [
      { id: 'standard', name: 'standard', models: ['openrouter:openai/gpt-4.1'], legacyNames: [] },
    ],
  },
  embeddingsEnabled: false,
  allowedEmbeddingModels: [],
  defaultEmbeddingDimensions: null,
  requestTimeoutMs: 30_000,
  promptCacheEnabled: true,
  piiEnabled: false,
  piiFailMode: 'closed',
  openRouterKeyManaged: true,
  mistralKeyManaged: false,
  piiSecretsPresent: false,
  providerMode: 'openrouter',
  configRevision: 1,
  proxyApiV2: true,
  defaultGroup: { id: 'standard', name: 'standard' },
  updatedAt: null,
  updatedBy: null,
  dbBacked: true,
};

vi.mock('@/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCapabilities: () => ({ hasCapability: () => true }),
}));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
vi.mock('@/server', () => ({
  llmProxyConfigQueryOptions: {
    queryKey: ['llm-proxy-config'],
    queryFn: () => Promise.resolve(mockConfig),
  },
  llmProxyModelsQueryOptions: {
    queryKey: ['llm-proxy-models'],
    queryFn: () => Promise.resolve([]),
  },
  saveLlmProxyConfigFn: vi.fn(),
  syncLibreChatForVardeFn: vi.fn(),
  validateGroupsInvariants: () => [],
  extractVardeFragments: () => ({}),
  baseConfigOptions: { queryKey: ['baseConfig'], queryFn: () => Promise.resolve({ config: {} }) },
}));
// click-ui + the field/shared wrappers need the click-ui theme provider; stub them (panel test idiom).
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/components/configuration/fields', () => ({
  TextField: (p: { 'aria-label'?: string }) => <input aria-label={p['aria-label']} />,
  NumberField: () => <input type="number" />,
  ToggleField: () => <div data-testid="toggle" />,
  SelectField: () => <div data-testid="select" />,
  ListField: () => <div data-testid="list" />,
}));
vi.mock('@/components/shared', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingState: () => <div data-testid="loading" />,
  FormDialog: () => <div data-testid="dialog" />,
}));
// Heavy children pull their own queries — stub them; this test targets the provider grouping only.
vi.mock('./ChatModelGroupsField', () => ({
  ChatModelGroupsField: () => <div data-testid="groups" />,
}));
vi.mock('./SyncImpactPreview', () => ({ SyncImpactPreview: () => <div data-testid="sync" /> }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LlmRouterPage />
    </QueryClientProvider>,
  );
}

describe('LlmRouterPage — AI Providers grouping', () => {
  it('renders an "AI Providers" heading with OpenRouter + Mistral grouped under it', async () => {
    renderPage();
    const groupHeading = await screen.findByRole('heading', { name: 'AI Providers' });
    // The two provider cards live inside the same group container as the heading.
    const group = groupHeading.parentElement as HTMLElement;
    expect(group).toBeTruthy();
    expect(within(group).getByRole('heading', { name: 'OpenRouter' })).toBeInTheDocument();
    expect(within(group).getByRole('heading', { name: 'Mistral' })).toBeInTheDocument();
    // The chat-model-groups section is a peer, NOT nested under AI Providers.
    expect(within(group).queryByRole('heading', { name: 'Chat model groups' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Chat model groups' })).toBeInTheDocument();
  });

  it('brands the page region as "Varde Rute" (not "LLM Router")', async () => {
    renderPage();
    expect(await screen.findByRole('region', { name: 'Varde Rute' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'LLM Router' })).toBeNull();
  });

  it('keeps the provider cards below the group heading (OpenRouter/Mistral are h3, AI Providers is h2)', async () => {
    renderPage();
    const groupHeading = await screen.findByRole('heading', { name: 'AI Providers' });
    expect(groupHeading.tagName).toBe('H2');
    expect(screen.getByRole('heading', { name: 'OpenRouter' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Mistral' }).tagName).toBe('H3');
    // Existing card copy is intact.
    expect(
      screen.getByText('Managed in Secret Manager — never editable or displayed here.'),
    ).toBeInTheDocument();
  });
});
