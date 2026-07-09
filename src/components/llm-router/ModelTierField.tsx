import type * as t from '@/types';
import { AddItemButton, TrashButton } from '@/components/shared';
import { ModelSelect } from './ModelSelect';
import { useLocalize } from '@/hooks';

interface ModelTierFieldProps {
  id: string;
  values: string[];
  options: t.SelectOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  maxItems?: number;
  'aria-label'?: string;
}

/**
 * An ordered list of searchable {@link ModelSelect} rows for one chat tier (1 primary + up to
 * `maxItems - 1` fallbacks, in priority order). Mirrors the shared ListField's add/remove UX (reusing
 * AddItemButton/TrashButton) but with a filterable combobox per row — kept as its own component so the
 * shared ListField stays untouched (isolated patch). The last row can't be removed (a tier needs ≥1),
 * a new row is seeded with the first unused catalog model (so it's never saved empty), and each row
 * excludes models already chosen in the other rows.
 */
export function ModelTierField({
  id,
  values,
  options,
  onChange,
  disabled,
  maxItems = 3,
  'aria-label': ariaLabel,
}: ModelTierFieldProps) {
  const localize = useLocalize();

  const handleChange = (index: number, val: string) => {
    const next = [...values];
    next[index] = val;
    onChange(next);
  };
  const handleRemove = (index: number) => onChange(values.filter((_, i) => i !== index));
  const handleAdd = () => {
    const used = new Set(values);
    const seed = options.find((o) => !used.has(o.value))?.value ?? '';
    onChange([...values, seed]);
  };

  const label = ariaLabel ?? 'Model';

  return (
    <div id={id} role="list" aria-label={ariaLabel} className="flex w-full max-w-100 flex-col gap-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2" role="listitem">
          <ModelSelect
            id={`${id}-${index}`}
            value={value}
            options={options.filter((o) => o.value === value || !values.includes(o.value))}
            onChange={(v) => handleChange(index, v)}
            disabled={disabled}
            aria-label={`${label} ${index + 1}${index === 0 ? ' (primary)' : ' (fallback)'}`}
          />
          {!disabled && values.length > 1 && (
            <TrashButton
              onClick={() => handleRemove(index)}
              ariaLabel={`${localize('com_ui_delete')} ${label} ${index + 1}`}
            />
          )}
        </div>
      ))}

      {!disabled && values.length < maxItems && (
        <AddItemButton label={localize('com_ui_add_item', { item: 'model' })} onClick={handleAdd} />
      )}
    </div>
  );
}
