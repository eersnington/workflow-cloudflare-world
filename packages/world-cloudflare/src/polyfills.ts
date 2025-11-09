// NOTE: The core workflow runtime always bundles the embedded world
// (`@workflow/world-local`) to support local development fallbacks. That package,
// in turn, depends on `undici`, which instantiates `WeakRef` and
// `FinalizationRegistry` at module load. Cloudflare Workers (and some local
// shims) don't expose these APIs, so simply importing `workflow-cloudflare-world`
// would throw before any user code ran. Installing these tiny polyfills keeps
// the module safe to import everywhere, even if the embedded world isn't
// actually used in Cloudflare deployments.

if (typeof globalThis.WeakRef === 'undefined') {
  class WeakRefPolyfill<T extends object> implements WeakRef<T> {
    private readonly value: T;
    readonly [Symbol.toStringTag] = 'WeakRef';

    constructor(value: T) {
      this.value = value;
    }

    deref(): T | undefined {
      return this.value;
    }
  }

  (globalThis as typeof globalThis & { WeakRef: typeof WeakRef }).WeakRef =
    WeakRefPolyfill as unknown as typeof WeakRef;
}

if (typeof globalThis.FinalizationRegistry === 'undefined') {
  class FinalizationRegistryPolyfill<T> {
    readonly [Symbol.toStringTag] = 'FinalizationRegistry';

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_cleanup: (heldValue: T) => void) {}

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    register(_target: object, _heldValue: T, _unregisterToken?: object): void {}

    unregister(_unregisterToken: object): boolean {
      return true;
    }
  }

  (
    globalThis as typeof globalThis & {
      FinalizationRegistry: typeof FinalizationRegistry;
    }
  ).FinalizationRegistry =
    FinalizationRegistryPolyfill as unknown as typeof FinalizationRegistry;
}
