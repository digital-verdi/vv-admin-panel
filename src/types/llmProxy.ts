export type PiiFailMode = 'closed' | 'open';

export type LlmProviderMode = 'openrouter' | 'mock';

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
  chatModelsPremium: string[];
  chatModelsStandard: string[];
  chatModelsBasic: string[];
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
  updatedAt: string | null;
  updatedBy: string | null;
  dbBacked: boolean;
}

export interface LlmProxyModel {
  id: string;
  name: string;
  supportsVision: boolean;
  supportsReasoning: boolean;
}
