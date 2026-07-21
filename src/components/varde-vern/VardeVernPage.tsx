import { useState, useEffect } from 'react';
import { Icon, Tabs } from '@clickhouse/click-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import type * as t from '@/types';
import {
  groupEntitiesByEngine,
  reportedNotIntegrated,
  entityDisplayName,
  greenLanguagesFor,
  phaseTone,
  actionTone,
  PRESIDIO_SCORE_INTRO,
} from './operations';
import { SelectField, NumberField } from '@/components/configuration/fields';
import { vardeVernQueryOptions, saveVardeVernFn } from '@/server';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError, cn } from '@/utils';
import { SystemCapabilities } from '@/constants';
import { PresidioPanel } from './PresidioPanel';
import { useCapabilities } from '@/hooks';

type SubTab = 'overview' | 'local' | 'presidio';

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
// Integrated semantic entities: Off/Shadow/Enforce; Enforce is offered ONLY when the entity has a green
// quality gate. 'Off' maps to the `allow` action (measured/masked by neither engine).
const ENFORCEMENT_OFF: t.SelectOption = { label: 'Off', value: 'allow' };
const ENFORCEMENT_SHADOW: t.SelectOption = { label: 'Shadow', value: 'shadow' };
const ENFORCEMENT_ENFORCE: t.SelectOption = { label: 'Enforce', value: 'enforce' };
const ENFORCEMENT_SHADOW_ONLY: t.SelectOption[] = [ENFORCEMENT_OFF, ENFORCEMENT_SHADOW];
const ENFORCEMENT_GREEN: t.SelectOption[] = [ENFORCEMENT_OFF, ENFORCEMENT_SHADOW, ENFORCEMENT_ENFORCE];
const GREEN_GATE_TOOLTIP = 'Requires a green quality gate';
// Detection Policy — Required maps to the per-entity `requiredEngines: ['presidio']`, Optional to [].
const DETECTION_OPTIONS: t.SelectOption[] = [
  { label: 'Optional', value: 'optional' },
  { label: 'Required', value: 'required' },
];
const PHASE_OPTIONS: t.SelectOption[] = [
  { label: 'Off', value: 'off' },
  { label: 'Shadow', value: 'shadow' },
  { label: 'Enforce', value: 'enforce' },
];
// Presidio engine rollout status (regex is always required + locked; Presidio is admin-editable).
const STATUS_OPTIONS: t.SelectOption[] = [
  { label: 'Optional', value: 'optional' },
  { label: 'Required', value: 'required' },
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

function ColumnHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
      {label}
      {tooltip && (
        <span aria-hidden="true" title={tooltip} className="ml-1 cursor-help">
          ?
        </span>
      )}
    </th>
  );
}

function isSubTab(v: string): v is SubTab {
  return v === 'overview' || v === 'local' || v === 'presidio';
}

export function VardeVernPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_CONFIGS);
  const { data, isLoading, isError, error } = useQuery(vardeVernQueryOptions);

  const [subTab, setSubTab] = useState<SubTab>('overview');
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
  const analyzerLanguages = data.presidio?.languages ?? (data.presidio?.language ? [data.presidio.language] : ['nb', 'en']);
  const notIntegrated = reportedNotIntegrated(data.presidio);
  // Backend-provided per-entity views drive the editable defaults — no hardcoded client-side fallback, so the
  // seeded shadow baseline for the semantic entities renders correctly.
  const entityViews: Record<string, t.VardeVernEntity> = Object.fromEntries(
    data.entities.map((e) => [e.entityType, e]),
  );

  const entryOf = (type: string): t.VardeVernEntityPolicy => {
    const existing = policy.entities[type];
    if (existing) return existing;
    const view = entityViews[type];
    return {
      action: view?.action ?? policy.defaultAction,
      requiredEngines: [],
      minConfidence: view?.minConfidence,
    };
  };
  const entityActions: Record<string, t.VardeVernAction> = Object.fromEntries(
    data.entities.map((e) => [e.entityType, entryOf(e.entityType).action]),
  );
  const setEntity = (type: string, patch: Partial<t.VardeVernEntityPolicy>) =>
    setPolicy((prev) =>
      prev ? { ...prev, entities: { ...prev.entities, [type]: { ...entryOf(type), ...patch } } } : prev,
    );
  const setPhase = (engineId: string, rolloutPhase: t.VardeVernRolloutPhase) =>
    setRollout((prev) =>
      prev ? prev.map((e) => (e.engineId === engineId ? { ...e, rolloutPhase } : e)) : prev,
    );
  const setStatus = (engineId: string, status: t.VardeVernEngineStatus) =>
    setRollout((prev) =>
      prev ? prev.map((e) => (e.engineId === engineId ? { ...e, status } : e)) : prev,
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

  // Regex entities (Local PII engine tab): checksum badge + enforce/block only — never a confidence slider.
  const entityRow = (entity: t.VardeVernEntity) => {
    const entry = entryOf(entity.entityType);
    return (
      <div
        key={entity.entityType}
        className="flex flex-col gap-2 border-b border-(--cui-color-stroke-default) py-3 last:border-0"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-sm font-medium text-(--cui-color-text-default)">{entity.label}</span>
            <span className="block text-xs text-(--cui-color-text-muted)">{entity.entityType}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {entity.technicalStatus && <Badge tone="inactive">{entity.technicalStatus}</Badge>}
            <SelectField
              id={`action-${entity.entityType}`}
              value={entry.action}
              options={REGEX_ACTIONS}
              onChange={(v) => setEntity(entity.entityType, { action: v as t.VardeVernAction })}
              disabled={disabled}
              aria-label={`${entity.label} policy action`}
            />
          </div>
        </div>
      </div>
    );
  };

  // Integrated semantic entities (Presidio tab): one table row per entity — Entity | Detection Policy |
  // Enforcement Mode | Minimum Score. Enforce is offered ONLY for a green entity, and selecting it auto-sets
  // `enforceLanguages` to the entity's green languages (the proxy requires it).
  const integratedEntityRow = (entity: t.VardeVernEntity) => {
    const entry = entryOf(entity.entityType);
    const green = greenLanguagesFor(entity, data.enforceableGreen);
    const canEnforce = green.length > 0;
    const name = entityDisplayName(entity.entityType);
    const detection = entry.requiredEngines.includes('presidio') ? 'required' : 'optional';
    const setEnforcement = (action: t.VardeVernAction) =>
      setEntity(
        entity.entityType,
        action === 'enforce' ? { action, enforceLanguages: green } : { action },
      );
    return (
      <tr key={entity.entityType} className="border-b border-(--cui-color-stroke-default) last:border-b-0">
        <td className="px-4 py-2.5 align-top">
          <span className="text-sm font-medium text-(--cui-color-text-default)">{name}</span>
        </td>
        <td className="px-4 py-2.5 align-top">
          <SelectField
            id={`detection-${entity.entityType}`}
            value={detection}
            options={DETECTION_OPTIONS}
            onChange={(v) => setEntity(entity.entityType, { requiredEngines: v === 'required' ? ['presidio'] : [] })}
            disabled={disabled}
            aria-label={`${name} detection policy`}
          />
        </td>
        <td className="px-4 py-2.5 align-top">
          <div className="flex items-center gap-2">
            <SelectField
              id={`action-${entity.entityType}`}
              value={entry.action}
              options={canEnforce ? ENFORCEMENT_GREEN : ENFORCEMENT_SHADOW_ONLY}
              onChange={(v) => setEnforcement(v as t.VardeVernAction)}
              disabled={disabled}
              aria-label={`${name} enforcement mode`}
            />
            {!canEnforce && (
              <span
                aria-hidden="true"
                title={GREEN_GATE_TOOLTIP}
                className="cursor-help text-xs text-(--cui-color-text-muted)"
              >
                ?
              </span>
            )}
          </div>
          {entry.action === 'enforce' && (
            <span className="mt-1 block text-xs text-(--cui-color-text-muted)">
              {(entry.enforceLanguages ?? []).join(', ')}
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 align-top">
          <div className="w-24">
            <NumberField
              id={`conf-${entity.entityType}`}
              value={entry.minConfidence ?? entity.minConfidence}
              onChange={(v) => setEntity(entity.entityType, { minConfidence: v })}
              min={0}
              max={1}
              step={0.05}
              disabled={disabled}
              aria-label={`${name} minimum score`}
            />
          </div>
        </td>
      </tr>
    );
  };

  const rolloutRow = (engine: t.VardeVernRolloutEngine) => {
    const locked = engine.engineId === 'regex';
    return (
      <div
        key={engine.engineId}
        className="flex flex-col gap-2 border-b border-(--cui-color-stroke-default) py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <span className="block text-sm font-medium text-(--cui-color-text-default)">{engine.engineId}</span>
          {locked && <span className="block text-xs text-(--cui-color-text-muted)">{engine.status}</span>}
        </div>
        {locked ? (
          <Badge tone={phaseTone(engine.rolloutPhase)}>{engine.rolloutPhase} (locked)</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              id={`status-${engine.engineId}`}
              value={engine.status}
              options={STATUS_OPTIONS}
              onChange={(v) => setStatus(engine.engineId, v as t.VardeVernEngineStatus)}
              disabled={disabled}
              aria-label={`${engine.engineId} status`}
            />
            <SelectField
              id={`phase-${engine.engineId}`}
              value={engine.rolloutPhase}
              options={PHASE_OPTIONS}
              onChange={(v) => setPhase(engine.engineId, v as t.VardeVernRolloutPhase)}
              disabled={disabled}
              aria-label={`${engine.engineId} rollout phase`}
            />
          </div>
        )}
      </div>
    );
  };

  const presidioEngine = rollout.find((e) => e.engineId === 'presidio');

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
      <div className="flex items-start justify-between gap-3">
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

      <Tabs
        value={subTab}
        onValueChange={(v) => isSubTab(v) && setSubTab(v)}
        ariaLabel="Varde Vern"
      >
        <Tabs.TriggersList>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="local">Local PII engine</Tabs.Trigger>
          <Tabs.Trigger value="presidio">Presidio Analyzer</Tabs.Trigger>
        </Tabs.TriggersList>
        <Tabs.Content value="overview" tabIndex={-1} />
        <Tabs.Content value="local" tabIndex={-1} />
        <Tabs.Content value="presidio" tabIndex={-1} />
      </Tabs>

      {subTab === 'overview' && (
        <div className="flex flex-col gap-4">
          <Section
            title="Operational status"
            description="Varde Vern is unconditionally fail-closed. The local regex engine is always authoritative (required + enforce); Presidio is supplementary."
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Fail-closed</span>
                <Badge tone="protective">always on (locked)</Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Local regex</span>
                <Badge tone="protective">required · enforce</Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Presidio</span>
                <Badge tone={data.presidio?.configured ? phaseTone(presidioEngine?.rolloutPhase ?? 'off') : 'inactive'}>
                  {data.presidio?.configured ? `${data.presidio.state ?? 'unknown'} · ${presidioEngine?.rolloutPhase ?? 'off'}` : 'not configured'}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Languages</span>
                <Badge tone="inactive">{analyzerLanguages.join(', ') || '—'}</Badge>
              </div>
            </div>
          </Section>

          <Section
            title="Entity matrix"
            description="Per entity: the local engine, Presidio, and the effective action. Driven by the backend."
          >
            <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
              <table className="w-full text-left text-sm">
                <thead className="text-(--cui-color-text-muted)">
                  <tr>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Local engine</th>
                    <th className="px-3 py-2">Presidio</th>
                    <th className="px-3 py-2">Effective action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entities.map((e) => (
                    <tr key={e.entityType} className="border-t border-(--cui-color-stroke-default)">
                      <td className="px-3 py-2">
                        <span className="font-medium">
                          {e.engine === 'semantic' ? entityDisplayName(e.entityType) : e.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">{e.engine === 'regex' ? <Badge tone="protective">authoritative</Badge> : '–'}</td>
                      <td className="px-3 py-2">{e.engine === 'semantic' ? <Badge tone="measuring">supplementary</Badge> : '–'}</td>
                      <td className="px-3 py-2"><Badge tone={actionTone(e.action)}>{e.action}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {subTab === 'local' && (
        <div className="flex flex-col gap-4">
          <Section
            title="Structured & validated data (local regex)"
            description="Authoritative engine. Precise identifiers validated by checksums/format. Enforce or Block only — never weaker."
          >
            {regex.map(entityRow)}
          </Section>
          <Section
            title="Rollout"
            description="The local regex engine is always enforced; a supplementary engine's phase is set on the Presidio tab."
          >
            {rollout.filter((e) => e.engineId === 'regex').map(rolloutRow)}
          </Section>
        </div>
      )}

      {subTab === 'presidio' && (
        <div className="flex flex-col gap-4">
          <Section
            title="Presidio engine"
            description="Status: optional or required. Phase: off (inactive) · shadow (measures without masking) · enforce (masks before the LLM; requires a green quality gate)."
          >
            {rollout.filter((e) => e.engineId !== 'regex').length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">Presidio has no rollout entry yet.</p>
            ) : (
              rollout.filter((e) => e.engineId !== 'regex').map(rolloutRow)
            )}
          </Section>

          <Section
            title="Active in Varde Vern"
            description="Supplementary AI/Presidio detection for the integrated semantic entities. Structured types such as email, phone, and national identity numbers are covered by the local PII engine — see the Local PII engine tab."
          >
            {semantic.length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">No integrated semantic entities in the catalog.</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-(--cui-color-text-muted)">{PRESIDIO_SCORE_INTRO}</p>
                <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                        <ColumnHeader label="Entity" />
                        <ColumnHeader label="Detection Policy" />
                        <ColumnHeader label="Enforcement Mode" />
                        <ColumnHeader label="Minimum Score" tooltip={PRESIDIO_SCORE_INTRO} />
                      </tr>
                    </thead>
                    <tbody>{semantic.map(integratedEntityRow)}</tbody>
                  </table>
                </div>
              </>
            )}
          </Section>

          <Section
            title="Reported by Presidio, not integrated"
            description="Derived dynamically: entity types the running analyzer reports, minus those Varde Vern actually requests and integrates."
          >
            {notIntegrated.length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">
                No additional types are reported by the running analyzer.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {notIntegrated.map((entity) => (
                  <span
                    key={entity}
                    className="inline-flex items-center gap-2 rounded-md border border-(--cui-color-stroke-default) px-2 py-1 text-xs text-(--cui-color-text-default)"
                  >
                    <span className="font-mono">{entity}</span>
                    <Badge tone="inactive">not integrated</Badge>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-(--cui-color-text-muted)">
              Not integrated means the type is reported by the analyzer but not requested by Varde Vern: it
              has no mapping, policy, or quality gates and cannot be set to Shadow or Enforce. Integration
              requires a mapping, a policy, language support, a synthetic corpus, and a green quality gate.
            </p>
          </Section>

          <Section
            title="Presidio Analyzer"
            description="Read-only status + a native test studio (synthetic data only; nothing is stored)."
          >
            <PresidioPanel status={data.presidio} canManage={canManage} entityActions={entityActions} />
          </Section>
        </div>
      )}

      <p className="text-xs text-(--cui-color-text-muted)">
        Default action for unlisted entities: <Badge tone={actionTone(policy.defaultAction)}>{policy.defaultAction}</Badge>
      </p>
    </div>
  );
}
