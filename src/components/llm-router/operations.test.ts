import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import { buildModelOptions, addGroup, moveGroup, deleteGroup } from './operations';

function model(over: Partial<t.LlmProxyModel>): t.LlmProxyModel {
  return {
    id: 'x',
    name: 'Friendly Name',
    provider: 'openrouter',
    supportsVision: false,
    supportsReasoning: 'unknown',
    ...over,
  };
}

describe('buildModelOptions', () => {
  it('formats every option as <provider>:<model> for value AND label — no friendly name, no provider tag', () => {
    const opts = buildModelOptions([
      model({
        provider: 'openrouter',
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
      }),
      model({ provider: 'openrouter', id: 'MoonshotAI/Kimi-K3', name: 'MoonshotAI: Kimi K3' }),
      model({ provider: 'mistral', id: 'pixtral-12b-2409', name: 'Pixtral 12B' }),
    ]);
    expect(opts).toEqual([
      {
        label: 'openrouter:anthropic/claude-3.7-sonnet',
        value: 'openrouter:anthropic/claude-3.7-sonnet',
      },
      { label: 'openrouter:MoonshotAI/Kimi-K3', value: 'openrouter:MoonshotAI/Kimi-K3' },
      { label: 'mistral:pixtral-12b-2409', value: 'mistral:pixtral-12b-2409' },
    ]);
    // No friendly name / capitalization / trailing `· provider` tag survives.
    for (const o of opts) {
      expect(o.label).toBe(o.value);
      expect(o.label).not.toContain(' · ');
      expect(o.label).not.toContain(' ');
    }
  });

  it('preserves the slash in OpenRouter ids and the bare id for Mistral', () => {
    const [or] = buildModelOptions([model({ provider: 'openrouter', id: 'org/model-v2' })]);
    expect(or!.value).toBe('openrouter:org/model-v2');
    const [mi] = buildModelOptions([model({ provider: 'mistral', id: 'mistral-small-latest' })]);
    expect(mi!.value).toBe('mistral:mistral-small-latest');
  });

  it('de-duplicates by the composite key (same id across providers stays distinct)', () => {
    const opts = buildModelOptions([
      model({ provider: 'openrouter', id: 'dup' }),
      model({ provider: 'openrouter', id: 'dup', name: 'other name' }),
      model({ provider: 'mistral', id: 'dup' }),
    ]);
    expect(opts.map((o) => o.value)).toEqual(['openrouter:dup', 'mistral:dup']);
  });
});

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
