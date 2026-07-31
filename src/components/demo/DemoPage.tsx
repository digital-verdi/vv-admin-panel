import { useState } from 'react';
import { Checkbox } from '@clickhouse/click-ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import {
  demoStatusQueryOptions,
  revokeDemoLinkFn,
  revokeDemoLinksFn,
  deleteDemoLinksFn,
  terminateDemoSessionsFn,
  setSelfServeFn,
} from '@/server';
import { EmptyState, LoadingState, FormDialog } from '@/components/shared';
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

const SESSION_STATUS_LABEL: Record<t.DemoProfileStatus, string> = {
  pending: 'Pending',
  activating: 'Activating',
  active: 'Active',
  closed: 'Closed',
  expired: 'Expired',
  failed: 'Failed',
};

type ConfirmState = { kind: 'delete-links' | 'terminate-sessions'; ids: string[] } | null;

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function linkLabel(link: t.DemoLink): string {
  return link.isSelfServe ? 'Self-serve (default)' : link.description || '';
}

/** Tri-state for a "select all" header checkbox over the currently-selectable rows. */
function headerCheckState(selectableIds: string[], selected: Set<string>): boolean | 'indeterminate' {
  if (selectableIds.length === 0) {
    return false;
  }
  const count = selectableIds.filter((id) => selected.has(id)).length;
  if (count === 0) {
    return false;
  }
  return count === selectableIds.length ? true : 'indeterminate';
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-(--cui-color-stroke-default) px-4 py-3">
      <span className="text-xs text-(--cui-color-text-muted)">{label}</span>
      <span className="text-lg font-semibold text-(--cui-color-text-default)">{value}</span>
      {hint && <span className="text-xs text-(--cui-color-text-muted)">{hint}</span>}
    </div>
  );
}

const EMPTY_POLL: t.DemoPollResults = { responses: 0, venn: 0, rute: 0, vern: 0 };

function BulkButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-(--cui-color-stroke-default) px-2.5 py-1 text-xs transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-(--cui-color-text-danger)' : 'text-(--cui-color-text-default)'
      }`}
    >
      {label}
    </button>
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
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(() => new Set());
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const { data: status, isLoading } = useQuery(demoStatusQueryOptions);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['demo-status'] });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDemoLinkFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      notifySuccess('Demo link revoked');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const revokeLinksMutation = useMutation({
    mutationFn: (ids: string[]) => revokeDemoLinksFn({ data: { ids } }),
    onSuccess: (result: t.DemoBulkResult) => {
      invalidate();
      setSelectedLinkIds(new Set());
      notifySuccess(`Revoked ${result.revoked?.length ?? 0} demo link(s).`);
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const deleteLinksMutation = useMutation({
    mutationFn: (ids: string[]) => deleteDemoLinksFn({ data: { ids } }),
    onSuccess: (result: t.DemoBulkResult) => {
      invalidate();
      setSelectedLinkIds(new Set());
      setConfirm(null);
      notifySuccess(`Deleted ${result.deleted?.length ?? 0} demo link(s).`);
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const terminateSessionsMutation = useMutation({
    mutationFn: (ids: string[]) => terminateDemoSessionsFn({ data: { ids } }),
    onSuccess: (result: t.DemoBulkResult) => {
      invalidate();
      setSelectedSessionIds(new Set());
      setConfirm(null);
      const ended = (result.terminated?.length ?? 0) + (result.deleted?.length ?? 0);
      notifySuccess(`Terminated ${ended} demo session(s).`);
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const selfServeMutation = useMutation({
    mutationFn: (enabled: boolean) => setSelfServeFn({ data: { enabled } }),
    onSuccess: (result: t.DemoSelfServe) => {
      invalidate();
      notifySuccess(result.enabled ? 'Self-serve demo turned on' : 'Self-serve demo turned off');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (isLoading || !status) {
    return <LoadingState />;
  }

  const { capacity, profiles, links, sessions, selfServe } = status;
  const driftDetected = hasConfigDrift(status.configDrift);
  // Optional on the contract so the panel still renders against a backend that predates the poll.
  const poll = status.pollResults ?? EMPTY_POLL;
  const pollShare = (count: number) =>
    poll.responses > 0 ? `${Math.round((count / poll.responses) * 100)}% of responses` : undefined;

  // Self-serve default link is managed by its toggle, never bulk-selected/deleted.
  const selectableLinks = links.filter((link) => !link.isSelfServe);
  const linkHeaderState = headerCheckState(
    selectableLinks.map((l) => l.id),
    selectedLinkIds,
  );
  const sessionHeaderState = headerCheckState(
    sessions.map((s) => s.id),
    selectedSessionIds,
  );
  const busy =
    revokeLinksMutation.isPending ||
    deleteLinksMutation.isPending ||
    terminateSessionsMutation.isPending;

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleAll = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    ids: string[],
    allSelected: boolean,
  ) => setter(() => (allSelected ? new Set() : new Set(ids)));

  const runConfirm = () => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === 'delete-links') {
      deleteLinksMutation.mutate(confirm.ids);
    } else {
      terminateSessionsMutation.mutate(confirm.ids);
    }
  };

  const selectedLinkList = [...selectedLinkIds];
  const selectedSessionList = [...selectedSessionIds];

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

      <section aria-label="Self-serve access">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-(--cui-color-stroke-default) px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: selfServe.enabled
                  ? 'var(--cui-color-text-success)'
                  : 'var(--cui-color-text-muted)',
              }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-(--cui-color-text-default)">
                Self-serve access — {selfServe.enabled ? 'On' : 'Off'}
              </span>
              <span className="text-xs text-(--cui-color-text-muted)">
                The tokenless <span className="font-mono">/demo</span> entry.{' '}
                {selfServe.enabled
                  ? `${selfServe.startsUsed} started via /demo.`
                  : 'Turn on to let anyone start a demo from /demo.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={!canManage || selfServeMutation.isPending}
            onClick={() => selfServeMutation.mutate(!selfServe.enabled)}
            aria-disabled={!canManage || undefined}
            className="shrink-0 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-3 py-1.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selfServe.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </section>

      <section aria-label="Demo profiles">
        <h3 className="mb-3 text-sm font-medium text-(--cui-color-text-default)">Session counts</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Active" value={profiles.active} />
          <Stat label="Pending" value={profiles.pending} />
          <Stat label="Closed" value={profiles.closed} />
          <Stat label="Expired" value={profiles.expired} />
          <Stat label="Failed" value={profiles.failed} />
          <Stat label="Cleanup errors" value={profiles.cleanupErrors} />
        </div>
      </section>

      <section aria-label="Poll results">
        <h3 className="mb-1 text-sm font-medium text-(--cui-color-text-default)">
          Product interest
        </h3>
        <p className="mb-3 text-sm text-(--cui-color-text-muted)">
          Anonymous answers from visitors who could not (further) demo — one vote per device, and no
          contact details are collected. A visitor may pick several products, so the counts overlap.
        </p>
        {poll.responses === 0 ? (
          <EmptyState message="No poll responses yet." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Responses" value={poll.responses} />
            <Stat label="Varde Venn" value={poll.venn} hint={pollShare(poll.venn)} />
            <Stat label="Varde Rute" value={poll.rute} hint={pollShare(poll.rute)} />
            <Stat label="Varde Vern" value={poll.vern} hint={pollShare(poll.vern)} />
          </div>
        )}
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

      <section aria-label="Demo sessions">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-(--cui-color-text-default)">Demo sessions</h3>
          {selectedSessionList.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-(--cui-color-text-muted)">
              <span>{selectedSessionList.length} selected</span>
              <BulkButton
                label={`Terminate selected (${selectedSessionList.length})`}
                danger
                disabled={!canManage || busy}
                onClick={() => setConfirm({ kind: 'terminate-sessions', ids: selectedSessionList })}
              />
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-(--cui-color-stroke-default)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-muted)">
                <th scope="col" className="w-10 px-4 py-2.5">
                  <Checkbox
                    checked={sessionHeaderState}
                    onCheckedChange={() =>
                      toggleAll(
                        setSelectedSessionIds,
                        sessions.map((s) => s.id),
                        sessionHeaderState === true,
                      )
                    }
                    disabled={!canManage || sessions.length === 0}
                    aria-label="Select all sessions"
                  />
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  User
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Started
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium text-(--cui-color-text-muted)">
                  Last seen
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
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-(--cui-color-stroke-default) last:border-0"
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selectedSessionIds.has(session.id)}
                      onCheckedChange={() => toggle(setSelectedSessionIds, session.id)}
                      disabled={!canManage}
                      aria-label={`Select session ${session.displayUsername}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-default)">
                    {session.displayUsername || (
                      <span className="text-(--cui-color-text-muted)">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {SESSION_STATUS_LABEL[session.status]}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {formatTime(session.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {formatTime(session.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-muted)">
                    {formatTime(session.expiresAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!canManage || busy}
                        onClick={() =>
                          setConfirm({ kind: 'terminate-sessions', ids: [session.id] })
                        }
                        className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-danger) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="No active demo sessions." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Demo links">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-(--cui-color-text-default)">Demo links</h3>
            {selectedLinkList.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-(--cui-color-text-muted)">
                <span>{selectedLinkList.length} selected</span>
                <BulkButton
                  label={`Revoke selected (${selectedLinkList.length})`}
                  disabled={!canManage || busy}
                  onClick={() => revokeLinksMutation.mutate(selectedLinkList)}
                />
                <BulkButton
                  label={`Delete selected (${selectedLinkList.length})`}
                  danger
                  disabled={!canManage || busy}
                  onClick={() => setConfirm({ kind: 'delete-links', ids: selectedLinkList })}
                />
              </div>
            )}
          </div>
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
                <th scope="col" className="w-10 px-4 py-2.5">
                  <Checkbox
                    checked={linkHeaderState}
                    onCheckedChange={() =>
                      toggleAll(
                        setSelectedLinkIds,
                        selectableLinks.map((l) => l.id),
                        linkHeaderState === true,
                      )
                    }
                    disabled={!canManage || selectableLinks.length === 0}
                    aria-label="Select all links"
                  />
                </th>
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
                  <td className="px-4 py-3">
                    {!link.isSelfServe && (
                      <Checkbox
                        checked={selectedLinkIds.has(link.id)}
                        onCheckedChange={() => toggle(setSelectedLinkIds, link.id)}
                        disabled={!canManage}
                        aria-label={`Select link ${linkLabel(link) || link.id}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-(--cui-color-text-default)">
                    {linkLabel(link) || <span className="text-(--cui-color-text-muted)">—</span>}
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
                    <div className="flex justify-end gap-2">
                      {link.isSelfServe ? (
                        <span className="text-xs text-(--cui-color-text-muted)">Managed above</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canManage || link.status !== 'active' || busy}
                            onClick={() => revokeMutation.mutate(link.id)}
                            className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default) disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            disabled={!canManage || busy}
                            onClick={() => setConfirm({ kind: 'delete-links', ids: [link.id] })}
                            className="rounded-md px-2 py-1 text-xs text-(--cui-color-text-danger) transition-colors hover:bg-(--cui-color-background-hover) disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr>
                  <td colSpan={6}>
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

      {confirm && (
        <FormDialog
          open
          title={confirm.kind === 'delete-links' ? 'Delete demo link(s)' : 'Terminate demo session(s)'}
          submitLabel={confirm.kind === 'delete-links' ? 'Delete' : 'Terminate'}
          saving={deleteLinksMutation.isPending || terminateSessionsMutation.isPending}
          onSubmit={runConfirm}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm text-(--cui-color-text-muted)">
            {confirm.kind === 'delete-links'
              ? `Delete ${confirm.ids.length} demo link(s)? This permanently removes them and ends any active demo sessions started from them.`
              : `Terminate ${confirm.ids.length} demo session(s)? The users lose access immediately and their data is deleted.`}
          </p>
        </FormDialog>
      )}
    </div>
  );
}
