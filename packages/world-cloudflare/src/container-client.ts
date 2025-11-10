import type { CloudflareEnv } from './config.js';

/**
 * ContainerClient
 *
 * Runtime utility to call the workflow executor container from a Cloudflare Worker.
 * It supports:
 *  - Durable Object namespace (namespace.idFromName(id) + namespace.get(id).fetch)
 *  - Service binding style (namespace.fetch)
 *  - Plain HTTP url fallback via WORKFLOW_EXECUTOR_URL
 *
 * The payload shape should match the container's expectation:
 * { workflowCode, workflowRun?, inputs?, events?, context? }
 *
 * The function returns the parsed JSON response from the container when possible.
 */
export class ContainerClient {
  private executorUrl?: string;

  constructor(opts?: { executorUrl?: string }) {
    this.executorUrl = opts?.executorUrl;
  }

  /**
   * Execute a workflow in the container.
   *
   * @param payload - The execution payload (workflowCode, workflowRun, inputs, events, context)
   * @param env - Optional Cloudflare env (may contain WORKFLOW_EXECUTOR or WORKFLOW_EXECUTOR_URL)
   *
   * @returns parsed JSON body from the container. On 503 the container may return { retryAfterSeconds }.
   */
  async execute(
    payload: unknown,
    env?: CloudflareEnv | Record<string, any>
  ): Promise<any> {
    // 1) Try Durable Object namespace / service binding if present
    if (env && (env as any).WORKFLOW_EXECUTOR) {
      const executor = (env as any).WORKFLOW_EXECUTOR;

      // Durable Object namespace idiom: idFromName + get(id) -> stub.fetch
      try {
        if (
          typeof executor.idFromName === 'function' &&
          typeof executor.get === 'function'
        ) {
          const name = String(
            (payload as any)?.workflowRun?.runId ?? 'default'
          );
          try {
            const id = executor.idFromName(name);
            const stub = executor.get(id);
            const resp = await stub.fetch('/execute', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            return await parseContainerResponse(resp);
          } catch (err) {
            // Fall through to next executor option
            console.error(
              'ContainerClient: durable object stub fetch failed',
              err
            );
          }
        }

        // Service-binding style: executor.fetch exists (a Fetcher)
        if (typeof executor.fetch === 'function') {
          try {
            const resp = await executor.fetch('/execute', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            return await parseContainerResponse(resp);
          } catch (err) {
            console.error('ContainerClient: service binding fetch failed', err);
          }
        }
      } catch (err) {
        // Defensive logging; continue to URL fallback below
        console.error(
          'ContainerClient: error while using WORKFLOW_EXECUTOR binding',
          err
        );
      }
    }

    // 2) Fallback to executor URL (from constructor opts / env / process.env)
    const url =
      this.executorUrl ||
      ((env && (env as any).WORKFLOW_EXECUTOR_URL) as string | undefined) ||
      (typeof process !== 'undefined' &&
        process.env &&
        process.env.WORKFLOW_EXECUTOR_URL) ||
      'http://workflow-container:8080/execute';

    const resp = await fetch(String(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return await parseContainerResponse(resp);
  }
}

/**
 * Parse the container HTTP response into a JS value or throw an informative error.
 * Handles 503 retry shape and returns the parsed JSON for success responses.
 */
async function parseContainerResponse(resp: Response): Promise<any> {
  const text = await resp.text().catch(() => null);
  // Try to parse JSON if any
  const parsed = tryParseJson(text);

  if (resp.status === 503) {
    // Allow caller to handle retry semantics; return whatever the container returned.
    if (parsed && typeof parsed === 'object') return parsed;
    // Otherwise return a minimal shape
    return { success: false, retryAfterSeconds: undefined, raw: text };
  }

  if (!resp.ok) {
    const body = parsed ?? text ?? `HTTP ${resp.status}`;
    throw new Error(`Container execute failed: ${resp.status} ${String(body)}`);
  }

  // 200-range responses
  return parsed ?? text;
}

function tryParseJson(text: string | null): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Default shared client instance
 */
export const defaultContainerClient = new ContainerClient();

export default defaultContainerClient;
