export type InviteProvider = 'google' | 'local';

export type InviteStatus = 'pending' | 'used' | 'expired';

export interface Invite {
  id: string;
  email: string;
  allowedProviders: InviteProvider[];
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
}

export interface CreateInviteDialogProps {
  open: boolean;
  onClose: () => void;
}
