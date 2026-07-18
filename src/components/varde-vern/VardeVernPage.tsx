import { useState, useEffect } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import type * as t from '@/types';
import { groupEntitiesByEngine, phaseTone, actionTone } from './operations';
import { SelectField, NumberField } from '@/components/configuration/fields';
import { EmptyState, LoadingState } from '@/components/shared';
import { vardeVernQueryOptions, saveVardeVernFn } from '@/server';
import { notifySuccess, notifyError, cn } from '@/utils';
import { SystemCapabilities } from '@/constants';
import { useCapabilities } from '@/hooks';

const TONE_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

// Authoritative (regex) entities may never be weaker than enforce (ADR 0005) → enforce/block only.
const REGEX_ACTIONS: t.SelectOption[] = [
  { label: 'Enforce (mask)', value: 'enforce' },
  { label: 'Block (reject)', value: 'block' },
];
const SEMANTIC_ACTIONS: t.SelectOption[] = [
  { label: 'Enforce (mask)', value: 'enforce' },
  { label: 'Shadow (measure)', value: 'shadow' },
  { label: 'Allow', value: 'allow' },
  { label: 'Block (reject)', value: 'block' },
];
const PHASE_OPTIONS: t.SelectOption[] = [
  { label: 'Off', value: 'off' },
  { label: 'Shadow', value: 'shadow' },
  { label: 'Enforce', value: 'enforce' },
];

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-(--cui-color-stroke-default) p-4">
      <h2 className="text-sm font-semibold text-(--cui-color-title-default)">{title}</h2>
      <p className="mt-1 mb-3 text-xs text-(--cui-color-text-muted)">{description}</p>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function VardeVernPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_CONFIGS);
  const { data, isLoading, isError, error } = useQuery(vardeVernQueryOptions);

  const [policy, setPolicy] = useState<t.VardeVernPolicyInput | null>(null);
  const [rollout, setRollout] = useState<t.VardeVernRolloutEngine[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setPolicy(data.policy);
      setRollout(data.rollout);
    }
  }, [data]);

  if (isLoading || !data || !policy || !rollout) {
    return isError ? (
      <div className="p-6">
        <EmptyState message={error instanceof Error ? error.message : 'Failed to load Varde Vern config.'} />
      </div>
    ) : (
      <LoadingState />
    );
  }

  const { regex, semantic } = groupEntitiesByEngine(data.entities);
  const disabled = !canManage || busy;

  const entryOf = (type: string): t.VardeVernEntityPolicy =>
    policy.entities[type] ?? { action: 'enforce', requiredEngines: [] };
  const setEntity = (type: string, patch: Partial<t.VardeVernEntityPolicy>) =>
    setPolicy((prev) =>
      prev ? { ...prev, entities: { ...prev.entities, [type]: { ...entryOf(type), ...patch } } } : prev,
    );
  const setPhase = (engineId: string, rolloutPhase: t.VardeVernRolloutPhase) =>
    setRollout((prev) =>
      prev ? prev.map((e) => (e.engineId === engineId ? { ...e, rolloutPhase } : e)) : prev,
    );

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveVardeVernFn({
        data: { expectedRevision: data.configRevision, policy, rollout: { version: 1, engines: rollout } },
      });
      if (result.status === 'version-mismatch') {
        notifyError('Varde Vern config changed elsewhere — reloading the latest.');
      } else {
        notifySuccess('Varde Vern config saved.');
      }
      await queryClient.invalidateQueries({ queryKey: ['varde-vern'] });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to save Varde Vern config.');
    } finally {
      setBusy(false);
    }
  };

  const entityRow = (entity: t.VardeVernEntity) => {
    const entry = entryOf(entity.entityType);
    return (
      <div
        key={entity.entityType}
        className="flex flex-col gap-2 border-b border-(--cui-color-stroke-default) py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <span className="block text-sm font-medium text-(--cui-color-text-default)">{entity.label}</span>
          <span className="block text-xs text-(--cui-color-text-muted)">{entity.entityType}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {entity.confidenceApplicable ? (
            <NumberField
              id={`conf-${entity.entityType}`}
              value={entry.minConfidence ?? entity.minConfidence}
              onChange={(v) => setEntity(entity.entityType, { minConfidence: v ?? undefined })}
              min={0.5}
              max={0.99}
              step={0.01}
              disabled={disabled}
              aria-label={`${entity.label} minimum confidence`}
            />
          ) : (
            entity.technicalStatus && <Badge tone="inactive">{entity.technicalStatus}</Badge>
          )}
          <SelectField
            id={`action-${entity.entityType}`}
            value={entry.action}
            options={entity.engine === 'semantic' ? SEMANTIC_ACTIONS : REGEX_ACTIONS}
            onChange={(v) => setEntity(entity.entityType, { action: v as t.VardeVernAction })}
            disabled={disabled}
            aria-label={`${entity.label} policy action`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-(--cui-color-text-muted)">
          Varde Vern is the LLM Router&apos;s collective PII protection. Grouping is driven by the backend —
          which engine owns which entity is never hardcoded here. Changes take effect live on save.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={disabled}
          className="shrink-0 rounded-md bg-(--cui-color-background-accent) px-4 py-2 text-sm font-medium text-(--cui-color-text-inverse) disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {(!data.policyValid || !data.rolloutValid) && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) p-3 text-xs text-(--cui-color-text-muted)"
        >
          <Icon name="warning" size="sm" />
          A stored Varde Vern value failed validation — the safe default is shown. Saving replaces it.
        </div>
      )}

      <Section
        title="Structured & validated data (local regex)"
        description="Authoritative engine. Precise identifiers validated by checksums/format. Enforce or Block only — never weaker."
      >
        {regex.map(entityRow)}
      </Section>

      <Section
        title="Contextual & semantic data (AI / Presidio)"
        description="Supplementary engine. Names, addresses, places, organisations. A minimum-confidence threshold applies before a match triggers."
      >
        {semantic.length === 0 ? (
          <p className="py-2 text-xs text-(--cui-color-text-muted)">
            No semantic engine is active yet — Presidio joins Varde Vern in a later phase.
          </p>
        ) : (
          semantic.map(entityRow)
        )}
      </Section>

      <Section
        title="Rollout"
        description="Per-engine phase: off (inactive), shadow (measures without masking), enforce (masks before the LLM). The local regex is always enforce."
      >
        {rollout.map((engine) => {
          const locked = engine.engineId === 'regex';
          return (
            <div
              key={engine.engineId}
              className="flex items-center justify-between gap-4 border-b border-(--cui-color-stroke-default) py-3 last:border-0"
            >
              <div className="min-w-0">
                <span className="block text-sm font-medium text-(--cui-color-text-default)">{engine.engineId}</span>
                <span className="block text-xs text-(--cui-color-text-muted)">{engine.status}</span>
              </div>
              {locked ? (
                <Badge tone={phaseTone(engine.rolloutPhase)}>{engine.rolloutPhase} (locked)</Badge>
              ) : (
                <SelectField
                  id={`phase-${engine.engineId}`}
                  value={engine.rolloutPhase}
                  options={PHASE_OPTIONS}
                  onChange={(v) => setPhase(engine.engineId, v as t.VardeVernRolloutPhase)}
                  disabled={disabled}
                  aria-label={`${engine.engineId} rollout phase`}
                />
              )}
            </div>
          );
        })}
      </Section>

      <p className="text-xs text-(--cui-color-text-muted)">
        Default action for unlisted entities: <Badge tone={actionTone(policy.defaultAction)}>{policy.defaultAction}</Badge>
      </p>
    </div>
  );
}
