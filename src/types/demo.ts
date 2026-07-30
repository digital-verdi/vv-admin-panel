/**
 * Types for the Demo Mode admin tab. Mirrors the LibreChat Admin API contract
 * (api/server/routes/admin/demo.js + DemoService). See docs/DEMO_CONFIG.md.
 */

export type DemoLinkStatus = 'active' | 'revoked' | 'expired';

export interface DemoCapacity {
  limit: number;
  used: number;
  reservations: number;
  remaining: number;
  revision: number;
}

export interface DemoProfileCounts {
  active: number;
  pending: number;
  closed: number;
  expired: number;
  failed: number;
  cleanupErrors: number;
}

export interface DemoLink {
  id: string;
  description: string;
  maxStarts: number | null;
  startsUsed: number;
  status: DemoLinkStatus;
  expiresAt: string | null;
}

/**
 * Config-drift diagnostic from the reconcile validator: `null` when the effective DEMO-role config
 * matches the intended `vardeDemo` config, otherwise a heterogeneous detail blob (reasons/issues, an
 * `{ error }`, or `{ ok: false }`). The tab only distinguishes present-vs-absent + shows any reasons.
 */
export type DemoConfigDrift =
  | null
  | string[]
  | { ok?: false; error?: string; reasons?: string[]; issues?: string[] };

export interface DemoStatus {
  capacity: DemoCapacity;
  profiles: DemoProfileCounts;
  links: DemoLink[];
  configDrift: DemoConfigDrift;
}

/** Discriminated result of a capacity raise: the backend 409/422 become non-throwing UI states. */
export type SetDemoCapacityResult =
  | { status: 'ok'; capacity: DemoCapacity }
  | { status: 'version-mismatch' }
  | { status: 'below-used' };

export interface CreateDemoLinkResult {
  token: string;
  link: DemoLink;
}

export interface RaiseCapacityDialogProps {
  open: boolean;
  onClose: () => void;
  currentLimit: number;
  used: number;
  expectedRevision: number;
}

export interface CreateDemoLinkDialogProps {
  open: boolean;
  onClose: () => void;
}
