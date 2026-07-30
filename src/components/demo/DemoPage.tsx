import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { demoStatusQueryOptions, revokeDemoLinkFn } from '@/server';
import { EmptyState, LoadingState } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';
import { useCapabilities } from '@/hooks';
import { SystemCapabilities } from '@/constants';
import { RaiseCapacityDialog } from './RaiseCapacityDialog';
import { CreateDemoLinkDialog } from './CreateDemoLinkDialog';

const LINK_STATUS_LABEL: Record<t.DemoLinkStatus, string> = {
  active: 'Active',
  revoked: 'Revoked',
  expired: 'Expired',
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-(--cui-color-stroke-default) px-4 py-3">
      <span className="text-xs text-(--cui-color-text-muted)">{label}</span>
      <span className="text-lg font-semibold text-(--cui-color-text-default)">{value}</span>
    </div>
  );
}

function hasConfigDrift(drift: t.DemoConfigDrift): boolean {
  if (drift == null) {
    return false;
  }
  if (Array.isArray(drift)) {
    return drift.length > 0;
  }
  return true;
}

export function DemoPage() {
  const queryClient = useQueryClient();
  const { hasCapability } = useCapabilities();
  const canManage = hasCapability(SystemCapabilities.MANAGE_USERS);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);

  const { data: status, isLoading } = useQuery(demoStatusQueryOptions);

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDemoLinkFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      notifySuccess('Demo link revoked');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading || !status) {
    return <LoadingState />;
  }

  const { capacity, profiles, links } = status;
  const driftDetected = hasConfigDrift(status.configDrift);

  return (
    <div
      role="region"
      aria-label="Demo Mode"
      className="flex flex-1 flex-col gap-6 overflow-auto p-6"
    >
      <section aria-label="Demo capacity">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-(--cui-color-text-muted)">
            Bounded, invite-free demo sessions. Global capacity is cumulative — cleanup never returns
            it — so raising it only adds headroom.
          </p>
          <button
            type="button"
            onClick={() => setCapacityOpen(true)}
            disabled={!canManage}
            aria-disabled={!canManage || undefined}
            className="shrink-0 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-3 py-1.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            Set capacity
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Capacity limit" value={capacity.limit} />
          <Stat label="Used" value={capacity.used} />
          <Stat label="Reserved (in-flight)" value={capacity.reservations} />
          <Stat label="Remaining" value={capacity.remaining} />
        </div>
      </section>

      <section aria-label="Demo profiles">
        <h3 className="mb-3 text-sm font-medium text-(--cui-color-text-default)">Sessions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Active" value={profiles.active} />
          <Stat label="Pending" value={profiles.pending} />
          <Stat label="Closed" value={profiles.closed} />
          <Stat label="Expired" value={profiles.expired} />
          <Stat label="Failed" value={profiles.failed} />
          <Stat label="Cleanup errors" value={profiles.cleanupErrors} />
        </div>
      </section>

      <section aria-label="Demo configuration status">
        <div
          className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: driftDetected
              ? 'var(--cui-color-text-warning)'
              : 'var(--cui-color-stroke-default)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: driftDetected
                ? 'var(--cui-color-text-warning)'
                : 'var(--cui-color-text-success)',
            }}
          />
          <span className="text-(--cui-color-text-default)">
            {driftDetected
              ? 'Config drift detected — the DEMO role config differs from the intended vardeDemo config. It reconciles on the next deploy or reconcile run.'
              : 'Config OK — the effective DEMO-role config matches the intended vardeDemo config.'}
          </span>
        </div>
      </section>

      <section aria-label="Demo links">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-(--cui-color-text-default)">Demo links</h3>
          <button
            type="button"
            onClick={() => setCreateLinkOpen(true)}
            disabled={!canManage}
            aria-disabled={!canManage || undefined}
            className="shrink-0 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-3 py-1.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            New demo link
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Description
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Starts
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
              {links.map((link) => (
                <tr
                  key={link.id}
                  className="border-b border-(--cui-color-stroke-default) last:border-0"
                >
                  <td className="px-4 py-3 text-(--cui-color-text-default)">
                    {link.description || <span className="text-(--cui-color-text-muted)">—</span>}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {LINK_STATUS_LABEL[link.status]}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {link.startsUsed}
                    {link.maxStarts != null ? ` / ${link.maxStarts}` : ''}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!canManage || link.status !== 'active' || revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(link.id)}
                        className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-danger) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No demo links yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RaiseCapacityDialog
        open={capacityOpen}
        onClose={() => setCapacityOpen(false)}
        currentLimit={capacity.limit}
        used={capacity.used}
        expectedRevision={capacity.revision}
      />
      <CreateDemoLinkDialog open={createLinkOpen} onClose={() => setCreateLinkOpen(false)} />
    </div>
  );
}
