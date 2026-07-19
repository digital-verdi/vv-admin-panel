/**
 * Varde Vern admin config — the read-only GUI contract served by the vv-llm-proxy
 * `GET /admin/varde-vern` (proxy Fase 4 + 8c). The panel is DRIVEN by this data:
 * engine ownership, confidence applicability, and rollout phase all come from the
 * backend — the GUI never hardcodes which engine owns which entity.
 */

export type VardeVernAction = 'block' | 'enforce' | 'shadow' | 'allow';

/** GUI grouping: `regex` = structured/validated (authoritative), `semantic` = AI/Presidio (supplementary). */
export type VardeVernEngineGroup = 'regex' | 'semantic';

export type VardeVernEngineStatus = 'disabled' | 'optional' | 'required';

export type VardeVernRolloutPhase = 'off' | 'shadow' | 'enforce';

/** One entity type's admin view. `technicalStatus` (checksum badge) is set for regex
 *  entities; `minConfidence` applies only when `confidenceApplicable` (semantic). */
export interface VardeVernEntity {
  entityType: string;
  label: string;
  engine: VardeVernEngineGroup;
  confidenceApplicable: boolean;
  minConfidence?: number;
  technicalStatus?: string;
  action: VardeVernAction;
}

export interface VardeVernRolloutEngine {
  engineId: string;
  status: VardeVernEngineStatus;
  rolloutPhase: VardeVernRolloutPhase;
  enforceAllowed: boolean;
}

/** One entity's editable policy entry (the PUT shape mirrors the proxy's `entityPolicySchema`). */
export interface VardeVernEntityPolicy {
  action: VardeVernAction;
  requiredEngines: string[];
  minConfidence?: number;
}

/** The editable policy object round-tripped through GET/PUT (mirrors the proxy `vardeVernPolicySchema`). */
export interface VardeVernPolicyInput {
  version: number;
  defaultAction: VardeVernAction;
  entities: Record<string, VardeVernEntityPolicy>;
}

export interface VardeVernRolloutInput {
  version: number;
  engines: VardeVernRolloutEngine[];
}

/** Read-only Presidio deployment + health status (from the proxy GET). NEVER carries endpoint/host/token. */
export interface PresidioStatus {
  configured: boolean;
  credential?: 'managed';
  imageMode?: string;
  release?: string;
  digest?: string;
  language?: string;
  state?: 'ready' | 'degraded' | 'unavailable' | 'unknown';
  lastProbeAt?: number | null;
  lastProbeLatencyMs?: number | null;
  supportedEntities?: string[];
}

/** One Presidio test-studio finding. Carries only offsets/labels/scores — NEVER the matched substring
 *  (the browser marks its own input locally from the UTF-16 offsets). */
export interface PresidioFinding {
  entityType: string;
  startUtf16: number;
  endUtf16: number;
  score: number;
  abovePolicyThreshold: boolean;
}

export interface PresidioTestResult {
  status: string;
  findings: PresidioFinding[];
}

export interface VardeVern {
  policyVersion: number;
  defaultAction: VardeVernAction;
  /** False when the STORED policy failed validation — the safe synthesized default is reflected. */
  policyValid: boolean;
  rolloutValid: boolean;
  entities: VardeVernEntity[];
  /** The editable policy source (GUI renders `entities`, edits `policy`). */
  policy: VardeVernPolicyInput;
  rollout: VardeVernRolloutEngine[];
  /** Read-only Presidio status (present once the proxy has the transport configured). */
  presidio?: PresidioStatus;
  configRevision: number;
  dbBacked: boolean;
}

export type SaveVardeVernResult =
  | { status: 'ok'; configRevision: number }
  | { status: 'version-mismatch' };
