import { Tabs } from '@clickhouse/click-ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { InvitesPage } from '@/components/invites';
import { DemoPage } from '@/components/demo';

type Tab = 'invitations' | 'demo';

function isTab(value?: string): value is Tab {
  return value === 'invitations' || value === 'demo';
}

export const Route = createFileRoute('/_app/invites')({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
  component: InvitesRoute,
});

function InvitesRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: '/invites' });
  const activeTab: Tab = isTab(tab) ? tab : 'invitations';

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isTab(value)) navigate({ search: { tab: value } });
        }}
        ariaLabel="Invitations and demo"
      >
        <Tabs.TriggersList>
          <Tabs.Trigger value="invitations">Invitations</Tabs.Trigger>
          <Tabs.Trigger value="demo">Demo</Tabs.Trigger>
        </Tabs.TriggersList>
        <Tabs.Content value="invitations" tabIndex={-1} />
        <Tabs.Content value="demo" tabIndex={-1} />
      </Tabs>
      {activeTab === 'demo' ? <DemoPage /> : <InvitesPage />}
    </div>
  );
}
