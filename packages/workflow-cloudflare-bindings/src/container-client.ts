/**
 * Worker-safe client for invoking the Cloudflare workflow runtime.
 * Prefers service bindings and Durable Object namespaces on the provided `env`
 * and falls back to an explicit executor URL when supplied.
 */
export class ContainerClient {
  private readonly executorUrl?: string;

  constructor(opts: { executorUrl?: string } = {}) {
    this.executorUrl = opts.executorUrl;
  }

  async execute(payload: unknown, env?: Record<string, unknown>): Promise<any> {
    const executor = env?.WORKFLOW_EXECUTOR as
      | Record<string, unknown>
      | undefined;

    // 1. Durable Object namespace (idFromName + get().fetch()).
    const durableObjectResult = await this.tryDurableObject(executor, payload);
    if (durableObjectResult !== undefined) {
      return durableObjectResult;
    }

    // 2. Service binding (fetch()).
    const serviceBindingResult = await this.tryServiceBinding(
      executor,
      payload
    );
    if (serviceBindingResult !== undefined) {
      return serviceBindingResult;
    }

    // 3. Explicit URL fallback.
    const fallback =
      this.executorUrl ||
      (typeof env?.WORKFLOW_EXECUTOR_URL === 'string'
        ? (env?.WORKFLOW_EXECUTOR_URL as string)
        : undefined);

    if (!fallback) {
      throw new Error(
        'No workflow executor configured. Provide WORKFLOW_EXECUTOR bindings or an executorUrl.'
      );
    }

    return this.fetchAndParse(new URL('/execute', fallback), payload);
  }

  private async tryDurableObject(
    binding: Record<string, unknown> | undefined,
    payload: unknown
  ): Promise<any> {
    const idFromName =
      typeof binding?.idFromName === 'function'
        ? binding.idFromName
        : undefined;
    const getStub =
      typeof binding?.get === 'function' ? binding.get : undefined;
    if (!idFromName || !getStub) return undefined;

    const runId =
      typeof (payload as any)?.workflowRun?.runId === 'string'
        ? (payload as any).workflowRun.runId
        : 'default';

    try {
      const id = idFromName.call(binding, runId);
      const stub = getStub.call(binding, id);
      if (!stub || typeof stub.fetch !== 'function') {
        return undefined;
      }

      const response = await stub.fetch('/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return this.parseResponse(response);
    } catch (error) {
      console.error('ContainerClient: durable object invocation failed', error);
      return undefined;
    }
  }

  private async tryServiceBinding(
    binding: Record<string, unknown> | undefined,
    payload: unknown
  ): Promise<any> {
    const fetchFn =
      typeof binding?.fetch === 'function' ? binding.fetch : undefined;
    if (!fetchFn) return undefined;

    try {
      const response = await fetchFn.call(binding, '/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return this.parseResponse(response);
    } catch (error) {
      console.error('ContainerClient: service binding fetch failed', error);
      return undefined;
    }
  }

  private async fetchAndParse(target: URL, payload: unknown): Promise<any> {
    const response = await fetch(String(target), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return this.parseResponse(response);
  }

  private async parseResponse(response: Response): Promise<any> {
    if (response.ok) {
      return this.safeJson(response);
    }

    if (response.status === 503) {
      const body = (await this.safeJson(response)) ?? {};
      const retry =
        typeof body.retryAfterSeconds === 'number'
          ? body.retryAfterSeconds
          : undefined;
      return { retryAfterSeconds: retry };
    }

    const message = await response.text().catch(() => '');
    throw new Error(`Container execute failed: ${response.status} ${message}`);
  }

  private async safeJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}

export const defaultContainerClient = new ContainerClient();
export default defaultContainerClient;
