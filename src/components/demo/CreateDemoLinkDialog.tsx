import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { createDemoLinkFn } from '@/server';
import { FormDialog } from '@/components/shared';
import { notifySuccess, notifyError } from '@/utils';

/**
 * Create a shareable demo link. The raw token is returned by the backend exactly once (only its hash is
 * persisted), so on success the dialog switches to a copy-the-link view — after closing, the token can
 * never be retrieved again. Share as `<app-url>/demo/<token>`.
 */
export function CreateDemoLinkDialog({ open, onClose }: t.CreateDemoLinkDialogProps) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [maxStarts, setMaxStarts] = useState('');
  const [error, setError] = useState('');
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setDescription('');
      setMaxStarts('');
      setError('');
      setCreatedPath(null);
      setCopied(false);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      const trimmed = maxStarts.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      return createDemoLinkFn({
        data: { description: description.trim(), maxStarts: parsed },
      });
    },
    onSuccess: (result: t.CreateDemoLinkResult) => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      setCreatedPath(`/demo/${result.token}`);
      notifySuccess('Demo link created.');
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const doSubmit = () => {
    setError('');
    const trimmed = maxStarts.trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setError('Max starts must be a whole number of at least 1, or left blank for unlimited.');
        return;
      }
    }
    mutation.mutate();
  };

  const copyLink = async () => {
    if (!createdPath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdPath);
      setCopied(true);
    } catch {
      notifyError('Could not copy to clipboard — copy the link manually.');
    }
  };

  if (createdPath) {
    return (
      <FormDialog
        open={open}
        title="Demo link created"
        submitLabel="Done"
        onSubmit={onClose}
        onClose={onClose}
      >
        <p className="text-sm text-(--cui-color-text-muted)">
          Share this link to start a demo session. It is shown only once — copy it now.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) px-3 py-2 text-xs text-(--cui-color-text-default)">
            {createdPath}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-lg border border-(--cui-color-stroke-default) px-3 py-2 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover)"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-(--cui-color-text-muted)">
          Prefix with the app URL, e.g. <span className="font-mono">https://…/demo/&lt;token&gt;</span>.
        </p>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open={open}
      title="Create demo link"
      submitLabel="Create link"
      saving={mutation.isPending}
      error={error}
      onSubmit={doSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="demo-link-description"
          className="text-sm font-medium text-(--cui-color-text-default)"
        >
          Description <span className="text-(--cui-color-text-muted)">(optional)</span>
        </label>
        <input
          id="demo-link-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Conference booth, October"
          autoFocus
          className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled)"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="demo-link-max-starts"
          className="text-sm font-medium text-(--cui-color-text-default)"
        >
          Max starts <span className="text-(--cui-color-text-muted)">(optional — blank = unlimited)</span>
        </label>
        <input
          id="demo-link-max-starts"
          type="number"
          min={1}
          step={1}
          value={maxStarts}
          onChange={(e) => setMaxStarts(e.target.value)}
          placeholder="Unlimited"
          className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled)"
        />
        <p className="text-xs text-(--cui-color-text-muted)">
          Starts are also bounded by the per-device limit and the global capacity.
        </p>
      </div>
    </FormDialog>
  );
}
