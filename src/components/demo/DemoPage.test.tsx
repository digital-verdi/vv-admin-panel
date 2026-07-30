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
    },
    {
      id: 'l2',
      description: '',
      maxStarts: null,
      startsUsed: 0,
      status: 'revoked',
      expiresAt: null,
    },
  ],
  configDrift: null,
};

let statusValue: t.DemoStatus = baseStatus;
let canManage = true;
const revokeFn = vi.fn().mockResolvedValue(undefined);
const setCapacityFn = vi.fn().mockResolvedValue({ status: 'ok', capacity: baseStatus.capacity });
const createLinkFn = vi.fn().mockResolvedValue({ token: 'tok', link: baseStatus.links[0] });

vi.mock('@/server', () => ({
  demoStatusQueryOptions: {
    queryKey: ['demo-status'],
    queryFn: () => Promise.resolve(statusValue),
  },
  revokeDemoLinkFn: (a: unknown) => revokeFn(a),
  setDemoCapacityFn: (a: unknown) => setCapacityFn(a),
  createDemoLinkFn: (a: unknown) => createLinkFn(a),
}));
vi.mock('@/hooks', () => ({ useCapabilities: () => ({ hasCapability: () => canManage }) }));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
vi.mock('@/components/shared', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  LoadingState: () => <div data-testid="loading" />,
  FormDialog: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
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
});
