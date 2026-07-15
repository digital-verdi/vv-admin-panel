import yaml from 'js-yaml';
import { Constants } from 'librechat-data-provider';
import type * as t from '@/types';
import { deepSerializeKVPairs, normalizeImportConfig } from '@/utils';
import { getScopeTypeConfig } from '@/constants';

const MAX_FILENAME_BASE = 120;
const INVALID_FILENAME_CHARS = /[/\\:*?"<>|]/g;

function isPlainObject(value: t.ConfigValue): value is Record<string, t.ConfigValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursively removes `null`/`undefined` values and the empty objects that result
 * (`false`, `0`, empty strings and arrays are kept; input is never mutated).
 *
 * The admin panel's active config is LibreChat's AppService runtime representation:
 * unset optionals come through as `null` (e.g. `mcpServers`, `mcpSettings`) or empty
 * stub objects (e.g. `turnstile: {}`), which the strict input `configSchema` rejects
 * (`Expected object, received null`, `turnstile.siteKey: Required`). Dropping them
 * makes the exported config a valid, importable `librechat.yaml`.
 */
export function sanitizeForImport(value: t.ConfigValue): t.ConfigValue {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined).map(sanitizeForImport);
  }
  if (isPlainObject(value)) {
    const result: Record<string, t.ConfigValue> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined || val === null) {
        continue;
      }
      const cleaned = sanitizeForImport(val);
      if (isPlainObject(cleaned) && Object.keys(cleaned).length === 0) {
        continue;
      }
      result[key] = cleaned;
    }
    return result;
  }
  return value;
}

/**
 * Canonicalizes an editor config object into a valid, importable `librechat.yaml`:
 * converts UI key/value-pair arrays back to records, maps legacy keys + strips
 * interface permission fields (matching the import/save round-trip), removes the
 * AppService `null`/empty stubs, and backfills the required `version` (which the
 * AppService runtime config omits) from the schema's canonical `CONFIG_VERSION`.
 */
export function prepareConfigForExport(
  config: Record<string, t.ConfigValue>,
): Record<string, t.ConfigValue> {
  const canonical = deepSerializeKVPairs(config) as Record<string, t.ConfigValue>;
  const normalized = normalizeImportConfig(canonical);
  const sanitized = sanitizeForImport(normalized) as Record<string, t.ConfigValue>;
  if (typeof sanitized.version !== 'string' || sanitized.version.length === 0) {
    sanitized.version = Constants.CONFIG_VERSION;
  }
  return sanitized;
}

/**
 * Serializes a config object to a LibreChat-config YAML string using the same
 * JSON schema the import parser reads, with no anchors/aliases, no line wrapping,
 * source key order preserved, and a trailing newline.
 */
export function serializeConfigToYaml(config: Record<string, t.ConfigValue>): string {
  const text = yaml.dump(config, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
  });
  return text.endsWith('\n') ? text : `${text}\n`;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Builds a default download filename for the given scope, e.g.
 * `librechat-base-2026-07-15.yaml` / `librechat-role-support-2026-07-15.yaml`.
 */
export function buildSuggestedFilename(scope: t.ScopeSelection, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  if (scope.type === 'BASE') {
    return `librechat-base-${date}.yaml`;
  }
  const kind = String(scope.scope.principalType).toLowerCase();
  const slug = slugify(scope.scope.name) || kind;
  return `librechat-${kind}-${slug}-${date}.yaml`;
}

/**
 * Sanitizes a user-supplied download filename: strips any path, removes invalid
 * filesystem characters, collapses whitespace, caps the base length, and ensures
 * a `.yaml`/`.yml` extension. Falls back to `fallback` when nothing usable remains.
 */
export function normalizeYamlFilename(requested: string, fallback: string): string {
  const basename = (requested.split(/[/\\]/).pop() ?? '')
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (basename === '' || basename === '.' || basename === '..') {
    return fallback;
  }

  const lower = basename.toLowerCase();
  let base: string;
  let ext: string;
  if (lower.endsWith('.yaml')) {
    base = basename.slice(0, -5);
    ext = basename.slice(-5);
  } else if (lower.endsWith('.yml')) {
    base = basename.slice(0, -4);
    ext = basename.slice(-4);
  } else {
    const dot = basename.lastIndexOf('.');
    base = dot > 0 ? basename.slice(0, dot) : basename;
    ext = '.yaml';
  }

  base = base.trim().slice(0, MAX_FILENAME_BASE).trim();
  if (base === '' || base === '.' || base === '..') {
    return fallback;
  }
  return `${base}${ext}`;
}

/** Resolves a human-readable source label for a scope selection. */
export function scopeSourceLabel(
  scope: t.ScopeSelection,
  localize: (key: string) => string,
): string {
  if (scope.type === 'BASE') {
    return localize('com_config_export_yaml_source_base');
  }
  return `${localize(getScopeTypeConfig(scope.scope.principalType).labelKey)} — ${scope.scope.name}`;
}

/** Triggers a browser download of `text` as `filename`. */
export function downloadYamlFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
