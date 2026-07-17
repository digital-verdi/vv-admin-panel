import { useQuery } from '@tanstack/react-query';
import type * as t from '@/types';
import { baseConfigOptions, computeVardeSyncPlan } from '@/server';

interface SyncImpactPreviewProps {
  chatRouting: t.ChatRoutingConfig;
}

function Change({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-1">
      <span className="text-(--cui-color-text-muted)">{label}:</span>
      <code className="text-(--cui-color-text-muted) line-through">{before || '—'}</code>
      <span aria-hidden="true">→</span>
      <code className="font-medium text-(--cui-color-text-default)">{after || '—'}</code>
    </li>
  );
}

/**
 * Shows the LibreChat base-config impact of the pending routing change (models.default / titleModel / each
 * Varde model spec), computed purely from the current base config. Warnings (endpoint missing/ambiguous,
 * unresolved specs) are advisory — routing still saves to the proxy first regardless.
 */
export function SyncImpactPreview({ chatRouting }: SyncImpactPreviewProps) {
  const { data: base } = useQuery({ ...baseConfigOptions, retry: false });
  if (!base) return null;

  const plan = computeVardeSyncPlan(
    base.config as Record<string, t.ConfigValue>,
    chatRouting.groups,
    chatRouting.defaultGroupId,
  );

  const box =
    'rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) p-3 text-xs';

  if ('error' in plan) {
    return (
      <div role="note" className={box}>
        <p className="text-(--cui-color-text-warning)">
          {plan.error === 'missing'
            ? "No Varde (vv-llm-proxy) endpoint found in the LibreChat config — routing will save to the proxy, but LibreChat won't be synced automatically."
            : 'Multiple “Varde” endpoints found — resolve the duplicate in the Configuration editor before the sync can run.'}
        </p>
      </div>
    );
  }

  const { modelsDefault, titleModel, specs } = plan.diff;
  const modelsChanged = modelsDefault.before.join(',') !== modelsDefault.after.join(',');
  const titleChanged = (titleModel.before ?? '') !== titleModel.after;
  const hasChanges = modelsChanged || titleChanged || specs.length > 0;

  return (
    <div className={box}>
      <p className="mb-1 font-medium text-(--cui-color-text-default)">LibreChat impact on save</p>
      {hasChanges ? (
        <ul className="flex flex-col gap-1">
          {modelsChanged && (
            <Change
              label="endpoint models.default"
              before={modelsDefault.before.join(', ')}
              after={modelsDefault.after.join(', ')}
            />
          )}
          {titleChanged && (
            <Change
              label="endpoint titleModel"
              before={titleModel.before ?? ''}
              after={titleModel.after}
            />
          )}
          {specs.map((spec) => (
            <Change
              key={spec.index}
              label={`spec ${spec.name}.model`}
              before={spec.before ?? ''}
              after={spec.after}
            />
          ))}
        </ul>
      ) : (
        <p className="text-(--cui-color-text-muted)">No LibreChat changes needed.</p>
      )}
      {plan.unresolvedSpecs.length > 0 && (
        <p role="note" className="mt-2 text-(--cui-color-text-warning)">
          {plan.unresolvedSpecs
            .map((s) => `Spec “${s.name}” points at “${s.model}”, which maps to no group`)
            .join('; ')}
          . Fold the old name into a group, or update the spec in the Configuration editor.
        </p>
      )}
    </div>
  );
}
