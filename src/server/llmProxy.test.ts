import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import {
  validateGroupsInvariants,
  normalizeProxyConfig,
  compositeToRef,
  refToComposite,
} from './llmProxy';

function groups(over: Partial<t.ChatModelGroup>[] = []): t.ChatModelGroup[] {
  const base: t.ChatModelGroup[] = [
    { id: 'premium', name: 'premium', models: ['p1'], legacyNames: [] },
    { id: 'standard', name: 'standard', models: ['s1'], legacyNames: [] },
    { id: 'basic', name: 'basic', models: ['b1'], legacyNames: [] },
  ];
  return over.length ? (over as t.ChatModelGroup[]) : base;
}

const commonRaw = {
  isActive: true,
  openrouterBaseUrl: 'https://openrouter.ai/api/v1',
  openrouterReferer: null,
  openrouterTitle: null,
  embeddingsEnabled: false,
  allowedEmbeddingModels: [],
  defaultEmbeddingDimensions: null,
  requestTimeoutMs: 30_000,
  promptCacheEnabled: true,
  piiEnabled: false,
  piiFailMode: 'closed' as const,
  openRouterKeyManaged: true,
  mistralKeyManaged: false,
  piiSecretsPresent: false,
  providerMode: 'openrouter' as const,
  updatedAt: null,
  updatedBy: null,
  dbBacked: true,
};

/** Proxy wire routing groups (routing v3): provider-explicit ModelRefs, as the proxy actually returns. */
function wireGroups(): Array<{
  id: string;
  name: string;
  models: t.ModelRef[];
  legacyNames: string[];
}> {
  return [
    {
      id: 'premium',
      name: 'premium',
      models: [{ provider: 'openrouter', model: 'p1' }],
      legacyNames: [],
    },
    {
      id: 'standard',
      name: 'standard',
      models: [{ provider: 'mistral', model: 's1' }],
      legacyNames: [],
    },
    {
      id: 'basic',
      name: 'basic',
      models: [{ provider: 'openrouter', model: 'b1' }],
      legacyNames: [],
    },
  ];
}

describe('validateGroupsInvariants', () => {
  it('accepts a valid set of groups', () => {
    expect(validateGroupsInvariants(groups(), 'standard')).toEqual([]);
  });

  it('rejects a non-slug name', () => {
    const errors = validateGroupsInvariants(
      [{ id: 'a', name: 'Not A Slug', models: ['m'], legacyNames: [] }],
      'a',
    );
    expect(errors.some((e) => e.includes('valid name'))).toBe(true);
  });

  it('rejects a name colliding with another group name or legacy name', () => {
    const dupName = validateGroupsInvariants(
      [
        { id: 'a', name: 'dup', models: ['m'], legacyNames: [] },
        { id: 'b', name: 'dup', models: ['m'], legacyNames: [] },
      ],
      'a',
    );
    expect(dupName.some((e) => e.includes('used by more than one'))).toBe(true);
    const dupLegacy = validateGroupsInvariants(
      [
        { id: 'a', name: 'alpha', models: ['m'], legacyNames: [] },
        { id: 'b', name: 'beta', models: ['m'], legacyNames: ['alpha'] },
      ],
      'a',
    );
    expect(dupLegacy.some((e) => e.includes('used by more than one'))).toBe(true);
  });

  it('rejects an empty model list and a missing default', () => {
    expect(
      validateGroupsInvariants([{ id: 'a', name: 'a', models: [], legacyNames: [] }], 'a').some(
        (e) => e.includes('at least one model'),
      ),
    ).toBe(true);
    expect(
      validateGroupsInvariants(groups(), 'nope').some((e) => e.includes('default group')),
    ).toBe(true);
  });
});

describe('compositeToRef / refToComposite', () => {
  it('round-trips a provider-tagged model key', () => {
    expect(compositeToRef('mistral:mistral-large-latest')).toEqual({
      provider: 'mistral',
      model: 'mistral-large-latest',
    });
    // OpenRouter ids contain `/`, never `:`, so the model part is preserved (split on the first `:`).
    expect(compositeToRef('openrouter:openai/gpt-4o')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-4o',
    });
    expect(refToComposite({ provider: 'mistral', model: 'x' })).toBe('mistral:x');
  });

  it('defaults an unprefixed / unknown-provider id to OpenRouter (custom-typed model)', () => {
    expect(compositeToRef('openai/gpt-5')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-5',
    });
    expect(compositeToRef('anthropic:claude')).toEqual({
      provider: 'openrouter',
      model: 'anthropic:claude',
    });
  });
});

describe('normalizeProxyConfig', () => {
  it('flags a v2 response as proxyApiV2 and maps wire ModelRefs to composite keys', () => {
    const raw = {
      ...commonRaw,
      mistralKeyManaged: true,
      chatRouting: { version: 3, defaultGroupId: 'standard', groups: wireGroups() },
      defaultGroup: { id: 'standard', name: 'standard' },
      configRevision: 4,
    };
    const config = normalizeProxyConfig(raw);
    expect(config.proxyApiV2).toBe(true);
    expect(config.configRevision).toBe(4);
    expect(config.mistralKeyManaged).toBe(true);
    expect(config.chatRouting.groups.map((g) => [g.name, g.models])).toEqual([
      ['premium', ['openrouter:p1']],
      ['standard', ['mistral:s1']],
      ['basic', ['openrouter:b1']],
    ]);
  });

  it('maps an old v1 response (3 tier arrays) into read-only OpenRouter-tagged pseudo-groups', () => {
    const raw = {
      ...commonRaw,
      chatModelsPremium: ['pA'],
      chatModelsStandard: ['sA'],
      chatModelsBasic: ['bA'],
    };
    const config = normalizeProxyConfig(raw);
    expect(config.proxyApiV2).toBe(false);
    expect(config.configRevision).toBe(-1);
    expect(config.mistralKeyManaged).toBe(false);
    expect(config.chatRouting.defaultGroupId).toBe('standard');
    expect(config.chatRouting.groups.map((g) => [g.name, g.models])).toEqual([
      ['premium', ['openrouter:pA']],
      ['standard', ['openrouter:sA']],
      ['basic', ['openrouter:bA']],
    ]);
  });
});
