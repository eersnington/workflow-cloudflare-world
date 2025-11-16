import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { HANDLER_FILENAMES } from './constants.js';

export type WorkflowHttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type WorkflowHandler = (
  request: Request
) => Response | Promise<Response>;

export interface WorkflowHandlers {
  step: WorkflowHandler;
  flow: WorkflowHandler;
  webhook: Partial<Record<WorkflowHttpMethod, WorkflowHandler>>;
}

export async function loadWorkflowHandlers(
  buildDir: string
): Promise<WorkflowHandlers> {
  const resolvedDir = resolve(buildDir);
  const [stepModule, flowModule, webhookModule] = await Promise.all([
    loadHandlerModule(resolvedDir, HANDLER_FILENAMES.step),
    loadHandlerModule(resolvedDir, HANDLER_FILENAMES.flow),
    loadHandlerModule(resolvedDir, HANDLER_FILENAMES.webhook),
  ]);

  const webhookHandlers: WorkflowHandlers['webhook'] = {};
  for (const method of SUPPORTED_WEBHOOK_METHODS) {
    const handler = webhookModule?.[method];
    if (typeof handler === 'function') {
      webhookHandlers[method] = handler.bind(webhookModule);
    }
  }

  return {
    step: bindPost(stepModule, HANDLER_FILENAMES.step),
    flow: bindPost(flowModule, HANDLER_FILENAMES.flow),
    webhook: webhookHandlers,
  };
}

const SUPPORTED_WEBHOOK_METHODS: WorkflowHttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

type HandlerModule =
  | {
      POST?: WorkflowHandler;
      [key: string]: unknown;
    }
  | undefined;

function bindPost(module: HandlerModule, name: string): WorkflowHandler {
  if (module?.POST && typeof module.POST === 'function') {
    return module.POST.bind(module);
  }
  throw new Error(
    `Workflow handler "${name}" does not export a POST function at build directory output`
  );
}

async function loadHandlerModule(
  buildDir: string,
  handlerBaseName: string
): Promise<HandlerModule> {
  const handlerPath = await resolveHandlerFile(buildDir, handlerBaseName);
  if (!handlerPath) {
    throw new Error(
      `Could not find handler file for "${handlerBaseName}" under ${buildDir}`
    );
  }

  const moduleUrl = pathToFileURL(handlerPath).href;

  if (handlerPath.endsWith('.mjs')) {
    const mod = await import(moduleUrl);
    return normalizeModule(mod);
  }

  try {
    const handlerRequire = createRequire(handlerPath);
    const mod = handlerRequire(handlerPath);
    return normalizeModule(mod);
  } catch (error) {
    if (isCommonJsInEsModuleError(error)) {
      const mod = await loadCommonJsFallback(handlerPath);
      return normalizeModule(mod);
    }
    throw error;
  }
}

async function resolveHandlerFile(
  buildDir: string,
  handlerBaseName: string
): Promise<string | undefined> {
  const candidates = ['.mjs', '.js', '.cjs'].map((ext) =>
    join(buildDir, `${handlerBaseName}${ext}`)
  );

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

function normalizeModule(mod: unknown): HandlerModule {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const candidate = (mod as Record<string, unknown>).default;
    if (candidate && typeof candidate === 'object') {
      return candidate as HandlerModule;
    }
  }
  return mod as HandlerModule;
}

function isCommonJsInEsModuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message || '';
  return (
    message.includes('module is not defined in ES module scope') ||
    message.includes('Cannot require() ES Module') ||
    message.includes('Unexpected module status') ||
    message.includes('module is not defined')
  );
}

async function loadCommonJsFallback(handlerPath: string): Promise<unknown> {
  const source = await readFile(handlerPath, 'utf8');
  const wrapperSource = `(function (exports, require, module, __filename, __dirname) {${source}\n})`;
  const script = new Script(wrapperSource, { filename: handlerPath });
  const compiledWrapper = script.runInThisContext();
  const module = { exports: {} as Record<string, unknown> };
  const localRequire = createRequire(handlerPath);
  compiledWrapper(
    module.exports,
    localRequire,
    module,
    handlerPath,
    dirname(handlerPath)
  );
  return module.exports;
}
