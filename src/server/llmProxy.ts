/**
 * Server functions for the LLM Router config page (Varde).
 *
 * Calls the vv-llm-proxy admin API (`/admin/config`, `/admin/models`) server-to-server via
 * {@link proxyFetch} (separate admin Bearer, never exposed to the browser). The proxy owns the config
 * store + hot-reload; the OpenRouter API key and other secrets are never read or written here.
 */

import { z } from 'zod';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import type * as t from '@/types';
import { proxyFetch, extractProxyError } from './utils/proxyApi';

/** A group name/legacyName/id slug — lowercase alphanumerics with single `-`/`_` separators. Sent verbatim
 *  as `model` to the proxy + into LibreChat config, so it stays deterministic (no case/whitespace ambiguity). */
export const GROUP_NAME_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const MAX_MODELS_PER_GROUP = 3;
export const MAX_GROUPS = 24;
const MAX_REQUEST_TIMEOUT_MS = 600_000;

/**
 * Pure cross-group invariant check shared by the PUT schema (below) and the UI (to disable + explain Save
 * before any network call). Returns human-readable errors — empty means valid.
 */
export function validateGroupsInvariants(
  groups: t.ChatModelGroup[],
  defaultGroupId: string,
): string[] {
  const errors: string[] = [];
  if (groups.length === 0) errors.push('At least one group is required.');
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const group of groups) {
    const name = group.name.trim();
    if (!GROUP_NAME_RE.test(name)) {
      errors.push(
        `"${name || '(empty)'}" is not a valid name — use lowercase letters, digits, - or _.`,
      );
    }
    if (ids.has(group.id)) errors.push('Two groups share the same id.');
    ids.add(group.id);
    for (const candidate of [name, ...group.legacyNames]) {
      if (names.has(candidate))
        errors.push(`The name "${candidate}" is used by more than one group.`);
      names.add(candidate);
    }
    const models = group.models.filter(Boolean);
    if (models.length < 1) errors.push(`Group "${name || '(unnamed)'}" needs at least one model.`);
    if (models.length > MAX_MODELS_PER_GROUP) {
      errors.push(`Group "${name}" has too many models (max ${MAX_MODELS_PER_GROUP}).`);
    }
  }
  if (!groups.some((group) => group.id === defaultGroupId))
    errors.push('A default group must be selected.');
  return errors;
}

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).regex(GROUP_NAME_RE),
  models: z.array(z.string().min(1)).min(1).max(MAX_MODELS_PER_GROUP),
  legacyNames: z.array(z.string().min(1).max(64).regex(GROUP_NAME_RE)),
});

const chatRoutingSchema = z
  .object({
    version: z.number().int().positive(),
    defaultGroupId: z.string().min(1),
    groups: z.array(groupSchema).min(1).max(MAX_GROUPS),
  })
  .superRefine((cfg, ctx) => {
    for (const message of validateGroupsInvariants(cfg.groups, cfg.defaultGroupId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });

const configInputSchema = z.object({
  isActive: z.boolean(),
  openrouterBaseUrl: z.string().url(),
  openrouterReferer: z.string().url().nullable(),
  openrouterTitle: z.string().min(1).nullable(),
  chatRouting: chatRoutingSchema,
  embeddingsEnabled: z.boolean(),
  allowedEmbeddingModels: z.array(z.string().min(1)),
  defaultEmbeddingDimensions: z.number().int().positive().nullable(),
  requestTimeoutMs: z.number().int().positive().max(MAX_REQUEST_TIMEOUT_MS),
  promptCacheEnabled: z.boolean(),
  piiEnabled: z.boolean(),
  piiFailMode: z.enum(['closed', 'open']),
});

const saveInputSchema = configInputSchema.extend({
  /** The optimistic-concurrency token from the last GET; the proxy 409s on a stale value. */
  expectedRevision: z.number().int().min(0),
});

interface RawProxyCommon {
  isActive: boolean;
  openrouterBaseUrl: string;
  openrouterReferer: string | null;
  openrouterTitle: string | null;
  embeddingsEnabled: boolean;
  allowedEmbeddingModels: string[];
  defaultEmbeddingDimensions: number | null;
  requestTimeoutMs: number;
  promptCacheEnabled: boolean;
  piiEnabled: boolean;
  piiFailMode: t.PiiFailMode;
  openRouterKeyManaged: boolean;
  piiSecretsPresent: boolean;
  providerMode: t.LlmProviderMode;
  updatedAt: string | null;
  updatedBy: string | null;
  dbBacked: boolean;
}

interface RawProxyV2 extends RawProxyCommon {
  chatRouting: t.ChatRoutingConfig;
  defaultGroup: { id: string; name: string };
  configRevision: number;
}

interface RawProxyV1 extends RawProxyCommon {
  chatModelsPremium: string[];
  chatModelsStandard: string[];
  chatModelsBasic: string[];
}

/**
 * Normalize the proxy's GET response. A v2 proxy returns `chatRouting` + `configRevision` → `proxyApiV2`.
 * An old v1 proxy returns the three static tier arrays → they are mapped into read-only pseudo-groups so
 * the page still renders the current routing (with `proxyApiV2: false` disabling dynamic saves).
 */
export function normalizeProxyConfig(raw: unknown): t.LlmProxyConfig {
  const value = raw as Partial<RawProxyV2 & RawProxyV1>;
  if (value.chatRouting && typeof value.configRevision === 'number') {
    return { ...(value as RawProxyV2), proxyApiV2: true };
  }
  const groups: t.ChatModelGroup[] = [
    { id: 'premium', name: 'premium', models: value.chatModelsPremium ?? [], legacyNames: [] },
    { id: 'standard', name: 'standard', models: value.chatModelsStandard ?? [], legacyNames: [] },
    { id: 'basic', name: 'basic', models: value.chatModelsBasic ?? [], legacyNames: [] },
  ];
  const { chatModelsPremium, chatModelsStandard, chatModelsBasic, ...common } = value as RawProxyV1;
  void chatModelsPremium;
  void chatModelsStandard;
  void chatModelsBasic;
  return {
    ...common,
    chatRouting: { version: 2, defaultGroupId: 'standard', groups },
    defaultGroup: { id: 'standard', name: 'standard' },
    configRevision: -1,
    proxyApiV2: false,
  };
}

export const getLlmProxyConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.LlmProxyConfig> => {
    const response = await proxyFetch('/admin/config');
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load LLM Router config');
    }
    return normalizeProxyConfig(await response.json());
  },
);

export const llmProxyConfigQueryOptions = queryOptions({
  queryKey: ['llm-proxy-config'],
  queryFn: () => getLlmProxyConfigFn(),
  staleTime: 15_000,
});

export const getLlmProxyModelsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ models: t.LlmProxyModel[] }> => {
    const response = await proxyFetch('/admin/models');
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load the model catalog');
    }
    const json = (await response.json()) as { data?: t.LlmProxyModel[] };
    return { models: json.data ?? [] };
  },
);

export const llmProxyModelsQueryOptions = queryOptions({
  queryKey: ['llm-proxy-models'],
  queryFn: () => getLlmProxyModelsFn().then((r) => r.models),
  staleTime: 300_000,
});

export const saveLlmProxyConfigFn = createServerFn({ method: 'POST' })
  .inputValidator(saveInputSchema)
  .handler(async ({ data }): Promise<t.SaveLlmProxyResult> => {
    const response = await proxyFetch('/admin/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      if ((body as { error?: { code?: string } }).error?.code === 'CONFIG_VERSION_MISMATCH') {
        return { status: 'version-mismatch' };
      }
    }
    if (!response.ok) {
      await extractProxyError(response, 'Failed to save LLM Router config');
    }
    const body = (await response.json().catch(() => ({}))) as { configRevision?: number };
    return {
      status: 'ok',
      configRevision: typeof body.configRevision === 'number' ? body.configRevision : -1,
    };
  });
