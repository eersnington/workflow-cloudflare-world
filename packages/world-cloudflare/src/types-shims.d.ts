/**
 * Type shims for third-party packages used in this package to satisfy the
 * TypeScript compiler during local development/builds.
 *
 * These are intentionally minimal — they provide just enough surface area for
 * the code in this repository to type-check. If you need richer typings, prefer
 * installing the official `@types/*` packages or the upstream packages that
 * include their own types.
 */

/* Vite plugin shim */
declare module 'vite' {
  /**
   * Minimal representation of a Vite plugin used by this repo's transform.
   * The real `Plugin` type is more feature-rich; we only expose the members
   * referenced by our transformer plugin to keep the shim small.
   */
  export interface VitePlugin {
    name?: string;
    enforce?: 'pre' | 'post' | string;
    transform?: (
      code: string,
      id: string
    ) =>
      | Promise<{ code: string; map?: any } | null>
      | { code: string; map?: any }
      | null;
    // Keep the shape open for other optional lifecycle hooks that may be used.
    [key: string]: any;
  }

  export type Plugin = VitePlugin;
}

/* MagicString shim */
declare module 'magic-string' {
  /**
   * Minimal MagicString interface covering the methods used by the transformer.
   * The actual library has more capabilities; this is sufficient for the build.
   */
  export default class MagicString {
    constructor(code: string);

    /**
     * Replace the substring in the original source between `start` and `end`
     * (indices) with `content`.
     */
    overwrite(start: number, end: number, content: string): void;

    /**
     * Append content to the end of the string.
     */
    append(content: string): void;

    /**
     * Return the transformed code as a string.
     */
    toString(): string;

    /**
     * Generate a source map. We keep the return type permissive to avoid
     * coupling to a particular source map shape.
     */
    generateMap(options?: { hires?: boolean }): any;
  }
}
