import { useMemo, useState } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useMutation } from '@tanstack/react-query';
import type { MarkSpan } from './SpanMarker';
import type { Tone } from './operations';
import type * as t from '@/types';
import { SelectField, TextareaField } from '@/components/configuration/fields';
import { testPresidioFn } from '@/server';
import { PresidioScoreField } from './PresidioScoreField';
import {
  entityDisplayName,
  formatPresidioScore,
  languageLabel,
  describeLanguageSource,
} from './operations';
import { Chip } from './ui';
import { SpanMarker } from './SpanMarker';
import { notifyError } from '@/utils';

// 'auto' (default) lets the proxy's Franc detector pick the language; nb/en pin it (ADR 0026).
const LANGUAGE_OPTIONS: t.SelectOption[] = [
  { label: 'Auto (detect)', value: 'auto' },
  { label: 'Norwegian (nb)', value: 'nb' },
  { label: 'English (en)', value: 'en' },
];

// The simulated UI-language / browser hint the resolver falls back to when Franc is uncertain (auto only).
const UI_HINT_OPTIONS: t.SelectOption[] = [
  { label: 'None', value: '' },
  { label: 'Norwegian (nb)', value: 'nb' },
  { label: 'English (en)', value: 'en' },
];

// The semantic types Varde requests from Presidio (regex is authoritative for structured types). Used
// for the test-studio entity filter — these are Presidio's OWN request codes (ORGANIZATION, not the Varde
// 'ORG' code), so the filter reaches the analyzer verbatim. Findings come back mapped to Varde codes.
const REQUESTABLE_ENTITIES = ['PERSON', 'LOCATION', 'ORGANIZATION'] as const;

// A SYNTHETIC starter sample (no real person). The admin can edit it; a warning discourages real PII.
const SAMPLE_TEXT = 'Ola Nordmann bor i Oslo og jobber i Nordre Skogtjenester.';

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
 * The Presidio Analyzer test studio: analyzes SYNTHETIC text against the proxy admin API, marks the browser's
 * own input from returned offsets (no matched substring crosses the API), persists nothing, and never calls
 * an LLM. The read-only deployment/health status card lives in Overview → Operational status
 * (PresidioStatusCard) — everything else on this tab is unchanged.
 */
export function PresidioPanel({
  status,
  canManage = false,
  entityActions = {},
  presidioPhase = 'off',
  presidioStatus = 'disabled',
}: PresidioPanelProps) {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [language, setLanguage] = useState<'auto' | 'nb' | 'en'>('auto');
  const [uiHint, setUiHint] = useState<'' | 'nb' | 'en'>('');
  const [threshold, setThreshold] = useState(0.5);
  const [entityFilter, setEntityFilter] = useState<Record<string, boolean>>({});

  const selectedEntities = REQUESTABLE_ENTITIES.filter((e) => entityFilter[e]);

  const analyze = useMutation({
    mutationFn: (input: {
      text: string;
      language: 'auto' | 'nb' | 'en';
      uiLanguage?: 'nb' | 'en';
      entities?: string[];
      scoreThreshold?: number;
    }) => testPresidioFn({ data: input }),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio test failed'),
  });

  const findings = analyze.data?.findings ?? [];
  // ADR 0026: the ONE language this analysis ran in + how it was decided (Franc / hint / fallback / pinned).
  const resolvedLanguage = analyze.data?.resolvedLanguage;
  const languageSource = describeLanguageSource(analyze.data?.languageResolutionSource);
  // F12c: mark + slice against the SUBMITTED text snapshot (the mutation variables), never the current
  // editable `text` — otherwise editing after analysis would mark the wrong characters.
  const analyzedText = analyze.variables?.text ?? '';
  const spans: MarkSpan[] = useMemo(
    () =>
      findings.map((f) => ({
        start: f.startUtf16,
        end: f.endUtf16,
        tone: f.abovePolicyThreshold ? 'protective' : 'measuring',
        label: `${entityDisplayName(f.entityType)} · ${formatPresidioScore(f.score)}`,
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

  // The Score column shows the analyzer's RAW score. The current spaCy recognizer returns a FIXED score for
  // every finding, so it is a technical value, not a calibrated probability — the legend says so, naming the
  // reported fixed score when the backend exposes it.
  const scoreNote =
    typeof status.semanticScoreFixed === 'number'
      ? `the current spaCy model returns a fixed ${status.semanticScoreFixed}, not a calibrated probability`
      : 'a technical value from the analyzer, not a calibrated probability';
  // The client-side "what Varde Vern would enforce" decision for a finding (server-side always governs).
  const vernDecision = (f: t.PresidioFinding): { tone: Tone; label: string } => {
    if (presidioStatus === 'disabled' || presidioPhase === 'off')
      return { tone: 'inactive', label: 'ignore' };
    if (!f.abovePolicyThreshold) return { tone: 'inactive', label: 'ignore' };
    const action = entityActions[f.entityType];
    if (action === 'allow') return { tone: 'inactive', label: 'ignore' };
    if (action === 'shadow') return { tone: 'measuring', label: 'observe' };
    if (presidioPhase !== 'enforce') return { tone: 'measuring', label: 'observe' };
    return action === 'block'
      ? { tone: 'protective', label: 'block' }
      : { tone: 'protective', label: 'mask' };
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Native test studio. The read-only status card now lives in Overview → Operational status. */}
      <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
        <h3 className="mb-2 text-sm font-semibold text-(--cui-color-title-default)">Test studio</h3>
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-md border border-(--cui-color-feedback-warning-fg) bg-(--cui-color-feedback-warning-bg) p-2 text-xs text-(--cui-color-feedback-warning-fg)"
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
              onChange={(v) => setLanguage(v as 'auto' | 'nb' | 'en')}
            />
          </div>
          {/* ADR 0026: when Auto is selected, let the admin simulate the user's UI-language / browser hint —
              the resolver uses it ONLY when Franc is uncertain (short/ambiguous text), so this demonstrates
              the hint path (and its "never auto-nb" fallback) without a real browser. */}
          {language === 'auto' && (
            <div className="w-48">
              <label
                htmlFor="presidio-test-uihint"
                className="mb-1 block text-xs text-(--cui-color-text-muted)"
              >
                If uncertain, use hint
              </label>
              <SelectField
                id="presidio-test-uihint"
                aria-label="UI-language hint"
                value={uiHint}
                options={UI_HINT_OPTIONS}
                onChange={(v) => setUiHint(v as '' | 'nb' | 'en')}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              analyze.mutate({
                text,
                language,
                uiLanguage: language === 'auto' && uiHint ? uiHint : undefined,
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
          <legend className="mr-1 text-xs text-(--cui-color-text-muted)">
            Entities (none = all):
          </legend>
          {REQUESTABLE_ENTITIES.map((e) => (
            <label
              key={e}
              className="flex items-center gap-1 text-xs text-(--cui-color-text-default)"
            >
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
            {/* ADR 0026 — which language the answer is shown in, and WHY (Franc score / UI-language hint /
                fallback / an explicit pin). Present on any proxy that exposes language routing. */}
            {resolvedLanguage && (
              <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-(--cui-color-title-default)">
                    Language detection
                  </span>
                  <Chip tone="protective">{languageLabel(resolvedLanguage)}</Chip>
                  <Chip tone={languageSource.tone}>{languageSource.label}</Chip>
                </div>
                <p className="text-xs text-(--cui-color-text-muted)">
                  The analysis ran in <strong>{languageLabel(resolvedLanguage)}</strong>
                  {typeof analyze.data.scoreGap === 'number' && (
                    <> · Franc score gap {analyze.data.scoreGap.toFixed(2)}</>
                  )}
                  {typeof analyze.data.sampleChars === 'number' && (
                    <> · {analyze.data.sampleChars} characters analyzed</>
                  )}
                  {analyze.data.requestedLanguage && (
                    <> · requested “{analyze.data.requestedLanguage}”</>
                  )}
                  .
                </p>
              </div>
            )}
            <SpanMarker text={analyzedText} spans={spans} />
            <p className="text-xs text-(--cui-color-text-muted)">
              <strong>Score</strong> = {scoreNote} · <strong>Match</strong> = the hit, shown locally
              from the offsets (never returned by the server) · <strong>Recognizer</strong> = which
              mechanism produced it · <strong>Presidio</strong> = detected ·{' '}
              <strong>Policy score</strong> = passes the saved threshold ·{' '}
              <strong>Varde Vern</strong> = ignore, observe, mask or block under the saved policy
              and rollout.
            </p>
            <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
              <table className="w-full text-left text-sm">
                <thead className="text-(--cui-color-text-muted)">
                  <tr>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Offsets (UTF-16)</th>
                    <th className="px-3 py-2">Match</th>
                    <th className="px-3 py-2">Recognizer</th>
                    <th className="px-3 py-2">Presidio</th>
                    <th className="px-3 py-2">Policy score</th>
                    <th className="px-3 py-2">Varde Vern</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-2 text-(--cui-color-text-muted)">
                        No findings.
                      </td>
                    </tr>
                  ) : (
                    findings.map((f, i) => {
                      const decision = vernDecision(f);
                      return (
                        <tr
                          key={`${f.entityType}-${f.startUtf16}-${i}`}
                          className="border-t border-(--cui-color-stroke-default)"
                        >
                          <td className="px-3 py-2">{entityDisplayName(f.entityType)}</td>
                          <td className="px-3 py-2">{formatPresidioScore(f.score)}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {f.startUtf16}–{f.endUtf16}
                          </td>
                          {/* The matched word is sliced CLIENT-SIDE from the submitted text (the backend
                              never echoes the substring — SECURITY §16); shown so humans can read the hit. */}
                          <td className="px-3 py-2 font-mono text-xs">
                            {analyzedText.slice(f.startUtf16, f.endUtf16)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{f.recognizer ?? '—'}</td>
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
