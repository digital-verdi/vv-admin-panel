export type PiiFailMode = 'closed' | 'open';

export type LlmProviderMode = 'openrouter' | 'mock';

/**
 * A dynamic chat-model group. `id` is a stable, opaque slug (never sent as `model`); `name` is the
 * editable slug LibreChat advertises + sends verbatim as `model`; `models` is 1 primary + up to 2
 * fallbacks (priority order); `legacyNames` are former names still routable after a rename/delete.
 */
export interface ChatModelGroup {
  id: string;
  name: string;
  models: string[];
  legacyNames: string[];
}

/**
 * The dynamic chat routing config. `version` is a constant format version (distinct from the proxy's
 * per-write `configRevision` concurrency token); `defaultGroupId` names the group whose `name` drives
 * LibreChat's titleModel + default model spec.
 */
export interface ChatRoutingConfig {
  version: number;
  defaultGroupId: string;
  groups: ChatModelGroup[];
}

/**
 * The editable, NON-secret vv-llm-proxy config (the PUT shape). Secrets — the OpenRouter API key, the
 * PII vault KEK/HKDF, the DB URL, and the chat/admin Bearers — are NEVER part of this shape; they stay
 * in Secret Manager and are only referenced by the read-only status flags on {@link LlmProxyConfig}.
 */
export interface LlmProxyConfigInput {
  isActive: boolean;
  openrouterBaseUrl: string;
  openrouterReferer: string | null;
  openrouterTitle: string | null;
  chatRouting: ChatRoutingConfig;
  embeddingsEnabled: boolean;
  allowedEmbeddingModels: string[];
  defaultEmbeddingDimensions: number | null;
  requestTimeoutMs: number;
  promptCacheEnabled: boolean;
  piiEnabled: boolean;
  piiFailMode: PiiFailMode;
}

/** GET /admin/config: the editable config + read-only status the UI uses to mask/lock fields. */
export interface LlmProxyConfig extends LlmProxyConfigInput {
  /** Whether the proxy env has an OpenRouter key (never the value) — the UI shows the key as managed. */
  openRouterKeyManaged: boolean;
  /** Whether the crypto secrets (KEK/HKDF/DB) are present — PII can only be enabled when true. */
  piiSecretsPresent: boolean;
  providerMode: LlmProviderMode;
  /** Monotonic optimistic-concurrency token echoed back as `expectedRevision` on save. */
  configRevision: number;
  /** True when the proxy spoke admin API v2 (dynamic groups); false → an old v1 proxy (saves disabled). */
  proxyApiV2: boolean;
  /** The default group's id + current name, for LibreChat titleModel / default-spec sync. */
  defaultGroup: { id: string; name: string };
  updatedAt: string | null;
  updatedBy: string | null;
  dbBacked: boolean;
}

/** Discriminated result of a proxy config save: `ok` (with the new revision) or an optimistic-lock miss. */
export type SaveLlmProxyResult =
  | { status: 'ok'; configRevision: number }
  | { status: 'version-mismatch' };

/** The before→after LibreChat impact of a routing change, for the sync preview + write. */
export interface VardeSyncPlan {
  endpointIndex: number;
  entries: Array<{ fieldPath: string; value: unknown }>;
  diff: {
    modelsDefault: { before: string[]; after: string[] };
    titleModel: { before: string | undefined; after: string };
    specs: Array<{ index: number; name: string; before: string | null; after: string }>;
  };
  /** Varde specs whose current `preset.model` matches no group name/legacyName (would break on save). */
  unresolvedSpecs: Array<{ index: number; name: string; model: string }>;
}

export type VardeSyncError = 'missing' | 'ambiguous';

/** The Varde-relevant LibreChat fragments used for best-effort optimistic-lock (drift) detection. */
export interface VardeFragments {
  modelsDefault: string[];
  titleModel: string | null;
  specModels: Array<{ index: number; model: string | null }>;
}

/** Result of the LibreChat sync orchestration (proxy save already committed first). */
export type SyncLibreChatResult =
  | { status: 'ok' | 'noop'; unresolvedSpecs: VardeSyncPlan['unresolvedSpecs'] }
  | { status: 'drift' }
  | { status: 'endpoint-missing' | 'endpoint-ambiguous' };

export interface LlmProxyModel {
  id: string;
  name: string;
  supportsVision: boolean;
  supportsReasoning: boolean;
}
