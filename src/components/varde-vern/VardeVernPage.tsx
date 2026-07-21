import { useState, useEffect } from 'react';
import { Icon, Tabs } from '@clickhouse/click-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Tone } from './operations';
import type * as t from '@/types';
import { groupEntitiesByEngine, phaseTone, actionTone, greenLanguagesFor, reportedNotIntegrated } from './operations';
import { vardeVernQueryOptions, saveVardeVernFn } from '@/server';
import { SelectField } from '@/components/configuration/fields';
import { EmptyState, LoadingState } from '@/components/shared';
import { PresidioScoreField } from './PresidioScoreField';
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
// Integrated semantic entities are presented as off/shadow/enforce; enforce is offered ONLY when the entity
// has a green quality gate (below). 'Av' maps to the `allow` action (measured/masked by neither engine).
const SEMANTIC_OFF: t.SelectOption = { label: 'Av (ikke aktiv)', value: 'allow' };
const SEMANTIC_SHADOW: t.SelectOption = { label: 'Skygge (måler)', value: 'shadow' };
const SEMANTIC_ENFORCE: t.SelectOption = { label: 'Håndhev (maskér)', value: 'enforce' };
const SEMANTIC_ACTIONS_SHADOW_ONLY: t.SelectOption[] = [SEMANTIC_OFF, SEMANTIC_SHADOW];
const SEMANTIC_ACTIONS_GREEN: t.SelectOption[] = [SEMANTIC_OFF, SEMANTIC_SHADOW, SEMANTIC_ENFORCE];
const PHASE_OPTIONS: t.SelectOption[] = [
  { label: 'Off', value: 'off' },
  { label: 'Shadow', value: 'shadow' },
  { label: 'Enforce', value: 'enforce' },
];
// Presidio-motor rollout status (regex is always required + locked; Presidio is admin-editable).
const STATUS_OPTIONS: t.SelectOption[] = [
  { label: 'Valgfri (optional)', value: 'optional' },
  { label: 'Påkrevd (required)', value: 'required' },
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
  const notIntegrated = reportedNotIntegrated(data.presidio);
  // Backend-provided per-entity views drive the editable defaults — no hardcoded client-side fallback, so the
  // seeded shadow baseline for PERSON/LOCATION/ORG renders correctly.
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

  // Regex entities (Lokal PII-motor tab): checksum badge + enforce/block only — never a confidence slider.
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

  // Integrated semantic entities (Presidio tab): off/shadow/enforce, Minimum Presidio-score, and the
  // green-gated per-language enforce control. Enforce is offered ONLY when the entity has green languages.
  const integratedEntityRow = (entity: t.VardeVernEntity) => {
    const entry = entryOf(entity.entityType);
    const green = greenLanguagesFor(entity, data.enforceableGreen);
    const canEnforce = green.length > 0;
    const enforcing = entry.action === 'enforce';
    return (
      <div
        key={entity.entityType}
        className="flex flex-col gap-3 border-b border-(--cui-color-stroke-default) py-3 last:border-0"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="block text-sm font-medium text-(--cui-color-text-default)">{entity.label}</span>
            <span className="block text-xs text-(--cui-color-text-muted)">
              {entity.entityType} · norsk (nb) + engelsk (en) modellintegrasjon
            </span>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <SelectField
              id={`action-${entity.entityType}`}
              value={entry.action}
              options={canEnforce ? SEMANTIC_ACTIONS_GREEN : SEMANTIC_ACTIONS_SHADOW_ONLY}
              onChange={(v) => setEntity(entity.entityType, { action: v as t.VardeVernAction })}
              disabled={disabled}
              aria-label={`${entity.label} policy action`}
            />
            {!canEnforce && (
              <span className="text-xs text-(--cui-color-text-muted)">
                Håndhev krever grønn kvalitetsgate
              </span>
            )}
          </div>
        </div>
        <PresidioScoreField
          id={`conf-${entity.entityType}`}
          value={entry.minConfidence ?? entity.minConfidence}
          onChange={(v) => setEntity(entity.entityType, { minConfidence: v ?? undefined })}
          disabled={disabled}
          showFixedNote={entity.scoreModel === 'spacy-ner-fixed'}
          aria-label={`${entity.label} minimum Presidio-score`}
        />
        {/* Green-gated språk-gate: enforce is per-language and limited to the entity's green languages. */}
        {enforcing && (
          <fieldset className="flex flex-wrap items-center gap-3 pl-1">
            <legend className="mr-1 text-xs text-(--cui-color-text-muted)">
              Håndhev for språk (kun grønt-gatede språk):
            </legend>
            {green.map((lang) => (
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
            title="Presidio-motor"
            description="Status: valgfri (optional) eller påkrevd (required). Fase: av (inaktiv) · skygge (måler uten maskering) · håndhev (maskerer før LLM-en; krever grønn kvalitetsgate)."
          >
            {rollout.filter((e) => e.engineId !== 'regex').length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">Presidio har ingen utrullingsoppføring ennå.</p>
            ) : (
              rollout.filter((e) => e.engineId !== 'regex').map(rolloutRow)
            )}
          </Section>

          <Section
            title="Aktivt integrert i Varde Vern"
            description="PERSON, STED (LOCATION) og ORGANISASJON (ORG) — supplerende AI/Presidio-deteksjon med norsk (nb) og engelsk (en) modellintegrasjon. Håndhev tilbys kun for språk med grønn kvalitetsgate; ellers er skygge/av tilgjengelig. Strukturerte typer som e-post (EMAIL), telefon (PHONE), fødselsnummer (FNR), IBAN og organisasjonsnummer (ORG_NR) dekkes allerede av den lokale PII-motoren (regex) — se fanen «Lokal PII-motor» — og er ikke manglende Presidio-funksjoner."
          >
            {semantic.length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">Ingen integrerte semantiske entiteter i katalogen.</p>
            ) : (
              semantic.map(integratedEntityRow)
            )}
          </Section>

          <Section
            title="Rapportert av nåværende Presidio Analyzer, men ikke integrert i Varde Vern"
            description="Utledet dynamisk: entiteter den kjørende analysemotoren rapporterer, minus de Varde Vern faktisk etterspør og integrerer. At en type rapporteres betyr ikke at norsk/engelsk kvalitet er verifisert. Disse kan ikke settes til skygge/håndhev."
          >
            {notIntegrated.length === 0 ? (
              <p className="py-2 text-xs text-(--cui-color-text-muted)">
                Ingen ekstra typer rapporteres av den kjørende analysemotoren.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {notIntegrated.map((entity) => (
                  <span
                    key={entity}
                    className="inline-flex items-center gap-2 rounded-md border border-(--cui-color-stroke-default) px-2 py-1 text-xs text-(--cui-color-text-default)"
                  >
                    <span className="font-mono">{entity}</span>
                    <Badge tone="inactive">ikke aktivert i Varde Vern</Badge>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 text-xs text-(--cui-color-text-muted)">
              <p className="mb-1">
                «Ikke aktivert» betyr at entiteten rapporteres av den kjørende Presidio-analysemotoren, men
                ennå ikke er integrert i Varde Vern. En slik entitet:
              </p>
              <ul className="list-disc pl-5">
                <li>etterspørres ikke av Varde Vern i den ordinære chat-flyten;</li>
                <li>har ingen Varde-type/mapping eller policy;</li>
                <li>har ingen definerte konfidens- eller språkgater;</li>
                <li>kan ikke maskeres eller håndheves;</li>
                <li>er ikke kvalitetstestet som en Varde Vern-funksjon.</li>
              </ul>
              <p className="mt-1">
                Den kan legges til senere, men bare sammen med mapping, policy, språkstøtte, et syntetisk
                korpus, en kvalitetsgate og tester.
              </p>
            </div>
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
