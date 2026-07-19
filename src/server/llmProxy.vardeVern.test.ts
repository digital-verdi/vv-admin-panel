import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as t from '@/types';

/**
 * Server-fn tests for the Varde Vern config fns (getVardeVernFn / saveVardeVernFn). We mock
 * `createServerFn` to pass the handler through as-is (so the exported fn IS the real handler) and
 * `proxyFetch`/`extractProxyError` to return controlled responses — exercising the 409-mapping,
 * configRevision extraction and error paths without a live proxy.
 */
let nextResponse: { status: number; ok: boolean; json: () => Promise<unknown> };
function respond(status: number, body: unknown): void {
  nextResponse = { status, ok: status >= 200 && status < 300, json: async () => body };
}

vi.mock('./utils/proxyApi', () => ({
  proxyFetch: vi.fn(async () => nextResponse),
  extractProxyError: vi.fn(async (_res: unknown, msg: string) => {
    throw new Error(msg);
  }),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: (...args: unknown[]) => unknown) => fn,
    inputValidator: () => ({ handler: (fn: (...args: unknown[]) => unknown) => fn }),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  queryOptions: (opts: unknown) => opts,
}));

import { getVardeVernFn as getVardeVernFnImpl, saveVardeVernFn as saveVardeVernFnImpl } from './llmProxy';

// The mocked createServerFn passes the handler through, so at runtime these ARE the raw handlers; cast to
// the handler signatures to call them directly (the real TanStack Fetcher types don't reflect the mock).
const getVardeVernFn = getVardeVernFnImpl as unknown as () => Promise<t.VardeVern>;
const saveVardeVernFn = saveVardeVernFnImpl as unknown as (opts: {
  data: { expectedRevision: number; policy: t.VardeVernPolicyInput; rollout: t.VardeVernRolloutInput };
}) => Promise<t.SaveVardeVernResult>;

const validInput: {
  data: { expectedRevision: number; policy: t.VardeVernPolicyInput; rollout: t.VardeVernRolloutInput };
} = {
  data: {
    expectedRevision: 3,
    policy: { version: 1, defaultAction: 'enforce', entities: {} },
    rollout: {
      version: 1,
      engines: [{ engineId: 'regex', status: 'required', rolloutPhase: 'enforce', enforceAllowed: true }],
    },
  },
};

describe('getVardeVernFn', () => {
  beforeEach(() => respond(200, {}));

  it('returns the Varde Vern config on 200', async () => {
    respond(200, { policy: { version: 1, defaultAction: 'enforce', entities: {} }, engines: [] });
    const result = await getVardeVernFn();
    expect(result).toMatchObject({ policy: { defaultAction: 'enforce' } });
  });

  it('throws a friendly error on a non-ok response', async () => {
    respond(503, { error: { message: 'proxy down' } });
    await expect(getVardeVernFn()).rejects.toThrow('Failed to load Varde Vern config');
  });
});

describe('saveVardeVernFn', () => {
  beforeEach(() => respond(200, { configRevision: 1 }));

  it('maps a 409 CONFIG_VERSION_MISMATCH to a version-mismatch result (optimistic-lock)', async () => {
    respond(409, { error: { code: 'CONFIG_VERSION_MISMATCH' } });
    const result = await saveVardeVernFn(validInput);
    expect(result).toEqual({ status: 'version-mismatch' });
  });

  it('does NOT swallow a 409 that lacks the mismatch code — it surfaces as an error', async () => {
    respond(409, { error: { code: 'SOMETHING_ELSE', message: 'nope' } });
    await expect(saveVardeVernFn(validInput)).rejects.toThrow('Failed to save Varde Vern config');
  });

  it('returns ok + the new configRevision on success', async () => {
    respond(200, { configRevision: 7 });
    const result = await saveVardeVernFn(validInput);
    expect(result).toEqual({ status: 'ok', configRevision: 7 });
  });

  it('defaults configRevision to -1 when the proxy omits it', async () => {
    respond(200, {});
    const result = await saveVardeVernFn(validInput);
    expect(result).toEqual({ status: 'ok', configRevision: -1 });
  });

  it('throws on a non-ok, non-409 response', async () => {
    respond(500, { error: { message: 'boom' } });
    await expect(saveVardeVernFn(validInput)).rejects.toThrow('Failed to save Varde Vern config');
  });
});
