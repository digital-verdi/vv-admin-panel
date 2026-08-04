import { useState, useEffect } from 'react';
import { Checkbox } from '@clickhouse/click-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { notifySuccess, notifyError } from '@/utils';
import { FormDialog } from '@/components/shared';
import { resetDemoCountersFn } from '@/server';

/** Opt-in, in ONE place: the initial state and the per-open reset must not be able to drift apart. */
const POLL_INCLUDED_BY_DEFAULT = false;

/**
 * Reset the demo counters to zero for a fresh campaign.
 *
 * The dialog spells out every collection it touches, because the numbers on the page come from five
 * independent counters and "reset" could plausibly mean any subset of them. Live sessions are never
 * affected — that is enforced server-side, and stated here so an admin can act during a live demo.
 *
 * The poll is a separate, unticked box: those are real anonymous answers with their own 365-day
 * retention, not a counter, and clearing counters between campaigns must not take them along by default.
 *
 * Optimistically locked like the capacity raise — a 409 comes back as a non-throwing result and turns
 * into a reload + retry prompt.
 */
export function ResetCountersDialog({
  open,
  onClose,
  used,
  selfServeStarts,
  finishedSessions,
  pollResponses,
  expectedRevision,
}: t.ResetCountersDialogProps) {
  const queryClient = useQueryClient();
  const [includePoll, setIncludePoll] = useState(POLL_INCLUDED_BY_DEFAULT);

  useEffect(() => {
    if (open) {
      setIncludePoll(POLL_INCLUDED_BY_DEFAULT);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => resetDemoCountersFn({ data: { expectedRevision, includePoll } }),
    onSuccess: (result: t.ResetDemoCountersResult) => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      if (result.status === 'version-mismatch') {
        notifyError('Demo capacity changed elsewhere — reloaded the latest. Please retry.');
      } else {
        notifySuccess('Demo counters reset to zero.');
      }
      onClose();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  return (
    <FormDialog
      open={open}
      title="Reset demo counters"
      submitLabel="Reset counters"
      saving={mutation.isPending}
      onSubmit={() => mutation.mutate()}
      onClose={onClose}
    >
      <p className="text-sm text-(--cui-color-text-muted)">
        Sets the demo counters back to zero — for starting a fresh campaign after internal testing.
        This cannot be undone.
      </p>
      <ul className="flex flex-col gap-1.5 text-sm text-(--cui-color-text-default)">
        <li>
          Sessions used: <strong>{used}</strong> → 0
        </li>
        <li>
          Started via <span className="font-mono">/demo</span>: <strong>{selfServeStarts}</strong> → 0
        </li>
        <li>
          Finished session records: <strong>{finishedSessions}</strong> removed
        </li>
        <li>Per-device limits: every browser may start its 5 demos again</li>
        <li>
          Named links: each gets its full <span className="font-mono">maxStarts</span> allowance back,
          so a link you had already spent becomes usable again
        </li>
      </ul>
      <Checkbox
        id="demo-reset-include-poll"
        checked={includePoll}
        onCheckedChange={(checked) => setIncludePoll(checked === true)}
        label={
          <span className="text-sm text-(--cui-color-text-default)">
            Also delete the {pollResponses} product-interest{' '}
            {pollResponses === 1 ? 'answer' : 'answers'}
            <span className="block text-xs text-(--cui-color-text-muted)">
              Anonymous feedback, not a counter — left in place unless you tick this.
            </span>
          </span>
        }
      />
      <p className="text-sm text-(--cui-color-text-muted)">
        Live sessions keep running, and the capacity limit is unchanged.
      </p>
    </FormDialog>
  );
}
