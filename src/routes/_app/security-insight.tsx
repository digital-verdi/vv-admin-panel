import { createFileRoute } from '@tanstack/react-router';
import { InsightPanel } from '@/components/varde-vern';
import { useLocalize } from '@/hooks';

export const Route = createFileRoute('/_app/security-insight')({
  component: SecurityInsightRoute,
});

function SecurityInsightRoute() {
  const localize = useLocalize();
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div>
        <h2 className="text-lg font-semibold text-(--cui-color-title-default)">
          {localize('com_nav_security_insight')}
        </h2>
        <p className="mt-1 text-sm text-(--cui-color-text-muted)">
          Protection telemetry for Varde Vern — what was protected, measured, and blocked over the
          selected window.
        </p>
      </div>
      <InsightPanel />
    </div>
  );
}
