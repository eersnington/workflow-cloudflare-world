import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseStepName, parseWorkflowName } from '@workflow/core/parse-name';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ManifestFileEntry = Record<
  string,
  { workflowId?: string; stepId?: string }
>;

type WorkflowManifest = {
  workflows?: Record<string, ManifestFileEntry>;
  steps?: Record<string, ManifestFileEntry>;
};

export type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
  type: 'workflow' | 'step';
};

const MANIFEST_DIR = '.well-known/workflow/v1';
const MANIFEST_FILES = ['manifest.json', 'manifest.debug.json'];
const KNOWN_DATA_DIR_SUFFIXES = [
  '.next/workflow-data',
  '.workflow-data',
  'workflow-data',
];

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function deriveRootsFromEnv(paramDataDir?: string | null): string[] {
  const roots = new Set<string>();

  const manifestPath = process.env.WORKFLOW_MANIFEST_PATH;
  if (manifestPath) {
    roots.add(dirname(manifestPath));
  }

  const projectRoot = process.env.WORKFLOW_PROJECT_ROOT;
  if (projectRoot) {
    roots.add(resolve(projectRoot));
  }

  const dataDir = paramDataDir || process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  if (dataDir) {
    const resolved = resolve(dataDir);
    roots.add(dirname(resolved));
    // If dataDir is like .next/workflow-data, parent is .next, grandparent is root
    roots.add(resolve(resolved, '..', '..'));

    for (const suffix of KNOWN_DATA_DIR_SUFFIXES) {
      const idx = resolved.lastIndexOf(suffix);
      if (idx !== -1) {
        const root = resolve(resolved.slice(0, idx));
        roots.add(root);
        // Check Next.js app dir pattern
        roots.add(join(root, 'app'));
        roots.add(join(root, 'src/app'));
      }
    }
  }

  roots.add(process.cwd());

  return Array.from(roots);
}

async function findManifest(dataDir?: string | null): Promise<{
  path: string;
  manifest: WorkflowManifest;
} | null> {
  const roots = deriveRootsFromEnv(dataDir);
  const subdirs = ['', 'flow', 'step'];

  const foundManifests: WorkflowManifest[] = [];
  let lastPath = '';

  for (const root of roots) {
    for (const subdir of subdirs) {
      for (const file of MANIFEST_FILES) {
        const fullPath = join(root, MANIFEST_DIR, subdir, file);
        console.log(`Checking manifest path: ${fullPath}`);
        if (await fileExists(fullPath)) {
          try {
            const content = await readFile(fullPath, 'utf8');
            const manifest = JSON.parse(content) as WorkflowManifest;
            foundManifests.push(manifest);
            lastPath = fullPath;
          } catch (error) {
            console.error(
              `Failed to read workflow manifest at ${fullPath}`,
              error
            );
          }
        }
      }
    }
  }

  if (foundManifests.length === 0) {
    return null;
  }

  // Merge all found manifests
  const mergedManifest: WorkflowManifest = {
    workflows: {},
    steps: {},
  };

  for (const manifest of foundManifests) {
    if (manifest.workflows) {
      for (const [file, fns] of Object.entries(manifest.workflows)) {
        mergedManifest.workflows![file] = {
          ...mergedManifest.workflows![file],
          ...fns,
        };
      }
    }
    if (manifest.steps) {
      for (const [file, fns] of Object.entries(manifest.steps)) {
        mergedManifest.steps![file] = {
          ...mergedManifest.steps![file],
          ...fns,
        };
      }
    }
  }

  return { path: lastPath, manifest: mergedManifest };
}

function normalizeManifest(manifest: WorkflowManifest): WorkflowListItem[] {
  const items: WorkflowListItem[] = [];

  // Process Workflows
  if (manifest.workflows) {
    for (const [relativeFile, functions] of Object.entries(
      manifest.workflows
    )) {
      for (const [, entry] of Object.entries(functions)) {
        if (!entry?.workflowId) continue;

        const parsed = parseWorkflowName(entry.workflowId);
        items.push({
          id: entry.workflowId,
          name: parsed?.shortName ?? entry.workflowId,
          file: relativeFile,
          type: 'workflow',
        });
      }
    }
  }

  // Process Steps
  if (manifest.steps) {
    for (const [relativeFile, functions] of Object.entries(manifest.steps)) {
      for (const [, entry] of Object.entries(functions)) {
        if (!entry?.stepId) continue;

        const parsed = parseStepName(entry.stepId);
        items.push({
          id: entry.stepId,
          name: parsed?.shortName ?? entry.stepId,
          file: relativeFile,
          type: 'step',
        });
      }
    }
  }

  return items;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataDir = searchParams.get('dataDir');

  const located = await findManifest(dataDir);

  if (!located) {
    return NextResponse.json(
      {
        workflows: [],
        error:
          'No workflow manifest found. Run `workflow build` to generate `.well-known/workflow/v1/manifest.json`.',
      },
      { status: 200 }
    );
  }

  const workflows = normalizeManifest(located.manifest);

  return NextResponse.json(
    {
      workflows,
      manifestPath: located.path,
    },
    { status: 200 }
  );
}
