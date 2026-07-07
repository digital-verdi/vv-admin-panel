import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as t from '@/types';
import { notifySuccess, notifyError } from '@/utils';
import { FormDialog } from '@/components/shared';
import { createInviteFn } from '@/server';

const PROVIDERS: { value: t.InviteProvider; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'local', label: 'Email / password' },
];

export function CreateInviteDialog({ open, onClose }: t.CreateInviteDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState<t.InviteProvider>('google');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => createInviteFn({ data: { email: email.trim(), provider } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      notifySuccess(`Invite sent to ${email.trim()}`);
      resetAndClose();
    },
    onError: (err: Error) => notifyError(err.message),
  });

  const resetAndClose = () => {
    setEmail('');
    setProvider('google');
    setError('');
    onClose();
  };

  const doSubmit = () => {
    setError('');
    const value = email.trim();
    if (!value || !value.includes('@')) {
      setError('A valid email address is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <FormDialog
      open={open}
      title="Invite a user"
      submitLabel="Send invite"
      submitDisabled={!email.trim()}
      saving={mutation.isPending}
      error={error}
      onSubmit={doSubmit}
      onClose={resetAndClose}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-email" className="text-sm font-medium text-(--cui-color-text-default)">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          autoFocus
          className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default) placeholder:text-(--cui-color-text-disabled)"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="invite-provider"
          className="text-sm font-medium text-(--cui-color-text-default)"
        >
          Sign-in method
        </label>
        <select
          id="invite-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as t.InviteProvider)}
          className="rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) px-3 py-2 text-sm text-(--cui-color-text-default)"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}
