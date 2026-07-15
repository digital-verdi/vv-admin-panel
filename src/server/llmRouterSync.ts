/**
 * Keep the LibreChat base config in sync with the vv-llm-proxy chat-model groups.
 *
 * Because a group `name` is sent verbatim as the OpenAI `model`, renaming/adding/removing a group must
 * also update the LibreChat `Varde` custom endpoint (`models.default` + `titleModel`) and every model
 * spec whose `preset.endpoint === "Varde"` (esp. the default spec → the default group's name). This
 * module computes that impact **purely** (reused by the UI preview) and writes it via the existing
 * `saveBaseConfigFn` field patch. Save ordering is proxy-first (the caller saves the proxy config, which
 * accepts both current + legacy names, before syncing here) so a failed sync never breaks routing.
 */

import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import type * as t from '@/types';
import { getBaseConfigFn, saveBaseConfigFn, toConfigArraySource } from './config';

const VARDE_ENDPOINT_NAME = 'Varde';

type ConfigObject = Record<string, t.ConfigValue>;

function asObject(value: unknown): ConfigObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ConfigObject)
    : undefined;
}

function modelName(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  const obj = asObject(entry);
  return obj && typeof obj.name === 'string' ? obj.name : null;
}

function readModelsDefault(endpoint: ConfigObject): string[] {
  const models = asObject(endpoint.models);
  const list = Array.isArray(models?.default) ? models.default : [];
  return list.map(modelName).filter((name): name is string => name != null);
}

/**
 * Locate the `Varde` custom endpoint in the base config by name. `endpoints.custom` may be a real array
 * or an index-keyed object, so it is normalized first. Zero matches → `missing`; more than one → `ambiguous`
 * (never guess — an admin must resolve it in the Configuration editor).
 */
export function findVardeEndpoint(
  baseConfig: ConfigObject,
): { index: number; endpoint: ConfigObject } | { error: t.VardeSyncError } {
  const endpoints = asObject(baseConfig.endpoints);
  const custom = toConfigArraySource(endpoints?.custom) ?? [];
  const matches: Array<{ index: number; endpoint: ConfigObject }> = [];
  for (let i = 0; i < custom.length; i += 1) {
    const endpoint = asObject(custom[i]);
    if (endpoint && endpoint.name === VARDE_ENDPOINT_NAME) matches.push({ index: i, endpoint });
  }
  if (matches.length === 0) return { error: 'missing' };
  if (matches.length > 1) return { error: 'ambiguous' };
  return matches[0]!;
}

/** The Varde-relevant fragments used for best-effort optimistic-lock (drift) detection. */
export function extractVardeFragments(baseConfig: ConfigObject): t.VardeFragments {
  const found = findVardeEndpoint(baseConfig);
  const modelsDefault = 'error' in found ? [] : readModelsDefault(found.endpoint);
  const titleModel =
    'error' in found || typeof found.endpoint.titleModel !== 'string'
      ? null
      : found.endpoint.titleModel;
  const specList = toConfigArraySource(asObject(baseConfig.modelSpecs)?.list) ?? [];
  const specModels: t.VardeFragments['specModels'] = [];
  for (let i = 0; i < specList.length; i += 1) {
    const preset = asObject(asObject(specList[i])?.preset);
    if (preset && preset.endpoint === VARDE_ENDPOINT_NAME) {
      specModels.push({ index: i, model: typeof preset.model === 'string' ? preset.model : null });
    }
  }
  return { modelsDefault, titleModel, specModels };
}

function fragmentsEqual(a: t.VardeFragments, b: t.VardeFragments): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compute the LibreChat impact of a routing change: `models.default` = the group names in order,
 * `titleModel` = the default group's name, and each Varde spec's `preset.model` rewritten via the
 * name/legacyName map (the default spec forced to the default group's name). Emits only whole-element
 * entries whose value actually changed; specs pointing at a name that maps to no group are surfaced as
 * `unresolvedSpecs` (not silently rewritten).
 */
export function computeVardeSyncPlan(
  baseConfig: ConfigObject,
  groups: t.ChatModelGroup[],
  defaultGroupId: string,
): t.VardeSyncPlan | { error: t.VardeSyncError } {
  const found = findVardeEndpoint(baseConfig);
  if ('error' in found) return found;
  const { index: endpointIndex, endpoint } = found;

  const byName = new Map<string, t.ChatModelGroup>();
  for (const group of groups) byName.set(group.name, group);
  for (const group of groups)
    for (const legacy of group.legacyNames) if (!byName.has(legacy)) byName.set(legacy, group);
  const defaultGroup = groups.find((group) => group.id === defaultGroupId) ?? groups[0];

  const beforeModelsDefault = readModelsDefault(endpoint);
  const afterModelsDefault = groups.map((group) => group.name);
  const beforeTitleModel =
    typeof endpoint.titleModel === 'string' ? endpoint.titleModel : undefined;
  const afterTitleModel = defaultGroup?.name ?? beforeTitleModel ?? '';

  const entries: t.VardeSyncPlan['entries'] = [];
  const modelsDefaultChanged =
    JSON.stringify(beforeModelsDefault) !== JSON.stringify(afterModelsDefault);
  if (modelsDefaultChanged || beforeTitleModel !== afterTitleModel) {
    const models = { ...(asObject(endpoint.models) ?? {}), default: afterModelsDefault };
    entries.push({
      fieldPath: `endpoints.custom.${endpointIndex}`,
      value: { ...endpoint, models, titleModel: afterTitleModel },
    });
  }

  const specList = toConfigArraySource(asObject(baseConfig.modelSpecs)?.list) ?? [];
  const specs: t.VardeSyncPlan['diff']['specs'] = [];
  const unresolvedSpecs: t.VardeSyncPlan['unresolvedSpecs'] = [];
  for (let i = 0; i < specList.length; i += 1) {
    const spec = asObject(specList[i]);
    const preset = spec && asObject(spec.preset);
    if (!spec || !preset || preset.endpoint !== VARDE_ENDPOINT_NAME) continue;
    const specName = typeof spec.name === 'string' ? spec.name : `spec ${i}`;
    const currentModel = typeof preset.model === 'string' ? preset.model : null;
    let resolved: string | undefined;
    if (spec.default === true) {
      resolved = defaultGroup?.name;
    } else if (currentModel != null) {
      resolved = byName.get(currentModel)?.name;
    }
    if (resolved == null) {
      if (currentModel != null)
        unresolvedSpecs.push({ index: i, name: specName, model: currentModel });
      continue;
    }
    if (resolved !== currentModel) {
      specs.push({ index: i, name: specName, before: currentModel, after: resolved });
      entries.push({
        fieldPath: `modelSpecs.list.${i}`,
        value: { ...spec, preset: { ...preset, model: resolved } },
      });
    }
  }

  return {
    endpointIndex,
    entries,
    diff: {
      modelsDefault: { before: beforeModelsDefault, after: afterModelsDefault },
      titleModel: { before: beforeTitleModel, after: afterTitleModel },
      specs,
    },
    unresolvedSpecs,
  };
}

const groupInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  models: z.array(z.string()),
  legacyNames: z.array(z.string()),
});

const fragmentsSchema = z.object({
  modelsDefault: z.array(z.string()),
  titleModel: z.string().nullable(),
  specModels: z.array(z.object({ index: z.number().int(), model: z.string().nullable() })),
});

export const syncLibreChatForVardeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      groups: z.array(groupInputSchema).min(1),
      defaultGroupId: z.string().min(1),
      expectedFragments: fragmentsSchema,
    }),
  )
  .handler(async ({ data }): Promise<t.SyncLibreChatResult> => {
    const base = await getBaseConfigFn();
    const baseConfig = base.config as ConfigObject;
    // Best-effort optimistic lock: the LibreChat PATCH is last-write-wins, so re-read and compare the exact
    // fragments the admin previewed right before writing; abort on drift rather than clobber a concurrent edit.
    if (!fragmentsEqual(extractVardeFragments(baseConfig), data.expectedFragments)) {
      return { status: 'drift' };
    }
    const plan = computeVardeSyncPlan(baseConfig, data.groups, data.defaultGroupId);
    if ('error' in plan) {
      return { status: plan.error === 'missing' ? 'endpoint-missing' : 'endpoint-ambiguous' };
    }
    if (plan.entries.length === 0) return { status: 'noop', unresolvedSpecs: plan.unresolvedSpecs };
    await saveBaseConfigFn({ data: { entries: plan.entries } });
    return { status: 'ok', unresolvedSpecs: plan.unresolvedSpecs };
  });
