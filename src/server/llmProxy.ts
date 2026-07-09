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

const MAX_MODELS_PER_TIER = 3;
const MAX_REQUEST_TIMEOUT_MS = 600_000;

const configInputSchema = z.object({
  isActive: z.boolean(),
  openrouterBaseUrl: z.string().url(),
  openrouterReferer: z.string().url().nullable(),
  openrouterTitle: z.string().min(1).nullable(),
  chatModelsPremium: z.array(z.string().min(1)).min(1).max(MAX_MODELS_PER_TIER),
  chatModelsStandard: z.array(z.string().min(1)).min(1).max(MAX_MODELS_PER_TIER),
  chatModelsBasic: z.array(z.string().min(1)).min(1).max(MAX_MODELS_PER_TIER),
  embeddingsEnabled: z.boolean(),
  allowedEmbeddingModels: z.array(z.string().min(1)),
  defaultEmbeddingDimensions: z.number().int().positive().nullable(),
  requestTimeoutMs: z.number().int().positive().max(MAX_REQUEST_TIMEOUT_MS),
  promptCacheEnabled: z.boolean(),
  piiEnabled: z.boolean(),
  piiFailMode: z.enum(['closed', 'open']),
});

export const getLlmProxyConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.LlmProxyConfig> => {
    const response = await proxyFetch('/admin/config');
    if (!response.ok) {
      await extractProxyError(response, 'Failed to load LLM Router config');
    }
    return (await response.json()) as t.LlmProxyConfig;
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
  .inputValidator(configInputSchema)
  .handler(async ({ data }): Promise<void> => {
    const response = await proxyFetch('/admin/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractProxyError(response, 'Failed to save LLM Router config');
    }
  });
