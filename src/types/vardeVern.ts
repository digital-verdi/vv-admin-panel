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
  /** SEMANTIC only: the detection mechanisms producing this entity (spaCy NER + label mapping + pattern
   *  recognizers), sourced from the backend for the "Recognizers" column. Undefined for regex entities. */
  recognizers?: string[];
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
  /** The coarse default score threshold applied when an entity's Minimum Score is left empty (the proxy's
   *  DEFAULT_PRESIDIO_CONFIDENCE) — distinct from the returned fixed score above. Drives the empty-state
   *  placeholder so it shows the real default (0.5), not the returned score. */
  defaultMinConfidence?: number;
  /** The NLP engine backing semantic detection (e.g. 'spaCy (SpacyRecognizer)'), derived from the score model. */
  nlpEngine?: string;
  /** The local (non-Presidio) PII engine that handles structured identifiers (e.g. 'Regex, Checksums …'). */
  localEngine?: string;
  /** Presidio modules present in the image but NOT active in this deployment (e.g. Transformers, Stanza). */
  inactiveModules?: string[];
}

/** One Presidio test-studio finding. Carries only offsets/labels/scores — NEVER the matched substring
 *  (the browser marks its own input locally from the UTF-16 offsets). */
export interface PresidioFinding {
  entityType: string;
  startUtf16: number;
  endUtf16: number;
  score: number;
  abovePolicyThreshold: boolean;
  /** The recognizer that produced this finding (name only, e.g. `SpacyRecognizer` / `OrgLegalFormRecognizer`)
   *  — metadata, never the matched substring. Present when the analyzer returns decision-process attribution. */
  recognizer?: string;
}

/** How the ONE Presidio analysis language was decided (ADR 0026) — mirrors the proxy resolver source enum. */
export type PresidioLanguageSource =
  | 'single_enabled'
  | 'explicit'
  | 'franc_current_turn'
  | 'franc_history_window'
  | 'hint'
  | 'hint_default_en'
  | 'error_fallback';

export interface PresidioTestResult {
  status: string;
  findings: PresidioFinding[];
  /** ADR 0026 — the language this test was analyzed in + how it was decided (metadata only, no raw text).
   *  Present on any proxy that exposes language routing; undefined on an older proxy. */
  requestedLanguage?: 'auto' | 'nb' | 'en';
  resolvedLanguage?: 'nb' | 'en';
  languageResolutionSource?: PresidioLanguageSource;
  sampleChars?: number;
  /** The Franc best-minus-runner-up score gap — present only when Franc decided. */
  scoreGap?: number;
}

/** Per-request Presidio language routing (ADR 0026): a local Franc detector picks ONE language (nb OR en)
 *  per request. Read-only, env/IaC-derived — never operator-editable. Undefined when an older proxy has not
 *  sent it yet (the panel falls back to a static "Franc (nb, en)" label). */
export interface VardeVernLanguageRouting {
  mode: string;
  minimumChars: number;
  minScoreGap?: number;
  defaultLanguage?: string | null;
  supportedLanguages: string[];
}

export interface VardeVern {
  policyVersion: number;
  defaultAction: VardeVernAction;
  /** Effective global PII / Varde Vern activation from the proxy GET (undefined when an older proxy has not sent it yet). */
  piiEnabled?: boolean;
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
  /** Read-only per-request language routing (ADR 0026). Undefined on older proxies. */
  languageRouting?: VardeVernLanguageRouting;
  configRevision: number;
  dbBacked: boolean;
}

export type SaveVardeVernResult =
  | { status: 'ok'; configRevision: number }
  | { status: 'version-mismatch' };

/**
 * The Varde Vern Insight report — protection telemetry aggregated over a rolling window, served by the
 * proxy `GET /admin/varde-vern/insight?days=N`. `ok` carries full KPIs + series/entities/rules;
 * `disabled` (pipeline off) and `unavailable` (no metrics backend) return null KPIs + empty arrays.
 */
export type VardeVernInsightStatus = 'ok' | 'disabled' | 'unavailable';

/** The rolling reporting window. `since` (an ISO timestamp) is present only when `status === 'ok'`. */
export interface VardeVernInsightWindow {
  days: number;
  since?: string;
}

/** Headline counters for the window. Null unless `status === 'ok'`. `protectedSpans` = masked ∪ blocked
 *  spans; `shadowSpans` = spans a shadow rule WOULD have acted on. */
export interface VardeVernInsightKpis {
  requestsInspected: number;
  requestsWithFindings: number;
  protectedSpans: number;
  shadowSpans: number;
  requestsWithShadow: number;
  requestsBlocked: number;
}

/** One day of the protection-activity series (`day` = `YYYY-MM-DD`). */
export interface VardeVernInsightSeriesPoint {
  day: string;
  inspected: number;
  enforced: number;
  shadow: number;
  blocked: number;
}

/** Per-entity findings rollup. `piiType` is the internal ALL-CAPS code; `label` is a backend display name
 *  (the panel prefers `entityDisplayName(piiType)` for body text). */
export interface VardeVernInsightEntity {
  piiType: string;
  label: string;
  enforceRequests: number;
  enforceSpans: number;
  shadowRequests: number;
  shadowSpans: number;
  wouldMask: number;
  wouldBlock: number;
}

/** Per-rule activity. `source` distinguishes the authoritative local regex from the Presidio NER engine;
 *  `minConfidence` is present only for `ner` rules. `matchRate` is a 0–1 fraction. */
export interface VardeVernInsightRule {
  ruleId: string;
  piiType: string;
  label: string;
  mode: 'enforce' | 'shadow' | 'off';
  source: 'regex' | 'ner';
  active: boolean;
  requestActivations: number;
  matchCount: number;
  shadowRequestActivations: number;
  shadowMatchCount: number;
  wouldMaskCount: number;
  wouldBlockCount: number;
  blockActivations: number;
  matchRate: number;
  minConfidence?: number;
}

export interface VardeVernInsight {
  status: VardeVernInsightStatus;
  scope: 'tenant';
  window: VardeVernInsightWindow;
  kpis: VardeVernInsightKpis | null;
  series: VardeVernInsightSeriesPoint[];
  entities: VardeVernInsightEntity[];
  rules: VardeVernInsightRule[];
}

/** Varde Vern term rules (ADR 0028) — language-scoped FORCE_MASK / DO_NOT_MASK. */
export type TermRuleAction = 'FORCE_MASK' | 'DO_NOT_MASK';
export type TermRuleLanguageScopeKind = 'ALL' | 'LANGUAGE';

export interface VardeVernLanguageCapability {
  code: string;
  displayNameKey: string;
  displayName: string;
  enabled: boolean;
  detection: { localEngine: boolean; presidio: boolean };
  termRules: { supported: boolean };
}

export type VardeVernRuleLanguageScope =
  | { type: 'ALL' }
  | { type: 'LANGUAGE'; languageCode: string };

export interface VardeVernCapabilities {
  languages: VardeVernLanguageCapability[];
  termRuleLanguageScopes: VardeVernRuleLanguageScope[];
  termRuleActions: TermRuleAction[];
  defaultLanguage: string;
}

export interface VardeVernTermRule {
  id: string;
  action: TermRuleAction;
  languageScope: TermRuleLanguageScopeKind;
  languageCode: string | null;
  term: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface VardeVernTermRules {
  rules: VardeVernTermRule[];
}

export interface CreateTermRuleInput {
  action: TermRuleAction;
  languageScope: TermRuleLanguageScopeKind;
  languageCode?: string;
  term: string;
}
