import { describe, it, expect, vi } from 'vitest';
import { useState, useCallback, act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as t from '@/types';
import { renderCollectionEntryFields } from './FieldRenderer';
import { ArrayObjectField } from './fields/ArrayObjectField';
import { createField } from '@/test/fixtures';
import { applyConfigEdit } from './utils';

vi.mock('@/hooks/useLocalize', () => ({
  default: () => (key: string) => key,
  useLocalize: () => (key: string) => key,
}));

interface MockTextFieldProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  type?: string;
}
interface MockButtonProps {
  label?: string;
  onClick?: () => void;
}
interface MockIconButtonProps {
  icon: string;
  onClick?: () => void;
  'aria-label'?: string;
}

vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
  Button: ({ label, onClick }: MockButtonProps) => <button onClick={onClick}>{label}</button>,
  IconButton: ({ icon, onClick, ...props }: MockIconButtonProps) => (
    <button
      onClick={onClick}
      aria-label={props['aria-label'] ?? icon}
      data-testid={`icon-button-${icon}`}
    />
  ),
  TextField: ({ id, value, onChange, onBlur, type }: MockTextFieldProps) => (
    <input
      id={id}
      value={value ?? ''}
      type={type ?? 'text'}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
  ),
}));

/**
 * Mirrors ConfigPage's real edit wiring: an editedValues map maintained by the
 * real applyConfigEdit reducer, an ArrayObjectField driven exactly like
 * ArrayObjectNestedGroup does (whole-array onChange + indexed onEntryChange),
 * and the real collection-entry field renderer. `listRef` exposes the current
 * modelSpecs.list so assertions can inspect what would be saved.
 */
function Harness({
  initialList,
  fields,
  listRef,
}: {
  initialList: t.ConfigValue[];
  fields: t.SchemaField[];
  listRef: { current: t.ConfigValue[] | undefined };
}) {
  const [edited, setEdited] = useState<t.FlatConfigMap>({ 'modelSpecs.list': initialList });
  const onChange = useCallback((path: string, value: t.ConfigValue) => {
    setEdited((prev) => applyConfigEdit(prev, path, value, {}, new Set(), new Set()));
  }, []);
  const list = edited['modelSpecs.list'];
  listRef.current = Array.isArray(list) ? list : undefined;
  return (
    <ArrayObjectField
      id="modelSpecs-list"
      value={list}
      fields={fields}
      onChange={(v) => onChange('modelSpecs.list', v)}
      onEntryChange={(i, v) => onChange(`modelSpecs.list.${i}`, v)}
      renderFields={renderCollectionEntryFields}
    />
  );
}

const specFields = [
  createField({ key: 'name', type: 'string', path: 'modelSpecs.list.name' }),
  createField({ key: 'label', type: 'string', path: 'modelSpecs.list.label' }),
];

const existingSpec = {
  name: 'gpt-4o',
  label: 'GPT-4o',
  preset: { endpoint: 'openAI', model: 'gpt-4o' },
};

function addEntryAndGetInputs(): HTMLInputElement[] {
  fireEvent.click(screen.getByText('com_ui_add_item'));
  return screen.getAllByRole('textbox') as HTMLInputElement[];
}

describe('config entry lost-update (add + fill a new array-object entry)', () => {
  it('accumulates two field commits that land in one React batch (name + label both survive)', () => {
    const listRef: { current: t.ConfigValue[] | undefined } = { current: undefined };
    render(<Harness initialList={[existingSpec]} fields={specFields} listRef={listRef} />);

    // "Add" prepends an empty {} at index 0 and auto-expands it.
    const [nameInput, labelInput] = addEntryAndGetInputs();
    expect(listRef.current?.[0]).toEqual({});

    // Type into both, then commit BOTH blurs in one batch (no re-render between)
    // — the exact interaction that dropped a key before the fix.
    fireEvent.change(nameInput, { target: { value: 'Varde EU-Secure Instant' } });
    fireEvent.change(labelInput, { target: { value: 'Varde EU-Secure Instant' } });
    act(() => {
      fireEvent.blur(nameInput);
      fireEvent.blur(labelInput);
    });

    // Both keys must be present — a name-only / label-only entry is what
    // produced "modelSpecs.list: Required; Required" on save.
    expect(listRef.current?.[0]).toEqual({
      name: 'Varde EU-Secure Instant',
      label: 'Varde EU-Secure Instant',
    });
    expect(listRef.current?.[1]).toEqual(existingSpec);
  });

  it('accumulates when the two commits are reversed within one batch (blur label then name)', () => {
    const listRef: { current: t.ConfigValue[] | undefined } = { current: undefined };
    render(<Harness initialList={[existingSpec]} fields={specFields} listRef={listRef} />);

    const [nameInput, labelInput] = addEntryAndGetInputs();
    fireEvent.change(nameInput, { target: { value: 'EU' } });
    fireEvent.change(labelInput, { target: { value: 'EU-Secure' } });
    act(() => {
      fireEvent.blur(labelInput);
      fireEvent.blur(nameInput);
    });

    expect(listRef.current?.[0]).toEqual({ name: 'EU', label: 'EU-Secure' });
  });

  it('regression: sequential edits (re-render between each) still accumulate', () => {
    const listRef: { current: t.ConfigValue[] | undefined } = { current: undefined };
    render(<Harness initialList={[existingSpec]} fields={specFields} listRef={listRef} />);

    const [nameInput, labelInput] = addEntryAndGetInputs();
    fireEvent.change(nameInput, { target: { value: 'EU' } });
    fireEvent.blur(nameInput);
    fireEvent.change(labelInput, { target: { value: 'EU-Secure' } });
    fireEvent.blur(labelInput);

    expect(listRef.current?.[0]).toEqual({ name: 'EU', label: 'EU-Secure' });
  });

  it('accumulates a nested-object field: two sub-field commits in one batch both survive', () => {
    const nestedFields = [
      createField({
        key: 'nested',
        type: 'object',
        isObject: true,
        path: 'modelSpecs.list.nested',
        children: [
          createField({ key: 'endpoint', type: 'string', path: 'modelSpecs.list.nested.endpoint' }),
          createField({ key: 'model', type: 'string', path: 'modelSpecs.list.nested.model' }),
        ],
      }),
    ];
    const listRef: { current: t.ConfigValue[] | undefined } = { current: undefined };
    // Seed the entry's nested object with values so both sub-fields render
    // (a fresh nested object would hide them behind progressive disclosure).
    render(
      <Harness
        initialList={[{ nested: { endpoint: 'a', model: 'b' } }]}
        fields={nestedFields}
        listRef={listRef}
      />,
    );

    // Expand the single (index 0) card, then the nested group.
    fireEvent.click(screen.getByText('com_config_entry_n'));
    fireEvent.click(screen.getByText('com_config_field_nested'));

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const endpointInput = inputs.find((i) => i.value === 'a')!;
    const modelInput = inputs.find((i) => i.value === 'b')!;

    fireEvent.change(endpointInput, { target: { value: 'Varde Secure' } });
    fireEvent.change(modelInput, { target: { value: 'eu-secure' } });
    act(() => {
      fireEvent.blur(endpointInput);
      fireEvent.blur(modelInput);
    });

    expect((listRef.current?.[0] as Record<string, t.ConfigValue>)?.nested).toEqual({
      endpoint: 'Varde Secure',
      model: 'eu-secure',
    });
  });
});
