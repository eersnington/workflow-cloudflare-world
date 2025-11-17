import { access, readFile } from 'node:fs/promises';
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
  const normalized = raw.trim();
  if (!normalized || normalized === 'undefined') {
    return {};
  }
  return JSON.parse(normalized) as WorkflowManifest;
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
      const moduleExports = await importWorkflowModule(
        cwd,
        relativePath,
        logger
      );
      if (!moduleExports) {
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

async function importWorkflowModule(
  cwd: string,
  relativePath: string,
  logger: Pick<Console, 'error'>
): Promise<Record<string, unknown> | undefined> {
  const candidates = createPathCandidates(relativePath);
  const roots = createSearchRoots(cwd);

  for (const candidate of candidates) {
    for (const root of roots) {
      const absolutePath = resolve(root, candidate);
      try {
        await access(absolutePath);
      } catch {
        continue;
      }

      try {
        return (await import(pathToFileURL(absolutePath).href)) as Record<
          string,
          unknown
        >;
      } catch {
        continue;
      }
    }
  }

  logger.error?.(
    `Failed to import workflow module for "${relativePath}". Checked roots: ${roots.join(
      ', '
    )}`
  );
  return undefined;
}

function createPathCandidates(relativePath: string): string[] {
  const candidates = new Set<string>([relativePath]);
  if (relativePath.endsWith('.js')) {
    candidates.add(relativePath.replace(/\.js$/, '.ts'));
    candidates.add(relativePath.replace(/\.js$/, '.tsx'));
  } else if (relativePath.endsWith('.mjs')) {
    candidates.add(relativePath.replace(/\.mjs$/, '.ts'));
    candidates.add(relativePath.replace(/\.mjs$/, '.tsx'));
  }
  return Array.from(candidates);
}

function createSearchRoots(cwd: string): string[] {
  const roots = new Set<string>([cwd]);
  roots.add(resolve(cwd, 'dist'));
  roots.add(resolve(cwd, 'build'));
  const customRoot = process.env.WORKFLOW_EXPRESS_SOURCE_ROOT;
  if (customRoot) {
    roots.add(resolve(cwd, customRoot));
  }
  return Array.from(roots);
}

type WorkflowFunctionWithMetadata = {
  (...args: unknown[]): unknown;
  workflowId?: string;
};
