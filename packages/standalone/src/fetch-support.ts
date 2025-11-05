let fetchSetupPromise: Promise<void> | null = null;

export async function ensureFetchSupport(): Promise<void> {
  if (
    typeof globalThis.Request === 'function' &&
    typeof globalThis.Response === 'function' &&
    typeof globalThis.Headers === 'function'
  ) {
    return;
  }

  if (!fetchSetupPromise) {
    fetchSetupPromise = import('undici').then((mod) => {
      const api = mod as unknown as {
        fetch?: typeof globalThis.fetch;
        Request?: typeof globalThis.Request;
        Response?: typeof globalThis.Response;
        Headers?: typeof globalThis.Headers;
      };

      const assignments: Record<string, unknown> = {};

      if (api.fetch && typeof globalThis.fetch !== 'function') {
        assignments.fetch = api.fetch;
      }
      if (api.Request && typeof globalThis.Request !== 'function') {
        assignments.Request = api.Request;
      }
      if (api.Response && typeof globalThis.Response !== 'function') {
        assignments.Response = api.Response;
      }
      if (api.Headers && typeof globalThis.Headers !== 'function') {
        assignments.Headers = api.Headers;
      }

      if (Object.keys(assignments).length > 0) {
        Object.assign(globalThis as Record<string, unknown>, assignments);
      }
    });
  }

  await fetchSetupPromise;
}
