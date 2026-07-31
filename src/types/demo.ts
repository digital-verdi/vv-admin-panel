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
  isSelfServe: boolean;
}

/** Raw per-session profile status (does NOT collapse `activating` into `pending` like DemoProfileCounts). */
export type DemoProfileStatus =
  | 'pending'
  | 'activating'
  | 'active'
  | 'closed'
  | 'expired'
  | 'failed';

/** A live demo user/session for the admin list — sanitized (no email / userId / device). */
export interface DemoSession {
  id: string;
  displayUsername: string;
  status: DemoProfileStatus;
  startedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
}

/** State of the tokenless /demo self-serve entry (the default link). */
export interface DemoSelfServe {
  enabled: boolean;
  startsUsed: number;
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

/**
 * Aggregated answers to the anonymous product-interest poll shown to visitors who could not (further)
 * demo. `responses` is the number of devices that answered (one vote per device); the three product
 * counts are subsets of it and overlap freely, since a visitor may tick several.
 */
export interface DemoPollResults {
  responses: number;
  venn: number;
  rute: number;
  vern: number;
}

export interface DemoStatus {
  capacity: DemoCapacity;
  profiles: DemoProfileCounts;
  links: DemoLink[];
  sessions: DemoSession[];
  selfServe: DemoSelfServe;
  configDrift: DemoConfigDrift;
  /** Optional so the panel keeps working against a backend that predates the poll. */
  pollResults?: DemoPollResults;
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

/** Per-id outcome of a bulk terminate/delete/revoke action (ids sorted into the buckets that apply). */
export interface DemoBulkResult {
  terminated?: string[];
  deleted?: string[];
  revoked?: string[];
  skipped?: string[];
  skippedSelfServe?: string[];
  notFound?: string[];
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
