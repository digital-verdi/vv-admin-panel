import type * as t from '@/types';

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
