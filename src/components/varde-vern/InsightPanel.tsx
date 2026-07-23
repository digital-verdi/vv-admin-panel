import { useMemo, useState } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useQuery } from '@tanstack/react-query';
import type * as t from '@/types';
import type { HorizontalBarRow, StackedBarRow } from './charts';
import { entityDisplayName, formatPresidioScore, phaseTone } from './operations';
import { vardeVernInsightQueryOptions, vardeVernQueryOptions } from '@/server';
import { TimeSeriesBars, HorizontalBars, StackedBar } from './charts';
import { SelectField } from '@/components/configuration/fields';
import { EmptyState, LoadingState } from '@/components/shared';
import { Section, Badge } from './ui';
import { cn } from '@/utils';

export interface InsightPanelProps {
  /** Advisory only — reads require ACCESS_ADMIN, so no control here is manager-gated. Accepted for parity
   *  with the sibling Varde Vern panels (and any future manage-only action). */
  canManage?: boolean;
}

type InsightDays = 7 | 14 | 30;
type EntityMetric = 'requests' | 'spans';
type EngineFilter = 'all' | 'regex' | 'ner';
type ModeFilter = 'all' | 'enforce' | 'shadow';
type SortDir = 'asc' | 'desc';
type RuleSortKey =
  | 'label'
  | 'source'
  | 'mode'
  | 'requestActivations'
  | 'matchCount'
  | 'matchRate'
  | 'minConfidence';

const TIMEFRAME_OPTIONS: t.SelectOption[] = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 14 days', value: '14' },
  { label: 'Last 30 days', value: '30' },
];
const METRIC_OPTIONS: t.SelectOption[] = [
  { label: 'Requests affected', value: 'requests' },
  { label: 'Total findings', value: 'spans' },
];
const ENGINE_FILTER_OPTIONS: t.SelectOption[] = [
  { label: 'All engines', value: 'all' },
  { label: 'Local regex', value: 'regex' },
  { label: 'Presidio', value: 'ner' },
];
const MODE_FILTER_OPTIONS: t.SelectOption[] = [
  { label: 'All modes', value: 'all' },
  { label: 'Enforce', value: 'enforce' },
  { label: 'Shadow', value: 'shadow' },
];

const formatCount = (n: number): string => n.toLocaleString('en-US');

const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

const engineLabel = (source: 'regex' | 'ner'): string =>
  source === 'regex' ? 'Local regex' : 'Presidio';

const stateMessage = (status: t.VardeVernInsightStatus): string =>
  status === 'disabled'
    ? 'Varde Vern protection is turned off, so there is no protection activity to report yet.'
    : 'Protection insight is unavailable right now. The metrics service could not be reached.';

const ruleSortValue = (rule: t.VardeVernInsightRule, key: RuleSortKey): string | number => {
  if (key === 'label') return rule.label.toLowerCase();
  if (key === 'source') return rule.source;
  if (key === 'mode') return rule.mode;
  if (key === 'minConfidence') return rule.minConfidence ?? -1;
  return rule[key];
};

const sortAria = (active: boolean, dir: SortDir): 'none' | 'ascending' | 'descending' => {
  if (!active) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
};

const sortIcon = (active: boolean, dir: SortDir): 'chevron-up' | 'chevron-down' | 'sort' => {
  if (!active) return 'sort';
  return dir === 'asc' ? 'chevron-up' : 'chevron-down';
};

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-4">
      <div className="text-2xl font-semibold text-(--cui-color-text-default)">{value}</div>
      <div className="mt-1 text-sm text-(--cui-color-text-muted)">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-(--cui-color-text-muted)">{hint}</div>}
    </div>
  );
}

/**
 * Varde Vern Insight — read-only protection telemetry over a rolling window (ACCESS_ADMIN). KPIs, a daily
 * activity chart, per-entity findings, an enforce-vs-shadow comparison, a sortable rules table, and a
 * shadow-readiness view gated on the saved `enforceableGreen` quality set. No confidence numbers or
 * per-language breakdowns are invented — only what the contract provides.
 */
export function InsightPanel(_props: InsightPanelProps) {
  const [days, setDays] = useState<InsightDays>(30);
  const [entityMetric, setEntityMetric] = useState<EntityMetric>('requests');
  const [engineFilter, setEngineFilter] = useState<EngineFilter>('all');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [sortKey, setSortKey] = useState<RuleSortKey>('requestActivations');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, isError, error } = useQuery(vardeVernInsightQueryOptions(days));
  const { data: vern } = useQuery(vardeVernQueryOptions);

  const greenLanguages = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const green of vern?.enforceableGreen ?? []) {
      const langs = map.get(green.entity) ?? [];
      langs.push(green.language);
      map.set(green.entity, langs);
    }
    return map;
  }, [vern?.enforceableGreen]);

  const entities = data?.entities ?? [];
  const rules = data?.rules ?? [];

  const entityBars: HorizontalBarRow[] = useMemo(
    () =>
      entities.map((entity) => ({
        label: entityDisplayName(entity.piiType),
        value:
          entityMetric === 'requests'
            ? entity.enforceRequests + entity.shadowRequests
            : entity.enforceSpans + entity.shadowSpans,
      })),
    [entities, entityMetric],
  );

  const stackedData: StackedBarRow[] = useMemo(
    () =>
      entities.map((entity) => ({
        label: entityDisplayName(entity.piiType),
        enforce: entity.enforceSpans,
        shadow: entity.shadowSpans,
      })),
    [entities],
  );

  const sortedRules = useMemo(() => {
    const filtered = rules.filter(
      (rule) =>
        (engineFilter === 'all' || rule.source === engineFilter) &&
        (modeFilter === 'all' || rule.mode === modeFilter),
    );
    return [...filtered].sort((a, b) => {
      const av = ruleSortValue(a, sortKey);
      const bv = ruleSortValue(b, sortKey);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rules, engineFilter, modeFilter, sortKey, sortDir]);

  if (isLoading || !data) {
    return isError ? (
      <EmptyState
        message={error instanceof Error ? error.message : 'Failed to load Varde Vern insight.'}
      />
    ) : (
      <LoadingState />
    );
  }

  if (data.status !== 'ok' || !data.kpis) {
    return <EmptyState message={stateMessage(data.status)} />;
  }

  const { kpis } = data;

  const onTimeframe = (value: string) => {
    const next = Number(value);
    if (next === 7 || next === 14 || next === 30) setDays(next);
  };

  const onSort = (key: RuleSortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'label' || key === 'source' || key === 'mode' ? 'asc' : 'desc');
  };

  const sortHeader = (label: string, key: RuleSortKey) => {
    const active = sortKey === key;
    const iconName = sortIcon(active, sortDir);
    return (
      <th
        scope="col"
        aria-sort={sortAria(active, sortDir)}
        className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)"
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            'inline-flex items-center gap-1 font-medium hover:text-(--cui-color-text-default)',
            active ? 'text-(--cui-color-text-default)' : 'text-(--cui-color-text-muted)',
          )}
        >
          {label}
          <span aria-hidden="true" className={active ? 'opacity-100' : 'opacity-40'}>
            <Icon name={iconName} size="sm" />
          </span>
        </button>
      </th>
    );
  };

  const shadowEntities = entities.filter((entity) => entity.shadowSpans > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--cui-color-text-muted)">
          What Varde Vern protected and would protect, over the selected window.
          {data.window.since && (
            <span className="ml-1">
              Since {new Date(data.window.since).toLocaleDateString('en-US')}.
            </span>
          )}
        </p>
        <div className="w-44">
          <SelectField
            id="insight-timeframe"
            aria-label="Timeframe"
            value={String(days)}
            options={TIMEFRAME_OPTIONS}
            onChange={onTimeframe}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Requests inspected" value={formatCount(kpis.requestsInspected)} />
        <KpiCard
          label="With findings"
          value={formatCount(kpis.requestsWithFindings)}
          hint={`${percent(kpis.requestsWithFindings, kpis.requestsInspected)}% of inspected`}
        />
        <KpiCard
          label="Protected"
          value={formatCount(kpis.protectedSpans)}
          hint="spans masked or blocked"
        />
        <KpiCard label="Shadow" value={formatCount(kpis.shadowSpans)} hint="spans measured only" />
      </div>

      <Section
        title="Protection activity"
        description="Protected, would-be-protected and blocked spans per day, with inspected requests overlaid."
      >
        {data.series.length === 0 ? (
          <p className="py-6 text-center text-sm text-(--cui-color-text-muted)">
            No protection activity in this window.
          </p>
        ) : (
          <TimeSeriesBars data={data.series} />
        )}
      </Section>

      <Section
        title="Findings by entity"
        description="The data types Varde Vern acted on across the window."
      >
        <div className="mb-3 w-56">
          <SelectField
            id="insight-entity-metric"
            aria-label="Entity metric"
            value={entityMetric}
            options={METRIC_OPTIONS}
            onChange={(v) => setEntityMetric(v === 'spans' ? 'spans' : 'requests')}
          />
        </div>
        {entityBars.length === 0 ? (
          <p className="py-6 text-center text-sm text-(--cui-color-text-muted)">
            No findings in this window.
          </p>
        ) : (
          <HorizontalBars data={entityBars} />
        )}
      </Section>

      <Section
        title="Enforce vs Shadow"
        description="Protected spans compared with spans that a shadow rule would have protected, per entity."
      >
        {stackedData.length === 0 ? (
          <p className="py-6 text-center text-sm text-(--cui-color-text-muted)">
            No entity activity in this window.
          </p>
        ) : (
          <>
            <StackedBar data={stackedData} />
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--cui-color-text-muted)">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="text-(--cui-color-accent-success)">
                  ■
                </span>
                Protected
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="text-(--cui-color-accent-info)">
                  ■
                </span>
                Would be protected
              </span>
            </p>
          </>
        )}
      </Section>

      <Section
        title="Rules"
        description="Per-rule activity. Sort by any column; inactive rules are marked."
      >
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="w-44">
            <SelectField
              id="insight-engine-filter"
              aria-label="Filter by engine"
              value={engineFilter}
              options={ENGINE_FILTER_OPTIONS}
              onChange={(v) => setEngineFilter(v as EngineFilter)}
            />
          </div>
          <div className="w-44">
            <SelectField
              id="insight-mode-filter"
              aria-label="Filter by mode"
              value={modeFilter}
              options={MODE_FILTER_OPTIONS}
              onChange={(v) => setModeFilter(v as ModeFilter)}
            />
          </div>
        </div>
        {sortedRules.length === 0 ? (
          <p className="py-6 text-center text-sm text-(--cui-color-text-muted)">
            No rules match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                  {sortHeader('Rule', 'label')}
                  {sortHeader('Engine', 'source')}
                  {sortHeader('Mode', 'mode')}
                  {sortHeader('Requests', 'requestActivations')}
                  {sortHeader('Findings', 'matchCount')}
                  {sortHeader('Rate', 'matchRate')}
                  {sortHeader('Min score', 'minConfidence')}
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((rule) => (
                  <tr
                    key={rule.ruleId}
                    className="border-b border-(--cui-color-stroke-default) last:border-b-0"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-(--cui-color-text-default)">
                          {rule.label}
                        </span>
                        {!rule.active && <Badge tone="inactive">inactive</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top text-(--cui-color-text-muted)">
                      {engineLabel(rule.source)}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <Badge tone={phaseTone(rule.mode)}>{rule.mode}</Badge>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {formatCount(rule.requestActivations)}
                    </td>
                    <td className="px-4 py-2.5 align-top">{formatCount(rule.matchCount)}</td>
                    <td className="px-4 py-2.5 align-top">{Math.round(rule.matchRate * 100)}%</td>
                    <td className="px-4 py-2.5 align-top">
                      {rule.source === 'ner' && rule.minConfidence != null
                        ? formatPresidioScore(rule.minConfidence)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Shadow readiness"
        description="Entities currently measured in shadow — how much they would protect, and whether their quality gate is approved for enforcement."
      >
        {shadowEntities.length === 0 ? (
          <p className="py-6 text-center text-sm text-(--cui-color-text-muted)">
            No entities are running in shadow in this window.
          </p>
        ) : (
          shadowEntities.map((entity) => {
            const langs = greenLanguages.get(entity.piiType) ?? [];
            const approved = langs.length > 0;
            return (
              <div
                key={entity.piiType}
                className="flex flex-col gap-1 border-b border-(--cui-color-stroke-default) py-3 last:border-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-(--cui-color-text-default)">
                    {entityDisplayName(entity.piiType)}
                  </span>
                  <Badge tone={approved ? 'protective' : 'inactive'}>
                    {approved ? `Approved for ${langs.join(', ')}` : 'Not yet approved'}
                  </Badge>
                </div>
                <p className="text-xs text-(--cui-color-text-muted)">
                  {formatCount(entity.shadowRequests)} requests would have been affected ·{' '}
                  {formatCount(entity.shadowSpans)} findings ·{' '}
                  {percent(entity.shadowRequests, kpis.requestsInspected)}% of inspected
                </p>
                <p className="text-xs text-(--cui-color-text-muted)">
                  Would mask {formatCount(entity.wouldMask)} · would block{' '}
                  {formatCount(entity.wouldBlock)}
                </p>
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}
