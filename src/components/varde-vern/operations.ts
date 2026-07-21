import type * as t from '@/types';

/** The Minimum Presidio-score field label + help text (shared by the per-entity settings and the test
 *  studio). It is a COARSE cutoff on a raw Presidio score — never a calibrated probability or security level. */
export const PRESIDIO_SCORE_LABEL = 'Minimum Presidio-score';
export const PRESIDIO_SCORE_HELP =
  'Funn med Presidio-score under denne grensen ignoreres. Scoren er en teknisk verdi fra Presidio, og er ikke nødvendigvis en prosentvis sannsynlighet.';
/** Shown for today's spaCy-based semantic entities (`scoreModel === 'spacy-ner-fixed'`) + the test studio. */
export const PRESIDIO_SCORE_FIXED_NOTE =
  'Den aktive spaCy-recognizeren returnerer for tiden fast score 0,85 for semantiske NER-funn. Terskelen gir derfor ikke finjustering i denne versjonen: verdier på eller under 0,85 godtar funnene, mens verdier over 0,85 filtrerer dem bort.';

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
 * The green languages an entity may enforce/block in — the per-entity språk-gate the panel renders.
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
