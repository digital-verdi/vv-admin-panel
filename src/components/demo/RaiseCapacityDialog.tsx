import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { setDemoCapacityFn } from '@/server';
import { FormDialog } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';

/**
 * Raise the cumulative global demo capacity. Optimistically locked on `expectedRevision`: a stale
 * revision or a limit below already-used sessions comes back as a non-throwing result → a toast + a
 * status reload (which refreshes the revision) rather than an error. Capacity is never returned by
 * cleanup, so the input floors at the number of sessions already used.
 */
export function RaiseCapacityDialog({
  open,
  onClose,
  currentLimit,
  used,
  expectedRevision,
}: t.RaiseCapacityDialogProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(currentLimit));
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(String(currentLimit));
      setError('');
    }
  }, [open, currentLimit]);

  const mutation = useMutation({
    mutationFn: (newLimit: number) => setDemoCapacityFn({ data: { newLimit, expectedRevision } }),
    onSuccess: (result: t.SetDemoCapacityResult) => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      if (result.status === 'version-mismatch') {
        notifyError('Capacity changed elsewhere — reloaded the latest. Please retry.');
      } else if (result.status === 'below-used') {
        notifyError('New limit cannot be below the number of demo sessions already used.');
      } else {
        notifySuccess(`Demo capacity set to ${result.capacity.limit}.`);
      }
      onClose();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const doSubmit = () => {
    setError('');
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setError('Capacity must be a non-negative whole number.');
      return;
    }
    if (parsed < used) {
      setError(`Capacity cannot be below ${used} sessions already used.`);
      return;
    }
    mutation.mutate(parsed);
  };

  return (
    <FormDialog
      open={open}
      title="Set demo capacity"
      submitLabel="Update capacity"
      submitDisabled={value.trim() === ''}
      saving={mutation.isPending}
      error={error}
      onSubmit={doSubmit}
      onClose={onClose}
    >
      <p className="text-sm text-(--cui-color-text-muted)">
        The global demo capacity is cumulative — used sessions are never returned, so raising it only
        adds headroom. Currently {used} used of {currentLimit}.
      </p>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="demo-capacity"
          className="text-sm font-medium text-(--cui-color-text-default)"
        >
          New capacity limit
        </label>
        <input
          id="demo-capacity"
          type="number"
          min={used}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default)"
        />
      </div>
    </FormDialog>
  );
}
