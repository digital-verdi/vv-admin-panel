import type * as t from '@/types';

/** Minimum-score help copy. Two distinct audiences now: the SAVED per-entity policy threshold (the
 *  dynamic-score policy intro, which names the live fixed spaCy score) and the TRANSIENT test-studio
 *  filter. Both describe a COARSE cutoff on a raw Presidio score — never a calibrated probability. */
export const PRESIDIO_SCORE_TEST_LABEL = 'Test score filter';
export const PRESIDIO_SCORE_TEST_INTRO =
  'Filters this test only. Saved entity thresholds are evaluated separately.';

/** Intro for the SAVED per-entity minimum-score policy. Names the live fixed spaCy score AND the empty-state
 *  default threshold when the backend exposes them, so the cutoff reads concretely; omits each number
 *  gracefully when it is not available. `defaultScore` is the coarse default applied when the field is empty
 *  (DEFAULT_PRESIDIO_CONFIDENCE), distinct from the fixed score spaCy returns. */
export function presidioScorePolicyIntro(fixedScore?: number, defaultScore?: number): string {
  const emptyNote = typeof defaultScore === 'number' ? ` Empty defaults to ${defaultScore}.` : '';
  if (typeof fixedScore === 'number') {
    return `Findings below this value are ignored.${emptyNote} It is a technical score, not a probability; spaCy currently returns ${fixedScore}, so values above ${fixedScore} filter them out.`;
  }
  return `Findings below this value are ignored.${emptyNote} It is a technical score, not a probability; the current spaCy recognizer returns a fixed score, so higher values filter them out.`;
}

const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  PERSON: 'Person',
  LOCATION: 'Location',
  ORG: 'Organization',
  ORGANIZATION: 'Organization',
};

/** Title-case display name for a semantic entity code — the ALL-CAPS codes stay internal, never body text. */
export function entityDisplayName(entityType: string): string {
  return (
    ENTITY_DISPLAY_NAMES[entityType] ??
    entityType
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

export interface EngineSplit {
  regex: t.VardeVernEntity[];
  semantic: t.VardeVernEntity[];
}

/**
 * Split entities into the two GUI sections by the BACKEND-provided engine group
 * (never hardcoded client-side). Preserves backend order within each group, so a
 * new entity/engine lands in the right section automatically.
 */
export function groupEntitiesByEngine(entities: readonly t.VardeVernEntity[]): EngineSplit {
  const split: EngineSplit = { regex: [], semantic: [] };
  for (const entity of entities) {
    if (entity.engine === 'semantic') split.semantic.push(entity);
    else split.regex.push(entity);
  }
  return split;
}

/**
 * The green languages an entity may enforce/block in — the per-entity language gate the panel renders.
 * Prefers the per-entity `enforceGreenLanguages` (SEMANTIC only); falls back to deriving from the
 * top-level `enforceableGreen` list. NEVER hardcoded — an empty result means enforce is not yet allowed.
 */
export function greenLanguagesFor(
  entity: t.VardeVernEntity,
  enforceableGreen?: readonly t.EnforceableGreen[],
): string[] {
  if (entity.enforceGreenLanguages) return [...entity.enforceGreenLanguages];
  return (enforceableGreen ?? [])
    .filter((g) => g.entity === entity.entityType)
    .map((g) => g.language);
}

/**
 * The Presidio types the running analyzer REPORTS but Varde Vern has NOT integrated — derived dynamically
 * as `supportedEntities` − `integratedPresidioEntities` (never a hardcoded list). These are reported-only:
 * no Varde mapping/policy/gates, so they can never be set to shadow/enforce.
 */
export function reportedNotIntegrated(presidio?: t.PresidioStatus): string[] {
  const integrated = new Set(presidio?.integratedPresidioEntities ?? []);
  return (presidio?.supportedEntities ?? []).filter((entity) => !integrated.has(entity));
}

/** Presentation tone — green (protective), blue (measuring), grey (inactive). */
export type Tone = 'protective' | 'measuring' | 'inactive';

/** Rollout phase → tone: enforce protects, shadow measures, off is inactive. */
export function phaseTone(phase: t.VardeVernRolloutPhase): Tone {
  if (phase === 'enforce') return 'protective';
  if (phase === 'shadow') return 'measuring';
  return 'inactive';
}

/** Policy action → tone: block/enforce protect, shadow measures, allow is inactive. */
export function actionTone(action: t.VardeVernAction): Tone {
  if (action === 'enforce' || action === 'block') return 'protective';
  if (action === 'shadow') return 'measuring';
  return 'inactive';
}

/** The effective runtime OUTCOME of one finding once the engine phase gates the entity action. */
export type VernDisposition = 'ignore' | 'shadow' | 'enforce' | 'block';

/**
 * Mirror of the proxy's authoritative `disposition(action, phase)` (vv-llm-proxy `pii/vern-pipeline.ts`):
 * the global Presidio rollout phase is a strict CEILING over the per-entity action — the most restrictive
 * setting wins. `phase` is the engine's effective phase (`disabled` when it has no rollout entry or is
 * switched off ⇒ the finding is ignored). Kept in lockstep with the proxy; the full truth table is pinned in
 * `operations.test.ts`.
 */
export function effectiveDisposition(
  action: t.VardeVernAction,
  phase: t.VardeVernRolloutPhase | 'disabled',
): VernDisposition {
  if (phase === 'disabled' || phase === 'off') return 'ignore';
  if (action === 'allow') return 'ignore';
  if (action === 'shadow') return 'shadow';
  if (phase !== 'enforce') return 'shadow';
  return action === 'block' ? 'block' : 'enforce';
}

/** Presentation for an effective disposition — the outcome label + tone shown in the Effective column. */
export function dispositionDisplay(disposition: VernDisposition): { label: string; tone: Tone } {
  if (disposition === 'enforce') return { label: 'Mask', tone: 'protective' };
  if (disposition === 'block') return { label: 'Reject', tone: 'protective' };
  if (disposition === 'shadow') return { label: 'Observe', tone: 'measuring' };
  return { label: 'Ignored', tone: 'inactive' };
}

/**
 * Render a raw analyzer score as a plain 0–1 value (e.g. `0.85`) — NEVER a percentage. The current spaCy
 * recognizer returns a FIXED score for every finding, so a `%` would dress a constant technical value up as a
 * calibrated probability it does not have. Matches the 0–1 Minimum Score / test-filter fields. Trims float
 * noise to at most two decimals.
 */
export function formatPresidioScore(score: number): string {
  return String(Number(score.toFixed(2)));
}
