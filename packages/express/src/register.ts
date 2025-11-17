import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { annotateWorkflowsFromManifest } from './manifest.js';

const DEFAULT_MANIFEST = '.well-known/workflow/manifest.json';
let installed = false;
export interface WorkflowExpressRegisterOptions {
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
