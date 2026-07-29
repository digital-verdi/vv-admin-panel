import { useState } from 'react';
import { Button, IconButton, TextField, Switch } from '@clickhouse/click-ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import {
  termRulesQueryOptions,
  vardeVernCapabilitiesQueryOptions,
  createTermRuleFn,
  setTermRuleEnabledFn,
  deleteTermRuleFn,
} from '@/server';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';
import { Section, Badge } from './ui';

const ALL = 'ALL';

function languageLabel(caps: t.VardeVernCapabilities | undefined, code: string | null): string {
  if (!code) return '';
  return caps?.languages.find((l) => l.code === code)?.displayName ?? code;
}

function actionLabel(action: t.TermRuleAction): string {
  return action === 'FORCE_MASK' ? 'Always mask' : 'Never mask';
}

function routingActionLabel(action: t.TermRuleRoutingAction): string {
  if (action === 'REQUIRE_EU') return 'Require EU processing';
  if (action === 'RECOMMEND_EU') return 'Recommend EU processing';
  return 'No routing';
}

interface RowProps {
  rule: t.VardeVernTermRule;
  caps: t.VardeVernCapabilities | undefined;
  canManage: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}

function TermRuleRow({ rule, caps, canManage, onToggle, onDelete, busy }: RowProps) {
  const scope =
    rule.languageScope === 'ALL' ? 'All languages' : languageLabel(caps, rule.languageCode);
  return (
    <div className="flex items-center gap-3 border-t border-(--cui-color-stroke-default) py-2 text-sm">
      <span className="flex-1 truncate">
        <span className="font-medium text-(--cui-color-title-default)">{rule.term}</span>
        <span className="ml-2 text-xs text-(--cui-color-text-muted)">{scope}</span>
      </span>
      {rule.createdBy ? (
        <span className="text-xs text-(--cui-color-text-muted)">by {rule.createdBy}</span>
      ) : null}
      <Switch
        checked={rule.enabled}
        disabled={!canManage || busy}
        onCheckedChange={() => onToggle(rule.id, !rule.enabled)}
        aria-label={`${rule.enabled ? 'Disable' : 'Enable'} the rule for ${rule.term}`}
      />
      <IconButton
        icon="trash"
        type="ghost"
        disabled={!canManage || busy}
        onClick={() => onDelete(rule.id)}
        aria-label={`Delete the rule for ${rule.term}`}
      />
    </div>
  );
}

export interface TermRulesPanelProps {
  /** MANAGE_CONFIGS — create/toggle/delete call the privileged proxy admin API (server-side is the real
   *  gate; the client mirrors it). Defaults to false (least privilege). */
  canManage?: boolean;
}

/**
 * Global (organization-wide) Varde Vern term rules (ADR 0028): words/phrases that must ALWAYS be masked
 * (FORCE_MASK) or must NEVER be masked (DO_NOT_MASK), scoped to all languages or one supported language.
 * The language dropdown is built from the authoritative capabilities catalog — never a hardcoded list.
 */
export function TermRulesPanel({ canManage = false }: TermRulesPanelProps) {
  const queryClient = useQueryClient();
  const { data: rulesData, isLoading, isError } = useQuery(termRulesQueryOptions);
  const { data: caps } = useQuery(vardeVernCapabilitiesQueryOptions);

  const [action, setAction] = useState<t.TermRuleAction>('FORCE_MASK');
  const [routingAction, setRoutingAction] = useState<t.TermRuleRoutingAction>('NONE');
  const [scope, setScope] = useState<string>(ALL);
  const [term, setTerm] = useState('');
  // EU-routing axis (ADR 0029). Shown only when the proxy advertises it (an older proxy omits it).
  const routingActions = caps?.termRuleRoutingActions;
  const showRouting = Array.isArray(routingActions) && routingActions.length > 1;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: termRulesQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: (input: t.CreateTermRuleInput) => createTermRuleFn({ data: input }),
    onSuccess: () => {
      setTerm('');
      notifySuccess('Term rule added');
      invalidate();
    },
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to add the rule'),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => setTermRuleEnabledFn({ data: input }),
    onSuccess: invalidate,
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to update the rule'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTermRuleFn({ data: { id } }),
    onSuccess: () => {
      notifySuccess('Term rule deleted');
      invalidate();
    },
    onError: (err) => notifyError(err instanceof Error ? err.message : 'Failed to delete the rule'),
  });
  const busy = create.isPending || toggle.isPending || remove.isPending;

  const scopeOptions = (caps?.termRuleLanguageScopes ?? [{ type: 'ALL' as const }]).map((s) =>
    s.type === 'ALL'
      ? { value: ALL, label: 'All languages' }
      : { value: s.languageCode, label: languageLabel(caps, s.languageCode) },
  );

  const submit = () => {
    const trimmed = term.trim();
    if (trimmed.length === 0 || !canManage || busy) return;
    create.mutate({
      action,
      routingAction: showRouting && routingAction !== 'NONE' ? routingAction : undefined,
      languageScope: scope === ALL ? 'ALL' : 'LANGUAGE',
      languageCode: scope === ALL ? undefined : scope,
      term: trimmed,
    });
  };

  if (isLoading) return <LoadingState />;
  if (isError || !rulesData) {
    return <EmptyState message="Could not load the term rules." />;
  }
  const rules = rulesData.rules;

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Add a global term rule"
        description="Global rules apply to every user. Choose whether the word or phrase must always be masked or never be masked, and the language it applies to."
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-(--cui-color-text-muted)">Rule</span>
              <select
                value={action}
                disabled={!canManage}
                onChange={(e) => setAction(e.target.value as t.TermRuleAction)}
                className="rounded-md border border-(--cui-color-stroke-default) bg-transparent px-2 py-1.5 text-sm"
              >
                <option value="FORCE_MASK">Always mask</option>
                <option value="DO_NOT_MASK">Never mask</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-(--cui-color-text-muted)">Language</span>
              <select
                value={scope}
                disabled={!canManage}
                onChange={(e) => setScope(e.target.value)}
                className="rounded-md border border-(--cui-color-stroke-default) bg-transparent px-2 py-1.5 text-sm"
              >
                {scopeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {showRouting ? (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-(--cui-color-text-muted)">European processing (Varde Rute)</span>
              <select
                value={routingAction}
                disabled={!canManage}
                onChange={(e) => setRoutingAction(e.target.value as t.TermRuleRoutingAction)}
                className="rounded-md border border-(--cui-color-stroke-default) bg-transparent px-2 py-1.5 text-sm"
              >
                {(routingActions ?? ['NONE']).map((ra) => (
                  <option key={ra} value={ra}>
                    {routingActionLabel(ra)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <TextField
            label="Word or phrase"
            value={term}
            disabled={!canManage}
            maxLength={128}
            placeholder="e.g. a project name"
            onChange={(value) => setTerm(value)}
          />
          <div>
            <Button
              type="primary"
              label="Add rule"
              disabled={!canManage || term.trim().length === 0 || busy}
              onClick={submit}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Global term rules"
        description="These rules apply to every user, in addition to each user's own personal rules."
      >
        {rules.length === 0 ? (
          <p className="py-2 text-sm text-(--cui-color-text-muted)">No global term rules yet.</p>
        ) : (
          <div className="flex flex-col">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2">
                <Badge tone={rule.action === 'FORCE_MASK' ? 'protective' : 'inactive'}>
                  {actionLabel(rule.action)}
                </Badge>
                {rule.routingAction && rule.routingAction !== 'NONE' ? (
                  <Badge tone="protective">{routingActionLabel(rule.routingAction)}</Badge>
                ) : null}
                <div className="flex-1">
                  <TermRuleRow
                    rule={rule}
                    caps={caps}
                    canManage={canManage}
                    busy={busy}
                    onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
                    onDelete={(id) => remove.mutate(id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
