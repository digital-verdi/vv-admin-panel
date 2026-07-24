import { useState, useEffect } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as t from '@/types';
import {
  llmProxyConfigQueryOptions,
  llmProxyModelsQueryOptions,
  saveLlmProxyConfigFn,
  syncLibreChatForVardeFn,
  validateGroupsInvariants,
  extractVardeFragments,
  baseConfigOptions,
} from '@/server';
import {
  TextField,
  NumberField,
  ToggleField,
  SelectField,
  ListField,
} from '@/components/configuration/fields';
import { EmptyState, LoadingState, FormDialog } from '@/components/shared';
import { ChatModelGroupsField } from './ChatModelGroupsField';
import { SyncImpactPreview } from './SyncImpactPreview';
import { notifySuccess, notifyError } from '@/utils';
import { buildModelOptions } from './operations';
import { SystemCapabilities } from '@/constants';
import { useCapabilities } from '@/hooks';

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
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-(--cui-color-text-default)"
        >
          {label}
        </label>
        {description && <p className="mt-1 text-xs text-(--cui-color-text-muted)">{description}</p>}
      </div>
      <div className="w-full sm:max-w-100">{children}</div>
    </div>
  );
}

function Section({
  title,
  level = 2,
  children,
}: {
  title: string;
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-(--cui-color-stroke-default) p-4"
    >
      <Heading className="mb-1 text-sm font-semibold text-(--cui-color-title-default)">
        {title}
      </Heading>
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
  const [busy, setBusy] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ message: string; retry?: () => void } | null>(
    null,
  );

  useEffect(() => {
    if (config) {
      const {
        openRouterKeyManaged,
        mistralKeyManaged,
        piiSecretsPresent,
        providerMode,
        configRevision,
        proxyApiV2,
        defaultGroup,
        updatedAt,
        updatedBy,
        dbBacked,
        ...input
      } = config;
      void openRouterKeyManaged;
      void mistralKeyManaged;
      void piiSecretsPresent;
      void providerMode;
      void configRevision;
      void proxyApiV2;
      void defaultGroup;
      void updatedAt;
      void updatedBy;
      void dbBacked;
      setForm(input);
    }
  }, [config]);

  if (isLoading || !form || !config) {
    return isError ? (
      <div className="p-6">
        <EmptyState
          message={error instanceof Error ? error.message : 'Failed to load Varde Rute config.'}
        />
      </div>
    ) : (
      <LoadingState />
    );
  }

  const update = (patch: Partial<t.LlmProxyConfigInput>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  // Catalog options for the searchable model pickers: both value AND label are the composite
  // `<provider>:<model>` key (routing v3), so options and the selected value render one consistent format.
  // Empty in local/mock mode — the combobox still lets an admin type a custom id via allowCreateOption.
  const catalogOptions = buildModelOptions(catalog);

  const piiLocked = !config.piiSecretsPresent;
  const proxyReadOnly = !config.proxyApiV2;
  const groupsDisabled = !canManage || proxyReadOnly;
  const invariantErrors = validateGroupsInvariants(
    form.chatRouting.groups,
    form.chatRouting.defaultGroupId,
  );
  const canSave = canManage && !proxyReadOnly && invariantErrors.length === 0 && !busy;

  const keyStatusLabel = (() => {
    if (config.providerMode === 'mock') return 'Mock provider (local) — no key';
    if (config.openRouterKeyManaged) return '•••••••••••• Managed in Secret Manager';
    return 'Not set';
  })();

  const mistralStatusLabel = (() => {
    if (config.providerMode === 'mock') return 'Mock provider (local) — no key';
    if (config.mistralKeyManaged) return '•••••••••••• Managed in Secret Manager';
    return 'Not configured — Mistral models are unavailable until the key is seeded';
  })();

  const runLibreChatSync = async (groups: t.ChatModelGroup[], defaultGroupId: string) => {
    const base = await queryClient.fetchQuery(baseConfigOptions);
    const expectedFragments = extractVardeFragments(base.config as Record<string, t.ConfigValue>);
    const res = await syncLibreChatForVardeFn({
      data: { groups, defaultGroupId, expectedFragments },
    });
    await queryClient.invalidateQueries({ queryKey: ['baseConfig'] });
    if (res.status === 'ok' || res.status === 'noop') {
      setSyncNotice(null);
      notifySuccess(
        res.unresolvedSpecs.length > 0
          ? 'Routing saved. Some model specs are unresolved — review the impact preview.'
          : 'Routing saved and LibreChat synced.',
      );
      return;
    }
    if (res.status === 'drift') {
      setSyncNotice({
        message:
          'Routing saved, but the LibreChat config changed since the preview. Retry the LibreChat sync.',
        retry: () => void retrySync(groups, defaultGroupId),
      });
      return;
    }
    setSyncNotice({
      message:
        res.status === 'endpoint-missing'
          ? 'Routing saved. No Varde (vv-llm-proxy) endpoint found in the LibreChat config — the LibreChat sync was skipped.'
          : 'Routing saved. Multiple “Varde” endpoints found — resolve the duplicate in the Configuration editor.',
    });
  };

  const retrySync = async (groups: t.ChatModelGroup[], defaultGroupId: string) => {
    setBusy(true);
    try {
      await runLibreChatSync(groups, defaultGroupId);
    } catch (err) {
      setSyncNotice({
        message: err instanceof Error ? err.message : 'LibreChat sync failed.',
        retry: () => void retrySync(groups, defaultGroupId),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    // Normalize: trim names + drop empty model rows so the proxy's per-group `min(1)` never trips.
    const groups = form.chatRouting.groups.map((g) => ({
      ...g,
      name: g.name.trim(),
      models: g.models.filter(Boolean),
    }));
    const chatRouting: t.ChatRoutingConfig = { ...form.chatRouting, groups };
    const errors = validateGroupsInvariants(groups, chatRouting.defaultGroupId);
    if (errors.length > 0) {
      notifyError(errors[0]!);
      return;
    }
    setBusy(true);
    setSyncNotice(null);
    try {
      // Proxy first: it accepts both current + legacy names, so a later LibreChat-sync failure never breaks routing.
      const proxyRes = await saveLlmProxyConfigFn({
        data: { ...form, chatRouting, isActive: true, expectedRevision: config.configRevision },
      });
      if (proxyRes.status === 'version-mismatch') {
        await queryClient.invalidateQueries({ queryKey: ['llm-proxy-config'] });
        setVersionConflict(true);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['llm-proxy-config'] });
      await runLibreChatSync(groups, chatRouting.defaultGroupId);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to save Varde Rute config');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Varde Rute"
      className="flex flex-1 flex-col gap-6 overflow-auto p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-(--cui-color-text-muted)">
          Configure Varde Rute — AI providers, chat-model routing and Varde Vern. Changes take
          effect live on save — no redeploy.
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

      {proxyReadOnly && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-(--cui-color-stroke-warning) bg-(--cui-color-background-warning) p-3 text-sm text-(--cui-color-text-warning)"
        >
          <Icon name="warning" size="sm" />
          <span>
            Proxy upgrade pending — this vv-llm-proxy still runs the legacy tier API. Dynamic
            chat-model groups are shown read-only until the proxy is upgraded to admin API v2.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-base font-medium text-(--cui-color-text-default)">AI Providers</h2>

        <Section title="OpenRouter" level={3}>
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
          <FieldRow
            label="Referer"
            description="Optional HTTP-Referer sent to OpenRouter."
            htmlFor="llm-referer"
          >
            <TextField
              id="llm-referer"
              type="url"
              value={form.openrouterReferer ?? ''}
              onChange={(v) => update({ openrouterReferer: v.trim() === '' ? null : v })}
              disabled={!canManage}
              aria-label="OpenRouter referer"
            />
          </FieldRow>
          <FieldRow
            label="Title"
            description="Optional X-Title sent to OpenRouter."
            htmlFor="llm-title"
          >
            <TextField
              id="llm-title"
              value={form.openrouterTitle ?? ''}
              onChange={(v) => update({ openrouterTitle: v.trim() === '' ? null : v })}
              disabled={!canManage}
              aria-label="OpenRouter title"
            />
          </FieldRow>
        </Section>

        <Section title="Mistral" level={3}>
          <FieldRow
            label="API key"
            description="Optional second provider. Managed in Secret Manager — never editable or displayed here. When configured, groups can route models tagged “mistral”."
          >
            <div className="flex items-center gap-2 rounded-md border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) px-3 py-2 text-sm text-(--cui-color-text-muted)">
              <Icon name={config.mistralKeyManaged ? 'lock' : 'warning'} size="xs" />
              <span>{mistralStatusLabel}</span>
            </div>
          </FieldRow>
        </Section>
      </div>

      <Section title="Chat model groups">
        <p className="mb-3 text-xs text-(--cui-color-text-muted)">
          Each group has an editable name (sent to the model as the selected “model”), 1 primary +
          up to 2 fallbacks, and optional legacy names kept routable after a rename. The default
          group drives LibreChat&apos;s title generation and default spec.
        </p>
        <ChatModelGroupsField
          value={form.chatRouting}
          options={catalogOptions}
          disabled={groupsDisabled}
          onChange={(chatRouting) => update({ chatRouting })}
        />
        {invariantErrors.length > 0 && !groupsDisabled && (
          <ul
            role="alert"
            className="mt-3 flex flex-col gap-1 text-xs text-(--cui-color-text-danger)"
          >
            {invariantErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <SyncImpactPreview chatRouting={form.chatRouting} />
        </div>
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
        <FieldRow
          label="Embedding dimensions"
          description="Optional default output dimensions."
          htmlFor="llm-embedding-dims"
        >
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
        <FieldRow
          label="Prompt caching"
          description="Send provider cache-control breakpoints where supported."
          htmlFor="llm-prompt-cache"
        >
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
        <FieldRow
          label="Failure mode"
          description="What to do when the PII engine is unavailable."
          htmlFor="llm-pii-failmode"
        >
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

      {syncNotice && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-(--cui-color-stroke-warning) bg-(--cui-color-background-warning) p-3 text-sm text-(--cui-color-text-warning)"
        >
          <span>{syncNotice.message}</span>
          {syncNotice.retry && (
            <button
              type="button"
              onClick={syncNotice.retry}
              disabled={busy}
              className="shrink-0 rounded-md border border-(--cui-color-stroke-default) px-3 py-1.5 text-xs font-medium hover:bg-(--cui-color-background-muted) disabled:opacity-50"
            >
              Retry LibreChat sync
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-(--cui-color-text-muted)">
          {config.updatedAt
            ? `Last saved ${new Date(config.updatedAt).toLocaleString()}${config.updatedBy ? ` by ${config.updatedBy}` : ''}`
            : 'Running on environment defaults (no saved config yet).'}
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          aria-disabled={!canSave || undefined}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-accent-default) px-4 py-2 text-sm font-medium text-(--cui-color-text-on-primary) transition-colors hover:bg-(--cui-color-background-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true">
            <Icon name="check" size="xs" />
          </span>
          {busy ? 'Saving…' : 'Save and activate'}
        </button>
      </div>

      <FormDialog
        open={versionConflict}
        title="Config changed elsewhere"
        submitLabel="OK"
        onSubmit={() => setVersionConflict(false)}
        onClose={() => setVersionConflict(false)}
      >
        <p className="text-sm text-(--cui-color-text-default)">
          The Varde Rute config was changed by another writer. We reloaded the latest version —
          review your changes and save again.
        </p>
      </FormDialog>
    </div>
  );
}
