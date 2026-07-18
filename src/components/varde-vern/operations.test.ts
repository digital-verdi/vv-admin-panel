import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import { groupEntitiesByEngine, phaseTone, actionTone } from './operations';

const entity = (over: Partial<t.VardeVernEntity>): t.VardeVernEntity => ({
  entityType: 'X',
  label: 'X',
  engine: 'regex',
  confidenceApplicable: false,
  action: 'enforce',
  ...over,
});

describe('groupEntitiesByEngine', () => {
  it('splits by backend engine group, preserving order within each group', () => {
    const entities = [
      entity({ entityType: 'FNR', engine: 'regex' }),
      entity({ entityType: 'PERSON', engine: 'semantic' }),
      entity({ entityType: 'EMAIL', engine: 'regex' }),
      entity({ entityType: 'LOCATION', engine: 'semantic' }),
    ];
    const split = groupEntitiesByEngine(entities);
    expect(split.regex.map((e) => e.entityType)).toEqual(['FNR', 'EMAIL']);
    expect(split.semantic.map((e) => e.entityType)).toEqual(['PERSON', 'LOCATION']);
  });

  it('handles an empty list', () => {
    const split = groupEntitiesByEngine([]);
    expect(split.regex).toEqual([]);
    expect(split.semantic).toEqual([]);
  });
});

describe('tones', () => {
  it('phaseTone maps enforce→protective, shadow→measuring, off→inactive', () => {
    expect(phaseTone('enforce')).toBe('protective');
    expect(phaseTone('shadow')).toBe('measuring');
    expect(phaseTone('off')).toBe('inactive');
  });

  it('actionTone maps block/enforce→protective, shadow→measuring, allow→inactive', () => {
    expect(actionTone('block')).toBe('protective');
    expect(actionTone('enforce')).toBe('protective');
    expect(actionTone('shadow')).toBe('measuring');
    expect(actionTone('allow')).toBe('inactive');
  });
});
