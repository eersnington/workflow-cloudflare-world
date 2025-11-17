import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { annotateWorkflowsFromManifest } from './manifest.js';

const require = createRequire(import.meta.url);
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DEFAULT_MANIFEST = '.well-known/workflow/manifest.json';
let installed = false;

type SwcPluginConfig = {
  target?: string;
  parser?: Record<string, unknown>;
  experimental?: {
    plugins?: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type SwcConfig = {
  module?: Record<string, unknown>;
  jsc?: SwcPluginConfig;
  [key: string]: unknown;
};

type SwcRegisterOptions = {
  extensions?: string[];
  sourceMaps?: boolean;
  swc?: SwcConfig;
  [key: string]: unknown;
};

export interface WorkflowExpressRegisterOptions extends SwcRegisterOptions {
  skip?: boolean;
}

export function registerWorkflowExpress(
  options: WorkflowExpressRegisterOptions = {}
): void {
  if (installed) {
    return;
  }

  const skipRegister =
    options.skip || process.env.WORKFLOW_EXPRESS_SKIP_REGISTER === '1';
  if (skipRegister) {
    installed = true;
    return;
  }

  const {
    skip: _skip,
    extensions = DEFAULT_EXTENSIONS,
    sourceMaps = false,
    swc: swcOptions,
    ...rest
  } = options;

  const pluginPath = require.resolve('@workflow/swc-plugin');
  const registerModule = require('@swc-node/register/register') as {
    register: (options?: SwcRegisterOptions) => void;
  };
  const { register } = registerModule;

  const userJsc = swcOptions?.jsc ?? {};
  const {
    jsc: _ignoredJsc,
    module: _ignoredModule,
    ...swcRest
  } = swcOptions ?? {};

  const mergedOptions: SwcRegisterOptions = {
    ...rest,
    extensions,
    sourceMaps,
    swc: {
      ...swcRest,
      module: { type: 'es6', ...swcOptions?.module },
      jsc: {
        ...userJsc,
        target: userJsc.target ?? 'es2022',
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: true,
          dynamicImport: true,
          ...userJsc.parser,
        },
        experimental: {
          ...userJsc.experimental,
          plugins: [
            ...(userJsc.experimental?.plugins ?? []),
            [pluginPath, { mode: 'client' }],
          ],
        },
      },
    },
  };

  register(mergedOptions);
  void annotateManifestFallback().catch((error) => {
    console.warn('[workflow-express] Failed to annotate workflows', error);
  });
  installed = true;
}

registerWorkflowExpress();

async function annotateManifestFallback(): Promise<void> {
  const manifestPath = process.env.WORKFLOW_MANIFEST_PATH ?? DEFAULT_MANIFEST;
  const resolvedPath = resolve(process.cwd(), manifestPath);
  try {
    await access(resolvedPath);
  } catch {
    return;
  }
  await annotateWorkflowsFromManifest({
    manifestPath,
    workingDir: process.cwd(),
  });
}
