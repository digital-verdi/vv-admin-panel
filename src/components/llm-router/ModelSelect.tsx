import { Select } from '@clickhouse/click-ui';
import type { SelectOptionListItem } from '@clickhouse/click-ui';
import type * as t from '@/types';

interface ModelSelectProps {
  id: string;
  value: string;
  options: t.SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Searchable model picker: click-ui `<Select showSearch>` renders a filter field at the top of the
 * dropdown (case-insensitive substring, keyboard nav handled by click-ui). `allowCreateOption` lets an
 * admin type a model id that isn't in the OpenRouter catalog (or when the catalog is empty in
 * local/mock mode). The current value is always shown even if it's a custom id not in `options`.
 */
export function ModelSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: ModelSelectProps) {
  const source: t.SelectOption[] =
    value && !options.some((o) => o.value === value) ? [{ label: value, value }, ...options] : options;
  const opts: SelectOptionListItem[] = source.map((o) => ({ label: o.label, value: o.value }));

  // click-ui exposes the accessible name via `triggerProps` (a top-level `aria-label` lands on a
  // role-less wrapper div and is ignored). Include the selected value so a screen reader announces both
  // the row position (primary/fallback) and the current model.
  const triggerLabel = ariaLabel ? `${ariaLabel}: ${value || 'no model selected'}` : undefined;

  return (
    <div className="select-field-a11y w-full" id={id}>
      <Select
        value={value || undefined}
        options={opts}
        onSelect={(next) => onChange(next)}
        showSearch
        allowCreateOption
        customText="Use {search}"
        placeholder="Select or search a model"
        maxHeight="20rem"
        disabled={disabled}
        triggerProps={triggerLabel ? { 'aria-label': triggerLabel } : undefined}
      />
    </div>
  );
}
