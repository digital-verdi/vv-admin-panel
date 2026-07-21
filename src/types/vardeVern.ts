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

/** One (entity, language) pair documented GREEN to enforce — the språk-gate. The panel offers the enforce
 *  control (and its per-language selection) only for these; everything else stays shadow-only. Sourced from
 *  the backend `enforceableGreen` list — never hardcoded client-side. */
export interface EnforceableGreen {
  entity: string;
  language: string;
}

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
  /** SEMANTIC only: the languages documented green to enforce/block (the språk-gate). Empty ⇒ shadow-only
   *  (enforce is disabled until the entity's quality gate is green). Undefined for regex entities. */
  enforceGreenLanguages?: string[];
  /** SEMANTIC only: the active score model. `spacy-ner-fixed` returns a fixed score, so the panel presents
   *  the Minimum Presidio-score as a coarse cutoff, not a calibrated probability. Undefined for regex. */
  scoreModel?: 'spacy-ner-fixed';
  /** SEMANTIC only: the fixed score the spaCy recognizer returns (drives the "fixed 0.85" note). */
  semanticFixedScore?: number;
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
  /** Languages this SEMANTIC entity is gated GREEN to enforce/block (F149f). Required by the proxy
   *  before a supplementary entity may be enforced; must be a subset of the analyzer's languages. */
  enforceLanguages?: string[];
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
  /** All languages the hot path analyzes in (e.g. ['nb','en']) — F149g. */
  languages?: string[];
  state?: 'ready' | 'degraded' | 'unavailable' | 'unknown';
  lastProbeAt?: number | null;
  lastProbeLatencyMs?: number | null;
  /** Everything the running image REPORTS it can detect (dynamic, from the last probe). */
  supportedEntities?: string[];
  /** The Presidio entity_types Varde Vern actually requests + maps (PERSON/LOCATION/ORGANIZATION). The panel
   *  derives "reported but NOT integrated" = `supportedEntities` − `integratedPresidioEntities`. */
  integratedPresidioEntities?: string[];
  /** The fixed score the current spaCy NER returns → the panel presents Minimum Presidio-score as a coarse
   *  cutoff, not a calibrated probability. */
  semanticScoreFixed?: number;
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
  /** The documented-green enforce-eligible (entity, language) set (the språk-gate). The panel offers the
   *  enforce control only for these; everything else is shadow-only until its corpus is green. */
  enforceableGreen?: EnforceableGreen[];
  /** Read-only Presidio status (present once the proxy has the transport configured). */
  presidio?: PresidioStatus;
  configRevision: number;
  dbBacked: boolean;
}

export type SaveVardeVernResult =
  | { status: 'ok'; configRevision: number }
  | { status: 'version-mismatch' };
