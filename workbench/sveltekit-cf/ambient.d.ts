// Minimal ambient declarations so TypeScript understands the shape of the generated
// SvelteKit worker without installing `@cloudflare/workers-types`. This keeps the
// workbench self-contained.

interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface CloudflareExportedHandler {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext
  ): Promise<Response>;
}

declare module './build/index.js' {
  const worker: CloudflareExportedHandler;
  export default worker;
}
