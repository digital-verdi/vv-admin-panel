import { useMemo, useState } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MarkSpan } from './SpanMarker';
import type { Tone } from './operations';
import type * as t from '@/types';
import { SelectField, TextareaField } from '@/components/configuration/fields';
import { testPresidioFn, refreshPresidioFn } from '@/server';
import { SpanMarker } from './SpanMarker';
import { cn, notifyError } from '@/utils';

const TONE_CLASS: Record<Tone, string> = {
  protective: 'bg-(--cui-color-background-success) text-(--cui-color-text-success)',
  measuring: 'bg-(--cui-color-background-accent-muted) text-(--cui-color-text-accent)',
  inactive: 'bg-(--cui-color-background-muted) text-(--cui-color-text-muted)',
};

const LANGUAGE_OPTIONS: t.SelectOption[] = [
  { label: 'Norsk (nb)', value: 'nb' },
  { label: 'English (en)', value: 'en' },
];

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

/**
 * The Presidio Analyzer sub-panel: read-only deployment/health status (never the endpoint/host/token)
 * plus the native test studio. The studio calls ONLY the proxy admin API, marks the browser's own input
 * from returned offsets (no matched substring crosses the API), persists nothing, and never calls an LLM.
 */
export function PresidioPanel({ status }: { status?: t.PresidioStatus }) {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [language, setLanguage] = useState(status?.language === 'en' ? 'en' : 'nb');

  const analyze = useMutation({
    mutationFn: (input: { text: string; language: string }) => testPresidioFn({ data: input }),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio test failed'),
  });
  const refresh = useMutation({
    mutationFn: () => refreshPresidioFn(),
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Presidio refresh failed'),
  });

  const findings = analyze.data?.findings ?? [];
  const spans: MarkSpan[] = useMemo(
    () =>
      findings.map((f) => ({
        start: f.startUtf16,
        end: f.endUtf16,
        tone: f.abovePolicyThreshold ? 'protective' : 'measuring',
        label: `${f.entityType} · ${Math.round(f.score * 100)}%`,
      })),
    [findings],
  );

  if (!status?.configured) {
    return (
      <p className="text-sm text-(--cui-color-text-muted)">
        No semantic engine is active yet — Presidio joins Varde Vern once the transport is configured.
      </p>
    );
  }

  const live = status.state ?? 'unknown';

  return (
    <div className="flex flex-col gap-4">
      {/* Read-only status — never endpoint/host/token. */}
      <div className="rounded-md border border-(--cui-color-stroke-default) p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Chip tone={STATE_TONE[live] ?? 'inactive'}>{live}</Chip>
            <span className="text-sm font-medium text-(--cui-color-title-default)">Presidio Analyzer</span>
          </div>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-(--cui-color-stroke-default) px-2 py-1 text-xs disabled:opacity-50"
          >
            <Icon name="refresh" size="sm" /> Refresh
          </button>
        </div>
        <StatusRow label="Credential" value={status.credential ?? 'managed'} />
        <StatusRow label="Image" value={`${status.imageMode ?? 'unknown'} · ${status.release ?? 'unknown'}`} />
        <StatusRow label="Digest" value={status.digest ?? 'unknown'} />
        <StatusRow label="Language" value={status.language ?? '—'} />
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
        <div className="mt-2 flex items-end gap-3">
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
            onClick={() => analyze.mutate({ text, language })}
            disabled={analyze.isPending || text.trim().length === 0}
            className="rounded-md bg-(--cui-color-background-accent) px-3 py-2 text-sm font-medium text-(--cui-color-text-on-primary) disabled:opacity-50"
          >
            {analyze.isPending ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>

        {analyze.data && (
          <div className="mt-3 flex flex-col gap-2">
            <SpanMarker text={text} spans={spans} />
            <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
              <table className="w-full text-left text-sm">
                <thead className="text-(--cui-color-text-muted)">
                  <tr>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Offsets (UTF-16)</th>
                    <th className="px-3 py-2">Over policy threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-(--cui-color-text-muted)">
                        No findings.
                      </td>
                    </tr>
                  ) : (
                    findings.map((f, i) => (
                      <tr key={`${f.entityType}-${f.startUtf16}-${i}`} className="border-t border-(--cui-color-stroke-default)">
                        <td className="px-3 py-2">{f.entityType}</td>
                        <td className="px-3 py-2">{Math.round(f.score * 100)}%</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {f.startUtf16}–{f.endUtf16}
                        </td>
                        <td className="px-3 py-2">
                          <Chip tone={f.abovePolicyThreshold ? 'protective' : 'measuring'}>
                            {f.abovePolicyThreshold ? 'yes' : 'below'}
                          </Chip>
                        </td>
                      </tr>
                    ))
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
