import { parseWorkflowName } from '@workflow/core/parse-name';
import { NextResponse } from 'next/server';
import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const dynamic = 'force-dynamic';

type WorkflowManifest = {
  [relativeFileName: string]: {
    [functionName: string]: {
      workflowId: string;
    };
  };
};

type WorkflowListItem = {
  id: string;
  name: string;
  file: string;
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

function deriveRootsFromEnv(): string[] {
  const roots = new Set<string>();

  const manifestPath = process.env.WORKFLOW_MANIFEST_PATH;
  if (manifestPath) {
    roots.add(dirname(manifestPath));
  }

  const projectRoot = process.env.WORKFLOW_PROJECT_ROOT;
  if (projectRoot) {
    roots.add(resolve(projectRoot));
  }

  const dataDir = process.env.WORKFLOW_EMBEDDED_DATA_DIR;
  if (dataDir) {
    const resolved = resolve(dataDir);
    roots.add(dirname(resolved));
    roots.add(resolve(resolved, '..', '..'));

    for (const suffix of KNOWN_DATA_DIR_SUFFIXES) {
      const idx = resolved.lastIndexOf(suffix);
      if (idx !== -1) {
        roots.add(resolve(resolved.slice(0, idx)));
      }
    }
  }

  roots.add(process.cwd());

  return Array.from(roots);
}

async function findManifest(): Promise<{
  path: string;
  manifest: WorkflowManifest;
} | null> {
  const roots = deriveRootsFromEnv();

  for (const root of roots) {
    for (const file of MANIFEST_FILES) {
      const fullPath = join(root, MANIFEST_DIR, file);
      if (!(await fileExists(fullPath))) {
        continue;
      }

      try {
        const content = await readFile(fullPath, 'utf8');
        const manifest = JSON.parse(content) as WorkflowManifest;
        return { path: fullPath, manifest };
      } catch (error) {
        console.error(`Failed to read workflow manifest at ${fullPath}`, error);
      }
    }
  }

  return null;
}

function normalizeManifest(manifest: WorkflowManifest): WorkflowListItem[] {
  const workflows: WorkflowListItem[] = [];

  for (const [relativeFile, functions] of Object.entries(manifest)) {
    for (const [, entry] of Object.entries(functions)) {
      if (!entry?.workflowId) continue;
      const parsed = parseWorkflowName(entry.workflowId);
      workflows.push({
        id: entry.workflowId,
        name: parsed?.shortName ?? entry.workflowId,
        file: relativeFile,
      });
    }
  }

  return workflows;
}

export async function GET() {
  const located = await findManifest();

  if (!located) {
    return NextResponse.json(
      {
        workflows: [],
        error:
          'No workflow manifest found. Run `workflow build` or execute a workflow to generate `.well-known/workflow/v1/manifest.json`.',
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
