import type * as t from '@/types';

/**
 * Build the model-picker options from the merged provider catalog. Both `value` AND `label` are the
 * canonical composite `<provider>:<model>` key — the raw provider id, no friendly display name and no
 * trailing `· provider` tag (e.g. `openrouter:anthropic/claude-3.7-sonnet`, `mistral:pixtral-12b-2409`) —
 * so the dropdown options and the selected value render one consistent, predictable format. De-duplicated
 * by the composite key (a model id is unique only within a provider).
 */
export function buildModelOptions(catalog: t.LlmProxyModel[]): t.SelectOption[] {
  return Array.from(
    new Map(
      catalog.map((m) => {
        const value = `${m.provider}:${m.id}`;
        return [value, { label: value, value }];
      }),
    ).values(),
  );
}

/** Append a new empty group, seeded with the first catalog model not already used by another group. */
export function addGroup(
  config: t.ChatRoutingConfig,
  catalog: t.SelectOption[],
  newId: () => string,
): t.ChatRoutingConfig {
  const used = new Set(config.groups.flatMap((group) => group.models));
  const seed = catalog.find((option) => !used.has(option.value))?.value ?? '';
  const group: t.ChatModelGroup = { id: newId(), name: '', models: [seed], legacyNames: [] };
  return { ...config, groups: [...config.groups, group] };
}

/** Move a group one slot up (-1) or down (+1). Cosmetic — only reorders the advertised models.default. */
export function moveGroup(
  config: t.ChatRoutingConfig,
  index: number,
  direction: -1 | 1,
): t.ChatRoutingConfig {
  const target = index + direction;
  if (target < 0 || target >= config.groups.length) return config;
  const groups = [...config.groups];
  [groups[index], groups[target]] = [groups[target]!, groups[index]!];
  return { ...config, groups };
}

/**
 * Delete a group. When it was the default, `newDefaultId` becomes the new default. When `foldIntoId` is
 * given, the deleted group's name + legacy names are folded into that group's legacyNames (deduped, and
 * never shadowing that group's own live name) so anything still referencing the old name keeps routing.
 */
export function deleteGroup(
  config: t.ChatRoutingConfig,
  targetId: string,
  opts: { newDefaultId?: string; foldIntoId?: string },
): t.ChatRoutingConfig {
  const target = config.groups.find((group) => group.id === targetId);
  if (!target) return config;
  const foldNames = [target.name.trim(), ...target.legacyNames].filter(Boolean);
  const groups = config.groups
    .filter((group) => group.id !== targetId)
    .map((group) => {
      if (opts.foldIntoId && group.id === opts.foldIntoId) {
        const merged = new Set([...group.legacyNames, ...foldNames]);
        merged.delete(group.name.trim());
        return { ...group, legacyNames: [...merged] };
      }
      return group;
    });
  const defaultGroupId =
    targetId === config.defaultGroupId
      ? (opts.newDefaultId ?? config.defaultGroupId)
      : config.defaultGroupId;
  return { ...config, groups, defaultGroupId };
}
