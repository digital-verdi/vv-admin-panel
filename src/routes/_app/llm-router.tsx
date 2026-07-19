import { Tabs } from '@clickhouse/click-ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LlmRouterPage } from '@/components/llm-router';
import { VardeVernPage } from '@/components/varde-vern';

type Tab = 'routing' | 'varde-vern';

function isTab(value?: string): value is Tab {
  return value === 'routing' || value === 'varde-vern';
}

export const Route = createFileRoute('/_app/llm-router')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
  component: LlmRouterRoute,
});

function LlmRouterRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: '/llm-router' });
  const activeTab: Tab = isTab(tab) ? tab : 'routing';

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isTab(value)) navigate({ search: { tab: value } });
        }}
        ariaLabel="LLM Router"
      >
        <Tabs.TriggersList>
          <Tabs.Trigger value="routing">Routing &amp; models</Tabs.Trigger>
          <Tabs.Trigger value="varde-vern">Varde Vern</Tabs.Trigger>
        </Tabs.TriggersList>
        <Tabs.Content value="routing" tabIndex={-1} />
        <Tabs.Content value="varde-vern" tabIndex={-1} />
      </Tabs>
      {activeTab === 'routing' ? <LlmRouterPage /> : <VardeVernPage />}
    </div>
  );
}
