import { useState } from 'react';
import { Icon } from '@clickhouse/click-ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { invitesQueryOptions, revokeInviteFn, resendInviteFn } from '@/server';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';
import { useCapabilities } from '@/hooks';
import { CreateInviteDialog } from './CreateInviteDialog';
import { SystemCapabilities } from '@/constants';

const STATUS_LABEL: Record<t.InviteStatus, string> = {
  pending: 'Pending',
  used: 'Used',
  expired: 'Expired',
};

export function InvitesPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_USERS);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: invites = [], isLoading } = useQuery(invitesQueryOptions);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['invites'] });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInviteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      notifySuccess('Invite revoked');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => resendInviteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      notifySuccess('Invite re-sent');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading) {
    return <LoadingState />;
  }

  const busy = revokeMutation.isPending || resendMutation.isPending;

  return (
    <div role="region" aria-label="Invites" className="flex flex-1 flex-col gap-6 overflow-auto p-6">
      <section aria-label="Invites list">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-(--cui-color-text-muted)">
            Invite users by email. A Google invite lets them sign in with Google; an email invite
            lets them set a password.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={!canManage}
            aria-disabled={!canManage || undefined}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-3 py-1.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">
              <Icon name="plus" size="xs" />
            </span>
            Invite user
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Email
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Method
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Expires
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr
                  key={invite.id}
                  className="border-b border-(--cui-color-stroke-default) last:border-0"
                >
                  <td className="px-4 py-3 text-(--cui-color-text-default)">{invite.email}</td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {invite.allowedProviders.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {STATUS_LABEL[invite.status]}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={!canManage || invite.status !== 'pending' || busy}
                        onClick={() => resendMutation.mutate(invite.id)}
                        className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() => revokeMutation.mutate(invite.id)}
                        className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-danger) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No invites yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CreateInviteDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
