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

export interface VardeVern {
  policyVersion: number;
  defaultAction: VardeVernAction;
  /** False when the STORED policy failed validation — the safe synthesized default is reflected. */
  policyValid: boolean;
  entities: VardeVernEntity[];
  rollout: VardeVernRolloutEngine[];
  configRevision: number;
  dbBacked: boolean;
}
