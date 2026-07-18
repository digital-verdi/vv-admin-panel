import { Icon } from '@clickhouse/click-ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import type * as t from '@/types';
import { groupEntitiesByEngine, phaseTone, actionTone } from './operations';
import { EmptyState, LoadingState } from '@/components/shared';
import { vardeVernQueryOptions } from '@/server';
import { cn } from '@/utils';

const TONE_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone],
      )}
    >
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

function EntityRow({ entity }: { entity: t.VardeVernEntity }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-(--cui-color-stroke-default) py-3 last:border-0">
      <div className="min-w-0">
        <span className="block text-sm font-medium text-(--cui-color-text-default)">{entity.label}</span>
        <span className="block text-xs text-(--cui-color-text-muted)">{entity.entityType}</span>
      </div>
      <div className="flex items-center gap-2">
        {entity.confidenceApplicable ? (
          <span className="text-xs text-(--cui-color-text-muted)">
            Min. confidence: {entity.minConfidence ?? 'default'}
          </span>
        ) : (
          entity.technicalStatus && <Badge tone="inactive">{entity.technicalStatus}</Badge>
        )}
        <Badge tone={actionTone(entity.action)}>{entity.action}</Badge>
      </div>
    </div>
  );
}

export function VardeVernPage() {
  const { data, isLoading, isError, error } = useQuery(vardeVernQueryOptions);

  if (isLoading || !data) {
    return isError ? (
      <div className="p-6">
        <EmptyState message={error instanceof Error ? error.message : 'Failed to load Varde Vern config.'} />
      </div>
    ) : (
      <LoadingState />
    );
  }

  const { regex, semantic } = groupEntitiesByEngine(data.entities);

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div>
        <p className="text-sm text-(--cui-color-text-muted)">
          Varde Vern is the LLM Router&apos;s collective PII-protection mechanism. This read-only view
          shows which engine owns which entity, the policy action, and the rollout phase — so you can see
          the risk of a rule and where to debug. Grouping is driven by the backend, never hardcoded here.
        </p>
      </div>

      {!data.policyValid && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) p-3 text-xs text-(--cui-color-text-muted)"
        >
          <Icon name="warning" size="sm" />
          The stored Varde Vern policy failed validation — the safe default policy is shown below.
        </div>
      )}

      <Section
        title="Structured & validated data (local regex)"
        description="Authoritative engine. Precise identifiers validated by checksums/format (mod-11, mod-97, Luhn, structure). Always enforced — confidence is implicitly 100%."
      >
        {regex.map((entity) => (
          <EntityRow key={entity.entityType} entity={entity} />
        ))}
      </Section>

      <Section
        title="Contextual & semantic data (AI / Presidio)"
        description="Supplementary engine. Names, addresses, places, organisations detected by a language model — a minimum-confidence threshold applies before a match triggers."
      >
        {semantic.length === 0 ? (
          <p className="py-2 text-xs text-(--cui-color-text-muted)">
            No semantic engine is active yet — Presidio joins Varde Vern in a later phase.
          </p>
        ) : (
          semantic.map((entity) => <EntityRow key={entity.entityType} entity={entity} />)
        )}
      </Section>

      <Section
        title="Rollout"
        description="Per-engine phase: off (inactive), shadow (measures/logs without masking — safe to test in prod), enforce (masks before the LLM)."
      >
        {data.rollout.map((engine) => (
          <div
            key={engine.engineId}
            className="flex items-center justify-between gap-4 border-b border-(--cui-color-stroke-default) py-3 last:border-0"
          >
            <div className="min-w-0">
              <span className="block text-sm font-medium text-(--cui-color-text-default)">{engine.engineId}</span>
              <span className="block text-xs text-(--cui-color-text-muted)">{engine.status}</span>
            </div>
            <Badge tone={phaseTone(engine.rolloutPhase)}>{engine.rolloutPhase}</Badge>
          </div>
        ))}
      </Section>
    </div>
  );
}
