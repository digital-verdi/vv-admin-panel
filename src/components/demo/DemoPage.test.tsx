import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { DemoPage } from './DemoPage';

const baseStatus: t.DemoStatus = {
  capacity: { limit: 200, used: 12, reservations: 3, remaining: 185, revision: 4 },
  profiles: { active: 7, pending: 5, closed: 8, expired: 9, failed: 0, cleanupErrors: 0 },
  links: [
    {
      id: 'l1',
      description: 'Booth',
      maxStarts: 50,
      startsUsed: 6,
      status: 'active',
      expiresAt: '2026-08-05T00:00:00.000Z',
      isSelfServe: false,
    },
    {
      id: 'l2',
      description: '',
      maxStarts: null,
      startsUsed: 0,
      status: 'revoked',
      expiresAt: null,
      isSelfServe: false,
    },
    {
      id: 'ss',
      description: 'Self-serve demo (default)',
      maxStarts: null,
      startsUsed: 4,
      status: 'active',
      expiresAt: null,
      isSelfServe: true,
    },
  ],
  sessions: [
    {
      id: 's1',
      displayUsername: 'Glad Rev 42',
      status: 'active',
      startedAt: '2026-08-01T10:00:00.000Z',
      lastSeenAt: '2026-08-01T10:05:00.000Z',
      expiresAt: '2026-08-02T10:00:00.000Z',
    },
  ],
  selfServe: { enabled: true, startsUsed: 4 },
  configDrift: null,
};

let statusValue: t.DemoStatus = baseStatus;
let canManage = true;
const revokeFn = vi.fn().mockResolvedValue(undefined);
const setCapacityFn = vi.fn().mockResolvedValue({ status: 'ok', capacity: baseStatus.capacity });
const createLinkFn = vi.fn().mockResolvedValue({ token: 'tok', link: baseStatus.links[0] });
const setSelfServeFn = vi.fn().mockResolvedValue({ enabled: false, startsUsed: 4 });
const revokeLinksFn = vi.fn().mockResolvedValue({ revoked: ['l1'] });
const deleteLinksFn = vi.fn().mockResolvedValue({ deleted: ['l1'] });
const terminateSessionsFn = vi.fn().mockResolvedValue({ terminated: ['s1'] });

vi.mock('@/server', () => ({
  demoStatusQueryOptions: {
    queryKey: ['demo-status'],
    queryFn: () => Promise.resolve(statusValue),
  },
  revokeDemoLinkFn: (a: unknown) => revokeFn(a),
  setDemoCapacityFn: (a: unknown) => setCapacityFn(a),
  createDemoLinkFn: (a: unknown) => createLinkFn(a),
  setSelfServeFn: (a: unknown) => setSelfServeFn(a),
  revokeDemoLinksFn: (a: unknown) => revokeLinksFn(a),
  deleteDemoLinksFn: (a: unknown) => deleteLinksFn(a),
  terminateDemoSessionsFn: (a: unknown) => terminateSessionsFn(a),
}));
vi.mock('@/hooks', () => ({ useCapabilities: () => ({ hasCapability: () => canManage }) }));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
// click-ui Checkbox → a native checkbox carrying its aria-label (indeterminate renders unchecked here).
vi.mock('@clickhouse/click-ui', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    disabled,
    'aria-label': ariaLabel,
  }: {
    checked: boolean | 'indeterminate';
    onCheckedChange?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <input
      type="checkbox"
      checked={checked === true}
      onChange={() => onCheckedChange?.()}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  ),
}));
vi.mock('@/components/shared', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingState: () => <div data-testid="loading" />,
  FormDialog: ({
    open,
    title,
    submitLabel,
    onSubmit,
    children,
  }: {
    open: boolean;
    title: string;
    submitLabel?: string;
    onSubmit?: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {onSubmit && (
          <button type="button" onClick={onSubmit}>
            {submitLabel ?? 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DemoPage />
    </QueryClientProvider>,
  );
}

describe('DemoPage', () => {
  beforeEach(() => {
    statusValue = baseStatus;
    canManage = true;
    revokeFn.mockClear();
    setCapacityFn.mockClear();
    createLinkFn.mockClear();
    setSelfServeFn.mockClear();
    revokeLinksFn.mockClear();
    deleteLinksFn.mockClear();
    terminateSessionsFn.mockClear();
  });

  it('renders capacity, session, and link stats from the status query', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: 'Demo Mode' });

    expect(within(screen.getByText('Capacity limit').parentElement as HTMLElement).getByText('200'))
      .toBeInTheDocument();
    expect(within(screen.getByText('Remaining').parentElement as HTMLElement).getByText('185'))
      .toBeInTheDocument();
    expect(within(screen.getByText('Used').parentElement as HTMLElement).getByText('12'))
      .toBeInTheDocument();
    expect(within(region).getByText('Booth')).toBeInTheDocument();
    expect(within(region).getByText('6 / 50')).toBeInTheDocument();
  });

  it('shows the config-OK banner when there is no drift, and a drift banner otherwise', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByText(/Config OK/)).toBeInTheDocument();
  });

  it('shows a drift banner when configDrift is present', async () => {
    statusValue = { ...baseStatus, configDrift: ['PERSON/nb missing'] };
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByText(/Config drift detected/)).toBeInTheDocument();
  });

  it('revokes a link via revokeDemoLinkFn', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    const boothRow = screen.getByText('Booth').closest('tr') as HTMLElement;
    fireEvent.click(within(boothRow).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revokeFn).toHaveBeenCalledWith({ data: { id: 'l1' } }));
  });

  it('disables the management actions when the admin lacks the capability', async () => {
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByRole('button', { name: 'Set capacity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New demo link' })).toBeDisabled();
  });

  it('opens the capacity dialog seeded with the current revision', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Set capacity' }));
    expect(await screen.findByRole('dialog', { name: 'Set demo capacity' })).toBeInTheDocument();
  });

  it('renders an empty state when there are no demo links', async () => {
    statusValue = { ...baseStatus, links: [] };
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByText('No demo links yet.')).toBeInTheDocument();
  });

  it('lists live demo sessions from status.sessions', async () => {
    renderPage();
    const sessions = await screen.findByRole('region', { name: 'Demo Mode' });
    const sessionsSection = within(sessions).getByRole('region', { name: 'Demo sessions' });
    expect(within(sessionsSection).getByText('Glad Rev 42')).toBeInTheDocument();
  });

  it('shows an empty state when there are no demo sessions', async () => {
    statusValue = { ...baseStatus, sessions: [] };
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByText('No active demo sessions.')).toBeInTheDocument();
  });

  it('toggles self-serve off via setSelfServeFn (enabled → mutate(false))', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(setSelfServeFn).toHaveBeenCalledWith({ data: { enabled: false } }));
  });

  it('labels the default self-serve link, hides its revoke, and gives it no checkbox', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: 'Demo Mode' });
    const ssRow = within(region).getByText('Self-serve (default)').closest('tr') as HTMLElement;
    expect(within(ssRow).queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(within(ssRow).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(ssRow).queryByRole('checkbox')).toBeNull();
    expect(within(ssRow).getByText('Managed above')).toBeInTheDocument();
  });

  it('disables the self-serve toggle without the capability', async () => {
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
  });

  it('bulk-deletes selected links via a confirm dialog', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select link Booth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete demo link(s)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteLinksFn).toHaveBeenCalledWith({ data: { ids: ['l1'] } }));
  });

  it('bulk-revokes selected links immediately (no confirm)', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select link Booth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke selected (1)' }));
    await waitFor(() => expect(revokeLinksFn).toHaveBeenCalledWith({ data: { ids: ['l1'] } }));
  });

  it('terminates a session via the row action + confirm dialog', async () => {
    renderPage();
    const region = await screen.findByRole('region', { name: 'Demo Mode' });
    const row = within(region).getByText('Glad Rev 42').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Terminate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Terminate demo session(s)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminate' }));
    await waitFor(() => expect(terminateSessionsFn).toHaveBeenCalledWith({ data: { ids: ['s1'] } }));
  });

  it('select-all links excludes the self-serve default row', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all links' }));
    // Booth (l1) is the only selectable link (l2 is revoked-but-selectable too; ss is excluded).
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete demo link(s)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      const ids = deleteLinksFn.mock.calls[0][0].data.ids as string[];
      expect(ids).toEqual(expect.arrayContaining(['l1', 'l2']));
      expect(ids).not.toContain('ss');
    });
  });

  it('disables bulk-select when the admin lacks the capability', async () => {
    canManage = false;
    renderPage();
    await screen.findByRole('region', { name: 'Demo Mode' });
    expect(screen.getByRole('checkbox', { name: 'Select all links' })).toBeDisabled();
  });
});
