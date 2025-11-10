import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContainerClient } from './container-client';

describe('ContainerClient', () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    // restore global fetch
    (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('constructs and exposes execute', () => {
    const client = new ContainerClient({
      executorUrl: 'http://example.local/execute',
    });
    expect(typeof client.execute).toBe('function');
  });

  it('uses executorUrl fallback and returns parsed JSON on success', async () => {
    const okResp = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, result: 123 }),
    } as any;

    (globalThis as any).fetch = vi.fn().mockResolvedValue(okResp);

    const client = new ContainerClient({
      executorUrl: 'http://example.local/execute',
    });
    const res = await client.execute({ foo: 'bar' }, {});
    expect(res).toEqual({ success: true, result: 123 });
    expect((globalThis as any).fetch).toHaveBeenCalled();
  });

  it('returns retry info when container responds with 503', async () => {
    const retryResp = {
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ retryAfterSeconds: 30 }),
    } as any;

    (globalThis as any).fetch = vi.fn().mockResolvedValue(retryResp);

    const client = new ContainerClient({
      executorUrl: 'http://example.local/execute',
    });
    const res = await client.execute({ foo: 'bar' }, {});
    expect(res).toEqual({ retryAfterSeconds: 30 });
  });

  it('uses service binding executor.fetch when provided in env', async () => {
    const okResp = {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ success: true, from: 'service-binding' }),
    } as any;

    const env: any = {
      WORKFLOW_EXECUTOR: {
        fetch: vi.fn().mockResolvedValue(okResp),
      },
    };

    // Ensure global fetch is not used in this scenario
    (globalThis as any).fetch = vi
      .fn()
      .mockRejectedValue(new Error('should not be used'));

    const client = new ContainerClient();
    const res = await client.execute({ foo: 'bar' }, env);
    expect(res).toEqual({ success: true, from: 'service-binding' });
    expect(env.WORKFLOW_EXECUTOR.fetch).toHaveBeenCalled();
  });

  it('uses durable object idFromName and get when provided in env', async () => {
    const okResp = {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ success: true, from: 'durable-object' }),
    } as any;

    // create a fake durable object namespace
    const executorNamespace = {
      idFromName: vi.fn((name: string) => `id-${name}`),
      get: vi.fn((id: string) => {
        return {
          fetch: vi.fn().mockResolvedValue(okResp),
        };
      }),
    } as any;

    const env: any = { WORKFLOW_EXECUTOR: executorNamespace };

    // Ensure global fetch is not used in this scenario
    (globalThis as any).fetch = vi
      .fn()
      .mockRejectedValue(new Error('should not be used'));

    const client = new ContainerClient();
    const payload = { workflowRun: { runId: 'run-123' } };
    const res = await client.execute(payload, env);
    expect(res).toEqual({ success: true, from: 'durable-object' });

    expect(executorNamespace.idFromName).toHaveBeenCalledWith('run-123');
    expect(executorNamespace.get).toHaveBeenCalled();
  });

  it('throws on non-OK non-503 response', async () => {
    const badResp = {
      ok: false,
      status: 400,
      text: async () => 'bad request',
    } as any;

    (globalThis as any).fetch = vi.fn().mockResolvedValue(badResp);

    const client = new ContainerClient({
      executorUrl: 'http://example.local/execute',
    });

    await expect(client.execute({ a: 1 }, {})).rejects.toThrow(
      /Container execute failed: 400/
    );
  });
});
