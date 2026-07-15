import yaml from 'js-yaml';
import { describe, it, expect } from 'vitest';
import { PrincipalType, configSchema, Constants } from 'librechat-data-provider';
import type * as t from '@/types';
import {
  sanitizeForImport,
  prepareConfigForExport,
  serializeConfigToYaml,
  buildSuggestedFilename,
  normalizeYamlFilename,
} from './export';

describe('sanitizeForImport', () => {
  it('drops null and undefined but keeps false, 0 and empty string', () => {
    const input: t.ConfigValue = { a: undefined, b: null, c: false, d: 0, e: '', f: 'x' };
    expect(sanitizeForImport(input)).toEqual({ c: false, d: 0, e: '', f: 'x' });
  });

  it('drops null-valued object fields and empty-object stubs (AppService artifacts)', () => {
    const input: t.ConfigValue = {
      mcpServers: null,
      mcpSettings: null,
      turnstile: { siteKey: undefined, options: {} },
      interface: { customWelcome: 'Hei' },
    };
    expect(sanitizeForImport(input)).toEqual({ interface: { customWelcome: 'Hei' } });
  });

  it('keeps empty arrays and filters null/undefined array elements', () => {
    const input: t.ConfigValue = { list: [{ k: 1, d: undefined }, null, 2, 3], empty: [] };
    expect(sanitizeForImport(input)).toEqual({ list: [{ k: 1 }, 2, 3], empty: [] });
  });

  it('does not mutate the input', () => {
    const input: t.ConfigValue = { a: null, b: { c: undefined, d: 1 } };
    sanitizeForImport(input);
    expect(input).toEqual({ a: null, b: { c: undefined, d: 1 } });
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
  it('drops null/undefined/empty holes and backfills version', () => {
    const result = prepareConfigForExport({ a: 1, b: undefined, c: { d: null, e: 2 } });
    expect(result).toEqual({ a: 1, c: { e: 2 }, version: Constants.CONFIG_VERSION });
  });

  it('keeps an existing version instead of overwriting it', () => {
    const result = prepareConfigForExport({
      version: '9.9.9',
      interface: { customWelcome: 'Hei' },
    });
    expect(result.version).toBe('9.9.9');
  });

  it('backfills version from the canonical CONFIG_VERSION when absent', () => {
    const result = prepareConfigForExport({ interface: { customWelcome: 'Hei' } });
    expect(result.version).toBe(Constants.CONFIG_VERSION);
    expect(Constants.CONFIG_VERSION).toBe('1.3.13');
  });

  it('round-trips through the YAML serializer without loss', () => {
    const prepared = prepareConfigForExport({
      version: '1.2.1',
      interface: { customWelcome: 'Hei' },
    });
    const loaded = yaml.load(serializeConfigToYaml(prepared), { schema: yaml.JSON_SCHEMA });
    expect(loaded).toEqual(prepared);
  });

  // Regression for the reported bug: the AppService runtime shape the admin panel actually
  // exports (null mcp*, empty turnstile stub, missing version) must pass the REAL strict
  // input configSchema after prepare + serialize + reload — i.e. it becomes importable.
  it('makes the real AppService base shape pass the strict configSchema', () => {
    const appServiceActiveConfig: Record<string, t.ConfigValue> = {
      interface: { customWelcome: 'Velkommen til Varde Venn', modelSelect: false },
      mcpServers: null,
      mcpSettings: null,
      turnstile: { siteKey: undefined, options: undefined },
      registration: { socialLogins: ['google'] },
      balance: { enabled: true, startBalance: 20000 },
      fileStrategy: 's3',
      endpoints: {
        custom: [
          {
            name: 'Varde',
            apiKey: '${OPENROUTER_KEY}',
            baseURL: 'https://proxy/v1',
            headers: { 'x-vv-user-id': '{{LIBRECHAT_USER_ID}}' },
          },
        ],
      },
    };

    // Before the fix (raw serialize) the strict schema rejects it.
    const rawFails = configSchema.safeParse(
      yaml.load(serializeConfigToYaml(appServiceActiveConfig), { schema: yaml.JSON_SCHEMA }),
    );
    expect(rawFails.success).toBe(false);

    // After the fix it validates.
    const prepared = prepareConfigForExport(appServiceActiveConfig);
    const reloaded = yaml.load(serializeConfigToYaml(prepared), { schema: yaml.JSON_SCHEMA });
    const result = configSchema.safeParse(reloaded);
    expect(result.success).toBe(true);
    // the exact prod errors are gone
    expect(prepared.version).toBe(Constants.CONFIG_VERSION);
    expect('mcpServers' in prepared).toBe(false);
    expect('mcpSettings' in prepared).toBe(false);
    expect('turnstile' in prepared).toBe(false);
    // real user config survives
    expect(prepared.interface).toEqual({
      customWelcome: 'Velkommen til Varde Venn',
      modelSelect: false,
    });
    expect(prepared.endpoints).toEqual(appServiceActiveConfig.endpoints);
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
