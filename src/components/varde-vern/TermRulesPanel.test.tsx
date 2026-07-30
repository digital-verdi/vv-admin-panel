import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as t from '@/types';
import { TermRulesPanel } from './TermRulesPanel';

const termRulesFn = vi.fn();
const capsFn = vi.fn();
const createFn = vi.fn().mockResolvedValue({ id: 'new' });
const toggleFn = vi.fn().mockResolvedValue(undefined);
const deleteFn = vi.fn().mockResolvedValue(undefined);

vi.mock('@/server', () => ({
  termRulesQueryOptions: { queryKey: ['varde-vern-term-rules'], queryFn: () => termRulesFn() },
  vardeVernCapabilitiesQueryOptions: {
    queryKey: ['varde-vern-capabilities'],
    queryFn: () => capsFn(),
  },
  createTermRuleFn: (args: unknown) => createFn(args),
  setTermRuleEnabledFn: (args: unknown) => toggleFn(args),
  deleteTermRuleFn: (args: unknown) => deleteFn(args),
}));
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>();
  return { ...actual, notifySuccess: vi.fn(), notifyError: vi.fn() };
});
vi.mock('@clickhouse/click-ui', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
  Button: ({
    label,
    onClick,
    disabled,
  }: {
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  IconButton: ({
    onClick,
    disabled,
    'aria-label': ariaLabel,
  }: {
    icon?: string;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} />,
  TextField: ({
    value,
    onChange,
    label,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

const CAPS: t.VardeVernCapabilities = {
  languages: [
    { code: 'nb', displayNameKey: 'x', displayName: 'Norsk (bokmål)', enabled: true, detection: { localEngine: true, presidio: true }, termRules: { supported: true } },
    { code: 'en', displayNameKey: 'x', displayName: 'English', enabled: true, detection: { localEngine: true, presidio: true }, termRules: { supported: true } },
    { code: 'da', displayNameKey: 'x', displayName: 'Dansk', enabled: true, detection: { localEngine: true, presidio: true }, termRules: { supported: true } },
  ],
  termRuleLanguageScopes: [
    { type: 'ALL' },
    { type: 'LANGUAGE', languageCode: 'nb' },
    { type: 'LANGUAGE', languageCode: 'en' },
    { type: 'LANGUAGE', languageCode: 'da' },
  ],
  termRuleActions: ['FORCE_MASK', 'DO_NOT_MASK'],
  defaultLanguage: 'nb',
};

function renderPanel(rules: t.VardeVernTermRule[] = [], canManage = true) {
  termRulesFn.mockResolvedValue({ rules });
  capsFn.mockResolvedValue(CAPS);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TermRulesPanel canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe('TermRulesPanel', () => {
  beforeEach(() => {
    createFn.mockClear();
    toggleFn.mockClear();
    deleteFn.mockClear();
  });

  it('builds the language dropdown from the capabilities catalog (mock `da`, no hardcoded list)', async () => {
    renderPanel();
    await screen.findByText('Add a global term rule');
    const options = Array.from(document.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('Dansk');
    expect(options).toContain('All languages');
  });

  it('creating an ALL-scope rule omits languageCode', async () => {
    renderPanel();
    await screen.findByText('Add a global term rule');
    fireEvent.change(screen.getByPlaceholderText('e.g. a project name'), {
      target: { value: '  Varde  ' },
    });
    fireEvent.click(screen.getByText('Add rule'));
    await waitFor(() =>
      expect(createFn).toHaveBeenCalledWith({
        data: { action: 'FORCE_MASK', languageScope: 'ALL', languageCode: undefined, term: 'Varde' },
      }),
    );
  });

  it('creating a LANGUAGE-scope rule includes the selected languageCode', async () => {
    renderPanel();
    await screen.findByText('Add a global term rule');
    const [, languageSelect] = document.querySelectorAll('select');
    fireEvent.change(languageSelect, { target: { value: 'da' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. a project name'), {
      target: { value: 'Projekt' },
    });
    fireEvent.click(screen.getByText('Add rule'));
    await waitFor(() =>
      expect(createFn).toHaveBeenCalledWith({
        data: { action: 'FORCE_MASK', languageScope: 'LANGUAGE', languageCode: 'da', term: 'Projekt' },
      }),
    );
  });

  it('shows the EU routingAction dropdown only when the proxy advertises it, and submits the choice', async () => {
    termRulesFn.mockResolvedValue({ rules: [] });
    capsFn.mockResolvedValue({
      ...CAPS,
      termRuleRoutingActions: ['NONE', 'RECOMMEND_EU', 'REQUIRE_EU'],
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <TermRulesPanel canManage={true} />
      </QueryClientProvider>,
    );
    await screen.findByText('Add a global term rule');
    const routingSelect = document.querySelectorAll('select')[2] as HTMLSelectElement;
    expect(routingSelect).toBeTruthy();
    fireEvent.change(routingSelect, { target: { value: 'REQUIRE_EU' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. a project name'), {
      target: { value: 'Prosjekt X' },
    });
    fireEvent.click(screen.getByText('Add rule'));
    await waitFor(() =>
      expect(createFn).toHaveBeenCalledWith({
        data: {
          action: 'FORCE_MASK',
          routingAction: 'REQUIRE_EU',
          languageScope: 'ALL',
          languageCode: undefined,
          term: 'Prosjekt X',
        },
      }),
    );
  });

  it('toggle + delete call the mutation server-fns with the rule id', async () => {
    const rule: t.VardeVernTermRule = {
      id: 'r1',
      action: 'DO_NOT_MASK',
      languageScope: 'ALL',
      languageCode: null,
      term: 'Oslo',
      enabled: true,
      createdBy: 'admin1',
      createdAt: '2026-07-28T00:00:00.000Z',
    };
    renderPanel([rule]);
    await screen.findByText('Oslo');
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(toggleFn).toHaveBeenCalledWith({ data: { id: 'r1', enabled: false } }));
    fireEvent.click(screen.getByLabelText('Delete the rule for Oslo'));
    await waitFor(() => expect(deleteFn).toHaveBeenCalledWith({ data: { id: 'r1' } }));
  });

  it('disables mutating controls without MANAGE_CONFIGS', async () => {
    renderPanel([], false);
    await screen.findByText('Add a global term rule');
    expect(screen.getByText('Add rule').closest('button')).toBeDisabled();
  });

  it('shows a live Effective outcome preview that tracks the selected masking action', async () => {
    renderPanel();
    await screen.findByText('Add a global term rule');
    // Default action is Always mask (FORCE_MASK).
    expect(screen.getByLabelText('Effective outcome preview')).toHaveTextContent(
      /masked before the request reaches/i,
    );
    const [ruleSelect] = document.querySelectorAll('select');
    fireEvent.change(ruleSelect, { target: { value: 'DO_NOT_MASK' } });
    expect(screen.getByLabelText('Effective outcome preview')).toHaveTextContent(
      /not masked as a name/i,
    );
  });

  it('the preview gains the EU-routing clause when routing is advertised and selected', async () => {
    termRulesFn.mockResolvedValue({ rules: [] });
    capsFn.mockResolvedValue({
      ...CAPS,
      termRuleRoutingActions: ['NONE', 'RECOMMEND_EU', 'REQUIRE_EU'],
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <TermRulesPanel canManage={true} />
      </QueryClientProvider>,
    );
    await screen.findByText('Add a global term rule');
    // NONE selected by default → no routing clause yet.
    expect(screen.getByLabelText('Effective outcome preview')).not.toHaveTextContent(
      /European \(EU\) model/i,
    );
    const routingSelect = document.querySelectorAll('select')[2] as HTMLSelectElement;
    fireEvent.change(routingSelect, { target: { value: 'REQUIRE_EU' } });
    expect(screen.getByLabelText('Effective outcome preview')).toHaveTextContent(
      /European \(EU\) model/i,
    );
    expect(screen.getByLabelText('Effective outcome preview')).toHaveTextContent(/locked/i);
    // RECOMMEND_EU renders the advisory clause instead.
    fireEvent.change(routingSelect, { target: { value: 'RECOMMEND_EU' } });
    expect(screen.getByLabelText('Effective outcome preview')).toHaveTextContent(
      /from the next message/i,
    );
  });

  it('each rule row spells out its effective outcome (masking + EU routing)', async () => {
    const rule: t.VardeVernTermRule = {
      id: 'r1',
      action: 'DO_NOT_MASK',
      routingAction: 'RECOMMEND_EU',
      languageScope: 'LANGUAGE',
      languageCode: 'nb',
      term: 'konfidensielt',
      enabled: true,
      createdBy: null,
      createdAt: '2026-07-30T00:00:00.000Z',
    };
    renderPanel([rule]);
    await screen.findByText('konfidensielt');
    expect(screen.getByText(/not masked as a name/i)).toBeInTheDocument();
    expect(screen.getByText(/from the next message/i)).toBeInTheDocument();
  });

  it('a disabled rule reads as having no effect', async () => {
    const rule: t.VardeVernTermRule = {
      id: 'r2',
      action: 'FORCE_MASK',
      routingAction: 'REQUIRE_EU',
      languageScope: 'ALL',
      languageCode: null,
      term: 'Prosjekt X',
      enabled: false,
      createdBy: null,
      createdAt: '2026-07-30T00:00:00.000Z',
    };
    renderPanel([rule]);
    await screen.findByText('Prosjekt X');
    expect(screen.getByText(/no effect while turned off/i)).toBeInTheDocument();
  });
});
