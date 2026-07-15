import { describe, it, expect } from 'vitest';
import type * as t from '@/types';
import { validateGroupsInvariants, normalizeProxyConfig } from './llmProxy';

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
  piiSecretsPresent: false,
  providerMode: 'openrouter' as const,
  updatedAt: null,
  updatedBy: null,
  dbBacked: true,
};

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

describe('normalizeProxyConfig', () => {
  it('flags a v2 response (chatRouting + configRevision) as proxyApiV2', () => {
    const raw = {
      ...commonRaw,
      chatRouting: { version: 2, defaultGroupId: 'standard', groups: groups() },
      defaultGroup: { id: 'standard', name: 'standard' },
      configRevision: 4,
    };
    const config = normalizeProxyConfig(raw);
    expect(config.proxyApiV2).toBe(true);
    expect(config.configRevision).toBe(4);
    expect(config.chatRouting.groups.map((g) => g.name)).toEqual(['premium', 'standard', 'basic']);
  });

  it('maps an old v1 response (3 tier arrays) into read-only pseudo-groups', () => {
    const raw = {
      ...commonRaw,
      chatModelsPremium: ['pA'],
      chatModelsStandard: ['sA'],
      chatModelsBasic: ['bA'],
    };
    const config = normalizeProxyConfig(raw);
    expect(config.proxyApiV2).toBe(false);
    expect(config.configRevision).toBe(-1);
    expect(config.chatRouting.defaultGroupId).toBe('standard');
    expect(config.chatRouting.groups.map((g) => [g.name, g.models])).toEqual([
      ['premium', ['pA']],
      ['standard', ['sA']],
      ['basic', ['bA']],
    ]);
  });
});
