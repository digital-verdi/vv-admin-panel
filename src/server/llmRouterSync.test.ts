import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import { findVardeEndpoint, computeVardeSyncPlan, extractVardeFragments } from './llmRouterSync';

type Cfg = Record<string, t.ConfigValue>;

function baseConfig(over: { custom?: unknown[]; specs?: unknown[] } = {}): Cfg {
  const custom = over.custom ?? [
    { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', models: { default: ['x'] } },
    {
      name: 'Varde',
      apiKey: '${VV_LLM_PROXY_API_KEY}',
      baseURL: '${VV_LLM_PROXY_BASE_URL}/v1',
      models: { default: ['basic', 'standard', 'premium'], fetch: false },
      titleConvo: true,
      titleModel: 'standard',
    },
  ];
  const specs = over.specs ?? [
    { name: 'varde-default', label: 'Varde', preset: { endpoint: 'Varde', model: 'standard' } },
    { name: 'openrouter-direct', label: 'OR', preset: { endpoint: 'OpenRouter', model: 'x' } },
  ];
  return { endpoints: { custom }, modelSpecs: { list: specs } } as unknown as Cfg;
}

function groups(over?: t.ChatModelGroup[]): t.ChatModelGroup[] {
  return (
    over ?? [
      { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
      { id: 'standard', name: 'standard', models: ['s1'], legacyNames: [] },
      { id: 'premium', name: 'premium', models: ['p1'], legacyNames: [] },
    ]
  );
}

describe('findVardeEndpoint', () => {
  it('finds the Varde endpoint by name', () => {
    const found = findVardeEndpoint(baseConfig());
    expect('error' in found).toBe(false);
    if (!('error' in found)) expect(found.index).toBe(1);
  });

  it('reports missing when there is no Varde endpoint', () => {
    const found = findVardeEndpoint(baseConfig({ custom: [{ name: 'OpenRouter' }] }));
    expect(found).toEqual({ error: 'missing' });
  });

  it('reports ambiguous when there is more than one Varde endpoint', () => {
    const found = findVardeEndpoint(baseConfig({ custom: [{ name: 'Varde' }, { name: 'Varde' }] }));
    expect(found).toEqual({ error: 'ambiguous' });
  });

  it('handles an index-keyed object shape for endpoints.custom', () => {
    const config = {
      endpoints: { custom: { '0': { name: 'OpenRouter' }, '1': { name: 'Varde' } } },
    } as unknown as Cfg;
    const found = findVardeEndpoint(config);
    expect('error' in found).toBe(false);
    if (!('error' in found)) expect(found.index).toBe(1);
  });
});

describe('extractVardeFragments', () => {
  it('reads the Varde models.default, titleModel, and only the Varde spec models', () => {
    expect(extractVardeFragments(baseConfig())).toEqual({
      modelsDefault: ['basic', 'standard', 'premium'],
      titleModel: 'standard',
      specModels: [{ index: 0, model: 'standard' }],
    });
  });
});

describe('computeVardeSyncPlan', () => {
  it('is a no-op when nothing changed', () => {
    const plan = computeVardeSyncPlan(baseConfig(), groups(), 'standard');
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.entries).toEqual([]);
    expect(plan.unresolvedSpecs).toEqual([]);
  });

  it('rewrites models.default, titleModel and the spec via legacy names on a rename', () => {
    const renamed = groups([
      { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
      { id: 'standard', name: 'advanced', models: ['s1'], legacyNames: ['standard'] },
      { id: 'premium', name: 'premium', models: ['p1'], legacyNames: [] },
    ]);
    const plan = computeVardeSyncPlan(baseConfig(), renamed, 'standard');
    if ('error' in plan) throw new Error('unexpected error');
    expect(plan.diff.modelsDefault.after).toEqual(['basic', 'advanced', 'premium']);
    expect(plan.diff.titleModel).toEqual({ before: 'standard', after: 'advanced' });
    expect(plan.diff.specs).toEqual([
      { index: 0, name: 'varde-default', before: 'standard', after: 'advanced' },
    ]);
    expect(plan.entries.map((e) => e.fieldPath)).toEqual([
      'endpoints.custom.1',
      'modelSpecs.list.0',
    ]);
    expect(plan.unresolvedSpecs).toEqual([]);
  });

  it('reordering only changes models.default, not the specs or routing', () => {
    const reordered = groups([
      { id: 'premium', name: 'premium', models: ['p1'], legacyNames: [] },
      { id: 'standard', name: 'standard', models: ['s1'], legacyNames: [] },
      { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
    ]);
    const plan = computeVardeSyncPlan(baseConfig(), reordered, 'standard');
    if ('error' in plan) throw new Error('unexpected error');
    expect(plan.diff.modelsDefault.after).toEqual(['premium', 'standard', 'basic']);
    expect(plan.diff.specs).toEqual([]);
    expect(plan.entries.map((e) => e.fieldPath)).toEqual(['endpoints.custom.1']);
  });

  it('surfaces a spec pointing at a now-unknown name instead of rewriting it', () => {
    const config = baseConfig({
      specs: [
        { name: 'varde-default', preset: { endpoint: 'Varde', model: 'standard' } },
        { name: 'legacy-spec', preset: { endpoint: 'Varde', model: 'gone' } },
      ],
    });
    const plan = computeVardeSyncPlan(config, groups(), 'standard');
    if ('error' in plan) throw new Error('unexpected error');
    expect(plan.unresolvedSpecs).toEqual([{ index: 1, name: 'legacy-spec', model: 'gone' }]);
    expect(plan.entries.some((e) => e.fieldPath === 'modelSpecs.list.1')).toBe(false);
  });

  it('forces the default spec to the default group name', () => {
    const config = baseConfig({
      specs: [{ name: 'forced', default: true, preset: { endpoint: 'Varde', model: 'x' } }],
    });
    const plan = computeVardeSyncPlan(config, groups(), 'premium');
    if ('error' in plan) throw new Error('unexpected error');
    expect(plan.diff.specs).toEqual([{ index: 0, name: 'forced', before: 'x', after: 'premium' }]);
  });

  it('returns an error when the Varde endpoint is missing', () => {
    const plan = computeVardeSyncPlan(
      baseConfig({ custom: [{ name: 'OpenRouter' }] }),
      groups(),
      'standard',
    );
    expect(plan).toEqual({ error: 'missing' });
  });
});
