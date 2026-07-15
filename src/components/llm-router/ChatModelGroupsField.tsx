import { useState } from 'react';
import type * as t from '@/types';
import { SelectField, ToggleField } from '@/components/configuration/fields';
import { AddItemButton, FormDialog } from '@/components/shared';
import { GROUP_NAME_RE } from '@/server';
import { GroupCard } from './GroupCard';
import { addGroup, moveGroup, deleteGroup } from './operations';
import { useLocalize } from '@/hooks';

interface ChatModelGroupsFieldProps {
  value: t.ChatRoutingConfig;
  options: t.SelectOption[];
  disabled: boolean;
  onChange: (value: t.ChatRoutingConfig) => void;
}

interface DeleteState {
  open: boolean;
  targetId: string;
  newDefaultId: string;
  fold: boolean;
  foldTargetId: string;
}

const CLOSED_DELETE: DeleteState = {
  open: false,
  targetId: '',
  newDefaultId: '',
  fold: false,
  foldTargetId: '',
};

/**
 * Editor for the dynamic chat-model groups: add / rename / reorder / delete groups, each with 1 primary +
 * up to 2 fallbacks, exactly one default. Deleting a group requires choosing a replacement default (when it
 * was the default) and offers to fold its name + legacy names into another group so nothing that still
 * references the old name breaks. Fully controlled — emits the whole {@link t.ChatRoutingConfig} up.
 */
export function ChatModelGroupsField({
  value,
  options,
  disabled,
  onChange,
}: ChatModelGroupsFieldProps) {
  const localize = useLocalize();
  const [del, setDel] = useState<DeleteState>(CLOSED_DELETE);

  const { groups, defaultGroupId } = value;
  const emit = (next: Partial<t.ChatRoutingConfig>) => onChange({ ...value, ...next });

  const nameUsage = new Map<string, number>();
  for (const group of groups) {
    for (const name of [group.name.trim(), ...group.legacyNames]) {
      nameUsage.set(name, (nameUsage.get(name) ?? 0) + 1);
    }
  }
  const groupNameError = (group: t.ChatModelGroup): string | undefined => {
    const name = group.name.trim();
    if (!GROUP_NAME_RE.test(name)) return 'Use lowercase letters, digits, - or _ (no spaces).';
    if ((nameUsage.get(name) ?? 0) > 1) return 'This name is already used by another group.';
    return undefined;
  };

  const updateGroup = (id: string, next: t.ChatModelGroup) =>
    emit({ groups: groups.map((group) => (group.id === id ? next : group)) });

  const target = groups.find((group) => group.id === del.targetId);
  const others = groups.filter((group) => group.id !== del.targetId);
  const otherOptions: t.SelectOption[] = others.map((group) => ({
    label: group.name || '(unnamed)',
    value: group.id,
  }));
  const deletingDefault = del.targetId === defaultGroupId;
  const deleteBlocked = (deletingDefault && !del.newDefaultId) || (del.fold && !del.foldTargetId);

  const confirmDelete = () => {
    onChange(
      deleteGroup(value, del.targetId, {
        newDefaultId: deletingDefault ? del.newDefaultId : undefined,
        foldIntoId: del.fold ? del.foldTargetId : undefined,
      }),
    );
    setDel(CLOSED_DELETE);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {groups.map((group, index) => (
        <GroupCard
          key={group.id}
          group={group}
          options={options}
          isDefault={group.id === defaultGroupId}
          disabled={disabled}
          canMoveUp={index > 0}
          canMoveDown={index < groups.length - 1}
          nameError={groupNameError(group)}
          onChange={(next) => updateGroup(group.id, next)}
          onDelete={() => setDel({ ...CLOSED_DELETE, open: true, targetId: group.id })}
          onMove={(direction) => onChange(moveGroup(value, index, direction))}
        />
      ))}

      {!disabled && groups.length < 24 && (
        <AddItemButton
          label={localize('com_ui_add_item', { item: 'group' })}
          onClick={() => onChange(addGroup(value, options, () => crypto.randomUUID()))}
        />
      )}

      <div className="flex flex-col gap-1 border-t border-(--cui-color-stroke-default) pt-3">
        <label
          htmlFor="llm-default-group"
          className="text-xs font-medium text-(--cui-color-text-default)"
        >
          Default group (drives LibreChat titleModel + the default model spec)
        </label>
        <SelectField
          id="llm-default-group"
          value={defaultGroupId}
          options={groups.map((group) => ({ label: group.name || '(unnamed)', value: group.id }))}
          onChange={(id) => emit({ defaultGroupId: id })}
          disabled={disabled}
          aria-label="Default chat model group"
        />
      </div>

      <FormDialog
        open={del.open}
        title={`Delete group "${target?.name || ''}"`}
        submitLabel={localize('com_ui_delete')}
        submitDisabled={deleteBlocked}
        onSubmit={confirmDelete}
        onClose={() => setDel(CLOSED_DELETE)}
      >
        {deletingDefault && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="llm-new-default"
              className="text-sm font-medium text-(--cui-color-text-default)"
            >
              This is the default group — choose a new default
            </label>
            <SelectField
              id="llm-new-default"
              value={del.newDefaultId}
              options={otherOptions}
              onChange={(id) => setDel((prev) => ({ ...prev, newDefaultId: id }))}
              aria-label="New default group"
            />
          </div>
        )}
        <ToggleField
          id="llm-fold-legacy"
          checked={del.fold}
          onChange={(fold) => setDel((prev) => ({ ...prev, fold }))}
          aria-label="Keep this group's names routable"
        />
        <p className="-mt-3 text-xs text-(--cui-color-text-muted)">
          Keep this group&apos;s name + legacy names routable by folding them into another group
          (recommended if any chat or model spec still uses them).
        </p>
        {del.fold && (
          <SelectField
            id="llm-fold-target"
            value={del.foldTargetId}
            options={otherOptions}
            onChange={(id) => setDel((prev) => ({ ...prev, foldTargetId: id }))}
            aria-label="Fold names into group"
          />
        )}
        {!del.fold && (
          <p role="note" className="text-xs text-(--cui-color-text-warning)">
            Without folding, any model spec still pointing at this group&apos;s name will become
            unresolved.
          </p>
        )}
      </FormDialog>
    </div>
  );
}
