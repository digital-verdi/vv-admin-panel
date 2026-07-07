/**
 * Server functions for invite-only onboarding (Varde).
 *
 * Calls the LibreChat Admin API (/api/admin/invites) for list, create, revoke, and resend. A create
 * carries the sign-in method (`google` or `local`) that the invite authorizes; the backend enforces
 * one provider per invite and emails the link.
 */

import { z } from 'zod';
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import type * as t from '@/types';
import { apiFetch, extractApiError } from './utils/api';

export const getInvitesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ invites: t.Invite[] }> => {
    const response = await apiFetch('/api/admin/invites');
    if (!response.ok) {
      await extractApiError(response, 'Failed to fetch invites');
    }
    const json = (await response.json()) as { invites: t.Invite[] };
    return { invites: json.invites ?? [] };
  },
);

export const invitesQueryOptions = queryOptions({
  queryKey: ['invites'],
  queryFn: () => getInvitesFn().then((r) => r.invites),
  staleTime: 30_000,
});

export const createInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email(), provider: z.enum(['google', 'local']) }))
  .handler(async ({ data }): Promise<void> => {
    const response = await apiFetch('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ email: data.email, provider: data.provider }),
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to create invite');
    }
  });

export const revokeInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const response = await apiFetch(`/api/admin/invites/${encodeURIComponent(data.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      await extractApiError(response, 'Failed to revoke invite');
    }
  });

export const resendInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const response = await apiFetch(`/api/admin/invites/${encodeURIComponent(data.id)}/resend`, {
      method: 'POST',
    });
    if (!response.ok) {
      await extractApiError(response, 'Failed to resend invite');
    }
  });
