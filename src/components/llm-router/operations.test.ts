import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import { addGroup, moveGroup, deleteGroup } from './operations';

function cfg(over: Partial<t.ChatRoutingConfig> = {}): t.ChatRoutingConfig {
  return {
    version: 2,
    defaultGroupId: 'standard',
    groups: [
      { id: 'premium', name: 'premium', models: ['p1'], legacyNames: [] },
      { id: 'standard', name: 'standard', models: ['s1'], legacyNames: [] },
      { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
    ],
    ...over,
  };
}

describe('addGroup', () => {
  it('appends an empty group seeded with the first unused catalog model', () => {
    const next = addGroup(
      cfg(),
      [
        { label: 's1', value: 's1' },
        { label: 'x', value: 'x' },
      ],
      () => 'new-id',
    );
    expect(next.groups).toHaveLength(4);
    expect(next.groups[3]).toEqual({ id: 'new-id', name: '', models: ['x'], legacyNames: [] });
  });

  it('seeds with an empty model when the catalog is exhausted', () => {
    const next = addGroup(cfg(), [], () => 'new-id');
    expect(next.groups[3]!.models).toEqual(['']);
  });
});

describe('moveGroup', () => {
  it('moves a group down', () => {
    expect(moveGroup(cfg(), 0, 1).groups.map((g) => g.id)).toEqual([
      'standard',
      'premium',
      'basic',
    ]);
  });
  it('moves a group up', () => {
    expect(moveGroup(cfg(), 2, -1).groups.map((g) => g.id)).toEqual([
      'premium',
      'basic',
      'standard',
    ]);
  });
  it('is a no-op past either edge', () => {
    const c = cfg();
    expect(moveGroup(c, 0, -1)).toBe(c);
    expect(moveGroup(c, 2, 1)).toBe(c);
  });
});

describe('deleteGroup', () => {
  it('deletes a non-default group and keeps the default', () => {
    const next = deleteGroup(cfg(), 'premium', {});
    expect(next.groups.map((g) => g.id)).toEqual(['standard', 'basic']);
    expect(next.defaultGroupId).toBe('standard');
  });

  it('reassigns the default when the default group is deleted', () => {
    const next = deleteGroup(cfg(), 'standard', { newDefaultId: 'basic' });
    expect(next.groups.map((g) => g.id)).toEqual(['premium', 'basic']);
    expect(next.defaultGroupId).toBe('basic');
  });

  it('folds the deleted group name + legacy names into another group (deduped, no self-shadow)', () => {
    const start = cfg({
      groups: [
        { id: 'premium', name: 'premium', models: ['p1'], legacyNames: ['old1'] },
        { id: 'standard', name: 'standard', models: ['s1'], legacyNames: ['old1', 'old2'] },
        { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
      ],
    });
    const next = deleteGroup(start, 'standard', { newDefaultId: 'basic', foldIntoId: 'premium' });
    const premium = next.groups.find((g) => g.id === 'premium')!;
    expect(new Set(premium.legacyNames)).toEqual(new Set(['old1', 'old2', 'standard']));
    expect(premium.legacyNames).not.toContain('premium');
    expect(next.defaultGroupId).toBe('basic');
  });

  it('is a no-op for an unknown target id', () => {
    const c = cfg();
    expect(deleteGroup(c, 'nope', {})).toBe(c);
  });
});
