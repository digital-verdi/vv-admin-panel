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
import { SystemCapabilities } from '@librechat/data-schemas/capabilities';
import type * as t from '@/types';
import { proxyFetch, extractProxyError } from './utils/proxyApi';
import { requireCapability } from './capabilities';

/** A group name/legacyName/id slug — lowercase alphanumerics with single `-`/`_` separators. Sent verbatim
 *  as `model` to the proxy + into LibreChat config, so it stays deterministic (no case/whitespace ambiguity). */
export const GROUP_NAME_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const MAX_MODELS_PER_GROUP = 3;
export const MAX_GROUPS = 24;
const MAX_REQUEST_TIMEOUT_MS = 600_000;

const MODEL_PROVIDERS: readonly t.ModelProvider[] = ['openrouter', 'mistral', 'mock'];

/**
 * Decode a UI composite model key `"<provider>:<model>"` into the proxy wire `ModelRef`. A value with no
 * recognized provider prefix (a custom id typed via the combobox) defaults to OpenRouter — always present,
 * the common case. Split on the FIRST `:` only (OpenRouter ids use `/`, so the model part is preserved).
 */
export function compositeToRef(composite: string): t.ModelRef {
  const i = composite.indexOf(':');
  if (i > 0) {
    const provider = composite.slice(0, i) as t.ModelProvider;
    if (MODEL_PROVIDERS.includes(provider)) return { provider, model: composite.slice(i + 1) };
  }
  return { provider: 'openrouter', model: composite };
}

/** Encode a proxy wire `ModelRef` as the UI composite key. */
export function refToComposite(ref: t.ModelRef): string {
  return `${ref.provider}:${ref.model}`;
}

/** The proxy wire shape for a routing group (routing v3): provider-explicit `ModelRef`s. */
interface WireGroup {
  id: string;
  name: string;
  models: t.ModelRef[];
  legacyNames: string[];
}
interface WireRouting {
  version: number;
  defaultGroupId: string;
  groups: WireGroup[];
}

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
  mistralKeyManaged: boolean;
  piiSecretsPresent: boolean;
  providerMode: t.LlmProviderMode;
  updatedAt: string | null;
  updatedBy: string | null;
  dbBacked: boolean;
}

interface RawProxyV2 extends RawProxyCommon {
  chatRouting: WireRouting;
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
    const wire = value as RawProxyV2;
    // The proxy sends provider-explicit ModelRefs; the UI works in composite `provider:model` keys.
    const groups: t.ChatModelGroup[] = wire.chatRouting.groups.map((group) => ({
      id: group.id,
      name: group.name,
      legacyNames: group.legacyNames,
      models: group.models.map(refToComposite),
    }));
    return {
      ...wire,
      chatRouting: { ...wire.chatRouting, groups },
      mistralKeyManaged: wire.mistralKeyManaged ?? false,
      proxyApiV2: true,
    };
  }
  // An old v1 proxy returns bare-string (OpenRouter) tier arrays → composite-tag them for the UI.
  const orRefs = (models: string[] | undefined): string[] =>
    (models ?? []).map((m) => `openrouter:${m}`);
  const groups: t.ChatModelGroup[] = [
    { id: 'premium', name: 'premium', models: orRefs(value.chatModelsPremium), legacyNames: [] },
    { id: 'standard', name: 'standard', models: orRefs(value.chatModelsStandard), legacyNames: [] },
    { id: 'basic', name: 'basic', models: orRefs(value.chatModelsBasic), legacyNames: [] },
  ];
  const { chatModelsPremium, chatModelsStandard, chatModelsBasic, ...common } = value as RawProxyV1;
  void chatModelsPremium;
  void chatModelsStandard;
  void chatModelsBasic;
  return {
    ...common,
    mistralKeyManaged: common.mistralKeyManaged ?? false,
    chatRouting: { version: 3, defaultGroupId: 'standard', groups },
    defaultGroup: { id: 'standard', name: 'standard' },
    configRevision: -1,
    proxyApiV2: false,
  };
}

export const getLlmProxyConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.LlmProxyConfig> => {
    // Server-side authz: proxyFetch carries the shared admin Bearer (no caller identity), so the ONLY
    // server-side gate on this privileged proxy action is here. The client capability check disables UI
    // only. READ_CONFIGS is implied by MANAGE_CONFIGS, so managers still pass.
    await requireCapability(SystemCapabilities.READ_CONFIGS);
    const response = await proxyFetch('/admin/config');
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load Varde Rute config');
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
    await requireCapability(SystemCapabilities.READ_CONFIGS);
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

export const getVardeVernFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.VardeVern> => {
    await requireCapability(SystemCapabilities.READ_CONFIGS);
    const response = await proxyFetch('/admin/varde-vern');
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load Varde Vern config');
    }
    return (await response.json()) as t.VardeVern;
  },
);

export const vardeVernQueryOptions = queryOptions({
  queryKey: ['varde-vern'],
  queryFn: () => getVardeVernFn(),
  staleTime: 15_000,
});

/** The Insight report windows the panel offers — validated server-side so a hand-crafted query cannot
 *  request an arbitrary (unbounded) range from the proxy. Defaults to 30 when omitted. */
const insightInputSchema = z.object({
  days: z
    .number()
    .int()
    .refine((d): d is 7 | 14 | 30 => d === 7 || d === 14 || d === 30, {
      message: 'days must be one of 7, 14, or 30',
    })
    .default(30),
});

export const getVardeVernInsightFn = createServerFn({ method: 'GET' })
  .inputValidator(insightInputSchema)
  .handler(async ({ data }): Promise<t.VardeVernInsight> => {
    // Reads are ACCESS_ADMIN — every admin may see protection telemetry, not only config managers.
    await requireCapability(SystemCapabilities.ACCESS_ADMIN);
    const response = await proxyFetch(`/admin/varde-vern/insight?days=${data.days}`);
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load Varde Vern insight');
    }
    return (await response.json()) as t.VardeVernInsight;
  });

export const vardeVernInsightQueryOptions = (days: number) =>
  queryOptions({
    queryKey: ['varde-vern-insight', days],
    queryFn: () => getVardeVernInsightFn({ data: { days } }),
    staleTime: 15_000,
  });

const vernActionSchema = z.enum(['block', 'enforce', 'shadow', 'allow']);
const saveVardeVernSchema = z.object({
  expectedRevision: z.number().int().min(0),
  policy: z.object({
    version: z.number().int().positive(),
    defaultAction: vernActionSchema,
    entities: z.record(
      z.string().min(1),
      z.object({
        action: vernActionSchema,
        requiredEngines: z.array(z.string().min(1)),
        minConfidence: z.number().min(0).max(1).optional(),
        // BLOCKER-5: per-language enforce approvals (the språk-gate). Without this the Zod record STRIPS
        // `enforceLanguages`, so a semantic enforce can never be saved (the proxy 400s without it).
        enforceLanguages: z.array(z.string().min(1)).optional(),
      }),
    ),
  }),
  rollout: z.object({
    version: z.literal(1),
    engines: z.array(
      z.object({
        engineId: z.string().min(1),
        status: z.enum(['disabled', 'optional', 'required']),
        rolloutPhase: z.enum(['off', 'shadow', 'enforce']),
        enforceAllowed: z.boolean(),
      }),
    ),
  }),
});

// The native Presidio test studio: analyze a SYNTHETIC sample. The proxy response carries only
// offsets/labels/scores (never the matched substring); nothing is persisted. Server-only (admin Bearer).
const presidioTestSchema = z.object({
  text: z.string().min(1).max(10_000),
  language: z.string().min(1).optional(),
  entities: z.array(z.string().min(1)).optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
});

export const testPresidioFn = createServerFn({ method: 'POST' })
  .inputValidator(presidioTestSchema)
  .handler(async ({ data }): Promise<t.PresidioTestResult> => {
    // Analyzing text against the live analyzer is a privileged, config-adjacent action → MANAGE_CONFIGS.
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await proxyFetch('/admin/varde-vern/presidio/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractProxyError(response, 'Presidio test failed');
    }
    return (await response.json()) as t.PresidioTestResult;
  });

export const refreshPresidioFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<t.PresidioStatus> => {
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await proxyFetch('/admin/varde-vern/presidio/refresh', { method: 'POST' });
    if (!response.ok) {
      await extractProxyError(response, 'Presidio refresh failed');
    }
    return (await response.json()) as t.PresidioStatus;
  },
);

export const saveVardeVernFn = createServerFn({ method: 'POST' })
  .inputValidator(saveVardeVernSchema)
  .handler(async ({ data }): Promise<t.SaveVardeVernResult> => {
    // Overwrites the ACTIVE Varde Vern PII policy (incl. regex-enforced entities live in prod) → MANAGE_CONFIGS.
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    const response = await proxyFetch('/admin/varde-vern', {
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
      await extractProxyError(response, 'Failed to save Varde Vern config');
    }
    const body = (await response.json().catch(() => ({}))) as { configRevision?: number };
    return {
      status: 'ok',
      configRevision: typeof body.configRevision === 'number' ? body.configRevision : -1,
    };
  });

export const saveLlmProxyConfigFn = createServerFn({ method: 'POST' })
  .inputValidator(saveInputSchema)
  .handler(async ({ data }): Promise<t.SaveLlmProxyResult> => {
    // Overwrites the live chat-routing config → MANAGE_CONFIGS (closes the same pre-existing gap).
    await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
    // Convert the UI composite `provider:model` keys to provider-explicit ModelRefs + stamp routing v3
    // (the proxy's PUT requires version 3). Everything else passes through unchanged.
    const chatRouting: WireRouting = {
      version: 3,
      defaultGroupId: data.chatRouting.defaultGroupId,
      groups: data.chatRouting.groups.map((group) => ({
        id: group.id,
        name: group.name,
        legacyNames: group.legacyNames,
        models: group.models.map(compositeToRef),
      })),
    };
    const response = await proxyFetch('/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ ...data, chatRouting }),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      if ((body as { error?: { code?: string } }).error?.code === 'CONFIG_VERSION_MISMATCH') {
        return { status: 'version-mismatch' };
      }
    }
    if (!response.ok) {
      await extractProxyError(response, 'Failed to save Varde Rute config');
    }
    const body = (await response.json().catch(() => ({}))) as { configRevision?: number };
    return {
      status: 'ok',
      configRevision: typeof body.configRevision === 'number' ? body.configRevision : -1,
    };
  });
