import { useMemo, useState } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MarkSpan } from './SpanMarker';
import type { Tone } from './operations';
import type * as t from '@/types';
import { SelectField, TextareaField } from '@/components/configuration/fields';
import { testPresidioFn, refreshPresidioFn } from '@/server';
import { PresidioScoreField } from './PresidioScoreField';
import { entityDisplayName } from './operations';
import { SpanMarker } from './SpanMarker';
import { cn, notifyError } from '@/utils';

const TONE_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

const LANGUAGE_OPTIONS: t.SelectOption[] = [
  { label: 'Norwegian (nb)', value: 'nb' },
  { label: 'English (en)', value: 'en' },
];

// The semantic types Varde requests from Presidio (regex is authoritative for structured types). Used
// for the test-studio entity filter — these are Presidio's OWN request codes (ORGANIZATION, not the Varde
// 'ORG' code), so the filter reaches the analyzer verbatim. Findings come back mapped to Varde codes.
const REQUESTABLE_ENTITIES = ['PERSON', 'LOCATION', 'ORGANIZATION'] as const;

// A SYNTHETIC starter sample (no real person). The admin can edit it; a warning discourages real PII.
const SAMPLE_TEXT = 'Ola Nordmann bor i Oslo og jobber i Nordre Skogtjenester.';

const STATE_TONE: Record<string, Tone> = {
  ready: 'protective',
  degraded: 'measuring',
  unavailable: 'inactive',
  unknown: 'inactive',
};

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
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

function StatusRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-sm">
      <span className="text-(--cui-color-text-muted)">{label}</span>
      <span className="font-mono text-xs break-all text-(--cui-color-text-default)">{value}</span>
    </div>
  );
}

export interface PresidioPanelProps {
  status?: t.PresidioStatus;
  /** MANAGE_CONFIGS — analyze + refresh call the privileged proxy admin API, so they are disabled without
   *  it (server-side is the real gate; the client stays consistent). Defaults to false (least privilege). */
  canManage?: boolean;
  /** SAVED per-entity policy action — drives the test studio's "what Varde Vern would enforce"
   *  decision level (the third of the three levels the plan requires). */
  entityActions?: Record<string, t.VardeVernAction>;
  /** SAVED Presidio rollout phase, threaded so the test-studio column mirrors the real pipeline. */
  presidioPhase?: t.VardeVernRolloutPhase;
  /** SAVED Presidio engine status, threaded so the test-studio column mirrors the real pipeline. */
  presidioStatus?: t.VardeVernEngineStatus;
}

/**
 * The Presidio Analyzer sub-panel: read-only deployment/health status (never the endpoint/host/token)
 * plus the native test studio. The studio calls ONLY the proxy admin API, marks the browser's own input
 * from returned offsets (no matched substring crosses the API), persists nothing, and never calls an LLM.
 */
export function PresidioPanel({
  status,
  canManage = false,
  entityActions = {},
  presidioPhase = 'off',
  presidioStatus = 'disabled',
}: PresidioPanelProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [language, setLanguage] = useState(status?.language === 'en' ? 'en' : 'nb');
  const [threshold, setThreshold] = useState(0.5);
  const [entityFilter, setEntityFilter] = useState<Record<string, boolean>>({});

  const selectedEntities = REQUESTABLE_ENTITIES.filter((e) => entityFilter[e]);

  const analyze = useMutation({
    mutationFn: (input: {
      text: string;
      language: string;
      entities?: string[];
      scoreThreshold?: number;
    }) => testPresidioFn({ data: input }),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio test failed'),
  });
  const refresh = useMutation({
    mutationFn: () => refreshPresidioFn(),
    // F12b: the refresh re-probes on the proxy; invalidate the query so the status card actually updates.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['varde-vern'] }),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio refresh failed'),
  });

  const findings = analyze.data?.findings ?? [];
  // F12c: mark + slice against the SUBMITTED text snapshot (the mutation variables), never the current
  // editable `text` — otherwise editing after analysis would mark the wrong characters.
  const analyzedText = analyze.variables?.text ?? '';
  const spans: MarkSpan[] = useMemo(
    () =>
      findings.map((f) => ({
        start: f.startUtf16,
        end: f.endUtf16,
        tone: f.abovePolicyThreshold ? 'protective' : 'measuring',
        label: `${entityDisplayName(f.entityType)} · ${Math.round(f.score * 100)}%`,
      })),
    [findings],
  );

  if (!status?.configured) {
    return (
      <p className="text-sm text-(--cui-color-text-muted)">
        Presidio is not connected. Connect the analyzer before semantic detection can run.
      </p>
    );
  }

  const live = status.state ?? 'unknown';
  // The client-side "what Varde Vern would enforce" decision for a finding (server-side always governs).
  const vernDecision = (f: t.PresidioFinding): { tone: Tone; label: string } => {
    if (presidioStatus === 'disabled' || presidioPhase === 'off') return { tone: 'inactive', label: 'ignore' };
    if (!f.abovePolicyThreshold) return { tone: 'inactive', label: 'ignore' };
    const action = entityActions[f.entityType];
    if (action === 'allow') return { tone: 'inactive', label: 'ignore' };
    if (action === 'shadow') return { tone: 'measuring', label: 'observe' };
    if (presidioPhase !== 'enforce') return { tone: 'measuring', label: 'observe' };
    return action === 'block' ? { tone: 'protective', label: 'block' } : { tone: 'protective', label: 'mask' };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Read-only status — never endpoint/host/token. */}
      <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Chip tone={STATE_TONE[live] ?? 'inactive'}>{live}</Chip>
            <span className="text-sm font-medium text-(--cui-color-title-default)">Presidio Analyzer</span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              title="Rechecks analyzer health and supported entity types."
              className="inline-flex items-center gap-1 rounded-md border border-(--cui-color-stroke-default) px-2 py-1 text-xs disabled:opacity-50"
            >
              <Icon name="refresh" size="sm" /> Refresh
            </button>
          )}
        </div>
        <StatusRow label="Credential" value={status.credential ?? 'managed'} />
        <StatusRow label="Image" value={`${status.imageMode ?? 'unknown'} · ${status.release ?? 'unknown'}`} />
        <StatusRow label="Digest" value={status.digest ?? 'unknown'} />
        <StatusRow label="Languages" value={(status.languages ?? [status.language]).filter(Boolean).join(', ') || '—'} />
        <StatusRow label="NLP Engine" value={status.nlpEngine ?? '—'} />
        <StatusRow label="Local PII engine" value={status.localEngine ?? '—'} />
        <StatusRow label="Inactive modules" value={(status.inactiveModules ?? []).join(', ') || '—'} />
        <StatusRow
          label="Supported entities"
          value={(status.supportedEntities ?? []).join(', ') || '—'}
        />
        <StatusRow
          label="Last probe"
          value={
            status.lastProbeAt
              ? `${new Date(status.lastProbeAt).toISOString()} (${status.lastProbeLatencyMs ?? '?'} ms)`
              : 'never'
          }
        />
      </div>

      {/* Native test studio. */}
      <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
        <h3 className="mb-2 text-sm font-semibold text-(--cui-color-title-default)">Test studio</h3>
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md border border-(--cui-color-stroke-warning) bg-(--cui-color-background-warning) p-2 text-xs text-(--cui-color-text-warning)"
        >
          <Icon name="warning" size="sm" />
          <span>Use SYNTHETIC data only — never paste real personal information.</span>
        </div>
        <TextareaField
          id="presidio-test-text"
          aria-label="Sample text"
          value={text}
          onChange={setText}
          rows={3}
          placeholder="Synthetic text to analyze"
        />
        {/* F12f: the score_threshold the server-fn supports — the same minimum-score cutoff, with the ONE
            consolidated intro line (never per-field repetition). */}
        <div className="mt-2">
          <PresidioScoreField
            id="presidio-test-threshold"
            aria-label="Test studio minimum score"
            value={threshold}
            onChange={(v) => setThreshold(v ?? 0.5)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <SelectField
              id="presidio-test-language"
              aria-label="Language"
              value={language}
              options={LANGUAGE_OPTIONS}
              onChange={setLanguage}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              analyze.mutate({
                text,
                language,
                entities: selectedEntities.length > 0 ? [...selectedEntities] : undefined,
                scoreThreshold: threshold,
              })
            }
            disabled={!canManage || analyze.isPending || text.trim().length === 0}
            className="rounded-md bg-(--cui-color-background-accent) px-3 py-2 text-sm font-medium text-(--cui-color-text-on-primary) disabled:opacity-50"
          >
            {analyze.isPending ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        {/* F12f: entity filter — restrict which semantic types Presidio is asked for. */}
        <fieldset className="mt-3 flex flex-wrap items-center gap-3">
          <legend className="mr-1 text-xs text-(--cui-color-text-muted)">Entities (none = all):</legend>
          {REQUESTABLE_ENTITIES.map((e) => (
            <label key={e} className="flex items-center gap-1 text-xs text-(--cui-color-text-default)">
              <input
                type="checkbox"
                aria-label={entityDisplayName(e)}
                checked={Boolean(entityFilter[e])}
                onChange={(ev) => setEntityFilter((prev) => ({ ...prev, [e]: ev.target.checked }))}
              />
              {entityDisplayName(e)}
            </label>
          ))}
        </fieldset>
        {!canManage && (
          <p className="mt-2 text-xs text-(--cui-color-text-muted)">
            Read-only: testing and refresh require Manage configs.
          </p>
        )}

        {analyze.data && (
          <div className="mt-3 flex flex-col gap-2">
            <SpanMarker text={analyzedText} spans={spans} />
            <p className="text-xs text-(--cui-color-text-muted)">
              <strong>Presidio</strong> = detected · <strong>Policy score</strong> = passes the saved
              threshold · <strong>Varde Vern</strong> = ignore, observe, mask or block under the saved
              policy and rollout.
            </p>
            <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
              <table className="w-full text-left text-sm">
                <thead className="text-(--cui-color-text-muted)">
                  <tr>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Offsets (UTF-16)</th>
                    <th className="px-3 py-2">Presidio</th>
                    <th className="px-3 py-2">Policy score</th>
                    <th className="px-3 py-2">Varde Vern</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-(--cui-color-text-muted)">
                        No findings.
                      </td>
                    </tr>
                  ) : (
                    findings.map((f, i) => {
                      const decision = vernDecision(f);
                      return (
                        <tr key={`${f.entityType}-${f.startUtf16}-${i}`} className="border-t border-(--cui-color-stroke-default)">
                          <td className="px-3 py-2">{entityDisplayName(f.entityType)}</td>
                          <td className="px-3 py-2">{Math.round(f.score * 100)}%</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {f.startUtf16}–{f.endUtf16}
                          </td>
                          <td className="px-3 py-2">
                            <Chip tone="measuring">found</Chip>
                          </td>
                          <td className="px-3 py-2">
                            <Chip tone={f.abovePolicyThreshold ? 'protective' : 'inactive'}>
                              {f.abovePolicyThreshold ? 'pass' : 'below'}
                            </Chip>
                          </td>
                          <td className="px-3 py-2">
                            <Chip tone={decision.tone}>{decision.label}</Chip>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
