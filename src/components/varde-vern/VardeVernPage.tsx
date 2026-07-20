import { useState, useEffect } from 'react';
import { Icon, Tabs } from '@clickhouse/click-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import type * as t from '@/types';
import { SelectField, NumberField } from '@/components/configuration/fields';
import { groupEntitiesByEngine, phaseTone, actionTone } from './operations';
import { vardeVernQueryOptions, saveVardeVernFn } from '@/server';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError, cn } from '@/utils';
import { SystemCapabilities } from '@/constants';
import { PresidioPanel } from './PresidioPanel';
import { useCapabilities } from '@/hooks';

type SubTab = 'oversikt' | 'lokal' | 'presidio';

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

function isSubTab(v: string): v is SubTab {
  return v === 'oversikt' || v === 'lokal' || v === 'presidio';
}

export function VardeVernPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_CONFIGS);
  const { data, isLoading, isError, error } = useQuery(vardeVernQueryOptions);

  const [subTab, setSubTab] = useState<SubTab>('oversikt');
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
  const entityActions: Record<string, t.VardeVernAction> = Object.fromEntries(
    data.entities.map((e) => [e.entityType, e.action]),
  );

  const entryOf = (type: string): t.VardeVernEntityPolicy =>
    policy.entities[type] ?? { action: 'enforce', requiredEngines: [] };
  const setEntity = (type: string, patch: Partial<t.VardeVernEntityPolicy>) =>
    setPolicy((prev) =>
      prev ? { ...prev, entities: { ...prev.entities, [type]: { ...entryOf(type), ...patch } } } : prev,
    );
  const toggleEnforceLanguage = (type: string, lang: string) =>
    setPolicy((prev) => {
      if (!prev) return prev;
      const cur = new Set(entryOf(type).enforceLanguages ?? []);
      cur.has(lang) ? cur.delete(lang) : cur.add(lang);
      return { ...prev, entities: { ...prev.entities, [type]: { ...entryOf(type), enforceLanguages: [...cur] } } };
    });
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
    const enforcing = entry.action === 'enforce' || entry.action === 'block';
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
        {/* F149f/F12f: a SEMANTIC entity may only enforce/block per gated language. */}
        {entity.engine === 'semantic' && enforcing && (
          <fieldset className="flex flex-wrap items-center gap-3 pl-1">
            <legend className="mr-1 text-xs text-(--cui-color-text-muted)">
              Enforce for language (required — must be gated green):
            </legend>
            {analyzerLanguages.map((lang) => (
              <label key={lang} className="flex items-center gap-1 text-xs text-(--cui-color-text-default)">
                <input
                  type="checkbox"
                  aria-label={`${entity.entityType} enforce ${lang}`}
                  checked={(entry.enforceLanguages ?? []).includes(lang)}
                  disabled={disabled}
                  onChange={() => toggleEnforceLanguage(entity.entityType, lang)}
                />
                {lang}
              </label>
            ))}
            {(entry.enforceLanguages ?? []).length === 0 && (
              <Badge tone="measuring">no language gated — save will be rejected</Badge>
            )}
          </fieldset>
        )}
      </div>
    );
  };

  const rolloutRow = (engine: t.VardeVernRolloutEngine) => {
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
          <Tabs.Trigger value="oversikt">Oversikt</Tabs.Trigger>
          <Tabs.Trigger value="lokal">Lokal PII-motor</Tabs.Trigger>
          <Tabs.Trigger value="presidio">Presidio Analyzer</Tabs.Trigger>
        </Tabs.TriggersList>
        <Tabs.Content value="oversikt" tabIndex={-1} />
        <Tabs.Content value="lokal" tabIndex={-1} />
        <Tabs.Content value="presidio" tabIndex={-1} />
      </Tabs>

      {subTab === 'oversikt' && (
        <div className="flex flex-col gap-4">
          <Section
            title="Operativ status"
            description="Varde Vern er ubetinget fail-closed. Lokal regex er alltid autoritativ (required + enforce); Presidio er supplerende."
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Fail-closed</span>
                <Badge tone="protective">alltid på (låst)</Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Lokal regex</span>
                <Badge tone="protective">required · enforce</Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Presidio</span>
                <Badge tone={data.presidio?.configured ? phaseTone(presidioEngine?.rolloutPhase ?? 'off') : 'inactive'}>
                  {data.presidio?.configured ? `${data.presidio.state ?? 'unknown'} · ${presidioEngine?.rolloutPhase ?? 'off'}` : 'ikke konfigurert'}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-(--cui-color-text-muted)">Språk</span>
                <Badge tone="inactive">{analyzerLanguages.join(', ') || '—'}</Badge>
              </div>
            </div>
          </Section>

          <Section
            title="Entitetsmatrise"
            description="Per entitet: lokal motor, Presidio og effektiv handling. Drevet av backend."
          >
            <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
              <table className="w-full text-left text-sm">
                <thead className="text-(--cui-color-text-muted)">
                  <tr>
                    <th className="px-3 py-2">Entitet</th>
                    <th className="px-3 py-2">Lokal motor</th>
                    <th className="px-3 py-2">Presidio</th>
                    <th className="px-3 py-2">Effektiv handling</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entities.map((e) => (
                    <tr key={e.entityType} className="border-t border-(--cui-color-stroke-default)">
                      <td className="px-3 py-2">
                        <span className="font-medium">{e.label}</span>
                        <span className="ml-1 text-xs text-(--cui-color-text-muted)">{e.entityType}</span>
                      </td>
                      <td className="px-3 py-2">{e.engine === 'regex' ? <Badge tone="protective">autoritativ</Badge> : '–'}</td>
                      <td className="px-3 py-2">{e.engine === 'semantic' ? <Badge tone="measuring">supplerende</Badge> : '–'}</td>
                      <td className="px-3 py-2"><Badge tone={actionTone(e.action)}>{e.action}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {subTab === 'lokal' && (
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
            title="Contextual & semantic data (AI / Presidio)"
            description="Supplementary engine. Names, places, organisations. A minimum-confidence threshold applies; enforce requires a per-language gate."
          >
            {semantic.length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">No semantic entities in the catalog.</p>
            ) : (
              semantic.map(entityRow)
            )}
          </Section>
          <Section
            title="Rollout (Presidio)"
            description="off (inactive) · shadow (measures without masking) · enforce (masks before the LLM; requires evidence)."
          >
            {rollout.filter((e) => e.engineId !== 'regex').length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">Presidio has no rollout entry yet.</p>
            ) : (
              rollout.filter((e) => e.engineId !== 'regex').map(rolloutRow)
            )}
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
