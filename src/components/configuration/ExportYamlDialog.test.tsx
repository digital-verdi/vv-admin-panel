import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { ExportYamlDialog } from './ExportYamlDialog';
import { parseImportedYaml } from '@/server';
import { notifySuccess } from '@/utils';

vi.mock('@/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

vi.mock('@/server', () => ({
  parseImportedYaml: vi.fn(),
}));

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn() };
});

vi.mock('@clickhouse/click-ui', () => ({
  Dialog: Object.assign(
    ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div>{children}</div> : null,
    {
      Content: ({ children, title }: { children: React.ReactNode; title: string }) => (
        <div>
          <h2>{title}</h2>
          {children}
        </div>
      ),
    },
  ),
  Button: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const snapshot: t.ExportYamlSnapshot = {
  config: { version: '1.2.1', interface: { customWelcome: 'Hei' } },
  scopeSelection: { type: 'BASE' },
  suggestedFilename: 'librechat-base-2026-07-15.yaml',
};

const parseMock = vi.mocked(parseImportedYaml);
const notifyMock = vi.mocked(notifySuccess);

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

function renderDialog(onClose = vi.fn()) {
  render(<ExportYamlDialog open snapshot={snapshot} onClose={onClose} />);
  return onClose;
}

describe('ExportYamlDialog', () => {
  it('shows the suggested filename and lets the user edit it', () => {
    renderDialog();
    const input = screen.getByLabelText('com_config_export_yaml_filename') as HTMLInputElement;
    expect(input.value).toBe('librechat-base-2026-07-15.yaml');
    fireEvent.change(input, { target: { value: 'my-config' } });
    expect(input.value).toBe('my-config');
  });

  it('does not download and reports errors when validation fails', async () => {
    parseMock.mockResolvedValue({
      success: false,
      error: 'Config validation failed',
      validationErrors: [{ path: 'interface', message: 'invalid' }],
      appConfig: null,
    });
    const onClose = renderDialog();

    fireEvent.click(screen.getByText('com_config_export_yaml_action'));

    await waitFor(() => expect(parseMock).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('invalid');
  });

  it('validates the generated YAML then downloads and closes on success', async () => {
    parseMock.mockResolvedValue({
      success: true,
      error: undefined,
      validationErrors: undefined,
      appConfig: snapshot.config,
    });
    const onClose = renderDialog();

    const input = screen.getByLabelText('com_config_export_yaml_filename') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'chosen-name.txt' } });
    fireEvent.click(screen.getByText('com_config_export_yaml_action'));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const call = parseMock.mock.calls[0][0] as { data: { yamlContent: string } };
    expect(call.data.yamlContent).toContain('customWelcome: Hei');
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('normalizes the chosen filename onto the download anchor', async () => {
    parseMock.mockResolvedValue({
      success: true,
      error: undefined,
      validationErrors: undefined,
      appConfig: snapshot.config,
    });
    const createEl = document.createElement.bind(document);
    const anchor = createEl('a') as HTMLAnchorElement;
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => (tag === 'a' ? anchor : createEl(tag)));

    renderDialog();
    fireEvent.change(screen.getByLabelText('com_config_export_yaml_filename'), {
      target: { value: '../../evil.txt' },
    });
    fireEvent.click(screen.getByText('com_config_export_yaml_action'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(anchor.download).toBe('evil.yaml');
    createSpy.mockRestore();
  });

  it('cancel closes without downloading', () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByText('com_ui_cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
  });
});
