import { Icon } from '@clickhouse/click-ui';
import type * as t from '@/types';
import { TextField } from '@/components/configuration/fields';
import { TrashButton } from '@/components/shared';
import { ModelTierField } from './ModelTierField';
import { useLocalize } from '@/hooks';

interface GroupCardProps {
  group: t.ChatModelGroup;
  options: t.SelectOption[];
  isDefault: boolean;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  nameError?: string;
  onChange: (group: t.ChatModelGroup) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}

/**
 * One chat-model group: an editable slug name, its ordered model list (reusing {@link ModelTierField}),
 * its legacy-name chips (removable), and move/delete controls. The default group cannot be deleted (pick a
 * new default first) — deletion is gated in the parent.
 */
export function GroupCard({
  group,
  options,
  isDefault,
  disabled,
  canMoveUp,
  canMoveDown,
  nameError,
  onChange,
  onDelete,
  onMove,
}: GroupCardProps) {
  const localize = useLocalize();
  const moveBtn =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-(--cui-color-stroke-default) text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-muted) disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            id={`group-name-${group.id}`}
            value={group.name}
            onChange={(v) => onChange({ ...group, name: v })}
            disabled={disabled}
            aria-label="Group name"
            placeholder="e.g. standard"
          />
        </div>
        {isDefault && (
          <span className="shrink-0 rounded-full bg-(--cui-color-background-accent-muted) px-2 py-0.5 text-xs font-medium text-(--cui-color-text-accent)">
            Default
          </span>
        )}
        <button
          type="button"
          className={moveBtn}
          onClick={() => onMove(-1)}
          disabled={disabled || !canMoveUp}
          aria-label={`Move ${group.name || 'group'} up`}
        >
          <Icon name="chevron-down" size="sm" className="rotate-180" />
        </button>
        <button
          type="button"
          className={moveBtn}
          onClick={() => onMove(1)}
          disabled={disabled || !canMoveDown}
          aria-label={`Move ${group.name || 'group'} down`}
        >
          <Icon name="chevron-down" size="sm" />
        </button>
        {!disabled && !isDefault && (
          <TrashButton
            onClick={onDelete}
            ariaLabel={`${localize('com_ui_delete')} ${group.name || 'group'}`}
          />
        )}
      </div>

      {nameError && (
        <p role="alert" className="text-xs text-(--cui-color-text-danger)">
          {nameError}
        </p>
      )}

      <ModelTierField
        id={`group-models-${group.id}`}
        values={group.models}
        options={options}
        maxItems={3}
        onChange={(models) => onChange({ ...group, models })}
        disabled={disabled}
        aria-label={`${group.name || 'group'} models`}
      />

      {group.legacyNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-(--cui-color-text-muted)">Legacy names:</span>
          {group.legacyNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-(--cui-color-background-muted) px-2 py-0.5 text-xs text-(--cui-color-text-muted)"
            >
              {name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...group, legacyNames: group.legacyNames.filter((n) => n !== name) })
                  }
                  aria-label={`Remove legacy name ${name}`}
                  className="flex items-center text-(--cui-color-text-muted) hover:text-(--cui-color-text-danger)"
                >
                  <Icon name="cross" size="xs" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
