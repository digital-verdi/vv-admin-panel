import { createFileRoute } from '@tanstack/react-router';
import { InvitesPage } from '@/components/invites';

export const Route = createFileRoute('/_app/invites')({
  component: InvitesPage,
});
