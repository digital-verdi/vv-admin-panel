/**
 * Server functions for Demo Mode administration (Varde).
 *
 * Calls the LibreChat Admin API (/api/admin/demo/*, /api/admin/demo-links) for status, capacity
 * governance, and demo-link lifecycle — same host + session-Bearer auth as invites (apiFetch). The
 * capacity raise is optimistically locked: a stale expectedRevision (409) or a limit below already-used
 * starts (422) are surfaced as non-throwing discriminated results so the UI can react without an error
 * boundary. The status endpoint already returns the links, so the tab drives everything off one query.
 */

import { z } from 'zod';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import type * as t from '@/types';
import { apiFetch, extractApiError } from './utils/api';

export const getDemoStatusFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<t.DemoStatus> => {
    const response = await apiFetch('/api/admin/demo/status');
    if (!response.ok) {
      await extractApiError(response, 'Failed to load demo status');
    }
    return (await response.json()) as t.DemoStatus;
  },
);

export const demoStatusQueryOptions = queryOptions({
  queryKey: ['demo-status'],
  queryFn: () => getDemoStatusFn(),
  staleTime: 15_000,
  // Live-refresh so new demo sessions + capacity/link usage appear without a manual reload; paused when the
  // tab is hidden.
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
});

export const setSelfServeFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data }): Promise<t.DemoSelfServe> => {
    const response = await apiFetch('/api/admin/demo/self-serve', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to update self-serve setting');
    }
    const body = (await response.json()) as { enabled: boolean };
    return { enabled: Boolean(body.enabled), startsUsed: 0 };
  });

export const setDemoCapacityFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ newLimit: z.number().int().min(0), expectedRevision: z.number().int().min(0) }),
  )
  .handler(async ({ data }): Promise<t.SetDemoCapacityResult> => {
    const response = await apiFetch('/api/admin/demo/capacity', {
      method: 'POST',
      body: JSON.stringify({ ...data, confirm: true }),
    });
    if (response.status === 409) {
      return { status: 'version-mismatch' };
    }
    if (response.status === 422) {
      return { status: 'below-used' };
    }
    if (!response.ok) {
      await extractApiError(response, 'Failed to update demo capacity');
    }
    const body = (await response.json()) as { capacity: t.DemoCapacity };
    return { status: 'ok', capacity: body.capacity };
  });

export const createDemoLinkFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      description: z.string().optional(),
      maxStarts: z.number().int().min(1).nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<t.CreateDemoLinkResult> => {
    const response = await apiFetch('/api/admin/demo-links', {
      method: 'POST',
      body: JSON.stringify({
        description: data.description ?? '',
        maxStarts: data.maxStarts ?? null,
      }),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to create demo link');
    }
    return (await response.json()) as t.CreateDemoLinkResult;
  });

const idsInput = z.object({ ids: z.array(z.string()).min(1) });

export const revokeDemoLinksFn = createServerFn({ method: 'POST' })
  .inputValidator(idsInput)
  .handler(async ({ data }): Promise<t.DemoBulkResult> => {
    const response = await apiFetch('/api/admin/demo-links/bulk-revoke', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to revoke demo links');
    }
    return (await response.json()) as t.DemoBulkResult;
  });

export const deleteDemoLinksFn = createServerFn({ method: 'POST' })
  .inputValidator(idsInput)
  .handler(async ({ data }): Promise<t.DemoBulkResult> => {
    const response = await apiFetch('/api/admin/demo-links/bulk-delete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to delete demo links');
    }
    return (await response.json()) as t.DemoBulkResult;
  });

export const terminateDemoSessionsFn = createServerFn({ method: 'POST' })
  .inputValidator(idsInput)
  .handler(async ({ data }): Promise<t.DemoBulkResult> => {
    const response = await apiFetch('/api/admin/demo/sessions/terminate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to terminate demo sessions');
    }
    return (await response.json()) as t.DemoBulkResult;
  });

export const revokeDemoLinkFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const response = await apiFetch(`/api/admin/demo-links/${encodeURIComponent(data.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      await extractApiError(response, 'Failed to revoke demo link');
    }
  });
