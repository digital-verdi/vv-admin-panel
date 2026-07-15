import yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';
import { PrincipalType } from 'librechat-data-provider';
import type * as t from '@/types';
import {
  removeUndefinedDeep,
  prepareConfigForExport,
  serializeConfigToYaml,
  buildSuggestedFilename,
  normalizeYamlFilename,
} from './export';

describe('removeUndefinedDeep', () => {
  it('drops undefined but keeps null, false, 0 and empty string', () => {
    const input: t.ConfigValue = { a: undefined, b: null, c: false, d: 0, e: '', f: 'x' };
    expect(removeUndefinedDeep(input)).toEqual({ b: null, c: false, d: 0, e: '', f: 'x' });
  });

  it('recurses into nested objects and arrays while preserving order', () => {
    const input: t.ConfigValue = {
      nested: { keep: 1, drop: undefined },
      list: [{ k: 1, d: undefined }, 2, 3],
    };
    expect(removeUndefinedDeep(input)).toEqual({ nested: { keep: 1 }, list: [{ k: 1 }, 2, 3] });
  });

  it('does not mutate the input', () => {
    const input: t.ConfigValue = { a: undefined, b: { c: undefined, d: 1 } };
    removeUndefinedDeep(input);
    expect(input).toEqual({ a: undefined, b: { c: undefined, d: 1 } });
  });
});

describe('serializeConfigToYaml', () => {
  const config: Record<string, t.ConfigValue> = {
    version: '1.2.1',
    interface: { customWelcome: 'Velkommen til Varde Venn' },
    endpoints: {
      custom: [
        {
          name: 'OpenRouter',
          apiKey: '${OPENROUTER_KEY}',
          baseURL:
            'https://openrouter.ai/api/v1/chat/completions/very/long/path/that/must/not/wrap',
        },
      ],
    },
  };

  it('round-trips: dump then load yields the same object', () => {
    const text = serializeConfigToYaml(config);
    expect(yaml.load(text, { schema: yaml.JSON_SCHEMA })).toEqual(config);
  });

  it('preserves ${ENV} placeholders as strings', () => {
    expect(serializeConfigToYaml(config)).toContain('${OPENROUTER_KEY}');
  });

  it('does not wrap long URLs and produces no anchors/aliases', () => {
    const text = serializeConfigToYaml(config);
    expect(text).toContain('very/long/path/that/must/not/wrap');
    expect(text).not.toMatch(/&\w|\*\w/);
  });

  it('ends with a trailing newline', () => {
    expect(serializeConfigToYaml(config).endsWith('\n')).toBe(true);
  });
});

describe('prepareConfigForExport', () => {
  it('removes undefined holes and returns a plain config object', () => {
    const result = prepareConfigForExport({ a: 1, b: undefined, c: { d: undefined, e: 2 } });
    expect(result).toEqual({ a: 1, c: { e: 2 } });
  });

  it('round-trips through the YAML serializer without loss', () => {
    const prepared = prepareConfigForExport({
      version: '1.2.1',
      interface: { customWelcome: 'Hei' },
    });
    const loaded = yaml.load(serializeConfigToYaml(prepared), { schema: yaml.JSON_SCHEMA });
    expect(loaded).toEqual(prepared);
  });
});

describe('buildSuggestedFilename', () => {
  const now = new Date('2026-07-15T09:00:00.000Z');

  it('builds a base filename', () => {
    expect(buildSuggestedFilename({ type: 'BASE' }, now)).toBe('librechat-base-2026-07-15.yaml');
  });

  it('builds a role filename from the scope name', () => {
    const scope: t.ScopeSelection = {
      type: 'SCOPE',
      scope: {
        principalType: PrincipalType.ROLE,
        principalId: 'r1',
        name: 'Support Team',
        priority: 10,
        isActive: true,
      },
    };
    expect(buildSuggestedFilename(scope, now)).toBe('librechat-role-support-team-2026-07-15.yaml');
  });

  it('builds a group filename', () => {
    const scope: t.ScopeSelection = {
      type: 'SCOPE',
      scope: {
        principalType: PrincipalType.GROUP,
        principalId: 'g1',
        name: 'Pilot users',
        priority: 20,
        isActive: true,
      },
    };
    expect(buildSuggestedFilename(scope, now)).toBe('librechat-group-pilot-users-2026-07-15.yaml');
  });
});

describe('normalizeYamlFilename', () => {
  const fallback = 'librechat-base-2026-07-15.yaml';

  it.each([
    ['min-konfig', 'min-konfig.yaml'],
    ['min-konfig.yml', 'min-konfig.yml'],
    ['min-konfig.yaml', 'min-konfig.yaml'],
    ['min-konfig.txt', 'min-konfig.yaml'],
    ['../../prod-config', 'prod-config.yaml'],
    ['a/b/c/report', 'report.yaml'],
    ['bad:*?"<>|name', 'badname.yaml'],
    ['ærlig-øvre-åsen', 'ærlig-øvre-åsen.yaml'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizeYamlFilename(input, fallback)).toBe(expected);
  });

  it('falls back on empty / dot-only input', () => {
    expect(normalizeYamlFilename('', fallback)).toBe(fallback);
    expect(normalizeYamlFilename('   ', fallback)).toBe(fallback);
    expect(normalizeYamlFilename('..', fallback)).toBe(fallback);
  });

  it('caps very long base names to 120 chars + extension', () => {
    const long = 'x'.repeat(300);
    const result = normalizeYamlFilename(long, fallback);
    expect(result).toBe(`${'x'.repeat(120)}.yaml`);
  });
});
