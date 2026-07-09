import { useState, useEffect } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as t from '@/types';
import {
  llmProxyConfigQueryOptions,
  llmProxyModelsQueryOptions,
  saveLlmProxyConfigFn,
} from '@/server';
import { TextField, NumberField, ToggleField, SelectField, ListField } from '@/components/configuration/fields';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';
import { useCapabilities } from '@/hooks';
import { SystemCapabilities } from '@/constants';
import { ModelTierField } from './ModelTierField';

const FAIL_MODE_OPTIONS: t.SelectOption[] = [
  { label: 'Closed — block on PII-engine failure', value: 'closed' },
  { label: 'Open — allow on PII-engine failure', value: 'open' },
];

/** A labelled config row: title + description on the left, the control on the right. */
function FieldRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-(--cui-color-stroke-default) py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 sm:max-w-80">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-(--cui-color-text-default)">
          {label}
        </label>
        {description && (
          <p className="mt-1 text-xs text-(--cui-color-text-muted)">{description}</p>
        )}
      </div>
      <div className="w-full sm:max-w-100">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-(--cui-color-stroke-default) p-4">
      <h2 className="mb-1 text-sm font-semibold text-(--cui-color-title-default)">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function LlmRouterPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_CONFIGS);

  const { data: config, isLoading, isError, error } = useQuery(llmProxyConfigQueryOptions);
  const { data: catalog = [] } = useQuery({ ...llmProxyModelsQueryOptions, retry: false });

  const [form, setForm] = useState<t.LlmProxyConfigInput | null>(null);

  useEffect(() => {
    if (config) {
      const { openRouterKeyManaged, piiSecretsPresent, providerMode, updatedAt, updatedBy, dbBacked, ...input } = config;
      void openRouterKeyManaged;
      void piiSecretsPresent;
      void providerMode;
      void updatedAt;
      void updatedBy;
      void dbBacked;
      setForm(input);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (input: t.LlmProxyConfigInput) => saveLlmProxyConfigFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-proxy-config'] });
      notifySuccess('LLM Router config saved and activated');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading || !form || !config) {
    return isError ? (
      <div className="p-6">
        <EmptyState message={error instanceof Error ? error.message : 'Failed to load LLM Router config.'} />
      </div>
    ) : (
      <LoadingState />
    );
  }

  const update = (patch: Partial<t.LlmProxyConfigInput>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  // Catalog options for the searchable model pickers, de-duplicated by id (the OpenRouter catalog can
  // surface the same id twice). May be empty in local/mock mode — the combobox still lets an admin type
  // a custom model id via allowCreateOption.
  const catalogOptions: t.SelectOption[] = Array.from(
    new Map(catalog.map((m) => [m.id, { label: m.name, value: m.id }])).values(),
  );

  const piiLocked = !config.piiSecretsPresent;
  const busy = saveMutation.isPending;

  const keyStatusLabel = (() => {
    if (config.providerMode === 'mock') return 'Mock provider (local) — no key';
    if (config.openRouterKeyManaged) return '•••••••••••• Managed in Secret Manager';
    return 'Not set';
  })();

  const tierRow = (
    label: string,
    key: 'chatModelsPremium' | 'chatModelsStandard' | 'chatModelsBasic',
  ) => (
    <FieldRow
      label={label}
      description="1 primary model + up to 2 fallbacks, in priority order."
      htmlFor={`llm-${key}`}
    >
      <ModelTierField
        id={`llm-${key}`}
        values={form[key]}
        onChange={(v) => update({ [key]: v } as Partial<t.LlmProxyConfigInput>)}
        options={catalogOptions}
        disabled={!canManage}
        aria-label={label}
      />
    </FieldRow>
  );

  return (
    <div role="region" aria-label="LLM Router" className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-(--cui-color-text-muted)">
          Configure the Varde LLM proxy (OpenRouter egress, model tiers, PII pseudonymization). Changes
          take effect live on save — no redeploy.
        </p>
        <span
          className={
            config.isActive
              ? 'shrink-0 rounded-full bg-(--cui-color-background-success) px-2.5 py-1 text-xs font-medium text-(--cui-color-text-success)'
              : 'shrink-0 rounded-full bg-(--cui-color-background-muted) px-2.5 py-1 text-xs font-medium text-(--cui-color-text-muted)'
          }
        >
          {config.isActive ? 'Active' : 'Not active'}
        </span>
      </div>

      <Section title="OpenRouter">
        <FieldRow
          label="API key"
          description="Managed in Secret Manager — never editable or displayed here."
        >
          <div className="flex items-center gap-2 rounded-md border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) px-3 py-2 text-sm text-(--cui-color-text-muted)">
            <Icon name="lock" size="xs" />
            <span>{keyStatusLabel}</span>
          </div>
        </FieldRow>
        <FieldRow label="Base URL" htmlFor="llm-base-url">
          <TextField
            id="llm-base-url"
            type="url"
            value={form.openrouterBaseUrl}
            onChange={(v) => update({ openrouterBaseUrl: v })}
            disabled={!canManage}
            aria-label="OpenRouter base URL"
          />
        </FieldRow>
        <FieldRow label="Referer" description="Optional HTTP-Referer sent to OpenRouter." htmlFor="llm-referer">
          <TextField
            id="llm-referer"
            type="url"
            value={form.openrouterReferer ?? ''}
            onChange={(v) => update({ openrouterReferer: v.trim() === '' ? null : v })}
            disabled={!canManage}
            aria-label="OpenRouter referer"
          />
        </FieldRow>
        <FieldRow label="Title" description="Optional X-Title sent to OpenRouter." htmlFor="llm-title">
          <TextField
            id="llm-title"
            value={form.openrouterTitle ?? ''}
            onChange={(v) => update({ openrouterTitle: v.trim() === '' ? null : v })}
            disabled={!canManage}
            aria-label="OpenRouter title"
          />
        </FieldRow>
      </Section>

      <Section title="Chat models">
        {tierRow('Premium', 'chatModelsPremium')}
        {tierRow('Standard', 'chatModelsStandard')}
        {tierRow('Basic', 'chatModelsBasic')}
      </Section>

      <Section title="Embeddings">
        <FieldRow label="Enable embeddings" htmlFor="llm-embeddings-enabled">
          <ToggleField
            id="llm-embeddings-enabled"
            checked={form.embeddingsEnabled}
            onChange={(v) => update({ embeddingsEnabled: v })}
            disabled={!canManage}
            aria-label="Enable embeddings"
          />
        </FieldRow>
        <FieldRow label="Allowed embedding models" htmlFor="llm-embedding-models">
          <ListField
            id="llm-embedding-models"
            values={form.allowedEmbeddingModels}
            onChange={(v) => update({ allowedEmbeddingModels: v })}
            placeholder="e.g. openai/text-embedding-3-small"
            itemLabel="model"
            disabled={!canManage || !form.embeddingsEnabled}
            aria-label="Allowed embedding models"
          />
        </FieldRow>
        <FieldRow label="Embedding dimensions" description="Optional default output dimensions." htmlFor="llm-embedding-dims">
          <NumberField
            id="llm-embedding-dims"
            value={form.defaultEmbeddingDimensions ?? undefined}
            onChange={(v) => update({ defaultEmbeddingDimensions: v ?? null })}
            min={1}
            disabled={!canManage || !form.embeddingsEnabled}
            aria-label="Embedding dimensions"
          />
        </FieldRow>
      </Section>

      <Section title="Requests & caching">
        <FieldRow label="Request timeout (ms)" htmlFor="llm-timeout">
          <NumberField
            id="llm-timeout"
            value={form.requestTimeoutMs}
            onChange={(v) => update({ requestTimeoutMs: v ?? form.requestTimeoutMs })}
            min={1}
            max={600_000}
            disabled={!canManage}
            aria-label="Request timeout in milliseconds"
          />
        </FieldRow>
        <FieldRow label="Prompt caching" description="Send provider cache-control breakpoints where supported." htmlFor="llm-prompt-cache">
          <ToggleField
            id="llm-prompt-cache"
            checked={form.promptCacheEnabled}
            onChange={(v) => update({ promptCacheEnabled: v })}
            disabled={!canManage}
            aria-label="Prompt caching"
          />
        </FieldRow>
      </Section>

      <Section title="PII pseudonymization">
        <FieldRow
          label="Enable PII pseudonymization"
          description={
            piiLocked
              ? 'Locked — the vault secrets (KEK / HKDF / database) are not configured in Secret Manager.'
              : 'Redact PII before egress and restore it in responses.'
          }
          htmlFor="llm-pii-enabled"
        >
          <ToggleField
            id="llm-pii-enabled"
            checked={form.piiEnabled && !piiLocked}
            onChange={(v) => update({ piiEnabled: v })}
            disabled={!canManage || piiLocked}
            aria-label="Enable PII pseudonymization"
          />
        </FieldRow>
        <FieldRow label="Failure mode" description="What to do when the PII engine is unavailable." htmlFor="llm-pii-failmode">
          <SelectField
            id="llm-pii-failmode"
            value={form.piiFailMode}
            options={FAIL_MODE_OPTIONS}
            onChange={(v) => update({ piiFailMode: v === 'open' ? 'open' : 'closed' })}
            disabled={!canManage || piiLocked}
            aria-label="PII failure mode"
          />
        </FieldRow>
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-(--cui-color-text-muted)">
          {config.updatedAt
            ? `Last saved ${new Date(config.updatedAt).toLocaleString()}${config.updatedBy ? ` by ${config.updatedBy}` : ''}`
            : 'Running on environment defaults (no saved config yet).'}
        </p>
        <button
          type="button"
          onClick={() =>
            saveMutation.mutate({
              ...form,
              isActive: true,
              // Drop any empty tier row (a seeded row the admin left unfilled) so the PUT can't fail the
              // proxy's `min(1)` element check and silently lose the whole save.
              chatModelsPremium: form.chatModelsPremium.filter(Boolean),
              chatModelsStandard: form.chatModelsStandard.filter(Boolean),
              chatModelsBasic: form.chatModelsBasic.filter(Boolean),
            })
          }
          disabled={!canManage || busy}
          aria-disabled={!canManage || busy || undefined}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-accent-default) px-4 py-2 text-sm font-medium text-(--cui-color-text-on-primary) transition-colors hover:bg-(--cui-color-background-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">
            <Icon name="check" size="xs" />
          </span>
          {busy ? 'Saving…' : 'Save and activate'}
        </button>
      </div>
    </div>
  );
}
