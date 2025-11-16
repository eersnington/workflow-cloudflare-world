import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type WorkflowMetadata = {
  workflowId: string;
};

export type WorkflowManifest = Record<string, Record<string, WorkflowMetadata>>;

export interface LoadWorkflowManifestOptions {
  manifestPath: string;
  workingDir?: string;
}

export interface AnnotateWorkflowsOptions {
  manifestPath?: string;
  manifest?: WorkflowManifest;
  workingDir?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export async function loadWorkflowManifest(
  options: LoadWorkflowManifestOptions
): Promise<WorkflowManifest> {
  const cwd = options.workingDir ?? process.cwd();
  const resolvedPath = resolve(cwd, options.manifestPath);
  const raw = await readFile(resolvedPath, 'utf8');
  return JSON.parse(raw) as WorkflowManifest;
}

export async function annotateWorkflowsFromManifest(
  options: AnnotateWorkflowsOptions
): Promise<void> {
  const cwd = options.workingDir ?? process.cwd();
  const logger = options.logger ?? console;

  const manifest =
    options.manifest ??
    (options.manifestPath
      ? await loadWorkflowManifest({
          manifestPath: options.manifestPath,
          workingDir: cwd,
        })
      : undefined);

  if (!manifest) {
    throw new Error(
      'annotateWorkflowsFromManifest requires either a manifest object or a manifestPath.'
    );
  }

  const entries = Object.entries(manifest);
  await Promise.all(
    entries.map(async ([relativePath, exportsMap]) => {
      const absolutePath = resolve(cwd, relativePath);
      const moduleUrl = pathToFileURL(absolutePath).href;

      let moduleExports: Record<string, unknown>;
      try {
        moduleExports = (await import(moduleUrl)) as Record<string, unknown>;
      } catch (error) {
        logger.error?.(
          `Failed to import workflow module at "${relativePath}".`,
          error
        );
        return;
      }

      for (const [exportName, metadata] of Object.entries(exportsMap)) {
        const candidate = moduleExports[exportName];
        if (typeof candidate !== 'function') {
          logger.warn?.(
            `Export "${exportName}" from "${relativePath}" is not a function and cannot be used as a workflow.`
          );
          continue;
        }

        const fn = candidate as WorkflowFunctionWithMetadata;
        if (fn.workflowId === metadata.workflowId) {
          continue;
        }

        Object.defineProperty(fn, 'workflowId', {
          value: metadata.workflowId,
          configurable: true,
          writable: true,
        });
      }
    })
  );
}

type WorkflowFunctionWithMetadata = {
  (...args: unknown[]): unknown;
  workflowId?: string;
};
